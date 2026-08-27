import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { destinationNumber } = await req.json()
    if (!destinationNumber) return new Response(JSON.stringify({ error: 'destinationNumber required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: settings, error: sErr } = await supabase.from('settings')
      .select('sw_space_url,sw_project_id,sw_api_token,sw_inbound_did,tenant_id')
      .not('sw_api_token', 'is', null).not('sw_space_url', 'is', null).not('sw_inbound_did', 'is', null)
      .order('updated_at', { ascending: true }).limit(1).maybeSingle()

    if (sErr || !settings?.sw_space_url || !settings?.sw_project_id || !settings?.sw_api_token || !settings?.sw_inbound_did) {
      return new Response(JSON.stringify({ error: 'SignalWire credentials or caller ID missing in Settings' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const conferenceName = `outbound-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const { error: insErr } = await supabase.from('outbound_calls').insert({ conference_name: conferenceName, destination_number: destinationNumber, status: 'pending', tenant_id: settings.tenant_id })
    if (insErr) return new Response(JSON.stringify({ error: insErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const spaceDomain = settings.sw_space_url.replace(/^https?:\/\//, '')
    const auth = 'Basic ' + btoa(`${settings.sw_project_id}:${settings.sw_api_token}`)
    const outboundLegUrl = `https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/outbound-leg?conf=${encodeURIComponent(conferenceName)}`
    const statusCallbackUrl = `https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/outbound-call-status?conf=${encodeURIComponent(conferenceName)}`

    const resp = await fetch(`https://${spaceDomain}/api/laml/2010-04-01/Accounts/${settings.sw_project_id}/Calls.json`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        To: destinationNumber,
        From: settings.sw_inbound_did,
        Url: outboundLegUrl,
        Method: 'POST',
        StatusCallback: statusCallbackUrl,
        // We need answered as well as terminal state. Previously only
        // completed was requested, so the CRM could never know when the
        // destination actually picked up.
        StatusCallbackEvent: 'initiated ringing answered completed',
        StatusCallbackMethod: 'POST',
      }),
    })

    const text = await resp.text()
    if (!resp.ok) {
      console.error('start-outbound-call: SignalWire rejected call', resp.status, text)
      await supabase.from('outbound_calls').update({ status: 'failed' }).eq('conference_name', conferenceName)
      return new Response(JSON.stringify({ error: text }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    let clientCallsid = null
    try { clientCallsid = JSON.parse(text)?.sid || null } catch { /* non-fatal */ }
    return new Response(JSON.stringify({ ok: true, conferenceName, clientCallsid }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('start-outbound-call error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
