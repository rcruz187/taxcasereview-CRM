import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Called BY SignalWire after a caller presses a digit at the auto-attendant
// menu played in receive-call (or after that <Gather> times out with no
// input at all, via the <Redirect> fallback -- same URL, just no Digits
// param that time).
//
//   Press 1 -> "speak with a tax advisor" (sales) -> hold in conference,
//             banner shows in the CRM labeled "Tax Advisor"
//   Press 2 -> "speak with a tax account representative" -> hold in
//             conference, banner labeled "Tax Associate"
//   Press 0 -> "speak with the operator" -> hold in conference, banner
//             labeled "Operator"
//   anything else / no input -> straight to voicemail (simplest safe
//             fallback rather than looping the menu indefinitely)
//
// All three menu options ring through the same way. If nobody answers,
// CallContext.jsx's 25s no-answer timeout calls redirect-to-voicemail
// regardless of department, so "queue full" falls through to voicemail
// automatically -- no extra logic needed here for that.

const VOICEMAIL_PROMPT_URL = 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/voicemail-prompt'
const CALL_RECORDED_URL = 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/call-recorded'
const IVR_EXTENSION_URL = 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/ivr-extension'

// Press 1 = Dial by extension (routes to ivr-extension submenu)
// Press 2 = Tax Advisor
// Press 3 = Tax Associate
// Press 0 = Operator
const DEPARTMENTS: Record<string, string> = {
  '2': 'Tax Advisor',
  '3': 'Tax Associate',
  '0': 'Operator',
}

serve(async (req) => {
  const body = await req.text()
  console.log('ivr-route invoked -- raw body:', body)
  const params = new URLSearchParams(body)
  const digits = params.get('Digits') || ''
  const callSid = params.get('CallSid')
  const from = params.get('From') || ''
  const to = params.get('To') || ''

  try {
    // Press 1 -> dial by extension submenu
    if (digits === '1') {
      const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Gather numDigits="3" timeout="8" action="${IVR_EXTENSION_URL}" method="POST"><Say voice="Polly.Joanna-Neural">Please enter the 3 digit extension you would like to reach.</Say></Gather><Redirect method="POST">${VOICEMAIL_PROMPT_URL}</Redirect></Response>`
      console.log('routing to extension submenu')
      return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
    }

    const department = DEPARTMENTS[digits]
    if (department) {
      const conferenceName = `office-${callSid || Date.now()}`

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )

      if (callSid) {
        // Resolve which tenant owns the number that was called, so the
        // incoming-call row is stamped to the right firm. Falls back to the
        // single settings row (single-tenant behaves identically).
        const DEFAULT_TENANT = '61a89aef-0e7e-4ea2-b222-44ab2024655a'
        let tenantId = DEFAULT_TENANT
        const toDigits = to.replace(/\D/g, '').slice(-10)
        try {
          const { data: rows } = await supabase.from('settings').select('tenant_id,sw_inbound_did')
          const match = (rows || []).find(
            r => (r.sw_inbound_did || '').replace(/\D/g, '').slice(-10) === toDigits
          )
          if (match?.tenant_id) tenantId = match.tenant_id
          else if ((rows || []).length === 1 && rows[0].tenant_id) tenantId = rows[0].tenant_id
        } catch (_) { /* keep default */ }

        const { error: insErr } = await supabase.from('incoming_calls').insert({
          callsid: callSid,
          conference_name: conferenceName,
          from_number: from,
          department,
          status: 'ringing',
          tenant_id: tenantId,
        })
        if (insErr) console.error('incoming_calls insert error:', insErr)
      }

      const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false" waitUrl="https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/hold-music" waitMethod="GET" statusCallback="https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/caller-hangup?conf=${conferenceName}" statusCallbackEvent="leave end" statusCallbackMethod="POST" record="record-from-start" recordingStatusCallback="${CALL_RECORDED_URL}">${conferenceName}</Conference></Dial></Response>`
      console.log('routing to conference:', conferenceName, '| department:', department)
      return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
    }

    // Unrecognized digit, or empty (timed out with no input) -- straight to
    // voicemail, nobody's phone rings.
    console.log('routing straight to voicemail -- digits was:', JSON.stringify(digits))
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">${VOICEMAIL_PROMPT_URL}</Redirect></Response>`
    return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })

  } catch (err) {
    console.error('ivr-route error:', err)
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural">We are sorry, an error occurred. Please try again.</Say></Response>`
    return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
  }
})
