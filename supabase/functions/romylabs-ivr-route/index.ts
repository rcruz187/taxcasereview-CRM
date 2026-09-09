import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
declare const EdgeRuntime:{waitUntil(p:Promise<unknown>):void}
const ADMIN_TENANT='a0000000-0000-0000-0000-000000000001'
const xml=(s:string,status=200)=>new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${s}</Response>`,{status,headers:{'Content-Type':'text/xml'}})
const normalize=(v:string)=>{const d=String(v||'').replace(/\D/g,'');return d.length===10?`+1${d}`:(d.length===11&&d.startsWith('1')?`+${d}`:'')}
async function verify(secret:string,url:string,params:Record<string,string>,sig:string){if(!secret||!sig)return false;let s=url;for(const k of Object.keys(params).sort())s+=k+(params[k]??'');const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-1'},false,['sign']),raw=await crypto.subtle.sign('HMAC',key,enc.encode(s)),expected=btoa(String.fromCharCode(...new Uint8Array(raw)));if(expected.length!==sig.length)return false;let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^sig.charCodeAt(i);return diff===0}
serve(async req=>{
  if(req.method!=='POST')return xml('',405)
  const raw=await req.text(),form=new URLSearchParams(raw),params:Record<string,string>={};for(const[k,v]of form)params[k]=v
  const secret=Deno.env.get('SW_SIGNING_SECRET')||'',sig=req.headers.get('x-signalwire-signature')||''
  if(secret&&!await verify(secret,req.url,params,sig))return xml('<Hangup/>',403)
  const digits=form.get('Digits')||'',callSid=form.get('CallSid')||'',from=form.get('From')||'',to=form.get('To')||''
  const romy=normalize(Deno.env.get('ROMYLABS_PHONE_NUMBER')||'')
  if(!callSid||!romy||normalize(to)!==romy)return xml('<Hangup/>',403)
  const base=`${Deno.env.get('SUPABASE_URL')}/functions/v1`
  if(digits==='0'||!['1','2','3','4'].includes(digits))return xml(`<Redirect method="POST">${base}/romylabs-voicemail-prompt</Redirect>`)
  const dept:any={'1':'RomyLabs Sales','2':'RomyLabs Support','3':'RomyLabs Billing','4':'Romy'}
  const conf=`romylabs-${digits}-${callSid}`.replace(/[^A-Za-z0-9_-]/g,'').slice(0,160)
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const {error}=await db.from('incoming_calls').insert({callsid:callSid,conference_name:conf,from_number:from.slice(0,32),department:dept[digits],status:'ringing',tenant_id:ADMIN_TENANT})
  if(error&&error.code!=='23505')throw error

  // Server-side no-answer watchdog. The browser also has a voicemail timeout,
  // but RomyLabs must still reach voicemail when nobody has the Admin Portal open.
  const noAnswer = new Promise<void>(resolve => setTimeout(resolve, 28000)).then(async()=>{
    try{
      const {data:row}=await db.from('incoming_calls').select('status').eq('tenant_id',ADMIN_TENANT).eq('callsid',callSid).limit(1).maybeSingle()
      if(row?.status!=='ringing')return
      const {data:settings}=await db.from('settings')
        .select('sw_space_url,sw_project_id,sw_api_token')
        .not('sw_api_token','is',null).not('sw_space_url','is',null).limit(1).maybeSingle()
      if(!settings?.sw_space_url||!settings?.sw_project_id||!settings?.sw_api_token)return
      const space=String(settings.sw_space_url).replace(/^https?:\/\//,'')
      const providerAuth='Basic '+btoa(`${settings.sw_project_id}:${settings.sw_api_token}`)
      const redirect=await fetch(`https://${space}/api/laml/2010-04-01/Accounts/${settings.sw_project_id}/Calls/${callSid}.json`,{
        method:'POST',
        headers:{Authorization:providerAuth,'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({Url:`${base}/romylabs-voicemail-prompt`,Method:'POST'})
      })
      if(redirect.ok){
        await db.from('incoming_calls').update({status:'missed'}).eq('tenant_id',ADMIN_TENANT).eq('callsid',callSid).eq('status','ringing')
      }else{
        console.error('[romylabs-ivr-route] no-answer redirect failed',redirect.status,await redirect.text())
      }
    }catch(e){console.error('[romylabs-ivr-route] no-answer watchdog',e)}
  })
  try{EdgeRuntime.waitUntil(noAnswer)}catch{void noAnswer}

  return xml(`<Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false" waitUrl="${base}/romylabs-hold-music" waitMethod="GET" statusCallback="${base}/caller-hangup?conf=${encodeURIComponent(conf)}&tenant=${ADMIN_TENANT}" statusCallbackEvent="leave end" statusCallbackMethod="POST" record="record-from-start" recordingStatusCallback="${base}/call-recorded?tenant=${ADMIN_TENANT}&callsid=${encodeURIComponent(callSid)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}">${conf}</Conference></Dial>`)
})
