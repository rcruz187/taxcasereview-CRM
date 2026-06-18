import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Called BY SignalWire whenever someone calls the number.
// Configure as the LaML Webhook under "Voice and Fax Settings" on the number.
// JWT verification MUST be off — SignalWire doesn't send a Supabase JWT.

const RELAY_RESOURCE = 'office'

serve(async (req) => {
  // Log every field SignalWire sends — visible in Supabase Dashboard → Edge Functions → receive-call → Logs
  const body = await req.text()
  console.log('receive-call invoked — raw body:', body)

  const params = new URLSearchParams(body)
  const callSid = params.get('CallSid')

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // SignalWire has been hitting this URL more than once for the SAME call
    // (same CallSid) a few seconds apart. Every hit used to unconditionally
    // return a fresh <Dial><Verto> command, ringing the browser twice for
    // one phone call — the two rings collided and both instantly hung up.
    // This lock makes sure only the FIRST hit for a given CallSid dials;
    // any repeat hit gets a harmless empty response instead.
    if (callSid) {
      const { error: lockErr } = await supabase
        .from('call_dial_locks')
        .insert({ callsid: callSid })

      if (lockErr) {
        if (lockErr.code === '23505') {
          // 23505 = unique_violation — SignalWire hit this URL again for a
          // call it already hit before. Logged for visibility only — we
          // still answer with the same real Dial command below rather than
          // an empty response, in case SignalWire treats an empty reply as
          // a reason to abandon the call setup entirely.
          console.log('duplicate receive-call hit for CallSid', callSid, '— answering with same Dial command')
        } else {
          console.error('call_dial_locks insert error:', lockErr)
        }
      }
    }

    const { data: settings, error: sErr } = await supabase
      .from('settings')
      .select('call_forward_number,sw_space_url')
      .limit(1)
      .maybeSingle()

    if (sErr) console.error('settings fetch error:', sErr)
    console.log('settings:', JSON.stringify(settings))

    const forwardTo = settings?.call_forward_number
    const spaceDomain = (settings?.sw_space_url || '').replace(/\.signalwire\.com$/i, '').replace(/^https?:\/\//, '')
    const vertoAddr = spaceDomain ? `${RELAY_RESOURCE}@${spaceDomain}.verto.signalwire.com` : null

    console.log('spaceDomain:', spaceDomain, '| vertoAddr:', vertoAddr, '| forwardTo:', forwardTo)

    if (!vertoAddr) {
      // No space URL — can't ring the browser. Just go straight to voicemail.
      console.error('sw_space_url not set — cannot generate Verto address, going straight to voicemail')
      const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Please leave a message after the tone.</Say><Record action="https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/voicemail-recorded" maxLength="120" playBeep="true"/></Response>`
      return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
    }

    const vertoNoun = `<Verto>${vertoAddr}</Verto>`
    const forwardNoun = forwardTo ? `<Number>${forwardTo}</Number>` : ''
    // record="record-from-answer" records both legs once the call connects —
    // this rides on the same call minutes already being paid for, no extra
    // SignalWire product to turn on. Recording posts to call-recorded once done.
    // TEMP TEST: record/recordingStatusCallback removed from this Dial to
    // rule out a Verto+recording incompatibility as the cause of the
    // instant (0-second) DialCallStatus=failed we've been seeing all day.
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial timeout="25">${vertoNoun}${forwardNoun}</Dial><Say>Thank you for calling Tax Case Review. No one is available right now. Please leave a message after the tone.</Say><Record action="https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/voicemail-recorded" maxLength="120" playBeep="true"/></Response>`

    console.log('returning cXML:', xml)
    return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })

  } catch (err) {
    console.error('receive-call error:', err)
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>We are sorry, an error occurred. Please try again.</Say></Response>`
    return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
  }
})
