import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const ADMIN_TENANT='a0000000-0000-0000-0000-000000000001'
const ACK='<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Ruth-Neural" language="en-US">Thank you. Your message has been recorded. RomyLabs will return your call as soon as possible.</Say></Response>'
const resp=(status=200)=>new Response(ACK,{status,headers:{'Content-Type':'text/xml'}})
const normalize=(v:string)=>{const d=String(v||'').replace(/\D/g,'');return d.length===10?`+1${d}`:(d.length===11&&d.startsWith('1')?`+${d}`:'')}
function swUrl(raw:string){try{const u=new URL(raw);return u.protocol==='https:'&&(u.hostname==='signalwire.com'||u.hostname.endsWith('.signalwire.com'))}catch{return false}}
async function verify(secret:string,url:string,params:Record<string,string>,sig:string){if(!secret||!sig)return false;let s=url;for(const k of Object.keys(params).sort())s+=k+(params[k]??'');const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-1'},false,['sign']),raw=await crypto.subtle.sign('HMAC',key,enc.encode(s)),expected=btoa(String.fromCharCode(...new Uint8Array(raw)));if(expected.length!==sig.length)return false;let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^sig.charCodeAt(i);return diff===0}
serve(async req=>{
  if(req.method!=='POST')return resp(405)
  try{
    const raw=await req.text(),form=new URLSearchParams(raw),params:Record<string,string>={};for(const[k,v]of form)params[k]=v
    const secret=Deno.env.get('SW_SIGNING_SECRET')||'',sig=req.headers.get('x-signalwire-signature')||''
    if(secret&&!await verify(secret,req.url,params,sig))return resp(403)
    const from=String(form.get('From')||''),to=String(form.get('To')||''),url=String(form.get('RecordingUrl')||''),sid=String(form.get('CallSid')||'').trim(),duration=String(form.get('RecordingDuration')||'')
    const romy=normalize(Deno.env.get('ROMYLABS_PHONE_NUMBER')||'')
    if(!sid||normalize(to)!==romy||!swUrl(url))return resp(400)
    const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const {data:existing}=await db.from('voicemails').select('id').eq('tenant_id',ADMIN_TENANT).eq('call_sid',sid).maybeSingle()
    if(existing)return resp()
    const {data:s}=await db.from('settings').select('sw_project_id,sw_api_token').not('sw_api_token','is',null).limit(1).maybeSingle()
    let stored=url
    if(s?.sw_project_id&&s?.sw_api_token){
      try{
        const audio=await fetch(url.endsWith('.mp3')?url:`${url}.mp3`,{headers:{Authorization:'Basic '+btoa(`${s.sw_project_id}:${s.sw_api_token}`)}})
        if(audio.ok){const bytes=new Uint8Array(await audio.arrayBuffer()),path=`${ADMIN_TENANT}/romylabs_vm_${sid.replace(/[^A-Za-z0-9_-]/g,'')}_${crypto.randomUUID()}.mp3`;const{error:up}=await db.storage.from('voicemails').upload(path,bytes,{contentType:'audio/mpeg',upsert:false});if(!up){const{data:signed}=await db.storage.from('voicemails').createSignedUrl(path,60*60*24*30);if(signed?.signedUrl)stored=signed.signedUrl}}
      }catch(e){console.error('[romylabs-voicemail-recorded] audio',e)}
    }
    const {error}=await db.from('voicemails').insert({from_number:from.slice(0,32),to_number:to.slice(0,32),recording_url:stored,duration_seconds:/^\d+$/.test(duration)?Math.min(Number(duration),3600):null,call_sid:sid,is_read:false,created_at:new Date().toISOString(),tenant_id:ADMIN_TENANT})
    if(error&&error.code!=='23505')throw error
    return resp()
  }catch(e){console.error('[romylabs-voicemail-recorded]',e);return resp(500)}
})
