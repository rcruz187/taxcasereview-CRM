import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// Returns the voicemail greeting + recording prompt. Used as the redirect
// target when redirect-to-voicemail pulls an unanswered/declined caller
// out of their hold conference.
// JWT verification must be OFF -- SignalWire calls this directly.

serve(async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Ruth-Neural" language="en-US"><speak>Thank you for calling Tax Case Review. <break time="400ms"/> We're sorry we missed your call. <break time="300ms"/> Please leave your name, number, and a brief message after the tone <break time="200ms"/> and we'll return your call as soon as possible.</speak></Say><Record action="https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/voicemail-recorded" maxLength="120" playBeep="true"/></Response>`
  return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
})
