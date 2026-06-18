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

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
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
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial timeout="25">${vertoNoun}${forwardNoun}</Dial><Say>Thank you for calling Tax Case Review. No one is available right now. Please leave a message after the tone.</Say><Record action="https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/voicemail-recorded" maxLength="120" playBeep="true"/></Response>`

    console.log('returning cXML:', xml)
    return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })

  } catch (err) {
    console.error('receive-call error:', err)
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>We are sorry, an error occurred. Please try again.</Say></Response>`
    return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
  }
})
