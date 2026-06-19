import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Called BY SignalWire after a caller presses a digit at the auto-attendant
// menu played in receive-call (or after that <Gather> times out with no
// input at all, via the <Redirect> fallback — same URL, just no Digits
// param that time).
//
//   Press 1 → "speak with a tax professional" → hold in conference, banner
//             shows in the CRM labeled "Tax Professional"
//   Press 0 → "front desk" → same mechanism, labeled "Front Desk"
//   Press 2 → "leave a voicemail" → straight to the recording prompt,
//             nobody's phone rings at all
//   anything else / no input → straight to voicemail (simplest safe
//             fallback rather than looping the menu indefinitely)

const VOICEMAIL_PROMPT_URL = 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/voicemail-prompt'
const CALL_RECORDED_URL = 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/call-recorded'

serve(async (req) => {
  const body = await req.text()
  console.log('ivr-route invoked — raw body:', body)
  const params = new URLSearchParams(body)
  const digits = params.get('Digits') || ''
  const callSid = params.get('CallSid')
  const from = params.get('From') || ''

  try {
    if (digits === '1' || digits === '0') {
      const department = digits === '1' ? 'Tax Professional' : 'Front Desk'
      const conferenceName = `office-${callSid || Date.now()}`

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )

      if (callSid) {
        const { error: insErr } = await supabase.from('incoming_calls').insert({
          callsid: callSid,
          conference_name: conferenceName,
          from_number: from,
          department,
          status: 'ringing',
        })
        if (insErr) console.error('incoming_calls insert error:', insErr)
      }

      const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" record="record-from-start" recordingStatusCallback="${CALL_RECORDED_URL}">${conferenceName}</Conference></Dial></Response>`
      console.log('routing to conference:', conferenceName, '| department:', department)
      return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
    }

    // Digits === '2', or empty (timed out with no input), or anything
    // unrecognized — straight to voicemail, nobody's phone rings.
    console.log('routing straight to voicemail — digits was:', JSON.stringify(digits))
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">${VOICEMAIL_PROMPT_URL}</Redirect></Response>`
    return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })

  } catch (err) {
    console.error('ivr-route error:', err)
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural">We are sorry, an error occurred. Please try again.</Say></Response>`
    return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
  }
})
