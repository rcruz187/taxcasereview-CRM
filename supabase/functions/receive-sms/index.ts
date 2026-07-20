import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// This one is called BY SignalWire (not by the CRM), every time someone
// texts your number. Configure it as the LaML Webhook under "Inbound
// Message Settings" on the phone number in the SignalWire dashboard.
// SignalWire posts form-encoded data and expects a cXML response back —
// an empty <Response></Response> means "got it, don't auto-reply."

const emptyXml = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'

serve(async (req) => {
  try {
    const form = await req.formData()
    const from = form.get('From')?.toString() || ''
    const to = form.get('To')?.toString() || ''
    const body = form.get('Body')?.toString() || ''
    const sid = form.get('MessageSid')?.toString() || form.get('sid')?.toString() || null

    // MMS: SignalWire (Twilio-compatible) sends NumMedia plus MediaUrl0/
    // MediaContentType0, MediaUrl1/MediaContentType1, etc. Previously none
    // of this was captured at all, so a client texting a photo of a
    // document just vanished — the text body (if any) was all that saved.
    const numMedia = parseInt(form.get('NumMedia')?.toString() || '0') || 0
    const media = []
    for (let i = 0; i < numMedia; i++) {
      const url = form.get(`MediaUrl${i}`)?.toString()
      const contentType = form.get(`MediaContentType${i}`)?.toString() || null
      if (url) media.push({ url, content_type: contentType })
    }

    if (!from || (!body && media.length === 0)) {
      return new Response(emptyXml, { headers: { 'Content-Type': 'text/xml' } })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Try to match the sender to a known lead/client by phone, purely so
    // it shows a name instead of just a number in the CRM's SMS list.
    const last10 = from.replace(/\D/g, '').slice(-10)
    let clientName = ''
    if (last10) {
      const { data: leadMatch } = await supabase.from('leads').select('name,phone')
        .ilike('phone', `%${last10}%`).limit(1).maybeSingle()
      if (leadMatch) clientName = leadMatch.name
      if (!clientName) {
        const { data: clientMatch } = await supabase.from('clients').select('name,phone')
          .ilike('phone', `%${last10}%`).limit(1).maybeSingle()
        if (clientMatch) clientName = clientMatch.name
      }
    }

    // Stamp the tenant that owns the number the text was sent to (fallback to
    // the single settings row — single-tenant behaves identically).
    const DEFAULT_TENANT = '61a89aef-0e7e-4ea2-b222-44ab2024655a'
    let tenantId = DEFAULT_TENANT
    const toDigits = to.replace(/\D/g, '').slice(-10)
    try {
      const { data: rows } = await supabase.from('settings').select('tenant_id,sw_inbound_did')
      const match = (rows || []).find(
        r => (r.sw_inbound_did || '').replace(/\D/g, '').slice(-10) === toDigits
      )
      if (match?.tenant_id) tenantId = match.tenant_id
      else if ((rows || []).length === 1 && rows[0].tenant_id) tenantId = rows[0].tenant_id
    } catch (_) { /* keep default */ }

    const { error: insertError } = await supabase.from('sms_messages').insert({
      tenant_id: tenantId,
      clientName: clientName || from,
      phone: from,
      body,
      media: media.length > 0 ? media : null,
      status: 'Received',
      direction: 'inbound',
      signalwire_sms_id: sid,
      created_at: new Date().toISOString(),
    })
    if (insertError) console.error('[receive-sms] sms_messages insert FAILED:', insertError.message)

    return new Response(emptyXml, { headers: { 'Content-Type': 'text/xml' } })

  } catch (err) {
    console.error('receive-sms error:', err)
    // Still return valid XML even on error, so SignalWire doesn't retry/loop
    return new Response(emptyXml, { headers: { 'Content-Type': 'text/xml' } })
  }
})
