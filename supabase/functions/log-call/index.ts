import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})

serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders})
  if(req.method!=='POST')return json({error:'Method not allowed'},405)
  try{
    const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const auth=req.headers.get('authorization')||''
    if(!auth.startsWith('Bearer '))return json({error:'Unauthorized'},401)
    const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}})
    const {data:{user},error:userErr}=await userClient.auth.getUser()
    if(userErr||!user)return json({error:'Unauthorized'},401)
    const {data:tenantId,error:tenantErr}=await userClient.rpc('current_tenant_id')
    if(tenantErr||!tenantId)return json({error:'Tenant unavailable'},403)

    const body=await req.json()
    const direction=String(body.direction||'outbound').toLowerCase()
    if(!['inbound','outbound'].includes(direction))return json({error:'Invalid direction'},400)
    const from_number=String(body.from_number||'').trim().slice(0,32)
    const to_number=String(body.to_number||'').trim().slice(0,32)
    if(!from_number&&!to_number)return json({error:'from_number or to_number required'},400)
    const duration=Math.max(0,Math.min(Number(body.duration_sec)||0,86400))
    const status=String(body.status||'completed').slice(0,40)
    const leadId=body.lead_id?String(body.lead_id):null
    const clientId=body.client_id?String(body.client_id):null

    const admin=createClient(url,service)
    if(clientId){const {data:c}=await admin.from('clients').select('id').eq('id',clientId).eq('tenant_id',tenantId).maybeSingle();if(!c)return json({error:'Client not found in authorized office'},404)}
    if(leadId){const {data:l}=await admin.from('leads').select('id').eq('id',leadId).eq('tenant_id',tenantId).maybeSingle();if(!l)return json({error:'Lead not found in authorized office'},404)}

    const {data,error}=await admin.from('call_logs').insert({
      tenant_id:tenantId,
      direction,
      from_number:from_number||null,
      to_number:to_number||null,
      duration_sec:duration,
      status,
      recording_url:body.recording_url?String(body.recording_url).slice(0,2000):null,
      notes:body.notes?String(body.notes).slice(0,5000):null,
      lead_id:leadId,
      client_id:clientId,
      user_id:String(user.id),
    }).select('id').single()
    if(error)throw error
    return json({success:true,id:data.id})
  }catch(err){
    console.error('[log-call]',err)
    return json({error:'Could not log call'},500)
  }
})
