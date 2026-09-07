import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BASE=`${Deno.env.get('SUPABASE_URL')}/functions/v1`
const VOICEMAIL_PROMPT_URL=`${BASE}/voicemail-prompt`
const CALL_RECORDED_URL=`${BASE}/call-recorded`
const HOLD_MUSIC_URL=`${BASE}/hold-music`
const CALLER_HANGUP_URL=`${BASE}/caller-hangup`
const xml=(body:string,status=200)=>new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`,{status,headers:{'Content-Type':'text/xml'}})

async function verifySW(secret:string,url:string,params:Record<string,string>,sig:string){
  if(!secret||!sig)return false
  let payload=url
  for(const k of Object.keys(params).sort())payload+=k+(params[k]??'')
  const enc=new TextEncoder()
  const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-1'},false,['sign'])
  const raw=await crypto.subtle.sign('HMAC',key,enc.encode(payload))
  const expected=btoa(String.fromCharCode(...new Uint8Array(raw)))
  if(expected.length!==sig.length)return false
  let diff=0
  for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^sig.charCodeAt(i)
  return diff===0
}

serve(async(req)=>{
  if(req.method!=='POST')return xml('<Hangup/>',405)
  const body=await req.text()
  const params=new URLSearchParams(body)
  const swSecret=Deno.env.get('SW_SIGNING_SECRET')??''
  if(swSecret){
    const sig=req.headers.get('x-signalwire-signature')??''
    const map:Record<string,string>={}
    for(const[k,v]of params)map[k]=v
    if(!await verifySW(swSecret,req.url,map,sig))return xml('<Hangup/>',403)
  }else console.warn('[ivr-extension] SW_SIGNING_SECRET absent; restricted structural validation only')

  const digits=String(params.get('Digits')||'').trim()
  const callSid=String(params.get('CallSid')||'').trim()
  const from=String(params.get('From')||'').trim()
  const to=String(params.get('To')||'').trim()
  if(!/^\d{1,6}$/.test(digits)||!callSid||!from||!to)return xml('<Hangup/>',400)

  try{
    const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const to10=to.replace(/\D/g,'').slice(-10)
    if(to10.length!==10)return xml('<Hangup/>',400)
    const {data:settings,error:settingsErr}=await supabase.from('settings').select('tenant_id,sw_inbound_did').not('tenant_id','is',null).not('sw_inbound_did','is',null)
    if(settingsErr)throw settingsErr
    const matches=(settings||[]).filter((r:any)=>String(r.sw_inbound_did||'').replace(/\D/g,'').slice(-10)===to10)
    if(matches.length!==1){console.error('[ivr-extension] DID did not resolve uniquely',{to10,matches:matches.length});return xml('<Hangup/>',403)}
    const tenantId=String(matches[0].tenant_id)

    const {data:emp,error:empErr}=await supabase.from('employees').select('id,name,extension,status,tenant_id').eq('tenant_id',tenantId).eq('extension',digits).limit(1).maybeSingle()
    if(empErr)throw empErr
    if(!emp||String(emp.status||'Active').toLowerCase()!=='active'){
      const spoken=digits.split('').join(' ')
      return xml(`<Say voice="Polly.Joanna-Neural">Sorry, extension ${spoken} was not found. Please leave a message after the tone.</Say><Redirect method="POST">${VOICEMAIL_PROMPT_URL}</Redirect>`)
    }

    const conferenceName=`ext-${digits}-${callSid}`.replace(/[^A-Za-z0-9_-]/g,'').slice(0,160)
    const department=`Extension ${digits} — ${String(emp.name||'Team Member').replace(/[<>&"]/g,'').slice(0,100)}`
    const {error:insErr}=await supabase.from('incoming_calls').insert({callsid:callSid,conference_name:conferenceName,from_number:from.slice(0,32),department,status:'ringing',tenant_id:tenantId})
    if(insErr&&insErr.code!=='23505')throw insErr

    return xml(`<Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false" waitUrl="${HOLD_MUSIC_URL}" waitMethod="GET" statusCallback="${CALLER_HANGUP_URL}?conf=${encodeURIComponent(conferenceName)}" statusCallbackEvent="leave end" statusCallbackMethod="POST" record="record-from-start" recordingStatusCallback="${CALL_RECORDED_URL}">${conferenceName}</Conference></Dial>`)
  }catch(err){
    console.error('[ivr-extension]',err)
    return xml('<Say voice="Polly.Joanna-Neural">We are sorry, an error occurred. Please try again.</Say><Hangup/>',500)
  }
})
