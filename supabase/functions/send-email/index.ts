import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SEND_URL  = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'

function base64UrlEncode(str: string): string {
  const utf8 = new TextEncoder().encode(str)
  let binary = ''
  utf8.forEach(b => { binary += String.fromCharCode(b) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function encodeHeaderValue(str: string): string {
  if (!str || /^[\x00-\x7F]*$/.test(str)) return str
  const utf8 = new TextEncoder().encode(str)
  let binary = ''
  utf8.forEach(b => { binary += String.fromCharCode(b) })
  return `=?UTF-8?B?${btoa(binary)}?=`
}

async function getValidGmailToken(supabase: any, settings: any): Promise<string> {
  const expiry = settings.gmail_token_expiry ? new Date(settings.gmail_token_expiry).getTime() : 0
  if (settings.gmail_access_token && expiry > Date.now() + 60000) {
    return settings.gmail_access_token
  }
  const body = new URLSearchParams({
    refresh_token: settings.gmail_refresh_token,
    client_id:     settings.gmail_client_id,
    client_secret: settings.gmail_client_secret,
    grant_type:    'refresh_token',
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description || data.error || 'Gmail token refresh failed')
  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString()
  await supabase.from('settings').update({
    gmail_access_token: data.access_token,
    gmail_token_expiry: expiresAt,
  }).eq('id', settings.id)
  return data.access_token
}

function buildRawEmail(opts: {
  from: string, fromName: string, to: string,
  subject: string, body: string, isHtml: boolean,
  replyTo?: string, atts?: { filename: string; b64: string }[]
}): string {
  const encodedFrom    = `${encodeHeaderValue(opts.fromName)} <${opts.from}>`
  const encodedSubject = encodeHeaderValue(opts.subject)
  const atts = opts.atts || []

  if (atts.length > 0) {
    const boundary = `tcr_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const headers = [
      `To: ${opts.to}`,
      `From: ${encodedFrom}`,
      ...(opts.replyTo ? [`Reply-To: ${opts.replyTo}`] : []),
      `Subject: ${encodedSubject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ].join('\r\n')
    const bodyPart =
      `--${boundary}\r\n` +
      `Content-Type: ${opts.isHtml ? 'text/html' : 'text/plain'}; charset="UTF-8"\r\n\r\n` +
      opts.body + '\r\n'
    const attParts = atts.map(a =>
      `--${boundary}\r\n` +
      `Content-Type: application/pdf\r\n` +
      `Content-Transfer-Encoding: base64\r\n` +
      `Content-Disposition: attachment; filename="${a.filename}"\r\n\r\n` +
      a.b64.match(/.{1,76}/g)!.join('\r\n') + '\r\n'
    ).join('')
    return `${headers}\r\n\r\n${bodyPart}${attParts}--${boundary}--`
  }

  const headers = [
    `To: ${opts.to}`,
    `From: ${encodedFrom}`,
    ...(opts.replyTo ? [`Reply-To: ${opts.replyTo}`] : []),
    `Subject: ${encodedSubject}`,
    `Date: ${new Date().toUTCString()}`,
    `Content-Type: ${opts.isHtml ? 'text/html' : 'text/plain'}; charset="UTF-8"`,
    'MIME-Version: 1.0',
  ].join('\r\n')
  return `${headers}\r\n\r\n${opts.body}`
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Load tenant settings
    let settingsQuery = supabase.from('settings').select('*')
    if (tenant_id) settingsQuery = settingsQuery.eq('tenant_id', tenant_id)
    else settingsQuery = settingsQuery.limit(1)
    const { data: tenantSettings } = await settingsQuery.maybeSingle()

    const fromDisplayName = from_name || tenantSettings?.name || 'TaxRes CRM'
    const fromAddress     = from_email || tenantSettings?.smtp_email || tenantSettings?.email || 'info@taxcasereview.org'
    const isHtml          = !!html
    const sig             = tenantSettings?.email_signature ? `\n\n${tenantSettings.email_signature}` : ''
    const finalBody       = isHtml ? html : `${text}${sig}`

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
        } catch (_) { /* skip */ }
      }
    }

    // Always use TCR Gmail OAuth — it's the only transport that works from Supabase's cloud.
    // from_name / from_email override the display name so non-TCR tenants
    // (Nashville, TaxRes CRM admin) still show their own branding in the email header.
    // Reply-To is set to the tenant's address so replies land in the right inbox.
    const { data: gmailSettings } = await supabase.from('settings')
      .select('*').not('gmail_refresh_token', 'is', null).limit(1).maybeSingle()

    if (!gmailSettings?.gmail_refresh_token) {
      return new Response(JSON.stringify({ error: 'No Gmail OAuth configured' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let accessToken = await getValidGmailToken(supabase, gmailSettings)

    const toList = Array.isArray(to) ? to : [to]
    for (const recipient of toList) {
      const raw = buildRawEmail({
        from:    gmailSettings.email || 'info@taxcasereview.org',
        fromName: fromDisplayName,
        to:      recipient,
        subject,
        body:    finalBody,
        isHtml,
        // Reply-To routes replies to the tenant's actual address
        replyTo: fromAddress !== (gmailSettings.email || '') ? fromAddress : undefined,
        atts,
      })

      const encoded = base64UrlEncode(raw)

      // Retry with exponential backoff on 429 (rate limit) and 5xx errors
      // Gmail API quota: 250 units/user/second — bursts from 16 users can hit this
      let sendRes: Response | null = null
      let sendData: any = null
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt > 0) {
          // Exponential backoff: 1s, 2s, 4s
          await new Promise(r => setTimeout(r, Math.pow(2, attempt - 1) * 1000))
          // Refresh token in case it expired during wait
          try { accessToken = await getValidGmailToken(supabase, gmailSettings) } catch (_) {}
        }
        sendRes = await fetch(SEND_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw: encoded }),
        })
        sendData = await sendRes.json()
        // Success or non-retryable error — stop retrying
        if (sendRes.ok || (sendRes.status !== 429 && sendRes.status < 500)) break
      }

      if (!sendRes!.ok) {
        const isRateLimit = sendRes!.status === 429
        console.error(`send-email: Gmail ${sendRes!.status} after retries — ${sendData?.error?.message}`)
        return new Response(JSON.stringify({
          error: isRateLimit
            ? 'Email queued — Gmail rate limit reached, retry in a moment'
            : (sendData?.error?.message || 'Gmail send failed'),
          retryable: isRateLimit,
        }), { status: isRateLimit ? 429 : 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    return new Response(JSON.stringify({ success: true, via: 'gmail' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('send-email error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Send failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
