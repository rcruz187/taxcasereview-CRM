import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// Hold music for conference waitUrl — repeating Say messages keep the line
// active. JWT must be OFF — SignalWire calls this directly.

serve(async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural">Thank you for holding. A Tax Case Review representative will be with you shortly.</Say><Say voice="Polly.Joanna-Neural">Thank you for your patience. Please continue to hold and someone will be right with you.</Say><Say voice="Polly.Joanna-Neural">We appreciate your patience. A representative will be with you momentarily.</Say><Say voice="Polly.Joanna-Neural">Thank you for holding with Tax Case Review. Someone will be right with you.</Say></Response>`
  return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
})
