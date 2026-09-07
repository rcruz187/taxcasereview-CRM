// portal-action
// Client Portal writes authenticated by the opaque session token issued by
// portal-login. Every service-role query/write is tenant + client scoped.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_EXPENSE_JSON_BYTES = 100 * 1024
const ARCHIVE_URL_TTL_SECONDS = 60 * 60 * 24 * 7
const ALLOWED_MIME = new Set([
  'application/pdf','image/jpeg','image/png','image/heic','image/heif','text/plain','text/csv',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})
const ok=(data:any)=>json({ok:true,...data})

async function getSession(supabase:any,token:string){
  const {data:session}=await supabase.from('portal_sessions')
    .select('client_id,is_lead,client_name,tenant_id,expires_at')
    .eq('token',token).maybeSingle()
  if(!session||!session.tenant_id||new Date(session.expires_at).getTime()<Date.now())return null
  return session
}

function safeFileName(value:string){
  const base=String(value||'').split(/[\\/]/).pop()||'document'
  const cleaned=base.replace(/[^A-Za-z0-9._() -]+/g,'_').replace(/\.{2,}/g,'.').trim()
  return (cleaned||'document').slice(0,160)
}

serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders})
  if(req.method!=='POST')return json({error:'Method not allowed'},405)
  try{
    const body=await req.json()
    const token=String(body?.token||''),type=String(body?.type||'')
    if(!token||token.length>256||!type||type.length>80)return json({error:'Missing or invalid token/type'},400)

    const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const session=await getSession(supabase,token)
    if(!session)return json({error:'Session expired — please log in again.'},401)

    const clientName=String(session.client_name||'')
    const clientId=String(session.client_id||'')
    const tenantId=String(session.tenant_id)
    const isLead=!!session.is_lead
    const clientTable=isLead?'leads':'clients'
    if(!clientName||!clientId)return json({error:'Invalid portal session'},401)

    const {data:record,error:recordErr}=await supabase.from(clientTable)
      .select('id,name,email,tenant_id').eq('id',clientId).eq('tenant_id',tenantId).maybeSingle()
    if(recordErr||!record)return json({error:'Portal record not found'},404)

    switch(type){
      case 'increment_payment_plan_changes':{
        if(isLead)return json({error:'Payment-plan tracking is available after client conversion.'},400)
        const {data:cur,error:curErr}=await supabase.from('clients').select('payment_plan_changes')
          .eq('id',clientId).eq('tenant_id',tenantId).maybeSingle()
        if(curErr||!cur)throw curErr||new Error('Client not found')
        const {error}=await supabase.from('clients').update({payment_plan_changes:Number(cur.payment_plan_changes||0)+1})
          .eq('id',clientId).eq('tenant_id',tenantId)
        if(error)throw error
        return ok({})
      }

      case 'save_financial_profile':{
        const expenses=body?.expenses
        const serialized=JSON.stringify(expenses??{})
        if(serialized.length>MAX_EXPENSE_JSON_BYTES)return json({error:'Financial profile data is too large'},413)
        const {data:existing,error:findErr}=await supabase.from('client_financial_profiles')
          .select('id').eq('tenant_id',tenantId).eq('client_id',clientId).limit(1).maybeSingle()
        if(findErr)throw findErr
        if(existing?.id){
          const {error}=await supabase.from('client_financial_profiles').update({expenses:expenses??{},client_name:clientName,updated_at:new Date().toISOString()})
            .eq('id',existing.id).eq('tenant_id',tenantId).eq('client_id',clientId)
          if(error)throw error
        }else{
          const {error}=await supabase.from('client_financial_profiles').insert({tenant_id:tenantId,client_id:clientId,client_name:clientName,expenses:expenses??{},updated_at:new Date().toISOString()})
          if(error)throw error
        }
        return ok({})
      }

      case 'create_tax_organizer':{
        const year=String(body?.year||'')
        const n=Number(year),current=new Date().getUTCFullYear()
        if(!/^\d{4}$/.test(year)||n<2000||n>current+1)return json({error:'Invalid year'},400)
        const {data:existing,error:findErr}=await supabase.from('tax_organizer_responses')
          .select('id,tax_year,status,updated_at').eq('tenant_id',tenantId).eq('client_id',clientId).eq('tax_year',year).limit(1).maybeSingle()
        if(findErr)throw findErr
        if(existing)return ok({organizer:existing,existing:true})
        const {data,error}=await supabase.from('tax_organizer_responses').insert({
          tenant_id:tenantId,client_id:clientId,client_name:clientName,client_email:String(record.email||''),tax_year:year,
          answers:{},status:'In Progress',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),
        }).select().single()
        if(error)throw error
        return ok({organizer:data})
      }

      case 'upload_document':{
        const fileName=safeFileName(String(body?.fileName||''))
        const fileType=String(body?.fileType||'').toLowerCase().trim()
        const fileBase64=String(body?.fileBase64||'')
        const docType=String(body?.docType||'Other').slice(0,100)
        if(!fileName||!fileBase64)return json({error:'Missing file'},400)
        if(!ALLOWED_MIME.has(fileType))return json({error:'Unsupported file type'},415)
        if(fileBase64.length>Math.ceil(MAX_FILE_BYTES*4/3)+16)return json({error:'File is too large'},413)
        let binary:string
        try{binary=atob(fileBase64)}catch{return json({error:'Invalid file encoding'},400)}
        if(binary.length===0||binary.length>MAX_FILE_BYTES)return json({error:'File is too large'},413)
        const bytes=new Uint8Array(binary.length)
        for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i)

        const path=`portal/${tenantId}/${clientId}/${crypto.randomUUID()}_${fileName}`
        const {error:upErr}=await supabase.storage.from('documents').upload(path,bytes,{upsert:false,contentType:fileType})
        if(upErr)throw upErr
        const {data:signedData,error:signErr}=await supabase.storage.from('documents').createSignedUrl(path,ARCHIVE_URL_TTL_SECONDS)
        if(signErr||!signedData?.signedUrl){await supabase.storage.from('documents').remove([path]);throw signErr||new Error('Could not create secure document URL')}

        const {error}=await supabase.from('documents').insert({
          tenant_id:tenantId,client_id:clientId,name:fileName,client:clientName,clientname:clientName,docType,
          notes:'Uploaded by client via portal',source:'client_portal',uploaded_by:clientName,
          file_url:signedData.signedUrl,url:signedData.signedUrl,file_name:fileName,filename:fileName,file_size:bytes.length,
          created_at:new Date().toISOString(),
        })
        if(error){await supabase.storage.from('documents').remove([path]);throw error}
        const {data:docsData,error:docsErr}=await supabase.from('documents').select('*')
          .eq('tenant_id',tenantId).eq('client_id',clientId).order('created_at',{ascending:false})
        if(docsErr)throw docsErr
        return ok({documents:docsData||[]})
      }

      default:return json({error:'Unknown action type'},400)
    }
  }catch(e){
    console.error('portal-action error:',e)
    return json({error:'Portal action failed'},500)
  }
})
