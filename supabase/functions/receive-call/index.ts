import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateSignalWireRequest } from '../_shared/sw-verify.ts'


// Called BY SignalWire whenever someone calls the number, AND ALSO called
// a second time whenever the browser (CallContext.jsx's answerIncoming())
// dials the business number itself to "answer" a held inbound caller.
//
// BACKGROUND -- why this isn't a simple <Dial><Verto> anymore: after a full
// day of testing, dialing straight into the browser's Verto/RELAY
// registration was confirmed dead -- SignalWire's own call logs show
// DialCallStatus=failed / DialCallDuration=0 on every single attempt,
// instantly, regardless of registration state, duplicate hits, or
// recording attributes (all ruled out one at a time). Real root cause
// unconfirmed (likely something in SignalWire's account-level routing we
// can't see from outside), but rather than keep guessing, this routes
// around it entirely using a mechanism that's been reliable all day:
// outbound dialing from the browser.
//
// New flow:
//   1. Real inbound call arrives -> held in a fresh <Conference>, a row is
//      written to incoming_calls so the CRM can show the incoming-call
//      banner (CallContext.jsx polls for it).
//   2. Staff clicks "Answer" -> browser dials the BUSINESS NUMBER ITSELF.
//      That creates a second hit to this exact function, which recognizes
//      "From and To are both our own number" as the agent joining, looks
//      up the held caller's conference, and bridges in.
//   3. If nobody answers within 25s, CallContext.jsx calls
//      redirect-to-voicemail, which uses the SignalWire REST API to pull
//      the still-held caller out to the voicemail prompt.

const HELD_ROW_MAX_AGE_MINUTES = 10

// Office hours: Monday-Friday, 9 AM-6 PM Eastern. Computed via Intl with an
// explicit timeZone rather than raw UTC offset math, so this stays correct
// across DST changes without needing a manual fix twice a year.
function isWithinBusinessHours(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date)
  const weekday = parts.find(p => p.type === 'weekday')?.value
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10)
  const isWeekday = weekday !== 'Sat' && weekday !== 'Sun'
  return isWeekday && hour >= 9 && hour < 18
}

serve(async (req) => {
  const body = await req.text()
  console.log('receive-call invoked -- raw body:', body)

  // ── SignalWire webhook authentication ──────────────────────────────────────
  const swSignature = req.headers.get('x-signalwire-signature') ?? ''
  const swSecret = Deno.env.get('SW_SIGNING_SECRET') ?? ''
  if (!swSecret) {
    console.error('[receive-call] SW_SIGNING_SECRET not configured')
    return new Response('Service unavailable', { status: 503 })
  }
  const webhookUrl = 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/receive-call'
  const paramMap: Record<string,string> = {}
  for (const [k,v] of new URLSearchParams(body)) { paramMap[k] = v }
  const sigValid = await validateSignalWireRequest(swSecret, webhookUrl, paramMap, swSignature)
  if (!sigValid) {
    console.warn('[receive-call] Invalid SignalWire signature — rejected')
    return new Response('Unauthorized', { status: 403 })
  }
  // ── End authentication ─────────────────────────────────────────────────────

  const params = new URLSearchParams(body)
  const callSid = params.get('CallSid')
  const from = params.get('From') || ''
  const to = params.get('To') || ''

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Multi-tenant resolve: match the settings row by the number that was
    // called (To). Falls back to the single settings row when no DID match —
    // so a single-tenant setup (one row, one DID) behaves exactly as before.
    const toDigitsForLookup = to.replace(/\D/g, '').slice(-10)
    let settings = null, sErr = null
    if (toDigitsForLookup) {
      const r = await supabase
        .from('settings')
        .select('call_forward_number,sw_inbound_did,tenant_id')
      sErr = r.error
      settings = (r.data || []).find(
        row => (row.sw_inbound_did || '').replace(/\D/g, '').slice(-10) === toDigitsForLookup
      ) || null
    }
    if (!settings) {
      const r = await supabase
        .from('settings')
        .select('call_forward_number,sw_inbound_did,tenant_id')
        .limit(1)
        .maybeSingle()
      if (!sErr) sErr = r.error
      settings = r.data || null
    }

    if (sErr) console.error('settings fetch error:', sErr)

    const businessDigits = (settings?.sw_inbound_did || '').replace(/\D/g, '').slice(-10)
    const fromDigits = from.replace(/\D/g, '').slice(-10)
    const toDigits = to.replace(/\D/g, '').slice(-10)
    const isAgentJoin = !!businessDigits && fromDigits === businessDigits && toDigits === businessDigits

    console.log('isAgentJoin:', isAgentJoin, '| from:', from, '| to:', to, '| businessDID:', settings?.sw_inbound_did)

    if (isAgentJoin) {
      // The browser dialing itself to bridge into a held caller's
      // conference -- not a real customer call. Could be answering a real
      // inbound caller (incoming_calls) OR bridging into a new outbound
      // call this same agent just originated (outbound_calls).
      //
      // Safety net: only consider incoming_calls rows from the last
      // HELD_ROW_MAX_AGE_MINUTES, regardless of status. This is a backstop
      // in case some future code path ever leaves a row open without
      // marking it completed/missed again (as happened before) -- a stale
      // row older than this can no longer hijack a fresh agent-join.
      const cutoff = new Date(Date.now() - HELD_ROW_MAX_AGE_MINUTES * 60 * 1000).toISOString()

      // ── Claimed-FIFO handshake (wrong-conference fix) ──
      // The old logic guessed "newest held row", so with two calls held at
      // once, an agent answering the OLDER call got bridged into the NEWER
      // caller's conference. bridge_pop_claimed atomically pops (in order):
      //   1. oldest claimed-but-unbridged row (modern tabs claim before
      //      self-dialing, so this pairs each agent with the call they
      //      actually clicked, FIFO by claim time)
      //   2. newest still-ringing row, stamped 'answered' (stale-tab backstop)
      //   3. newest answered row (recovery/legacy — matches old behavior)
      // FOR UPDATE SKIP LOCKED inside the RPC makes two simultaneous
      // agent-joins take two different rows instead of the same one.
      // If the RPC is missing or errors, fall back to the legacy lookup so
      // this deploy can never make answering worse than yesterday.
      let bridgeTarget = null
      const { data: popped, error: popErr } = await supabase
        .rpc('bridge_pop_claimed', { p_cutoff: cutoff })
      if (popErr) console.error('bridge_pop_claimed RPC error (falling back to legacy lookup):', popErr)
      if (popped?.conference_name) {
        bridgeTarget = popped
        console.log('bridge_pop_claimed matched via:', popped.via)
      }

      if (!bridgeTarget) {
        // Legacy lookup — newest held row (also the path when the RPC
        // hasn't been created yet).
        const { data: held, error: heldErr } = await supabase
          .from('incoming_calls')
          .select('conference_name, callsid')
          .in('status', ['ringing', 'answered'])
          .gte('created_at', cutoff)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (heldErr) console.error('incoming_calls lookup error:', heldErr)
        if (held) {
          // Backstop: a bridged call must never sit in 'ringing' (stale
          // pre-claim tabs) — otherwise give-up timers legitimately
          // redirect the live call to voicemail. Conditional so a modern
          // tab's claim is never clobbered.
          const { error: stampErr } = await supabase
            .from('incoming_calls')
            .update({ status: 'answered' })
            .eq('callsid', held.callsid)
            .eq('status', 'ringing')
          if (stampErr) console.error('bridge-time answered stamp error:', stampErr)
          bridgeTarget = held
        }
      }

      if (bridgeTarget) {
        console.log('agent joining inbound conference:', bridgeTarget.conference_name)
        const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial><Conference endConferenceOnExit="true">${bridgeTarget.conference_name}</Conference></Dial></Response>`
        return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
      }

      // No held inbound caller -- check for a pending outbound call this
      // agent just started (see start-outbound-call).
      const { data: outbound, error: outErr } = await supabase
        .from('outbound_calls')
        .select('id, conference_name')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (outErr) console.error('outbound_calls lookup error:', outErr)

      if (outbound) {
        await supabase.from('outbound_calls').update({ status: 'connected' }).eq('id', outbound.id)
        console.log('agent joining outbound conference:', outbound.conference_name)
        // Deliberately bare -- matching the inbound bridge above exactly.
        // This used to also carry record="record-from-start" +
        // recordingStatusCallback, duplicating what's already on
        // outbound-leg's noun for the same conference. Two legs both
        // declaring record-from-start on the same conference is most
        // likely what was making SignalWire choke on this leg entirely
        // (never connecting, and not cleanly hanging up either since it
        // never properly connected). Recording still happens via
        // outbound-leg's noun -- only one leg needs to declare it.
        const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial><Conference endConferenceOnExit="true">${outbound.conference_name}</Conference></Dial></Response>`
        return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
      }

      console.log('agent join attempted but no held caller or pending outbound call found -- hanging up')
      const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`
      return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
    }

    // A real inbound call. If a manual forwarding number is set, use the
    // old simple behavior (ring that number directly) -- bypasses the IVR
    // entirely since that's a manual override Romy can flip on/off.
    const forwardTo = settings?.call_forward_number
    if (forwardTo) {
      const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial timeout="25"><Number>${forwardTo}</Number></Dial><Say voice="Polly.Ruth-Neural" language="en-US"><speak>Thank you for calling ${settings?.name || "our office"}. <break time="400ms"/> We're sorry we missed you. <break time="300ms"/> Please leave your name, number, and a brief message <break time="200ms"/> and we'll get back to you shortly.</speak></Say><Record action="${Deno.env.get("SUPABASE_URL")}/functions/v1/voicemail-recorded" maxLength="120" playBeep="true"/></Response>`
      return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
    }

    // Outside office hours -- skip the menu entirely, straight to
    // voicemail with a message that sets the right expectation instead of
    // the generic "no one is available" line.
    if (!isWithinBusinessHours(new Date())) {
      const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Ruth-Neural" language="en-US"><speak>Thank you for calling ${settings?.name || "our office"}. <break time="400ms"/> Our office is currently closed. <break time="300ms"/> We're available Monday through Friday, <break time="200ms"/> nine AM to six PM Eastern. <break time="500ms"/> Please leave us a message after the tone <break time="200ms"/> and we'll return your call the next business day.</speak></Say><Record action="${Deno.env.get("SUPABASE_URL")}/functions/v1/voicemail-recorded" maxLength="120" playBeep="true"/></Response>`
      return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
    }

    // Otherwise, play the auto-attendant menu. ivr-route handles whatever
    // digit (or no digit) comes back, including holding the caller in a
    // conference for Option 1/2/0 -- this function's job stops at
    // presenting the menu.
    const ivrRouteUrl = '${Deno.env.get("SUPABASE_URL")}/functions/v1/ivr-route'
    const greeting = `<speak>Thank you for calling ${settings?.name || "our office"}. <break time="400ms"/> If you're an existing client, check your email or text messages for your secure client portal link. <break time="600ms"/> To continue, please listen carefully as our menu has recently changed. <break time="400ms"/> Press <say-as interpret-as="digits">1</say-as> to dial by extension. <break time="300ms"/> Press <say-as interpret-as="digits">2</say-as> to speak with a tax advisor. <break time="300ms"/> Press <say-as interpret-as="digits">3</say-as> to speak with a tax associate. <break time="300ms"/> Or press <say-as interpret-as="digits">0</say-as> for the operator.</speak>`
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Gather numDigits="1" timeout="8" action="${ivrRouteUrl}" method="POST"><Say voice="Polly.Ruth-Neural" language="en-US">${greeting}</Say></Gather><Redirect method="POST">${ivrRouteUrl}</Redirect></Response>`

    console.log('returning IVR cXML:', xml)
    return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })

  } catch (err) {
    console.error('receive-call error:', err)
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Ruth-Neural" language="en-US"><speak>We're sorry, we're experiencing a brief technical issue. <break time="300ms"/> Please try your call again in just a moment.</speak></Say></Response>`
    return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
  }
})
