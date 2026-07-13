import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// LaML endpoint hit by SignalWire when a conferenced-in third party
// answers (see call-add-participant). Returns the <Dial><Conference>
// instruction that drops them into the existing call's conference.
//
// startConferenceOnEnter="false": if the agent has already hung up by the
// time this person answers, they must not spin up a fresh empty
// conference by themselves — they'd just hear hold music briefly and the
// call ends when they hang up.
// endConferenceOnExit="false": a conferenced-in guest leaving must never
// tear down the call for the agent and the original caller.

serve(async (req) => {
  const url = new URL(req.url)
  let conf = url.searchParams.get('conf') || ''

  // Also accept LaML POST body just in case the query param is stripped.
  if (!conf && req.method === 'POST') {
    try {
      const body = await req.text()
      const params = new URLSearchParams(body)
      conf = params.get('conf') || ''
    } catch { /* fall through */ }
  }

  if (!conf || !/^[A-Za-z0-9_-]+$/.test(conf)) {
    console.error('join-conference: missing/invalid conf param:', conf)
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural">We are sorry, this call is no longer available.</Say><Hangup/></Response>`
    return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
  }

  console.log('join-conference: joining leg into', conf)
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial><Conference startConferenceOnEnter="false" endConferenceOnExit="false">${conf}</Conference></Dial></Response>`
  return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
})
