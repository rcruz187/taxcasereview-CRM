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
    client_id: settings.gmail_client_id,
    client_secret: settings.gmail_client_secret,
    grant_type: 'refresh_token',
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

// Send via Stalwart SMTP (or any SMTP server) — used for tenants with smtp_host configured.
// Port 465 = SSL directly, port 587 = STARTTLS (we use 465 for Stalwart).
async function sendViaSMTP(opts: {
  host: string, port: number,
  username: string, password: string,
  from: string, to: string, rawEmail: string,
}): Promise<void> {
  const enc = new TextEncoder()
  const dec = new TextDecoder()
  const conn = await (Deno as any).connectTls({ hostname: opts.host, port: opts.port })

  const read = async () => {
    const buf = new Uint8Array(4096)
    const n = await conn.read(buf)
    return dec.decode(buf.subarray(0, n || 0))
  }
  const write = async (s: string) => { await conn.write(enc.encode(s + '\r\n')) }

  await read() // 220 greeting
  await write(`EHLO taxrescrm.net`); await read()
  await write(`AUTH LOGIN`); await read()
  await write(btoa(opts.username)); await read()
  await write(btoa(opts.password)); await read()
  await write(`MAIL FROM:<${opts.from}>`); await read()
  const toList = Array.isArray(opts.to) ? opts.to : [opts.to]
  for (const t of toList) { await write(`RCPT TO:<${t}>`); await read() }
  await write(`DATA`); await read()
  await write(opts.rawEmail + '\r\n.'); await read()
  await write(`QUIT`)
  conn.close()
}

function buildRawEmail(opts: {
  from: string, fromName: string, to: string,
  subject: string, body: string, isHtml: boolean,
  replyTo?: string, atts?: { filename: string; b64: string }[]
}): string {
  const encodedFrom = `${encodeHeaderValue(opts.fromName)} <${opts.from}>`
  const encodedSubject = encodeHeaderValue(opts.subject)
  const atts = opts.atts || []

  if (atts.length > 0) {
    const boundary = `tcr_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const headers = [
      `To: ${opts.to}`,
      `From: ${encodedFrom}`,
      ...(opts.replyTo ? [`Reply-To: ${opts.replyTo}`] : []),
      `Subject: ${encodedSubject}`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ].join('\r\n')
    let msg = `${headers}\r\n\r\n--${boundary}\r\n`
    msg += `Content-Type: ${opts.isHtml ? 'text/html' : 'text/plain'}; charset="UTF-8"\r\n\r\n${opts.body}\r\n`
    for (const a of atts) {
      msg += `--${boundary}\r\n`
      msg += `Content-Type: application/pdf; name="${a.filename}"\r\n`
      msg += `Content-Disposition: attachment; filename="${a.filename}"\r\n`
      msg += 'Content-Transfer-Encoding: base64\r\n\r\n'
      msg += `${a.b64.replace(/(.{76})/g, '$1\r\n')}\r\n`
    }
    msg += `--${boundary}--`
    return msg
  } else {
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

    // Load settings for the requested tenant (or first row = TCR fallback)
    let settingsQuery = supabase.from('settings').select('*')
    if (tenant_id) settingsQuery = settingsQuery.eq('tenant_id', tenant_id)
    else settingsQuery = settingsQuery.limit(1)
    const { data: settings } = await settingsQuery.maybeSingle()

    const fromDisplayName = from_name || settings?.name || 'Tax Case Review'
    const fromAddress     = from_email || settings?.email || 'info@taxcasereview.org'
    const isHtml = !!html
    const sig = settings?.email_signature ? `\n\n${settings.email_signature}` : ''
    const finalBody = isHtml ? html : `${text}${sig}`

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

    // ── PATH 1: SMTP (Stalwart) ── tenant has smtp_host configured
    if (settings?.smtp_host && settings?.smtp_email && settings?.smtp_password) {
      const rawEmail = buildRawEmail({
        from: settings.smtp_email,
        fromName: fromDisplayName,
        to,
        subject,
        body: finalBody,
        isHtml,
        replyTo: fromAddress !== settings.smtp_email ? fromAddress : undefined,
        atts,
      })
      await sendViaSMTP({
        host: settings.smtp_host,
        port: Number(settings.smtp_port) || 465,
        username: settings.smtp_email,
        password: settings.smtp_password,
        from: settings.smtp_email,
        to,
        rawEmail,
      })
      return new Response(JSON.stringify({ success: true, via: 'smtp' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── PATH 2: Gmail OAuth ── tenant has Gmail connected
    let activeSettings = settings
    if (!settings?.gmail_refresh_token || !settings?.gmail_client_id || !settings?.gmail_client_secret) {
      // Fall back to platform Gmail (TCR)
      const { data: platformSettings } = await supabase.from('settings')
        .select('*').not('gmail_refresh_token', 'is', null).limit(1).maybeSingle()
      if (!platformSettings?.gmail_refresh_token) {
        return new Response(JSON.stringify({ error: 'No email transport configured (no SMTP and no Gmail)' }), {
          status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      activeSettings = platformSettings
    }

    const token = await getValidGmailToken(supabase, activeSettings)
    const from = fromAddress
      ? `${encodeHeaderValue(fromDisplayName)} <${fromAddress}>`
      : encodeHeaderValue(fromDisplayName)
    const replyTo = fromAddress ? `Reply-To: ${fromAddress}` : null
    const encodedSubject = encodeHeaderValue(subject)

    let message: string
    if (atts.length > 0) {
      const boundary = `tcr_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const headers = [
        `To: ${to}`, `From: ${from}`,
        ...(replyTo ? [replyTo] : []),
        `Subject: ${encodedSubject}`,
        `Date: ${new Date().toUTCString()}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
      ].join('\r\n')
      let body = `${headers}\r\n\r\n--${boundary}\r\n`
      body += `Content-Type: ${isHtml ? 'text/html' : 'text/plain'}; charset="UTF-8"\r\n\r\n${finalBody}\r\n`
      for (const a of atts) {
        body += `--${boundary}\r\n`
        body += `Content-Type: application/pdf; name="${a.filename}"\r\n`
        body += `Content-Disposition: attachment; filename="${a.filename}"\r\n`
        body += 'Content-Transfer-Encoding: base64\r\n\r\n'
        body += `${a.b64.replace(/(.{76})/g, '$1\r\n')}\r\n`
      }
      body += `--${boundary}--`
      message = body
    } else {
      const headers = [
        `To: ${to}`, `From: ${from}`,
        ...(replyTo ? [replyTo] : []),
        `Subject: ${encodedSubject}`,
        `Date: ${new Date().toUTCString()}`,
        `Content-Type: ${isHtml ? 'text/html' : 'text/plain'}; charset="UTF-8"`,
        'MIME-Version: 1.0',
      ].join('\r\n')
      message = `${headers}\r\n\r\n${finalBody}`
    }

    const raw = base64UrlEncode(message)
    const sendRes = await fetch(SEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    })
    const sendData = await sendRes.json()
    if (!sendRes.ok) {
      return new Response(JSON.stringify({ error: sendData.error?.message || 'Gmail send failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ success: true, via: 'gmail', id: sendData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('send-email error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Send failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
