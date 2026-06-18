import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Called BY SignalWire whenever someone calls the number. Configure as
// the LaML Webhook under "Voice and Fax Settings" → "Handle Calls Using"
// on the phone number (with "Accept Incoming Calls As" set to Voice).
// Returns cXML telling SignalWire to ring the CRM itself (the "office"
// RELAY resource that the Dialer page connects as) and, if a Call
// Forwarding Number is also set in Settings, ring that phone in parallel —
// whichever picks up first wins, the other side just stops ringing.

const RELAY_RESOURCE = 'office' // must match the resource used in signalwire-relay-token

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const { data: settings } = await supabase.from('settings')
      .select('call_forward_number,sw_space_url').limit(1).maybeSingle()

    const forwardTo = settings?.call_forward_number
    const spaceDomain = (settings?.sw_space_url || '').replace(/\.signalwire\.com$/i, '')
    const vertoNoun = spaceDomain ? `<Verto>${RELAY_RESOURCE}@${spaceDomain}.verto.signalwire.com</Verto>` : ''

    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial timeout="25">${vertoNoun}${forwardTo ? `<Number>${forwardTo}</Number>` : ''}</Dial><Say>Thank you for calling. No one is available to take your call right now. Please leave a message after the tone.</Say><Record action="https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/voicemail-recorded" maxLength="120" playBeep="true" /></Response>`

    return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })

  } catch (err) {
    console.error('receive-call error:', err)
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>We're sorry, an error occurred. Please try again later.</Say></Response>`
    return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
  }
})
