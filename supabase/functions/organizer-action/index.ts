// organizer-action
// Standalone Tax Organizer access. The UUID organizer row id is the bearer
// access token; all service-role reads/writes are anchored to the resolved
// organizer tenant/client and request-controlled identity fields are ignored.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}
const MAX_FILE_BYTES=15*1024*1024
const MAX_ANSWERS_BYTES=512*1024
const ARCHIVE_URL_TTL_SECONDS=60*60*24*7
const ALLOWED_MIME=new Set([
  'application/pdf','image/jpeg','image/png','image/heic','image/heif','text/plain','text/csv',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])
const ok=(data:any)=>new Response(JSON.stringify({ok:true,...data}),{headers:{...corsHeaders,'Content-Type':'application/json'}})
const err=(msg:string,status=400)=>new Response(JSON.stringify({error:msg}),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})
function safeFileName(value:string){const base=String(value||'').split(/[\\/]/).pop()||'document',cleaned=base.replace(/[^A-Za-z0-9._() -]+/g,'_').replace(/\.{2,}/g,'.').trim();return(cleaned||'document').slice(0,160)}

serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders})
  if(req.method!=='POST')return err('Method not allowed',405)
  try{
    const body=await req.json()
    const type=String(body?.type||''),organizerId=String(body?.organizerId||'')
    if(!type||type.length>80||!/^[0-9a-f-]{36}$/i.test(organizerId))return err('Missing or invalid type/organizerId')
    const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const {data:organizer,error:orgErr}=await supabase.from('tax_organizer_responses')
      .select('*').eq('id',organizerId).maybeSingle()
    if(orgErr||!organizer||!organizer.tenant_id)return err('Organizer not found or expired.',404)
    const tenantId=String(organizer.tenant_id),clientId=organizer.client_id?String(organizer.client_id):null,clientName=String(organizer.client_name||'')
    if(!clientName)return err('Organizer not found or expired.',404)

    if(type==='get')return ok({record:organizer})

    const answers=body?.answers??{}
    if(type==='save_answers'||type==='submit'){
      let encoded=''
      try{encoded=JSON.stringify(answers)}catch{return err('Invalid organizer answers')}
      if(encoded.length>MAX_ANSWERS_BYTES)return err('Organizer answers are too large',413)
      if(String(organizer.status||'').toLowerCase()==='submitted'&&type==='save_answers')return err('This organizer has already been submitted.',409)
      const updates:any={answers,updated_at:new Date().toISOString()}
      if(type==='submit'){updates.status='Submitted';updates.submitted_at=new Date().toISOString()}
      const {data:updated,error}=await supabase.from('tax_organizer_responses').update(updates)
        .eq('id',organizerId).eq('tenant_id',tenantId).select('id,status,submitted_at,updated_at').maybeSingle()
      if(error)throw error
      if(!updated)return err('Organizer not found or expired.',404)
      return ok(type==='submit'?{record:updated}:{})
    }

    if(type==='upload_document'){
      if(String(organizer.status||'').toLowerCase()==='submitted')return err('This organizer has already been submitted.',409)
      const fileName=safeFileName(String(body?.fileName||'')),fileType=String(body?.fileType||'').toLowerCase().trim(),fileBase64=String(body?.fileBase64||'')
      if(!fileName||!fileBase64)return err('Missing file')
      if(!ALLOWED_MIME.has(fileType))return err('Unsupported file type',415)
      if(fileBase64.length>Math.ceil(MAX_FILE_BYTES*4/3)+16)return err('File is too large',413)
      let binary:string
      try{binary=atob(fileBase64)}catch{return err('Invalid file encoding')}
      if(binary.length===0||binary.length>MAX_FILE_BYTES)return err('File is too large',413)
      const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i)
      const identity=clientId||organizerId,path=`organizer/${tenantId}/${identity}/${organizerId}/${crypto.randomUUID()}_${fileName}`
      const {error:upErr}=await supabase.storage.from('documents').upload(path,bytes,{upsert:false,contentType:fileType})
      if(upErr)throw upErr
      const {data:signedData,error:signErr}=await supabase.storage.from('documents').createSignedUrl(path,ARCHIVE_URL_TTL_SECONDS)
      if(signErr||!signedData?.signedUrl){await supabase.storage.from('documents').remove([path]);throw signErr||new Error('Could not create secure organizer document URL')}
      const payload:any={
        tenant_id:tenantId,client_id:clientId,name:fileName,client:clientName,clientname:clientName,docType:'Tax Organizer',
        notes:`Uploaded via Tax Organizer (${String(organizer.tax_year||'')})`,source:'tax_organizer',uploaded_by:clientName,
        file_url:signedData.signedUrl,url:signedData.signedUrl,file_name:fileName,filename:fileName,file_size:bytes.length,created_at:new Date().toISOString(),
      }
      const {error}=await supabase.from('documents').insert(payload)
      if(error){await supabase.storage.from('documents').remove([path]);throw error}
      return ok({url:signedData.signedUrl})
    }

    return err('Unknown action type')
  }catch(e){console.error('organizer-action error:',e);return err('Organizer action failed',500)}
})
