// portal-get-data
// Returns everything the Client Portal needs to display, scoped to
// whichever client the session token belongs to — verified server-side
// via the service role, which is what actually makes this safe (the
// service role bypasses RLS/grants entirely, so there is no dependency on
// anon-role table access at all; the token check here is the only gate).
//
// JWT Verification must be OFF — clients have no CRM login/session, just
// this portal's own token issued by portal-login.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { token } = await req.json()
    if (!token) return new Response(JSON.stringify({ error: 'Missing token' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: session } = await supabase.from('portal_sessions').select('*').eq('token', token).maybeSingle()
    if (!session || new Date(session.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: 'Session expired — please log in again.' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const clientName = session.client_name
    const clientId = session.client_id
    const isLead = session.is_lead

    const clientTable = isLead ? 'leads' : 'clients'
    const clientSelectFields = isLead
      ? 'id,name,email'
      : 'id,name,email,autopay_enabled,autopay_amount,autopay_frequency,autopay_next_charge,default_payment_method_id,payment_method_brand,payment_method_last4,payment_plan_changes'

    const [
      { data: clientRecord },
      { data: comp }, { data: docsData }, { data: books }, { data: pays },
      { data: notesData }, { data: orgs }, { data: invs }, { data: sms },
      { data: fp }, { data: emailsData },
    ] = await Promise.all([
      supabase.from(clientTable).select(clientSelectFields).eq('id', clientId).maybeSingle(),
      supabase.from('client_compliance_records').select('*').eq('client_name', clientName),
      supabase.from('documents').select('*').eq('client', clientName).order('created_at', { ascending: false }),
      supabase.from('bookkeeping').select('*').eq('client_name', clientName).order('date', { ascending: false }),
      supabase.from('payments').select('*').eq('clientName', clientName).order('created_at', { ascending: false }),
      supabase.from('client_notes').select('*').eq('clientname', clientName).eq('visible_to_client', true).order('created_at', { ascending: false }),
      supabase.from('tax_organizer_responses').select('id,tax_year,status,updated_at').eq('client_name', clientName).order('tax_year', { ascending: false }),
      supabase.from('invoices').select('*').eq('clientName', clientName).neq('status', 'Paid').order('created_at', { ascending: false }),
      supabase.from('sms_messages').select('*').eq('clientName', clientName).order('created_at', { ascending: true }),
      supabase.from('client_financial_profiles').select('*').eq('client_name', clientName).maybeSingle(),
      supabase.from('emails').select('*').eq('clientName', clientName).order('created_at', { ascending: false }),
    ])

    return new Response(JSON.stringify({
      client: clientRecord, isLead,
      compliance: comp || [], documents: docsData || [], bookkeeping: books || [],
      payments: pays || [], notes: notesData || [], organizers: orgs || [],
      invoices: invs || [], sms: sms || [], financialProfile: fp || null,
      emails: emailsData || [],
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (e) {
    console.error('portal-get-data error:', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
