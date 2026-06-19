import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Called BY SignalWire whenever someone calls the number, AND ALSO called
// a second time whenever the browser (CallContext.jsx's answerIncoming())
// dials the business number itself to "answer" a held inbound caller.
//
// BACKGROUND — why this isn't a simple <Dial><Verto> anymore: after a full
// day of testing, dialing straight into the browser's Verto/RELAY
// registration was confirmed dead — SignalWire's own call logs show
// DialCallStatus=failed / DialCallDuration=0 on every single attempt,
// instantly, regardless of registration state, duplicate hits, or
// recording attributes (all ruled out one at a time). Real root cause
// unconfirmed (likely something in SignalWire's account-level routing we
// can't see from outside), but rather than keep guessing, this routes
// around it entirely using a mechanism that's been reliable all day:
// outbound dialing from the browser.
//
// New flow:
//   1. Real inbound call arrives → held in a fresh <Conference>, a row is
//      written to incoming_calls so the CRM can show the incoming-call
//      banner (CallContext.jsx polls for it).
//   2. Staff clicks "Answer" → browser dials the BUSINESS NUMBER ITSELF.
//      That creates a second hit to this exact function, which recognizes
//      "From and To are both our own number" as the agent joining, looks
//      up the held caller's conference, and bridges in.
//   3. If nobody answers within 25s, CallContext.jsx calls
//      redirect-to-voicemail, which uses the SignalWire REST API to pull
//      the still-held caller out to the voicemail prompt.

serve(async (req) => {
  const body = await req.text()
  console.log('receive-call invoked — raw body:', body)

  const params = new URLSearchParams(body)
  const callSid = params.get('CallSid')
  const from = params.get('From') || ''
  const to = params.get('To') || ''

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: settings, error: sErr } = await supabase
      .from('settings')
      .select('call_forward_number,sw_inbound_did')
      .limit(1)
      .maybeSingle()

    if (sErr) console.error('settings fetch error:', sErr)

    const businessDigits = (settings?.sw_inbound_did || '').replace(/\D/g, '').slice(-10)
    const fromDigits = from.replace(/\D/g, '').slice(-10)
    const toDigits = to.replace(/\D/g, '').slice(-10)
    const isAgentJoin = !!businessDigits && fromDigits === businessDigits && toDigits === businessDigits

    console.log('isAgentJoin:', isAgentJoin, '| from:', from, '| to:', to, '| businessDID:', settings?.sw_inbound_did)

    if (isAgentJoin) {
      // The browser dialing itself to bridge into a held caller's
      // conference — not a real customer call.
      const { data: held, error: heldErr } = await supabase
        .from('incoming_calls')
        .select('conference_name, callsid')
        .in('status', ['ringing', 'answered'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (heldErr) console.error('incoming_calls lookup error:', heldErr)

      if (!held) {
        console.log('agent join attempted but no held caller found — hanging up')
        const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`
        return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
      }

      console.log('agent joining conference:', held.conference_name)
      const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial><Conference endConferenceOnExit="true">${held.conference_name}</Conference></Dial></Response>`
      return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
    }

    // A real inbound call. If a manual forwarding number is set, use the
    // old simple behavior (ring that number directly) — bypasses the IVR
    // entirely since that's a manual override Romy can flip on/off.
    const forwardTo = settings?.call_forward_number
    if (forwardTo) {
      const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial timeout="25"><Number>${forwardTo}</Number></Dial><Say>Thank you for calling Tax Case Review. No one is available right now. Please leave a message after the tone.</Say><Record action="https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/voicemail-recorded" maxLength="120" playBeep="true"/></Response>`
      return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
    }

    // Otherwise, play the auto-attendant menu. ivr-route handles whatever
    // digit (or no digit) comes back, including holding the caller in a
    // conference for Option 1/0 — this function's job stops at presenting
    // the menu.
    const greeting = 'Thank you for calling Tax Case Review. To check your tax status instantly, please check your email or text messages for your personal client portal link. Otherwise, please choose from the following options. Press 1 to speak with a tax professional. Press 2 to leave a general voicemail for our team. Press 0 for the front desk or receptionist.'
    const ivrRouteUrl = 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/ivr-route'
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Gather numDigits="1" timeout="8" action="${ivrRouteUrl}" method="POST"><Say>${greeting}</Say></Gather><Redirect method="POST">${ivrRouteUrl}</Redirect></Response>`

    console.log('returning IVR cXML:', xml)
    return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })

  } catch (err) {
    console.error('receive-call error:', err)
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>We are sorry, an error occurred. Please try again.</Say></Response>`
    return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
  }
})
