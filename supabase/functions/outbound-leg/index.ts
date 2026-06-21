import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// Called BY SignalWire once the outbound call leg created in
// start-outbound-call is answered by the destination number. Drops that
// leg into the conference start-outbound-call already wrote a row for,
// with recording on -- mirrors ivr-route's inbound conference join.
// JWT verification must be OFF -- SignalWire calls this directly.

const CALL_RECORDED_URL = 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/call-recorded'
const CONFERENCE_ENDED_URL = 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/conference-ended'

serve(async (req) => {
  const url = new URL(req.url)
  const conf = url.searchParams.get('conf') || ''

  if (!conf) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`
    return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" record="record-from-start" recordingStatusCallback="${CALL_RECORDED_URL}" statusCallback="${CONFERENCE_ENDED_URL}" statusCallbackEvent="end">${conf}</Conference></Dial></Response>`
  return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
})
