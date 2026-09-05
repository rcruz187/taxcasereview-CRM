import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const SUPABASE_URL = process.env.CERT_SUPABASE_URL
const ANON_KEY = process.env.CERT_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.CERT_SUPABASE_SERVICE_ROLE_KEY
const TENANT_ID = process.env.CERT_TENANT_ID || '61a89aef-0e7e-4ea2-b222-44ab2024655a'
const TENANT_NAME = process.env.CERT_TENANT_NAME || 'Tax Case Review'
const USERS_PER_ROLE = Number(process.env.CERT_USERS_PER_ROLE || 4)
const PHASE10_MS = Number(process.env.CERT_PHASE10_MS || 90000)
const PHASE20_MS = Number(process.env.CERT_PHASE20_MS || 180000)
const THINK_MS = Number(process.env.CERT_THINK_MS || 350)

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('Missing CERT_SUPABASE_URL / CERT_SUPABASE_ANON_KEY / CERT_SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}

const runId = `qa_${Date.now()}_${Math.random().toString(36).slice(2,8)}`
const password = `Qa!${Math.random().toString(36).slice(2)}A9#`
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth:{ persistSession:false, autoRefreshToken:false } })

const ROLES = [
  { key:'owner_admin', label:'Owner/Admin', access:'Super Admin', perms:{perm_leads:3,perm_clients:3,perm_billing:3,perm_schedule:3,perm_documents:3,perm_irs:3,perm_comms:3,perm_reports:3,perm_hr:3,perm_settings:3} },
  { key:'manager', label:'Manager', access:'Manager', perms:{perm_leads:3,perm_clients:0,perm_billing:0,perm_schedule:2,perm_documents:2,perm_irs:0,perm_comms:2,perm_reports:1,perm_hr:0,perm_settings:0} },
  { key:'sales_rep', label:'Sales Rep', access:'Sales Rep', perms:{perm_leads:2,perm_clients:0,perm_billing:0,perm_schedule:2,perm_documents:1,perm_irs:0,perm_comms:2,perm_reports:0,perm_hr:0,perm_settings:0} },
  { key:'tax_advisor', label:'Tax Advisor', access:'Tax Advisor', perms:{perm_leads:2,perm_clients:0,perm_billing:0,perm_schedule:2,perm_documents:2,perm_irs:0,perm_comms:2,perm_reports:0,perm_hr:0,perm_settings:0} },
  { key:'tax_associate', label:'Tax Associate', access:'Tax Associate', perms:{perm_leads:1,perm_clients:1,perm_billing:0,perm_schedule:1,perm_documents:1,perm_irs:1,perm_comms:2,perm_reports:0,perm_hr:0,perm_settings:0} },
]

const metrics = []
const hardFailures = []
const createdUsers = []
const createdRows = []

function pct(values, p){ if(!values.length)return 0; const a=[...values].sort((x,y)=>x-y); return a[Math.min(a.length-1,Math.ceil(a.length*p)-1)] }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)) }
function record(kind, role, ok, ms, detail=''){ metrics.push({kind,role,ok,ms,detail}) }
function fail(msg){ hardFailures.push(msg); console.error(`CERT FAIL: ${msg}`) }
function track(table, id){ if(id) createdRows.push({table,id}) }

async function timed(kind, role, fn, expected='success') {
  const t0=performance.now()
  try {
    const out=await fn()
    const ms=performance.now()-t0
    const err=out?.error || null
    const succeeded=!err
    const ok=expected==='success' ? succeeded : !succeeded
    record(kind,role,ok,ms,err?.message||'')
    if(!ok) fail(`${role} ${kind}: expected ${expected}, got ${err?.message||'success'}`)
    return out
  } catch(e){
    const ms=performance.now()-t0
    const ok=expected==='deny'
    record(kind,role,ok,ms,e?.message||String(e))
    if(!ok) fail(`${role} ${kind}: ${e?.message||e}`)
    return {error:e}
  }
}

function userClient(){
  return createClient(SUPABASE_URL,ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
}

async function createQaUser(role, idx){
  const email=`${runId}.${role.key}.${idx}@example.com`
  const name=`QA ${role.label} ${idx} ${runId}`
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name,qa_certification:true,qa_run:runId,qa_role:role.key}})
  if(error) throw error
  createdUsers.push({id:data.user.id,email})
  const employeeId=`${runId}_${role.key}_${idx}`
  const row={id:employeeId,name,email,role:role.label,title:role.label,access:role.access,status:'Active',tenant_id:TENANT_ID,team:'QA Certification',employee_id:employeeId,notes:`TEMP QA CERT ${runId}`,...role.perms}
  const ins=await admin.from('employees').insert(row)
  if(ins.error) throw ins.error
  track('employees',employeeId)
  return {role,idx,email,name,authId:data.user.id,employeeId,client:userClient()}
}

async function loginSession(s){
  const out=await timed('auth.sign_in',s.role.key,()=>s.client.auth.signInWithPassword({email:s.email,password}))
  if(out.error) return
  const tenant=await timed('rpc.current_tenant_id',s.role.key,()=>s.client.rpc('current_tenant_id'))
  if(!tenant.error && tenant.data!==TENANT_ID) fail(`${s.role.key} resolved tenant ${tenant.data}, expected ${TENANT_ID}`)
}

async function seedReadTargets(){
  const clientId=`${runId}_client`
  const leadId=`${runId}_lead`
  const taskId=`${runId}_task`
  const eventId=`${runId}_event`
  const esignId=`${runId}_esign`
  const inserts=[
    ['clients',{id:clientId,name:`Capacity Client ${runId}`,email:`${runId}.client@example.com`,phone:'2025550198',status:'Active',tenant_id:TENANT_ID,notes:`TEMP CAPACITY CERT ${runId}`}],
    ['leads',{id:leadId,name:`Capacity Lead ${runId}`,email:`${runId}.lead@example.com`,phone:'2025550199',status:'New Lead',tenant_id:TENANT_ID,notes:`TEMP CAPACITY CERT ${runId}`}],
    ['tasks',{id:taskId,title:`QA Task ${runId}`,priority:'Normal',tenant_id:TENANT_ID,notes:`TEMP QA CERT ${runId}`}],
    ['calevents',{id:eventId,title:`QA Meeting ${runId}`,client:`QA Client ${runId}`,date:new Date().toISOString().slice(0,10),time:'23:55',eventType:'QA Certification',status:'QA_DRY_RUN',source:'qa_certification',tenant_id:TENANT_ID}],
    ['esigns',{id:esignId,doc_type:'QA Certification',client_name:`QA Client ${runId}`,client_email:`${runId}.esign@example.com`,message:`TEMP QA CERT ${runId}`,status:'QA_DRY_RUN',send_via:'qa_dry_run',tenant_id:TENANT_ID}],
  ]
  for(const [table,row] of inserts){ const r=await admin.from(table).insert(row); if(r.error) throw new Error(`seed ${table}: ${r.error.message}`); track(table,row.id) }
  return {clientId,leadId,taskId,eventId,esignId}
}

async function boundaryProbe(session, table, permKey, minRead, minWrite, mkRow){
  const level=session.role.perms[permKey] ?? 0
  const readExpected=level>=minRead?'success':'deny'
  const writeExpected=level>=minWrite?'success':'deny'

  const readStart=performance.now()
  try{
    const r=await session.client.from(table).select('id').eq('tenant_id',TENANT_ID).limit(1)
    const ms=performance.now()-readStart
    const visible=!r.error && Array.isArray(r.data) && r.data.length>0
    const denied=Boolean(r.error) || (!r.error && Array.isArray(r.data) && r.data.length===0)
    const ok=readExpected==='success' ? visible : denied
    record(`boundary.${table}.read`,session.role.key,ok,ms,r.error?.message || (visible?'visible row':'RLS filtered to zero rows'))
    if(!ok) fail(`${session.role.key} boundary.${table}.read: expected ${readExpected}, got ${r.error?.message || (visible?'visible row':'zero rows')}`)
  }catch(e){
    const ms=performance.now()-readStart
    const ok=readExpected==='deny'
    record(`boundary.${table}.read`,session.role.key,ok,ms,e?.message||String(e))
    if(!ok) fail(`${session.role.key} boundary.${table}.read: ${e?.message||e}`)
  }

  const row=mkRow()
  const w=await timed(`boundary.${table}.write`,session.role.key,()=>session.client.from(table).insert(row).select('id').maybeSingle(),writeExpected)
  if(writeExpected==='success'&&!w.error&&w.data?.id) track(table,w.data.id)
  if(writeExpected==='deny'&&!w.error&&w.data?.id) track(table,w.data.id)
}

const outboundCases = [
  { fn:'send-email', payload:{to:'qa-certification@example.invalid',subject:'QA certification dry run',text:'No delivery. Controlled QA validation.',qa_certification:true,dry_run:true} },
  { fn:'send-sms', payload:{to:'+12025550100',body:'QA certification dry run - no delivery',qa_certification:true,dry_run:true} },
  { fn:'send-fax', payload:{to:'+12025550100',document_url:`${SUPABASE_URL}/storage/v1/object/sign/documents/qa-certification-placeholder.pdf`,qa_certification:true,dry_run:true} },
  { fn:'start-outbound-call', payload:{destinationNumber:'2025550100',qa_certification:true,dry_run:true} },
]

async function externalBoundaryProbe(session, expected='allow'){
  const {data:{session:authSession}}=await session.client.auth.getSession()
  const token=authSession?.access_token
  if(!token){ fail(`${session.role.key} missing access token for outbound boundary tests`); return }
  for(const test of outboundCases){
    const url=`${SUPABASE_URL}/functions/v1/${test.fn}`
    const t0=performance.now()
    try{
      const res=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,apikey:ANON_KEY,'Content-Type':'application/json','X-QA-Certification':runId},body:JSON.stringify(test.payload)})
      let parsed=null,raw=''
      try{ raw=await res.text(); parsed=raw?JSON.parse(raw):null }catch{}
      const ms=performance.now()-t0
      const allowed=Boolean(res.ok&&parsed?.success===true&&parsed?.dry_run===true&&parsed?.delivery===false)
      const denied=res.status===403
      const ok=expected==='allow'?allowed:denied
      record(`outbound.${test.fn}.${expected==='allow'?'dry_run':'permission_denial'}`,session.role.key,ok,ms,`${res.status} ${raw.slice(0,220)}`)
      if(!ok) fail(`${session.role.key} ${test.fn}: expected ${expected}, got HTTP ${res.status} ${raw.slice(0,160)}`)
    }catch(e){
      record(`outbound.${test.fn}.${expected==='allow'?'dry_run':'permission_denial'}`,session.role.key,false,performance.now()-t0,e.message)
      fail(`${session.role.key} ${test.fn} boundary probe errored: ${e.message}`)
    }
  }
}

async function runBoundarySuite(sessions){
  const reps=ROLES.map(r=>sessions.find(s=>s.role.key===r.key)).filter(Boolean)
  for(const s of reps){
    await boundaryProbe(s,'leads','perm_leads',1,2,()=>({id:`${runId}_lead_${s.role.key}_${Date.now()}`,name:`QA ${s.role.label} Lead`,status:'New Lead',tenant_id:TENANT_ID,notes:`TEMP QA CERT ${runId}`}))
    await boundaryProbe(s,'clients','perm_clients',1,2,()=>({id:`${runId}_client_${s.role.key}_${Date.now()}`,name:`QA ${s.role.label} Client`,status:'Active',tenant_id:TENANT_ID,notes:`TEMP QA CERT ${runId}`}))
    await boundaryProbe(s,'calevents','perm_schedule',1,2,()=>({id:`${runId}_event_${s.role.key}_${Date.now()}`,title:`QA ${s.role.label} Meeting`,date:new Date().toISOString().slice(0,10),time:'23:55',eventType:'QA Certification',status:'QA_DRY_RUN',source:'qa_certification',tenant_id:TENANT_ID}))
    await boundaryProbe(s,'esigns','perm_documents',1,2,()=>({id:`${runId}_esign_${s.role.key}_${Date.now()}`,doc_type:'QA Certification',client_name:`QA ${s.role.label}`,client_email:`${runId}.${s.role.key}@example.com`,status:'QA_DRY_RUN',send_via:'qa_dry_run',tenant_id:TENANT_ID,message:`TEMP QA CERT ${runId}`}))
    await boundaryProbe(s,'chat_messages','perm_comms',1,2,()=>({channel:'general',sender:s.name,text:`[CAPACITY ${runId}] ${s.role.label} chat write`,tenant_id:TENANT_ID,source:'capacity_certification'}))
    await externalBoundaryProbe(s,'allow')
  }
}

async function runDeniedOutboundSuite(sessions){
  const target=sessions.find(s=>s.role.key==='tax_associate')
  if(!target){ fail('No Tax Associate session available for outbound denial certification'); return }
  const down=await admin.from('employees').update({perm_comms:0}).eq('id',target.employeeId).eq('tenant_id',TENANT_ID)
  if(down.error){ fail(`Could not downgrade Tax Associate comm permission: ${down.error.message}`); return }
  try{
    await sleep(750)
    await externalBoundaryProbe(target,'deny')
  }finally{
    const restore=await admin.from('employees').update({perm_comms:target.role.perms.perm_comms}).eq('id',target.employeeId).eq('tenant_id',TENANT_ID)
    if(restore.error) fail(`Could not restore Tax Associate comm permission: ${restore.error.message}`)
  }
}

async function workloadIteration(s){
  const reads=[
    ['leads','id,name,status'],['clients','id,name,status'],['tasks','id,title,done'],['calevents','id,title,date,time'],['chat_messages','id,channel,sender,created_at'],['esigns','id,status,client_name'],['sms_messages','id,status,direction'],['fax_logs','id,status,direction'],['call_logs','id,status,direction']
  ]
  const picked=reads[Math.floor(Math.random()*reads.length)]
  await timed(`load.read.${picked[0]}`,s.role.key,()=>s.client.from(picked[0]).select(picked[1]).limit(15))
  if((s.role.perms.perm_comms||0)>=2 && Math.random()<0.25){
    const r=await timed('load.write.chat',s.role.key,()=>s.client.from('chat_messages').insert({channel:'general',sender:s.name,text:`[CAPACITY ${runId}] heartbeat ${Date.now()}`,tenant_id:TENANT_ID,source:'capacity_certification'}).select('id').maybeSingle())
    if(!r.error&&r.data?.id) track('chat_messages',r.data.id)
  }
}

async function runPhase(name,sessions,durationMs){
  console.log(`\n=== ${name}: ${sessions.length} simultaneous authenticated sessions for ${Math.round(durationMs/1000)}s ===`)
  const end=Date.now()+durationMs
  await Promise.all(sessions.map(async s=>{
    while(Date.now()<end){ await workloadIteration(s); await sleep(THINK_MS+Math.floor(Math.random()*250)) }
  }))
}

async function cleanup(){
  console.log('\n=== cleanup ===')
  const order=['chat_messages','esigns','calevents','tasks','leads','clients','employees']
  for(const table of order){
    const ids=createdRows.filter(r=>r.table===table).map(r=>r.id)
    for(let i=0;i<ids.length;i+=100){
      const batch=ids.slice(i,i+100)
      if(!batch.length)continue
      const d=await admin.from(table).delete().in('id',batch)
      if(d.error) fail(`cleanup ${table}: ${d.error.message}`)
    }
  }
  for(const u of createdUsers){
    const d=await admin.auth.admin.deleteUser(u.id)
    if(d.error) fail(`cleanup auth ${u.email}: ${d.error.message}`)
  }
  const checks=[]
  for(const table of ['employees','leads','clients','tasks','calevents','esigns','chat_messages']){
    const col=table==='employees'?'notes':table==='chat_messages'?'text':table==='calevents'?'title':table==='esigns'?'message':'notes'
    const q=await admin.from(table).select('id',{count:'exact',head:true}).ilike(col,`%${runId}%`)
    checks.push({table,count:q.count||0,error:q.error?.message||null})
    if(q.error) fail(`cleanup verification ${table}: ${q.error.message}`)
    if((q.count||0)!==0) fail(`cleanup verification ${table}: ${q.count} QA rows remain`)
  }

  // Verify only the exact temporary auth IDs created by this run. Listing the
  // entire auth.users catalog can fail independently on large/legacy projects
  // and caused a false red certification even after every QA user was deleted.
  // getUserById returning user_not_found/404 is the expected clean result.
  for(const u of createdUsers){
    const probe=await admin.auth.admin.getUserById(u.id)
    if(!probe.error && probe.data?.user){
      fail(`cleanup auth: QA user still exists ${u.email}`)
      continue
    }
    const status=Number(probe.error?.status || 0)
    const code=String(probe.error?.code || '').toLowerCase()
    const msg=String(probe.error?.message || '').toLowerCase()
    const notFound=status===404 || code.includes('user_not_found') || msg.includes('user not found')
    if(!notFound) fail(`cleanup auth verification ${u.email}: ${probe.error?.message || 'unexpected response'}`)
  }
  return checks
}

function report(cleanupChecks){
  const groups={}
  for(const m of metrics){ (groups[m.kind]??=[]).push(m) }
  const summary=Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,{count:v.length,failures:v.filter(x=>!x.ok).length,p95_ms:Math.round(pct(v.map(x=>x.ms),.95)),p99_ms:Math.round(pct(v.map(x=>x.ms),.99))}]))
  const total=metrics.length, failures=metrics.filter(x=>!x.ok).length, failureRate=total?failures/total:1
  const readMs=metrics.filter(x=>x.kind.startsWith('load.read.')).map(x=>x.ms)
  const writeMs=metrics.filter(x=>x.kind.startsWith('load.write.')).map(x=>x.ms)
  if(failureRate>=0.01) fail(`overall operation failure rate ${(failureRate*100).toFixed(2)}% >= 1%`)
  if(pct(readMs,.95)>=1500) fail(`load read p95 ${Math.round(pct(readMs,.95))}ms >= 1500ms`)
  if(writeMs.length&&pct(writeMs,.95)>=2000) fail(`load write p95 ${Math.round(pct(writeMs,.95))}ms >= 2000ms`)
  const result={run_id:runId,tenant_id:TENANT_ID,tenant_name:TENANT_NAME,users_created:createdUsers.length,total_operations:total,failed_operations:failures,failure_rate:failureRate,load_read_p95_ms:Math.round(pct(readMs,.95)),load_read_p99_ms:Math.round(pct(readMs,.99)),load_write_p95_ms:Math.round(pct(writeMs,.95)),hard_failures:[...hardFailures],cleanup:cleanupChecks,metrics:summary}
  fs.mkdirSync('artifacts',{recursive:true})
  fs.writeFileSync('artifacts/production-capacity-certification.json',JSON.stringify(result,null,2))
  console.log('\n=== CERTIFICATION RESULT ===')
  console.log(JSON.stringify(result,null,2))
}

let cleanupChecks=[]
try{
  console.log(`Starting controlled production certification ${runId} for ${TENANT_NAME} (${TENANT_ID})`)
  console.log('Outbound customer delivery is disabled by design: real authorized dry-run paths are required to return delivery=false.')
  await seedReadTargets()
  const sessions=[]
  for(const role of ROLES){ for(let i=1;i<=USERS_PER_ROLE;i++) sessions.push(await createQaUser(role,i)) }
  await Promise.all(sessions.map(loginSession))
  await runBoundarySuite(sessions)
  await runPhase('10-user phase',sessions.slice(0,10),PHASE10_MS)
  await runPhase('20-user phase',sessions.slice(0,Math.min(20,sessions.length)),PHASE20_MS)
  await runDeniedOutboundSuite(sessions)
}catch(e){ fail(`fatal harness error: ${e?.stack||e}`) }
finally{
  try{ cleanupChecks=await cleanup() }catch(e){ fail(`cleanup fatal: ${e?.stack||e}`) }
  report(cleanupChecks)
}

if(hardFailures.length){ console.error(`\nCertification FAILED with ${hardFailures.length} hard failure(s).`); process.exit(1) }
console.log('\nCertification PASSED.')