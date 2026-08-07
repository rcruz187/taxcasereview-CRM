import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function encodeHeaderValue(str: string): string {
  if (!str || /^[\x00-\x7F]*$/.test(str)) return str
  const utf8 = new TextEncoder().encode(str)
  let binary = ''
  utf8.forEach(b => { binary += String.fromCharCode(b) })
  return `=?UTF-8?B?${btoa(binary)}?=`
}

// Send via Brevo HTTP API — works from Supabase edge functions (HTTPS/443 only, no raw SMTP sockets)
async function sendViaBrevo(opts: {
  apiKey: string
  from: string
  fromName: string
  to: string | string[]
  subject: string
  html?: string
  text?: string
  replyTo?: string
  attachments?: { filename: string; b64: string }[]
}): Promise<void> {
  const toList = (Array.isArray(opts.to) ? opts.to : [opts.to]).map(e => ({ email: e }))

  const body: Record<string, unknown> = {
    sender: { name: opts.fromName, email: opts.from },
    to: toList,
    subject: opts.subject,
  }
  if (opts.html) body.htmlContent = opts.html
  else if (opts.text) body.textContent = opts.text
  if (opts.replyTo) body.replyTo = { email: opts.replyTo }
  if (opts.attachments?.length) {
    body.attachment = opts.attachments.map(a => ({
      name: a.filename,
      content: a.b64,
    }))
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': opts.apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Brevo error ${res.status}: ${err}`)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { to, subject, html, text, attachments, tenant_id, from_email, from_name } = await req.json()

    if (!to || !subject || (!html && !text)) {
      return new Response(JSON.stringify({ error: 'Missing required fields: to, subject, html/text' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') ?? ''
    if (!BREVO_API_KEY) {
      return new Response(JSON.stringify({ error: 'BREVO_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Load settings for the requested tenant (first row = TCR fallback)
    let settingsQuery = supabase.from('settings').select('name, email, smtp_email, email_signature')
    if (tenant_id) settingsQuery = settingsQuery.eq('tenant_id', tenant_id)
    else settingsQuery = settingsQuery.limit(1)
    const { data: settings } = await settingsQuery.maybeSingle()

    // From address: explicit override → tenant smtp_email → tenant email → TCR fallback
    const fromDisplayName = from_name || settings?.name || 'TaxRes CRM'
    const fromAddress     = from_email || settings?.smtp_email || settings?.email || 'info@taxcasereview.org'

    const sig = settings?.email_signature ? `\n\n${settings.email_signature}` : ''
    const finalBody = html ?? `${text}${sig}`

    // Fetch attachments
    const atts: { filename: string; b64: string }[] = []
    if (Array.isArray(attachments)) {
      for (const a of attachments) {
        if (!a?.url) continue
        try {
          const r = await fetch(a.url)
          if (!r.ok) continue
          const buf = new Uint8Array(await r.arrayBuffer())
          let bin = ''
          for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
          atts.push({ filename: a.filename || 'document.pdf', b64: btoa(bin) })
        } catch (_) { /* skip failed attachment */ }
      }
    }

    await sendViaBrevo({
      apiKey: BREVO_API_KEY,
      from: fromAddress,
      fromName: fromDisplayName,
      to,
      subject,
      html: html ? finalBody : undefined,
      text: !html ? finalBody : undefined,
      replyTo: from_email && from_email !== fromAddress ? from_email : undefined,
      attachments: atts.length ? atts : undefined,
    })

    return new Response(JSON.stringify({ success: true, via: 'brevo' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('send-email error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Send failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
