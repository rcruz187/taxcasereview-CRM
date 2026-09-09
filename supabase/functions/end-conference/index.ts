import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY=Deno.env.get('SUPABASE_ANON_KEY')!
const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})

serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders})
  try{
    const authHeader=req.headers.get('authorization')||''
    if(!authHeader.toLowerCase().startsWith('bearer ')) return json({error:'Unauthorized'},401)
    const token=authHeader.slice(7).trim()
    const authClient=createClient(SUPABASE_URL,ANON_KEY,{global:{headers:{Authorization:`Bearer ${token}`}}})
    const {data:{user},error:userErr}=await authClient.auth.getUser(token)
    if(userErr||!user?.email) return json({error:'Unauthorized'},401)
    const {conferenceName,phoneContext}=await req.json()
    if(!conferenceName||!/^[A-Za-z0-9_-]+$/.test(conferenceName)) return json({error:'valid conferenceName required'},400)

    const db=createClient(SUPABASE_URL,SERVICE_KEY)
    const {data:isPlatformAdmin}=await authClient.rpc('_is_platform_admin')
    const isRomyLabs=phoneContext==='romylabs'&&isPlatformAdmin===true
    const {data:emp}=await db.from('employees').select('tenant_id,status').ilike('email',user.email).limit(1).maybeSingle()
    const tenantId=isRomyLabs?'a0000000-0000-0000-0000-000000000001':emp?.tenant_id
    if(!tenantId||(!isRomyLabs&&String(emp?.status||'Active').toLowerCase()!=='active')) return json({error:'Unauthorized'},403)
    let {data:settings,error:sErr}=await db.from('settings').select('sw_space_url,sw_project_id,sw_api_token').eq('tenant_id',tenantId).limit(1).maybeSingle()
    if(isRomyLabs&&(!settings?.sw_space_url||!settings?.sw_project_id||!settings?.sw_api_token)){
      const f=await db.from('settings').select('sw_space_url,sw_project_id,sw_api_token').eq('tenant_id','61a89aef-0e7e-4ea2-b222-44ab2024655a').limit(1).maybeSingle()
      if(f.data)settings=f.data;if(!sErr)sErr=f.error
    }
    if(sErr||!settings?.sw_space_url||!settings?.sw_project_id||!settings?.sw_api_token) return json({error:'SignalWire credentials missing for this calling context.'},400)

    const [{data:inConf},{data:outConf}]=await Promise.all([
      db.from('incoming_calls').select('id').eq('tenant_id',tenantId).eq('conference_name',conferenceName)
        .in('status',['ringing','answered']).limit(1).maybeSingle(),
      db.from('outbound_calls').select('id').eq('tenant_id',tenantId).eq('conference_name',conferenceName)
        .in('status',['pending','ringing','answered','connected']).limit(1).maybeSingle(),
    ])
    if(!inConf&&!outConf) return json({ok:true,note:'Call already ended or unavailable'})

    const spaceDomain=settings.sw_space_url.replace(/^https?:\/\//,'')
    const providerAuth='Basic '+btoa(`${settings.sw_project_id}:${settings.sw_api_token}`)
    const base=`https://${spaceDomain}/api/laml/2010-04-01/Accounts/${settings.sw_project_id}`
    const confResp=await fetch(`${base}/Conferences.json?FriendlyName=${encodeURIComponent(conferenceName)}&Status=in-progress`,{headers:{Authorization:providerAuth}})
    const confData=await confResp.json();const conferenceSid=confData?.conferences?.[0]?.sid
    if(!conferenceSid) return json({ok:true,note:'Conference already ended'})

    try{
      const partResp=await fetch(`${base}/Conferences/${conferenceSid}/Participants.json`,{headers:{Authorization:providerAuth}})
      const partData=await partResp.json()
      for(const p of partData?.participants||[]){if(!p.call_sid)continue;const kill=await fetch(`${base}/Calls/${p.call_sid}.json`,{method:'POST',headers:{Authorization:providerAuth,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({Status:'completed'})});if(!kill.ok)console.error('end-conference participant hangup failed',p.call_sid,kill.status,await kill.text())}
    }catch(e){console.error('end-conference participant sweep error',e)}

    const updResp=await fetch(`${base}/Conferences/${conferenceSid}.json`,{method:'POST',headers:{Authorization:providerAuth,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({Status:'completed'})})
    if(!updResp.ok) return json({error:'SignalWire rejected conference termination.'},502)
    await db.from('outbound_calls').update({status:'completed'}).eq('tenant_id',tenantId).eq('conference_name',conferenceName).neq('status','completed')
    await db.from('incoming_calls').update({status:'completed'}).eq('tenant_id',tenantId).eq('conference_name',conferenceName).eq('status','answered')
    return json({ok:true})
  }catch(err){console.error('end-conference error:',err);return json({error:'Unable to end conference.'},500)}
})
