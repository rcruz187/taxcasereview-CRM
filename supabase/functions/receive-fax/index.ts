import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Called BY SignalWire whenever a fax arrives. Configure as the LaML
// Webhook under "Voice and Fax Settings" → "Handle Faxes Using" on the
// phone number, after setting "Accept Incoming Calls As" to Fax.
// SignalWire posts form-encoded data and wants a cXML response back.

const emptyXml = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'

serve(async (req) => {
  try {
    const form = await req.formData()
    const from = form.get('From')?.toString() || form.get('RemoteStationId')?.toString() || ''
    const to = form.get('To')?.toString() || ''
    // SignalWire's fax callback typically includes the document under
    // MediaUrl or OriginalMediaUrl depending on the bin/script used.
    const mediaUrl = form.get('MediaUrl')?.toString() || form.get('OriginalMediaUrl')?.toString() || null
    const sid = form.get('FaxSid')?.toString() || form.get('sid')?.toString() || null

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    await supabase.from('fax_logs').insert({
      from_number: from,
      to_number: to,
      file_url: mediaUrl,
      status: 'Received',
      direction: 'inbound',
      signalwire_fax_id: sid,
      created_at: new Date().toISOString(),
    })

    return new Response(emptyXml, { headers: { 'Content-Type': 'text/xml' } })

  } catch (err) {
    console.error('receive-fax error:', err)
    return new Response(emptyXml, { headers: { 'Content-Type': 'text/xml' } })
  }
})
