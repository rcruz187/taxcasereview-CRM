import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const VOICEMAIL_PROMPT_URL = 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/voicemail-prompt'
const CALL_RECORDED_URL   = 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/call-recorded'
const HOLD_MUSIC_URL      = 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/hold-music'

serve(async (req) => {
  const body = await req.text()
  console.log('ivr-extension invoked -- raw body:', body)
  const params  = new URLSearchParams(body)
  const digits  = params.get('Digits') || ''
  const callSid = params.get('CallSid') || ''
  const from    = params.get('From') || ''

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: emp, error: empErr } = await supabase
      .from('employees').select('id, name, extension').eq('extension', digits).maybeSingle()

    if (empErr) console.error('employee lookup error:', empErr)

    if (!emp) {
      console.log('extension not found:', digits)
      const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural">Sorry, extension ${digits.split('').join(' ')} was not found. Please leave a message after the tone.</Say><Redirect method="POST">${VOICEMAIL_PROMPT_URL}</Redirect></Response>`
      return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
    }

    const conferenceName = `ext-${digits}-${callSid || Date.now()}`
    const department = `Extension ${digits} — ${emp.name}`

    if (callSid) {
      const { error: insErr } = await supabase.from('incoming_calls').insert({
        callsid: callSid, conference_name: conferenceName, from_number: from, department, status: 'ringing',
      })
      if (insErr) console.error('incoming_calls insert error:', insErr)
    }

    console.log('routing to extension conference:', conferenceName, '| employee:', emp.name)
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false" waitUrl="${HOLD_MUSIC_URL}" waitMethod="GET" record="record-from-start" recordingStatusCallback="${CALL_RECORDED_URL}">${conferenceName}</Conference></Dial></Response>`
    return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })

  } catch (err) {
    console.error('ivr-extension error:', err)
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural">We are sorry, an error occurred. Please try again.</Say></Response>`
    return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
  }
})
