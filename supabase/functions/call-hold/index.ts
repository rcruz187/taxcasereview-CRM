import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Called by the browser (CallContext.jsx toggleHold) to put the caller —
// and anyone conferenced in — on hold, or take them off. Every call in
// this system lives inside a conference, so "hold" means: hold every
// participant EXCEPT the agent's own leg. Held participants hear
// SignalWire's hold music and hear nothing from the room; the agent stays
// in the conference and hears silence.
//
// Agent legs are identified reliably without tracking callsids anywhere:
// the agent joins by dialing the business number FROM the business number
// (the self-dial bridge in receive-call), so any participant whose call
// has from == to == business DID is an agent. Everyone else gets held.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { conference_name, hold } = await req.json()
    if (!conference_name || typeof hold !== 'boolean') {
      return json({ error: 'conference_name and hold (boolean) required' }, 400)
    }
    // Conference names are only ever "office-<uuid>" / "out-..." — reject
    // anything else so this can't be pointed at arbitrary strings.
    if (!/^[A-Za-z0-9_-]+$/.test(conference_name)) {
      return json({ error: 'invalid conference name' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: settings, error: sErr } = await supabase
      .from('settings')
      .select('sw_space_url,sw_project_id,sw_api_token,sw_inbound_did')
      .limit(1)
      .maybeSingle()

    if (sErr || !settings?.sw_space_url || !settings?.sw_project_id || !settings?.sw_api_token) {
      console.error('call-hold: missing SignalWire credentials', sErr)
      return json({ error: 'SignalWire credentials missing in Settings' }, 400)
    }

    const spaceDomain = settings.sw_space_url.replace(/^https?:\/\//, '')
    const auth = 'Basic ' + btoa(`${settings.sw_project_id}:${settings.sw_api_token}`)
    const base = `https://${spaceDomain}/api/laml/2010-04-01/Accounts/${settings.sw_project_id}`
    const businessDigits = (settings.sw_inbound_did || '').replace(/\D/g, '').slice(-10)

    // 1) Find the live conference by name
    const confResp = await fetch(
      `${base}/Conferences.json?FriendlyName=${encodeURIComponent(conference_name)}&Status=in-progress`,
      { headers: { Authorization: auth } }
    )
    const confData = await confResp.json()
    const conf = confData?.conferences?.[0]
    if (!conf?.sid) {
      console.log('call-hold: no in-progress conference named', conference_name)
      return json({ error: 'Call not found — it may have already ended.' }, 404)
    }

    // 2) List its participants
    const partResp = await fetch(`${base}/Conferences/${conf.sid}/Participants.json`, {
      headers: { Authorization: auth },
    })
    const partData = await partResp.json()
    const participants = partData?.participants || []

    // 3) Hold/unhold every non-agent leg
    let touched = 0
    for (const p of participants) {
      const callSid = p.call_sid
      if (!callSid) continue
      let isAgent = false
      try {
        const callResp = await fetch(`${base}/Calls/${callSid}.json`, { headers: { Authorization: auth } })
        const call = await callResp.json()
        const fromD = (call?.from || '').replace(/\D/g, '').slice(-10)
        const toD = (call?.to || '').replace(/\D/g, '').slice(-10)
        isAgent = !!businessDigits && fromD === businessDigits && toD === businessDigits
      } catch (e) {
        console.error('call-hold: call fetch failed for', callSid, e)
      }
      if (isAgent) continue

      const upd = await fetch(`${base}/Conferences/${conf.sid}/Participants/${callSid}.json`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ Hold: hold ? 'true' : 'false' }),
      })
      if (!upd.ok) {
        const t = await upd.text()
        console.error('call-hold: participant update failed', callSid, upd.status, t)
      } else {
        touched++
      }
    }

    if (touched === 0) {
      return json({ error: 'No caller leg found to ' + (hold ? 'hold' : 'resume') + '.' }, 404)
    }

    console.log(`call-hold: ${hold ? 'held' : 'resumed'} ${touched} participant(s) in`, conference_name)
    return json({ ok: true, participants: touched })

  } catch (err) {
    console.error('call-hold error:', err)
    return json({ error: String(err) }, 500)
  }
})
