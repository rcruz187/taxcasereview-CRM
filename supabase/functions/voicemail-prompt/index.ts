import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// Returns the voicemail greeting + recording prompt. Used as the redirect
// target when redirect-to-voicemail pulls an unanswered/declined caller
// out of their hold conference.
// JWT verification must be OFF -- SignalWire calls this directly.

serve(async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Thank you for calling Tax Case Review. No one is available right now. Please leave a message after the tone.</Say><Record action="https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/voicemail-recorded" maxLength="120" playBeep="true"/></Response>`
  return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
})
