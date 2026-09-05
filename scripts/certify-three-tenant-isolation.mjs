import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const SUPABASE_URL = process.env.CERT_SUPABASE_URL
const ANON_KEY = process.env.CERT_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.CERT_SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('Missing production Supabase certification credentials')
  process.exit(2)
}

const TENANTS = [
  { id:'61a89aef-0e7e-4ea2-b222-44ab2024655a', code:'TRC-001', name:'Tax Case Review' },
  { id:'489ace07-1a6b-4864-833a-4f8420568b40', code:'TRC-002', name:'Nashville Tax Solutions' },
  { id:'ecd3d3ce-016a-4bb4-800e-f090f51e4cae', code:'TRC-003', name:'CloudCPA Inc' },
]

// Read-only production probes. We deliberately do NOT seed synthetic
// leads/clients/tasks/chat into production. The anti-QA-pollution guard is
// supposed to reject that. Service role locates at most one existing row per
// tenant/table; authenticated tenant sessions then prove they cannot see the
// other tenants' known row ids.
const PROBE_TABLES = ['clients','leads','tasks','chat_messages']

const runId=process.env.CERT_ISOLATION_RUN_ID || `qa_iso_${Date.now()}_${Math.random().toString(36).slice(2,7)}`
const password=`QaIso!${Math.random().toString(36).slice(2)}A9#`
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const createdUsers=[]
const createdRows=[]
const sessions=[]
const checks=[]
const probes=new Map()
let fatal=null

function userClient(){ return createClient(SUPABASE_URL,ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}) }
function assert(ok,label,detail=''){
  checks.push({label,ok,detail})
  if(!ok) throw new Error(`${label}${detail?`: ${detail}`:''}`)
}

async function discoverReadOnlyProbes(){
  for(const table of PROBE_TABLES){
    const perTenant=[]
    for(const tenant of TENANTS){
      const q=await admin.from(table).select('id,tenant_id').eq('tenant_id',tenant.id).limit(1)
      if(q.error) throw new Error(`${table}/${tenant.code} probe discovery: ${q.error.message}`)
      const row=Array.isArray(q.data) ? q.data[0] : null
      perTenant.push({tenantId:tenant.id,id:row?.id ?? null})
    }
    probes.set(table,perTenant)
  }
}

async function provision(){
  for(const tenant of TENANTS){
    const email=`${runId}.${tenant.code.toLowerCase()}@example.com`
    const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_isolation:true,qa_run:runId,tenant_id:tenant.id}})
    if(error) throw error
    createdUsers.push(data.user.id)

    const employeeId=`${runId}_${tenant.code}_employee`
    const row={id:employeeId,name:`QA Isolation ${tenant.name}`,email,status:'Active',tenant_id:tenant.id,access:'Super Admin',role:'Super Admin',title:'QA Isolation',team:'QA Certification',employee_id:employeeId,notes:`TEMP QA ISOLATION ${runId}`,perm_leads:3,perm_clients:3,perm_billing:3,perm_schedule:3,perm_documents:3,perm_irs:3,perm_comms:3,perm_reports:3,perm_hr:3,perm_settings:3}
    const ins=await admin.from('employees').insert(row)
    if(ins.error) throw new Error(`${tenant.code} employee seed: ${ins.error.message}`)
    createdRows.push({table:'employees',id:employeeId,tenantId:tenant.id})

    const client=userClient()
    const login=await client.auth.signInWithPassword({email,password})
    if(login.error) throw new Error(`${tenant.code} login: ${login.error.message}`)
    sessions.push({tenant,client,employeeId})
  }
}

async function verify(){
  for(const {tenant,client} of sessions){
    const resolved=await client.rpc('current_tenant_id')
    assert(!resolved.error,`${tenant.code} current_tenant_id RPC`,resolved.error?.message||'')
    assert(resolved.data===tenant.id,`${tenant.code} resolves its own tenant`,String(resolved.data))

    // Prove read isolation against known existing production row ids. No
    // production business rows are created or modified by this certification.
    for(const table of PROBE_TABLES){
      const tableProbes=probes.get(table) || []
      const ids=tableProbes.map(p=>p.id).filter(Boolean)
      if(!ids.length){
        checks.push({label:`${tenant.code} ${table} read isolation`,ok:true,detail:'no existing probe rows in any certified tenant; skipped'})
        continue
      }

      const q=await client.from(table).select('id,tenant_id').in('id',ids)
      assert(!q.error,`${tenant.code} ${table} probe read`,q.error?.message||'')
      const rows=Array.isArray(q.data)?q.data:[]
      const foreign=rows.filter(r=>r.tenant_id!==tenant.id)
      assert(foreign.length===0,`${tenant.code} ${table} zero foreign rows`,JSON.stringify(foreign))

      const ownProbe=tableProbes.find(p=>p.tenantId===tenant.id && p.id)
      if(ownProbe){
        const own=rows.filter(r=>r.id===ownProbe.id && r.tenant_id===tenant.id)
        assert(own.length===1,`${tenant.code} ${table} own production probe visible`,`count=${own.length}`)
      }
    }

    // Prove cross-tenant write isolation using ONLY the temporary QA employee
    // rows created by this run. A policy failure can never touch a customer row.
    const foreignSession=sessions.find(s=>s.tenant.id!==tenant.id)
    const w=await client.from('employees')
      .update({title:'QA Isolation Unauthorized Write'})
      .eq('id',foreignSession.employeeId)
      .select('id,tenant_id,title')
    assert(!w.error,`${tenant.code} cross-tenant employee update request`,w.error?.message||'')
    const changed=Array.isArray(w.data)?w.data:[]
    assert(changed.length===0,`${tenant.code} cross-tenant employee write denied`,JSON.stringify(changed))

    const confirm=await admin.from('employees').select('title').eq('id',foreignSession.employeeId).maybeSingle()
    assert(!confirm.error,`${tenant.code} foreign employee integrity check`,confirm.error?.message||'')
    assert(confirm.data?.title==='QA Isolation',`${tenant.code} foreign employee remained unchanged`,String(confirm.data?.title))
  }
}

async function cleanup(){
  const ids=createdRows.filter(r=>r.table==='employees').map(r=>r.id).filter(Boolean)
  if(ids.length){
    try { await admin.from('employees').delete().in('id',ids) } catch {}
  }
  for(const id of createdUsers){
    try { await admin.auth.admin.deleteUser(id) } catch {}
  }
}

try{
  await discoverReadOnlyProbes()
  await provision()
  await verify()
}catch(e){
  fatal=e?.message||String(e)
  console.error(`ISOLATION CERT FAIL: ${fatal}`)
}finally{
  await cleanup()
}

const evidence={
  runId,
  generatedAt:new Date().toISOString(),
  tenants:TENANTS.map(({id,code,name})=>({id,code,name})),
  probeTables:PROBE_TABLES,
  seededBusinessRows:0,
  checks,
  passed:!fatal&&checks.every(c=>c.ok),
  fatal
}
fs.mkdirSync('artifacts',{recursive:true})
fs.writeFileSync('artifacts/three-tenant-isolation-certification.json',JSON.stringify(evidence,null,2))
console.log(JSON.stringify({passed:evidence.passed,checks:checks.length,seededBusinessRows:0,tenants:TENANTS.map(t=>t.name)},null,2))
if(!evidence.passed) process.exit(1)
