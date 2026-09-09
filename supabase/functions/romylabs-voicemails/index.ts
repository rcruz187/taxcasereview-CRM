import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const ADMIN_TENANT='a0000000-0000-0000-0000-000000000001'
const CORS={'Access-Control-Allow-Origin':'https://admin.romylabs.com','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...CORS,'Content-Type':'application/json'}})
serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:CORS})
  if(req.method!=='POST')return json({error:'Method not allowed'},405)
  try{
    const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const auth=req.headers.get('authorization')||''
    if(!auth.toLowerCase().startsWith('bearer '))return json({error:'Unauthorized'},401)
    const token=auth.slice(7).trim(),userClient=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}}})
    const {data:{user},error:userErr}=await userClient.auth.getUser(token)
    if(userErr||!user)return json({error:'Unauthorized'},401)
    const {data:isAdmin}=await userClient.rpc('_is_platform_admin')
    if(isAdmin!==true)return json({error:'Forbidden'},403)
    const db=createClient(url,service),body=await req.json().catch(()=>({})),action=String(body?.action||'list')
    if(action==='list'){
      const {data,error}=await db.from('voicemails').select('id,from_number,to_number,recording_url,duration_seconds,is_read,created_at').eq('tenant_id',ADMIN_TENANT).order('created_at',{ascending:false}).limit(100)
      if(error)return json({error:error.message},500)
      return json({ok:true,voicemails:data||[]})
    }
    if(action==='mark_read'){
      const id=String(body?.id||'')
      if(!id)return json({error:'id required'},400)
      const {error}=await db.from('voicemails').update({is_read:true}).eq('tenant_id',ADMIN_TENANT).eq('id',id)
      return error?json({error:error.message},500):json({ok:true})
    }
    if(action==='delete'){
      const id=String(body?.id||'')
      if(!id)return json({error:'id required'},400)
      const {error}=await db.from('voicemails').delete().eq('tenant_id',ADMIN_TENANT).eq('id',id)
      return error?json({error:error.message},500):json({ok:true})
    }
    return json({error:'Unsupported action'},400)
  }catch(e){console.error('[romylabs-voicemails]',e);return json({error:'Unable to manage RomyLabs voicemails'},500)}
})
