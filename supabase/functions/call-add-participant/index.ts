import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Called by the browser (CallContext.jsx addParticipant) to conference a
// third person into the active call. Uses the SignalWire REST API to
// place a new outbound call FROM the business number TO the given number;
// when they answer, join-conference returns LaML that drops them straight
// into the same conference the agent and caller are already in.
//
// Anti-abuse: the target conference must actually exist and be
// in-progress. Conference names are unguessable (they embed the call's
// SID/uuid), so this can't be used to place arbitrary calls without
// already being party to a live call.

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
    const { conference_name, number } = await req.json()
    if (!conference_name || !number) {
      return json({ error: 'conference_name and number required' }, 400)
    }
    if (!/^[A-Za-z0-9_-]+$/.test(conference_name)) {
      return json({ error: 'invalid conference name' }, 400)
    }

    // Normalize the number: strip formatting, require a real 10-digit US
    // number (or 11 starting with 1), dial as E.164.
    const digits = String(number).replace(/\D/g, '')
    let e164 = ''
    if (digits.length === 10) e164 = '+1' + digits
    else if (digits.length === 11 && digits.startsWith('1')) e164 = '+' + digits
    else return json({ error: 'Enter a valid 10-digit US phone number.' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: settings, error: sErr } = await supabase
      .from('settings')
      .select('sw_space_url,sw_project_id,sw_api_token,sw_inbound_did')
      .limit(1)
      .maybeSingle()

    if (sErr || !settings?.sw_space_url || !settings?.sw_project_id || !settings?.sw_api_token || !settings?.sw_inbound_did) {
      console.error('call-add-participant: missing SignalWire credentials/DID', sErr)
      return json({ error: 'SignalWire credentials missing in Settings' }, 400)
    }

    const spaceDomain = settings.sw_space_url.replace(/^https?:\/\//, '')
    const auth = 'Basic ' + btoa(`${settings.sw_project_id}:${settings.sw_api_token}`)
    const base = `https://${spaceDomain}/api/laml/2010-04-01/Accounts/${settings.sw_project_id}`

    // The conference must be live — this is the guard that keeps this
    // endpoint from being usable as a free dialer.
    const confResp = await fetch(
      `${base}/Conferences.json?FriendlyName=${encodeURIComponent(conference_name)}&Status=in-progress`,
      { headers: { Authorization: auth } }
    )
    const confData = await confResp.json()
    if (!confData?.conferences?.[0]?.sid) {
      return json({ error: 'Call not found — it may have already ended.' }, 404)
    }

    const joinUrl = `https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/join-conference?conf=${encodeURIComponent(conference_name)}`

    const dialResp = await fetch(`${base}/Calls.json`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        To: e164,
        From: settings.sw_inbound_did,
        Url: joinUrl,
        Method: 'POST',
        Timeout: '30',
      }),
    })

    const text = await dialResp.text()
    if (!dialResp.ok) {
      console.error('call-add-participant: SignalWire rejected the dial', dialResp.status, text)
      return json({ error: 'Could not place the call: ' + text }, 502)
    }

    console.log('call-add-participant: dialing', e164, 'into', conference_name)
    return json({ ok: true })

  } catch (err) {
    console.error('call-add-participant error:', err)
    return json({ error: String(err) }, 500)
  }
})
