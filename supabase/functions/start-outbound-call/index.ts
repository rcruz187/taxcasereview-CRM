import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Called BY THE BROWSER (CallContext.jsx's startCall()) to place a NEW
// outbound call routed through a recorded SignalWire <Conference> instead
// of a direct browser-to-PSTN RELAY dial -- a direct RELAY dial can't be
// recorded, so this is required for outbound recording to work at all.
//
// Flow:
//   1. This function originates the call OUT to the destination number via
//      the SignalWire REST API, pointing it at outbound-leg, which plays a
//      short recorded-call notice and drops that leg into a fresh
//      conference with recording on from the start.
//   2. A row is written to outbound_calls so the agent's self-dial (the
//      same proven mechanism already used to answer inbound calls) can
//      find which conference to bridge into -- see receive-call's
//      isAgentJoin branch.
//   3. The browser immediately self-dials the business number right after
//      this returns, same as answerIncoming().
//
// CORS is enabled because this is called directly from the browser.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { destinationNumber } = await req.json()
    if (!destinationNumber) {
      return new Response(JSON.stringify({ error: 'destinationNumber required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: settings, error: sErr } = await supabase
      .from('settings')
      .select('sw_space_url,sw_project_id,sw_api_token,sw_inbound_did,tenant_id')
      .limit(1)
      .maybeSingle()

    if (sErr || !settings?.sw_space_url || !settings?.sw_project_id || !settings?.sw_api_token || !settings?.sw_inbound_did) {
      console.error('start-outbound-call: missing SignalWire credentials/caller ID in settings', sErr)
      return new Response(JSON.stringify({ error: 'SignalWire credentials or caller ID missing in Settings' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const conferenceName = `outbound-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const { error: insErr } = await supabase.from('outbound_calls').insert({
      conference_name: conferenceName,
      destination_number: destinationNumber,
      status: 'pending',
      tenant_id: settings.tenant_id,
    })
    if (insErr) {
      console.error('outbound_calls insert error:', insErr)
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const spaceDomain = settings.sw_space_url.replace(/^https?:\/\//, '')
    const auth = 'Basic ' + btoa(`${settings.sw_project_id}:${settings.sw_api_token}`)
    const outboundLegUrl = `https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/outbound-leg?conf=${encodeURIComponent(conferenceName)}`
    // Separate from outboundLegUrl on purpose -- this is a pure status
    // REPORT (fires a background POST when the call ends, doesn't control
    // anything about how the call behaves), not part of the call-control
    // response. Keeping it as its own param rather than folding it into
    // the Conference noun's own statusCallback (tried that, broke live
    // call connection/audio -- reverted) means there's nothing here that
    // can affect routing if SignalWire handles it any differently than
    // expected.
    const statusCallbackUrl = `https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/outbound-call-status?conf=${encodeURIComponent(conferenceName)}`

    const resp = await fetch(
      `https://${spaceDomain}/api/laml/2010-04-01/Accounts/${settings.sw_project_id}/Calls.json`,
      {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          To: destinationNumber,
          From: settings.sw_inbound_did,
          Url: outboundLegUrl,
          Method: 'POST',
          StatusCallback: statusCallbackUrl,
          StatusCallbackEvent: 'completed',
          StatusCallbackMethod: 'POST',
        }),
      }
    )

    const text = await resp.text()
    if (!resp.ok) {
      console.error('start-outbound-call: SignalWire rejected the call origination', resp.status, text)
      await supabase.from('outbound_calls').update({ status: 'failed' }).eq('conference_name', conferenceName)
      return new Response(JSON.stringify({ error: text }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Purely additive: the create-call response includes the new client
    // leg's sid — hand it to the browser so Transfer works on outbound
    // calls too (transferring = redirecting the client's leg). Nothing
    // about the call flow itself changes.
    let clientCallsid = null
    try { clientCallsid = JSON.parse(text)?.sid || null } catch { /* non-fatal */ }

    return new Response(JSON.stringify({ ok: true, conferenceName, clientCallsid }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('start-outbound-call error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
