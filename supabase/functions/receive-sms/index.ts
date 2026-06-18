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

    if (!from || !body) {
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

    await supabase.from('sms_messages').insert({
      clientName: clientName || from,
      phone: from,
      body,
      status: 'Received',
      direction: 'inbound',
      signalwire_sms_id: sid,
      created_at: new Date().toISOString(),
    })

    return new Response(emptyXml, { headers: { 'Content-Type': 'text/xml' } })

  } catch (err) {
    console.error('receive-sms error:', err)
    // Still return valid XML even on error, so SignalWire doesn't retry/loop
    return new Response(emptyXml, { headers: { 'Content-Type': 'text/xml' } })
  }
})
