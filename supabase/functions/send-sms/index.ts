import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}
const digits=(v:any)=>String(v||'').replace(/\D/g,'')
serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders})
 if(req.method!=='POST')return new Response(JSON.stringify({error:'Method not allowed'}),{status:405,headers:{...corsHeaders,'Content-Type':'application/json'}})
 try{
  const url=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!
  const admin=createClient(url,service), payload=await req.json(); const {to,body,lead_id,client_id,user_id,employee_portal_token}=payload
  if(!to||!String(body||'').trim())return new Response(JSON.stringify({error:'to and body are required'}),{status:400,headers:{...corsHeaders,'Content-Type':'application/json'}})
  if(String(body).length>1600)return new Response(JSON.stringify({error:'Message is too long'}),{status:400,headers:{...corsHeaders,'Content-Type':'application/json'}})
  let tenantId:string|null=null,sentBy='CRM',employeeName:string|null=null
  const auth=req.headers.get('authorization')||''
  if(auth.startsWith('Bearer ')&&anon){
    const jwt=auth.slice(7),uc=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${jwt}`}}});const{data:u}=await uc.auth.getUser(jwt)
    if(u?.user){const{data:t}=await uc.rpc('current_tenant_id');tenantId=t||null;sentBy=u.user.email||'CRM'}
  }
  if(!tenantId&&employee_portal_token){
    if(!client_id)return new Response(JSON.stringify({error:'client_id is required for employee portal SMS'}),{status:403,headers:{...corsHeaders,'Content-Type':'application/json'}})
    const{data:s}=await admin.from('employee_portal_sessions').select('employee_id,employee_name,tenant_id,expires_at').eq('token',String(employee_portal_token)).gt('expires_at',new Date().toISOString()).maybeSingle()
    if(s){
      tenantId=s.tenant_id;employeeName=s.employee_name;sentBy=s.employee_name||'Employee Portal'
      const{data:c}=await admin.from('clients').select('id,name,phone,phone2,assignedto,assignedTo,taxAssociate,tenant_id').eq('id',String(client_id)).eq('tenant_id',tenantId).maybeSingle()
      if(!c||(c.assignedto!==employeeName&&c.assignedTo!==employeeName&&c.taxAssociate!==employeeName)||digits(c.phone||c.phone2).slice(-10)!==digits(to).slice(-10))return new Response(JSON.stringify({error:'Client is not assigned to this employee'}),{status:403,headers:{...corsHeaders,'Content-Type':'application/json'}})
    }
  }
  if(!tenantId)return new Response(JSON.stringify({error:'Unauthorized'}),{status:401,headers:{...corsHeaders,'Content-Type':'application/json'}})
  const{data:settings}=await admin.from('settings').select('sw_space_url,sw_project_id,sw_api_token,sw_inbound_did,sw_outbound_did').eq('tenant_id',tenantId).maybeSingle()
  if(!settings?.sw_space_url||!settings?.sw_project_id||!settings?.sw_api_token)return new Response(JSON.stringify({error:'SignalWire not configured'}),{status:422,headers:{...corsHeaders,'Content-Type':'application/json'}})
  const fromNumber=settings.sw_outbound_did||settings.sw_inbound_did;if(!fromNumber)return new Response(JSON.stringify({error:'SMS sending number not configured'}),{status:422,headers:{...corsHeaders,'Content-Type':'application/json'}})
  const authHeader=btoa(`${settings.sw_project_id}:${settings.sw_api_token}`),form=new URLSearchParams({From:fromNumber,To:String(to),Body:String(body).trim()})
  const swRes=await fetch(`https://${settings.sw_space_url}/api/laml/2010-04-01/Accounts/${settings.sw_project_id}/Messages.json`,{method:'POST',headers:{Authorization:`Basic ${authHeader}`,'Content-Type':'application/x-www-form-urlencoded'},body:form.toString()});const sw=await swRes.json()
  if(!swRes.ok)return new Response(JSON.stringify({error:sw.message||'SignalWire error'}),{status:400,headers:{...corsHeaders,'Content-Type':'application/json'}})
  let clientName:string|null=null;if(client_id){const{data:c}=await admin.from('clients').select('name').eq('id',String(client_id)).eq('tenant_id',tenantId).maybeSingle();clientName=c?.name||null}
  const{error:logErr}=await admin.from('sms_messages').insert({clientName,phone:String(to),body:String(body).trim(),status:sw.status||'sent',direction:'outbound',signalwire_sms_id:sw.sid||null,sent_by:sentBy,tenant_id:tenantId,client_id:client_id?String(client_id):null,read:true})
  if(logErr)console.error('[send-sms] log failed',logErr.message)
  return new Response(JSON.stringify({success:true,sid:sw.sid}),{headers:{...corsHeaders,'Content-Type':'application/json'}})
 }catch(e){console.error('[send-sms]',e);return new Response(JSON.stringify({error:e?.message||'Send failed'}),{status:500,headers:{...corsHeaders,'Content-Type':'application/json'}})}
})