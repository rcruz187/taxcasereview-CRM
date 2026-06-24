import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// Hold music for conference waitUrl — pure TwiML Say+Pause, no external
// audio dependency. SignalWire calls this directly so JWT must be OFF.

serve(async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural">Please hold, your call is being connected.</Say><Pause length="10"/><Say voice="Polly.Joanna-Neural">Still connecting, thank you for your patience.</Say><Pause length="10"/><Say voice="Polly.Joanna-Neural">Please continue to hold.</Say><Pause length="10"/></Response>`
  return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
})
