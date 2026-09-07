import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1'

const corsHeaders={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
}
const LEGACY_BUCKET='office-agreements'
const ESIGN_BUCKET='romylabs-esign'
const PLATFORM_ADMIN_EMAILS=new Set(['romy@taxcasereview.org','romy@romylabs.com','romy@taxrescrm.net','info@romylabs.com'])
const enc=new TextEncoder()
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})
async function sha256(s:string){const b=await crypto.subtle.digest('SHA-256',enc.encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function ip(req:Request){return req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||null}
function safeFile(v:string){return String(v||'document.pdf').replace(/[^a-zA-Z0-9._-]/g,'_')}

serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders})
  if(req.method!=='POST')return json({error:'POST only'},405)
  try{
    const url=Deno.env.get('SUPABASE_URL')!
    const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey=Deno.env.get('SUPABASE_ANON_KEY')!
    const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
    const b=await req.json().catch(()=>({}))
    const action=String(b.action||'')

    // Token-scoped public signing actions. No anonymous database/storage access is exposed.
    if(action==='esign_load'||action==='esign_sign'){
      const signingToken=String(b.token||'')
      if(signingToken.length<32)return json({error:'Invalid signing link'},400)
      const hash=await sha256(signingToken)
      const {data:doc,error:de}=await admin.from('romylabs_office_signing_documents').select('*').eq('token_hash',hash).maybeSingle()
      if(de||!doc)return json({error:'Signing request not found'},404)
      if(doc.status==='void')return json({error:'This signing request was voided'},410)
      if(doc.expires_at&&new Date(doc.expires_at).getTime()<Date.now()&&doc.status!=='signed')return json({error:'This signing link has expired'},410)

      if(action==='esign_load'){
        if(doc.status==='sent'){
          const audit=[...(Array.isArray(doc.audit)?doc.audit:[]),{event:'viewed',at:new Date().toISOString(),ip:ip(req),user_agent:req.headers.get('user-agent')}]
          await admin.from('romylabs_office_signing_documents').update({status:'viewed',opened_at:new Date().toISOString(),updated_at:new Date().toISOString(),audit}).eq('id',doc.id).eq('status','sent')
        }
        const path=doc.status==='signed'&&doc.signed_path?doc.signed_path:doc.source_path
        const {data:u,error:ue}=await admin.storage.from(ESIGN_BUCKET).createSignedUrl(path,600)
        if(ue||!u?.signedUrl)return json({error:'Could not open document'},500)
        return json({ok:true,document:{id:doc.id,title:doc.title,firm_name:doc.firm_name,signer_name:doc.signer_name,signer_email:doc.signer_email,fields:doc.fields,status:doc.status,signed_at:doc.signed_at,expires_at:doc.expires_at,file_url:u.signedUrl}})
      }

      if(doc.status==='signed')return json({ok:true,already_signed:true,signed_at:doc.signed_at})
      if(!['sent','viewed'].includes(doc.status))return json({error:'Document is not available for signing'},409)
      const signatureName=String(b.signature_name||'').trim()
      const values=b.values&&typeof b.values==='object'?b.values:{}
      if(!signatureName)return json({error:'Signature name is required'},400)
      if(b.consent!==true)return json({error:'Electronic signature consent is required'},400)
      const fields=Array.isArray(doc.fields)?doc.fields:[]
      for(const f of fields){
        const value=String(values[f.id]??'').trim()
        if(f.required!==false&&!value&&!['date','signature','name','initials'].includes(f.type))return json({error:`Complete required field: ${f.label||f.type}`},400)
      }
      const {data:file,error:fe}=await admin.storage.from(ESIGN_BUCKET).download(doc.source_path)
      if(fe||!file)return json({error:'Could not load source document'},500)
      const pdf=await PDFDocument.load(new Uint8Array(await file.arrayBuffer()))
      const regular=await pdf.embedFont(StandardFonts.Helvetica)
      const oblique=await pdf.embedFont(StandardFonts.HelveticaOblique)
      const pages=pdf.getPages()
      for(const f of fields){
        const page=pages[Math.max(0,Math.min(pages.length-1,Number(f.page||1)-1))]
        if(!page)continue
        const {width,height}=page.getSize()
        const x=Math.max(0,Math.min(1,Number(f.x||0)))*width
        const boxW=Math.max(.03,Math.min(1,Number(f.w||.22)))*width
        const boxH=Math.max(.02,Math.min(1,Number(f.h||.055)))*height
        const top=Math.max(0,Math.min(1,Number(f.y||0)))*height
        const y=Math.max(3,height-top-boxH+Math.min(3,boxH*.1))
        let text=String(values[f.id]??'').trim()
        if(f.type==='signature')text=signatureName
        if(f.type==='initials'&&!text)text=signatureName.split(/\s+/).filter(Boolean).map((p:string)=>p[0]).join('').slice(0,4).toUpperCase()
        if(f.type==='date')text=new Date().toLocaleDateString('en-US',{timeZone:'America/New_York'})
        if(f.type==='name'&&!text)text=doc.signer_name||signatureName
        const size=Math.max(8,Math.min(f.type==='signature'?18:12,boxH*.55))
        page.drawText(text.slice(0,200),{x:x+3,y:y+Math.max(0,(boxH-size)/2),size,font:f.type==='signature'?oblique:regular,color:rgb(.05,.12,.22),maxWidth:Math.max(10,boxW-6)})
      }
      const finalBytes=await pdf.save()
      const signedPath=`${doc.product_key}/${doc.external_office_id}/${doc.id}/signed-${crypto.randomUUID()}-${safeFile(doc.source_filename)}`
      const {error:up}=await admin.storage.from(ESIGN_BUCKET).upload(signedPath,finalBytes,{contentType:'application/pdf',upsert:false})
      if(up)return json({error:'Could not save signed document: '+up.message},500)
      const now=new Date().toISOString()
      const audit=[...(Array.isArray(doc.audit)?doc.audit:[]),{event:'signed',at:now,signer:signatureName,email:doc.signer_email,consent_to_esign:true,ip:ip(req),user_agent:req.headers.get('user-agent')}]
      const {data:updated,error:upd}=await admin.from('romylabs_office_signing_documents').update({status:'signed',signed_path:signedPath,signed_at:now,signature_name:signatureName,signer_ip:ip(req),signer_user_agent:req.headers.get('user-agent'),audit,updated_at:now}).eq('id',doc.id).in('status',['sent','viewed']).select('id').maybeSingle()
      if(upd){await admin.storage.from(ESIGN_BUCKET).remove([signedPath]);return json({error:'Could not finalize signature'},500)}
      if(!updated){await admin.storage.from(ESIGN_BUCKET).remove([signedPath]);return json({error:'This document was already signed or is no longer signable'},409)}
      return json({ok:true,signed_at:now})
    }

    // All management actions below require a real authenticated platform-admin JWT.
    const token=(req.headers.get('Authorization')||'').replace('Bearer ','')
    if(!token)return json({error:'Missing authorization'},401)
    const asCaller=createClient(url,anonKey,{global:{headers:{Authorization:`Bearer ${token}`}}})
    const {data:{user},error:userErr}=await asCaller.auth.getUser()
    if(userErr||!user?.email)return json({error:'Invalid session'},401)
    const email=user.email.toLowerCase()
    if(!PLATFORM_ADMIN_EMAILS.has(email))return json({error:'Not authorized'},403)

    if(action==='esign_geturl'){
      const path=String(b.file_path||'')
      if(!path)return json({error:'file_path is required'},400)
      const {data,error}=await admin.storage.from(ESIGN_BUCKET).createSignedUrl(path,300)
      if(error)return json({error:error.message},400)
      return json({url:data.signedUrl})
    }

    // Legacy office-agreement file actions retained.
    if(action==='upload'){
      const {tenant_id,file_name,file_base64,content_type,label}=b
      if(!tenant_id||!file_name||!file_base64)return json({error:'tenant_id, file_name, and file_base64 are required'},400)
      const bytes=Uint8Array.from(atob(file_base64),c=>c.charCodeAt(0))
      const path=`${tenant_id}/${Date.now()}-${safeFile(file_name)}`
      const {error:upErr}=await admin.storage.from(LEGACY_BUCKET).upload(path,bytes,{contentType:content_type||'application/octet-stream',upsert:false})
      if(upErr)return json({error:'Upload failed: '+upErr.message},400)
      const {data:rpcData,error:rpcErr}=await admin.rpc('add_office_agreement',{p_tenant_id:tenant_id,p_file_name:file_name,p_file_path:path,p_file_size:bytes.length,p_label:label||null,p_uploaded_by:user.email})
      if(rpcErr){await admin.storage.from(LEGACY_BUCKET).remove([path]);return json({error:rpcErr.message},400)}
      return json(rpcData)
    }
    if(action==='geturl'){
      const {file_path}=b
      if(!file_path)return json({error:'file_path is required'},400)
      const {data,error}=await admin.storage.from(LEGACY_BUCKET).createSignedUrl(file_path,300)
      if(error)return json({error:error.message},400)
      return json({url:data.signedUrl})
    }
    if(action==='delete'){
      const {agreement_id}=b
      if(!agreement_id)return json({error:'agreement_id is required'},400)
      const {data:rpcData,error:rpcErr}=await admin.rpc('delete_office_agreement',{p_id:agreement_id})
      if(rpcErr)return json({error:rpcErr.message},400)
      const path=(rpcData as any)?.file_path
      if(path)await admin.storage.from(LEGACY_BUCKET).remove([path])
      return json({ok:true})
    }
    return json({error:'Unknown action'},400)
  }catch(e){console.error('[office-agreement-file]',e);return json({error:String((e as Error)?.message||e)},500)}
})
