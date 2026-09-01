// trigger-workflow
// Anonymous post-sign workflow bridge. The browser cannot choose the e-sign
// record: we derive its id from the same-origin /sign/:id Referer, verify that
// it is signed, compare the legacy body fields to the stored row, and claim the
// trigger exactly once before any service-role task creation.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://taxrescrm.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json','Cache-Control':'no-store'}})

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ok:false,error:'Method not allowed'},405)

  try {
    const origin=req.headers.get('origin')||''
    const referer=req.headers.get('referer')||''
    if(origin!=='https://taxrescrm.app' && origin!=='https://www.taxrescrm.app') return json({ok:false,error:'Unauthorized'},403)
    let esignId=''
    try {
      const ref=new URL(referer)
      if(!['taxrescrm.app','www.taxrescrm.app'].includes(ref.hostname))return json({ok:false,error:'Unauthorized'},403)
      const m=ref.pathname.match(/^\/sign\/([^/?#]+)$/)
      esignId=m?decodeURIComponent(m[1]):''
    } catch { return json({ok:false,error:'Unauthorized'},403) }
    if(!esignId || esignId.length>200)return json({ok:false,error:'Invalid signing request'},400)

    const body=await req.json().catch(()=>null)
    const event=String(body?.event||'')
    if(event!=='esign_signed')return json({ok:false,error:'Invalid trigger'},400)

    const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const {data:signedDoc,error:signedErr}=await supabase.from('esigns')
      .select('id,tenant_id,client_name,doc_type,signed_at,workflow_triggered_at')
      .eq('id',esignId).maybeSingle()
    if(signedErr||!signedDoc?.tenant_id||!signedDoc?.client_name||!signedDoc?.signed_at)return json({ok:false,error:'Signed document not found'},404)

    // The current SignPage still sends these legacy fields. They are never
    // trusted as authority; mismatches reject the request instead of selecting
    // another tenant/entity.
    if(String(body?.tenant_id||'')!==String(signedDoc.tenant_id) ||
       String(body?.entity_name||'')!==String(signedDoc.client_name) ||
       String(body?.doc_type||'')!==String(signedDoc.doc_type||'') ||
       String(body?.entity_type||'')!=='client') return json({ok:false,error:'Signing request mismatch'},403)

    if(signedDoc.workflow_triggered_at)return json({ok:true,tasks_created:0,duplicate:true})
    const claimedAt=new Date().toISOString()
    const {data:claimed,error:claimErr}=await supabase.from('esigns')
      .update({workflow_triggered_at:claimedAt})
      .eq('id',esignId).is('workflow_triggered_at',null).not('signed_at','is',null)
      .select('id')
    if(claimErr)throw claimErr
    if(!claimed?.length)return json({ok:true,tasks_created:0,duplicate:true})

    const entity_type='client'
    const entity_name=String(signedDoc.client_name)
    const tenant_id=String(signedDoc.tenant_id)
    const doc_type=String(signedDoc.doc_type||'')

    const {data:templates,error:tmplErr}=await supabase.from('workflow_templates')
      .select('id,name,trigger_event,trigger_value,entity_type')
      .eq('tenant_id',tenant_id).eq('active',true).eq('trigger_event',event)
    if(tmplErr)throw tmplErr
    const matching=(templates||[]).filter((t:any)=>(t.entity_type===entity_type||t.entity_type==='both')&&(!t.trigger_value||t.trigger_value===doc_type))
    if(!matching.length)return json({ok:true,tasks_created:0})

    const ids=matching.map((t:any)=>t.id)
    const {data:steps,error:stepsErr}=await supabase.from('workflow_steps').select('*').in('template_id',ids).order('step_order')
    if(stepsErr)throw stepsErr
    if(!steps?.length)return json({ok:true,tasks_created:0})

    let advisorName:string|null=null
    const {data:cRows}=await supabase.from('clients').select('assignedTo').eq('name',entity_name).eq('tenant_id',tenant_id).limit(1)
    advisorName=cRows?.[0]?.assignedTo||null
    if(!advisorName){const{data:lRows}=await supabase.from('leads').select('assignedTo').eq('name',entity_name).eq('tenant_id',tenant_id).limit(1);advisorName=lRows?.[0]?.assignedTo||null}

    let associateName:string|null=null
    if(steps.some((s:any)=>s.assigned_role==='ASSOCIATE')){
      const{data:cRows2}=await supabase.from('clients').select('taxAssociate').eq('name',entity_name).eq('tenant_id',tenant_id).limit(1)
      associateName=cRows2?.[0]?.taxAssociate||null
      if(!associateName){const{data:lRows2}=await supabase.from('leads').select('taxAssociate').eq('name',entity_name).eq('tenant_id',tenant_id).limit(1);associateName=lRows2?.[0]?.taxAssociate||null}
      if(!associateName){const{data:rr}=await supabase.rpc('get_next_tax_associate');associateName=rr||advisorName}
    }

    const now=new Date()
    const tasks=steps.map((s:any,idx:number)=>{const due=new Date(now);due.setDate(due.getDate()+(s.due_in_days||1));return{
      title:s.title,clientName:entity_name,assignedTo:s.assigned_role==='ASSOCIATE'?associateName:advisorName,
      priority:'Normal',dueDate:due.toISOString().slice(0,10),done:false,notes:s.notes||'',section_title:s.section_title||null,
      created_at:new Date(now.getTime()+idx*1000).toISOString(),tenant_id,
    }})
    const{error:insertErr}=await supabase.from('tasks').insert(tasks)
    if(insertErr){await supabase.from('esigns').update({workflow_triggered_at:null}).eq('id',esignId).eq('workflow_triggered_at',claimedAt);throw insertErr}
    return json({ok:true,tasks_created:tasks.length})
  }catch(e){console.error('[trigger-workflow]',e);return json({ok:false,error:'Workflow trigger failed'},500)}
})
