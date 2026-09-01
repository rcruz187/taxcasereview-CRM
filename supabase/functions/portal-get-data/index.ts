// portal-get-data
// Returns Client Portal data strictly scoped to the tenant and client bound
// to the opaque portal session token. Service-role access is never used
// without both tenant and client/session constraints.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({error:'Method not allowed'},405)
  try {
    const { token } = await req.json()
    if (!token || String(token).length > 256) return json({ error: 'Missing or invalid token' },400)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: session } = await supabase.from('portal_sessions').select('token,client_id,is_lead,client_name,tenant_id,expires_at').eq('token', String(token)).maybeSingle()
    if (!session || !session.tenant_id || new Date(session.expires_at).getTime() < Date.now()) {
      return json({ error: 'Session expired — please log in again.' },401)
    }

    const clientName = String(session.client_name||'')
    const clientId = String(session.client_id||'')
    const tenantId = String(session.tenant_id)
    const isLead = !!session.is_lead
    if(!clientId||!clientName)return json({error:'Invalid portal session'},401)

    const clientTable = isLead ? 'leads' : 'clients'
    const clientSelectFields = isLead
      ? 'id,name,email'
      : 'id,name,email,autopay_enabled,autopay_amount,autopay_frequency,autopay_next_charge,default_payment_method_id,payment_method_brand,payment_method_last4,payment_plan_changes'

    const clientRecordQ=supabase.from(clientTable).select(clientSelectFields).eq('id',clientId).eq('tenant_id',tenantId).maybeSingle()
    const complianceQ=(isLead
      ? supabase.from('client_compliance_records').select('*').eq('tenant_id',tenantId).eq('client_name',clientName)
      : supabase.from('client_compliance_records').select('*').eq('tenant_id',tenantId).eq('client_id',clientId))
    const documentsQ=(isLead
      ? supabase.from('documents').select('*').eq('tenant_id',tenantId).eq('client',clientName)
      : supabase.from('documents').select('*').eq('tenant_id',tenantId).eq('client_id',clientId)).order('created_at',{ascending:false})
    const bookkeepingQ=(isLead
      ? supabase.from('bookkeeping').select('*').eq('tenant_id',tenantId).eq('client_name',clientName)
      : supabase.from('bookkeeping').select('*').eq('tenant_id',tenantId).eq('client_id',clientId)).order('date',{ascending:false})
    const paymentsQ=(isLead
      ? supabase.from('payments').select('*').eq('tenant_id',tenantId).eq('clientName',clientName)
      : supabase.from('payments').select('*').eq('tenant_id',tenantId).eq('client_id',clientId)).order('created_at',{ascending:false})
    const notesQ=(isLead
      ? supabase.from('client_notes').select('*').eq('tenant_id',tenantId).eq('clientname',clientName)
      : supabase.from('client_notes').select('*').eq('tenant_id',tenantId).eq('client_id',clientId)).eq('visible_to_client',true).order('created_at',{ascending:false})
    const organizersQ=(isLead
      ? supabase.from('tax_organizer_responses').select('id,tax_year,status,updated_at').eq('tenant_id',tenantId).eq('client_name',clientName)
      : supabase.from('tax_organizer_responses').select('id,tax_year,status,updated_at').eq('tenant_id',tenantId).eq('client_id',clientId)).order('tax_year',{ascending:false})
    const invoicesQ=(isLead
      ? supabase.from('invoices').select('*').eq('tenant_id',tenantId).eq('clientName',clientName)
      : supabase.from('invoices').select('*').eq('tenant_id',tenantId).eq('client_id',clientId)).neq('status','Paid').order('created_at',{ascending:false})
    const smsQ=(isLead
      ? supabase.from('sms_messages').select('*').eq('tenant_id',tenantId).eq('clientName',clientName)
      : supabase.from('sms_messages').select('*').eq('tenant_id',tenantId).eq('client_id',clientId)).order('created_at',{ascending:true})
    const fpQ=(isLead
      ? supabase.from('client_financial_profiles').select('*').eq('tenant_id',tenantId).eq('client_name',clientName)
      : supabase.from('client_financial_profiles').select('*').eq('tenant_id',tenantId).eq('client_id',clientId)).maybeSingle()
    const emailsQ=(isLead
      ? supabase.from('emails').select('*').eq('tenant_id',tenantId).eq('clientName',clientName)
      : supabase.from('emails').select('*').eq('tenant_id',tenantId).eq('client_id',clientId)).order('created_at',{ascending:false})

    const results=await Promise.all([clientRecordQ,complianceQ,documentsQ,bookkeepingQ,paymentsQ,notesQ,organizersQ,invoicesQ,smsQ,fpQ,emailsQ])
    const firstError=results.find((r:any)=>r.error)?.error
    if(firstError){console.error('[portal-get-data] scoped query failed',firstError.message);return json({error:'Unable to load portal data'},500)}
    const [clientRecord,comp,docsData,books,pays,notesData,orgs,invs,sms,fp,emailsData]=results.map((r:any)=>r.data)
    if(!clientRecord)return json({error:'Portal record not found'},404)

    return json({
      client: clientRecord, isLead,
      compliance: comp || [], documents: docsData || [], bookkeeping: books || [],
      payments: pays || [], notes: notesData || [], organizers: orgs || [],
      invoices: invs || [], sms: sms || [], financialProfile: fp || null,
      emails: emailsData || [],
    })
  } catch (e) {
    console.error('portal-get-data error:', e)
    return json({ error: 'Unable to load portal data' },500)
  }
})
