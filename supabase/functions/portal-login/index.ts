// portal-login
// Verifies a client/lead portal login SERVER-SIDE (email + last-4-of-SSN),
// using the service role — never trusting the browser with the real SSN
// or an unauthenticated table read. On success, issues a random opaque
// session token stored in `portal_sessions`, which the frontend then uses
// for every subsequent portal-get-data / portal-action call.
//
// This replaces the old flow, where the client record (including the full
// SSN) was fetched directly into the browser BEFORE any check happened,
// and the "PIN check" was just a client-side JS comparison against data
// that had already been delivered — meaning the check was cosmetic and
// bypassable entirely via a direct API call.
//
// JWT Verification must be OFF — clients have no CRM login/session.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SESSION_HOURS = 12

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { id, email, pin } = await req.json()
    if (!id || !email || !pin) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    let { data: record } = await supabase.from('clients')
      .select('id,name,ssn,email').eq('id', id).maybeSingle()
    let isLead = false
    if (!record) {
      const { data: l } = await supabase.from('leads').select('id,name,ssn,email').eq('id', id).maybeSingle()
      if (l) { record = l; isLead = true }
    }

    // Deliberately generic error for every failure case below — a
    // specific "that email doesn't match" vs "that PIN doesn't match"
    // message lets someone confirm whether a given ID/email combination
    // exists at all, which is its own small information leak.
    const genericError = () => new Response(JSON.stringify({ error: "That information doesn't match what we have on file. Contact your representative if you need help accessing your portal." }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    if (!record) return genericError()

    const last4 = (record.ssn || '').replace(/\D/g, '').slice(-4)
    const emailOnFile = (record.email || '').trim().toLowerCase()
    if (!last4 || !emailOnFile) return genericError()
    if (email.trim().toLowerCase() !== emailOnFile) return genericError()
    if (pin.trim() !== last4) return genericError()

    // Success — issue a session token. Nothing sensitive (no SSN, no
    // full record) goes back to the browser here, just an opaque token.
    const token = crypto.randomUUID() + '-' + crypto.randomUUID()
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString()

    const { error: sessionErr } = await supabase.from('portal_sessions').insert({
      token, client_id: record.id, is_lead: isLead, client_name: record.name, expires_at: expiresAt,
    })
    if (sessionErr) {
      console.error('[portal-login] session insert failed:', sessionErr.message)
      return new Response(JSON.stringify({ error: 'Could not start a session — try again.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ token, clientName: record.name, isLead }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (e) {
    console.error('portal-login error:', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
