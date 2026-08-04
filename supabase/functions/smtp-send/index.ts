// smtp-send — sends email via Stalwart SMTP (or any IMAP/SMTP server).
// Called from the CRM compose UI. Uses the employee's connected email_account
// for authentication, falls back to the firm's Gmail send-email function
// if no IMAP account is connected.
//
// Stalwart SMTP: mail.taxrescrm.net:587 STARTTLS or :465 SSL

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ENCRYPT_KEY   = Deno.env.get('EMAIL_ENCRYPT_KEY') || 'taxrescrm-email-key-change-in-prod'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

function buildRawEmail(opts: {
  from: string, fromName: string,
  to: string | string[],
  subject: string,
  textBody: string,
  htmlBody?: string,
  messageId?: string,
  inReplyTo?: string,
  references?: string,
}): string {
  const boundary = `---boundary-${Date.now()}`
  const toList = Array.isArray(opts.to) ? opts.to.join(', ') : opts.to
  const msgId = opts.messageId || `<${Date.now()}.${Math.random().toString(36).slice(2)}@taxrescrm.net>`
  const now = new Date().toUTCString()

  let raw = [
    `From: ${opts.fromName} <${opts.from}>`,
    `To: ${toList}`,
    `Subject: ${opts.subject}`,
    `Date: ${now}`,
    `Message-ID: ${msgId}`,
    opts.inReplyTo ? `In-Reply-To: <${opts.inReplyTo}>` : '',
    opts.references ? `References: <${opts.references}>` : '',
    'MIME-Version: 1.0',
  ].filter(Boolean).join('\r\n')

  if (opts.htmlBody) {
    raw += `\r\nContent-Type: multipart/alternative; boundary="${boundary}"\r\n`
    raw += `\r\n--${boundary}\r\n`
    raw += `Content-Type: text/plain; charset=UTF-8\r\n\r\n${opts.textBody}\r\n`
    raw += `\r\n--${boundary}\r\n`
    raw += `Content-Type: text/html; charset=UTF-8\r\n\r\n${opts.htmlBody}\r\n`
    raw += `\r\n--${boundary}--\r\n`
  } else {
    raw += '\r\nContent-Type: text/plain; charset=UTF-8\r\n'
    raw += `\r\n${opts.textBody}\r\n`
  }

  return raw
}

async function sendViaSMTP(opts: {
  smtpHost: string, smtpPort: number, useSsl: boolean,
  username: string, password: string,
  rawEmail: string, from: string, to: string[],
}): Promise<void> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  // Connect — port 465 = SSL directly, port 587 = STARTTLS
  let conn: Deno.TcpConn | Deno.TlsConn

  if (opts.smtpPort === 465 || opts.useSsl) {
    conn = await Deno.connectTls({ hostname: opts.smtpHost, port: opts.smtpPort })
  } else {
    conn = await Deno.connect({ hostname: opts.smtpHost, port: opts.smtpPort })
  }

  const read = async () => {
    const buf = new Uint8Array(4096)
    const n = await conn.read(buf)
    return decoder.decode(buf.subarray(0, n || 0))
  }
  const write = async (s: string) => {
    await conn.write(encoder.encode(s + '\r\n'))
  }

  // SMTP handshake
  await read() // 220 greeting
  await write(`EHLO taxrescrm.net`)
  const ehlo = await read()

  // STARTTLS upgrade for port 587
  if (opts.smtpPort === 587 && !opts.useSsl) {
    await write('STARTTLS')
    await read() // 220 Go ahead
    conn = await Deno.startTls(conn as Deno.TcpConn, { hostname: opts.smtpHost })
    await write(`EHLO taxrescrm.net`)
    await read()
  }

  // AUTH LOGIN
  await write('AUTH LOGIN')
  await read() // 334 Username:
  await write(btoa(opts.username))
  await read() // 334 Password:
  await write(btoa(opts.password))
  const authResp = await read()
  if (!authResp.startsWith('235')) {
    throw new Error(`SMTP AUTH failed: ${authResp.slice(0, 100)}`)
  }

  // MAIL FROM
  await write(`MAIL FROM:<${opts.from}>`)
  await read()

  // RCPT TO
  for (const recipient of opts.to) {
    await write(`RCPT TO:<${recipient}>`)
    await read()
  }

  // DATA
  await write('DATA')
  await read() // 354 Start input
  await write(opts.rawEmail + '\r\n.')
  const dataResp = await read()
  if (!dataResp.startsWith('250')) {
    throw new Error(`SMTP DATA rejected: ${dataResp.slice(0, 100)}`)
  }

  await write('QUIT')
  conn.close()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const {
      account_id,       // uuid of email_accounts row (optional — if omitted, use first active account for the user)
      to,               // string or string[]
      subject,
      text_body,
      html_body,
      from_name,
      in_reply_to,
      references,
      client_id,
      case_id,
      thread_id,
    } = await req.json()

    // Get the email account
    let accountQuery = supabase.from('email_accounts').select('*').eq('is_active', true)
    if (account_id) {
      accountQuery = accountQuery.eq('id', account_id)
    }
    const { data: accounts } = await accountQuery.limit(1).maybeSingle()

    if (!accounts) {
      return new Response(JSON.stringify({ error: 'No active email account found' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const account = accounts

    // Decrypt password
    const { data: password } = await supabase
      .rpc('decrypt_email_password', { p_encrypted: account.encrypted_password, p_key: ENCRYPT_KEY })

    if (!password) throw new Error('Could not decrypt email password')

    const toList = Array.isArray(to) ? to : [to]
    const msgId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@taxrescrm.net>`

    const rawEmail = buildRawEmail({
      from:       account.email_address,
      fromName:   from_name || account.display_name || account.email_address,
      to:         toList,
      subject,
      textBody:   text_body || '',
      htmlBody:   html_body,
      messageId:  msgId,
      inReplyTo:  in_reply_to,
      references,
    })

    await sendViaSMTP({
      smtpHost: account.smtp_host,
      smtpPort: account.smtp_port,
      useSsl:   account.use_ssl,
      username: account.email_address,
      password,
      rawEmail,
      from: account.email_address,
      to:   toList,
    })

    // Save the sent email to the database
    await supabase.from('emails').insert([{
      tenant_id:        account.tenant_id,
      email_account_id: account.id,
      message_id:       msgId.replace(/[<>]/g, ''),
      thread_id:        thread_id || msgId.replace(/[<>]/g, '').split('@')[0],
      mailbox_owner:    account.employee_email,
      sender:           account.email_address,
      from_address:     account.email_address,
      recipients:       toList.map((e: string) => ({ email: e })),
      subject,
      body:             text_body || '',
      body_html:        html_body || '',
      direction:        'outbound',
      is_read:          true,
      client_id,
      case_id,
      received_at:      new Date().toISOString(),
      created_at:       new Date().toISOString(),
    }])

    return new Response(JSON.stringify({ ok: true, message_id: msgId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('smtp-send error:', err)
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
