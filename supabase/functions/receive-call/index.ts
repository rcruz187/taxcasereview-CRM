import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Called BY SignalWire whenever someone calls the number. Configure as
// the LaML Webhook under "Voice and Fax Settings" → "Handle Calls Using"
// on the phone number (with "Accept Incoming Calls As" set to Voice).
// Returns cXML telling SignalWire to ring a real phone — set which one
// in Settings → SignalWire → Call Forwarding Number.

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const { data: settings } = await supabase.from('settings')
      .select('call_forward_number').limit(1).maybeSingle()

    const forwardTo = settings?.call_forward_number

    const xml = forwardTo
      ? `<?xml version="1.0" encoding="UTF-8"?><Response><Dial>${forwardTo}</Dial></Response>`
      // No number configured yet — play a quick message instead of just
      // ringing dead air, so a caller at least knows it's a real business.
      : `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Thank you for calling. No one is available to take your call right now. Please try again later.</Say></Response>`

    return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })

  } catch (err) {
    console.error('receive-call error:', err)
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>We're sorry, an error occurred. Please try again later.</Say></Response>`
    return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
  }
})
