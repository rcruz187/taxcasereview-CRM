import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const URL=Deno.env.get('SUPABASE_URL')!
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})

function safeEqual(a:string,b:string){
  if(!a||!b||a.length!==b.length)return false
  let diff=0
  for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i)
  return diff===0
}

serve(async req=>{
  if(req.method!=='POST')return json({error:'Method not allowed'},405)
  try{
    const supplied=req.headers.get('x-internal-call-secret')||''
    if(!safeEqual(supplied,SERVICE))return json({error:'Unauthorized'},401)

    const { voicemail_id, storage_path }=await req.json()
    if(!voicemail_id||!storage_path)return json({error:'voicemail_id and storage_path required'},400)

    const db=createClient(URL,SERVICE)
    const {data:vm,error:vmErr}=await db.from('voicemails')
      .select('id,tenant_id').eq('id',voicemail_id)
      .eq('tenant_id','a0000000-0000-0000-0000-000000000001')
      .limit(1).maybeSingle()
    if(vmErr||!vm)return json({error:'Voicemail not found'},404)

    const key=Deno.env.get('GROQ_API_KEY')||''
    if(!key){
      await db.from('voicemails').update({transcription_status:'unavailable'}).eq('id',voicemail_id).eq('tenant_id',vm.tenant_id)
      return json({ok:true,skipped:'GROQ_API_KEY missing'})
    }

    await db.from('voicemails').update({transcription_status:'processing'}).eq('id',voicemail_id).eq('tenant_id',vm.tenant_id)
    const {data:audio,error:downloadErr}=await db.storage.from('voicemails').download(String(storage_path))
    if(downloadErr||!audio){
      await db.from('voicemails').update({transcription_status:'failed'}).eq('id',voicemail_id).eq('tenant_id',vm.tenant_id)
      return json({error:'Unable to load voicemail audio'},500)
    }

    const form=new FormData()
    form.append('file',audio,'voicemail.mp3')
    form.append('model','whisper-large-v3')
    form.append('response_format','text')
    const resp=await fetch('https://api.groq.com/openai/v1/audio/transcriptions',{
      method:'POST',
      headers:{Authorization:`Bearer ${key}`},
      body:form,
    })
    if(!resp.ok){
      console.error('[romylabs-voicemail-transcribe] whisper',resp.status,await resp.text())
      await db.from('voicemails').update({transcription_status:'failed'}).eq('id',voicemail_id).eq('tenant_id',vm.tenant_id)
      return json({error:'Transcription provider failed'},502)
    }

    const transcript=(await resp.text()).trim().slice(0,20000)
    await db.from('voicemails').update({
      transcript:transcript||null,
      transcription_status:transcript?'complete':'empty',
    }).eq('id',voicemail_id).eq('tenant_id',vm.tenant_id)

    return json({ok:true})
  }catch(e){
    console.error('[romylabs-voicemail-transcribe]',e)
    return json({error:'Transcription failed'},500)
  }
})
