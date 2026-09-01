import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const REMINDER_DAYS=[1,3,7]
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})
function esc(v:unknown){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))}

serve(async(req)=>{
  if(req.method!=='POST')return json({error:'Method not allowed'},405)
  try{
    const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const token=req.headers.get('x-internal-cron-token')||''
    const{data:authorized,error:authErr}=token?await supabase.rpc('verify_internal_cron_token',{provided:token}):{data:false,error:null}
    if(authErr||authorized!==true)return json({error:'Unauthorized'},401)

    const now=new Date();let totalSent=0,totalSkipped=0
    const{data:unsignedDocs,error}=await supabase.from('esigns').select('id,tenant_id,client_name,client_email,doc_type,sent_at,opened_at,reminder_count,reminder_1_sent_at,reminder_2_sent_at,reminder_3_sent_at').is('signed_at',null).not('sent_at','is',null).not('client_email','is',null).lt('reminder_count',3)
    if(error)throw error
    for(const doc of unsignedDocs||[]){
      const sentAt=new Date(doc.sent_at),daysSinceSent=Math.floor((now.getTime()-sentAt.getTime())/86400000),reminderCount=doc.reminder_count||0,reminderNum=reminderCount+1,targetDay=REMINDER_DAYS[reminderCount]
      if(!(daysSinceSent>=targetDay&&reminderNum<=3)){totalSkipped++;continue}
      const{data:settings}=await supabase.from('settings').select('firm_name,email,phone').eq('tenant_id',doc.tenant_id).maybeSingle()
      const firmName=settings?.firm_name||'Tax Resolution CRM',signingUrl=`https://taxrescrm.app/sign/${encodeURIComponent(doc.id)}`
      const subject=reminderNum===1?`Action Required: Please sign your ${doc.doc_type||'document'}`:reminderNum===2?`Reminder: Your ${doc.doc_type||'document'} is still awaiting your signature`:`Final Reminder: Please sign your ${doc.doc_type||'document'} today`
      const openedLine=doc.opened_at?`<p style="font-size:13px;color:#64748b;">✅ You opened this document on ${esc(new Date(doc.opened_at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}))}.</p>`:''
      const html=`<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#fff;"><div style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:24px;">${esc(firmName)}</div><p style="font-size:15px;color:#0f172a;">Dear ${esc(doc.client_name||'Valued Client')},</p>${reminderNum===3?'<p style="font-size:14px;color:#dc2626;font-weight:600;">⚠️ This is your final reminder.</p>':''}<p style="font-size:14px;color:#334155;line-height:1.6;">We are reaching out because your <strong>${esc(doc.doc_type||'document')}</strong> is still awaiting your signature.</p>${openedLine}<div style="text-align:center;margin:28px 0;"><a href="${signingUrl}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:700;">Sign Document Now →</a></div><p style="font-size:13px;color:#64748b;">If you have questions, contact us at ${esc(settings?.phone||'')}.</p><hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"><p style="font-size:11px;color:#94a3b8;">This is reminder ${reminderNum} of 3. Sent by ${esc(firmName)}.</p></div>`
      const{error:emailErr}=await supabase.functions.invoke('send-email',{body:{tenant_id:doc.tenant_id,to:doc.client_email,subject,html}})
      if(emailErr){console.error('[esign-reminders] send failed',doc.id);totalSkipped++;continue}
      const updateField=reminderNum===1?'reminder_1_sent_at':reminderNum===2?'reminder_2_sent_at':'reminder_3_sent_at'
      await supabase.from('esigns').update({[updateField]:now.toISOString(),reminder_count:reminderNum}).eq('id',doc.id).eq('tenant_id',doc.tenant_id).is('signed_at',null)
      totalSent++
    }
    return json({ok:true,sent:totalSent,skipped:totalSkipped})
  }catch(err){console.error('[esign-reminders]',err);return json({error:'E-sign reminder sweep failed'},500)}
})
