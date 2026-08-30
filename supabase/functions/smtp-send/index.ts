// smtp-send — authenticated SMTP sender with mailbox-safe RomyLabs reply routing.
// Normal staff may only use their own email_accounts rows. RomyLabs routed replies
// additionally require an approved romylabs_mailboxes route and must send from that
// route's exact outbound identity.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const ENCRYPT_KEY = Deno.env.get('EMAIL_ENCRYPT_KEY') || 'taxrescrm-email-key-change-in-prod'
const svc = createClient(SUPABASE_URL, SERVICE_KEY)
const ROMYLABS_ADMINS = new Set(['info@romylabs.com', 'romy@romylabs.com'])

const safeHeader = (v: unknown) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim()
const stripAngles = (v: unknown) => String(v ?? '').trim().replace(/^<|>$/g, '')
const validEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

function buildRawEmail(opts: {
  from: string, fromName: string,
  to: string | string[], subject: string,
  textBody: string, htmlBody?: string,
  messageId?: string, inReplyTo?: string, references?: string,
}): string {
  const boundary = `---boundary-${Date.now()}`
  const toList = (Array.isArray(opts.to) ? opts.to : [opts.to]).map(safeHeader).join(', ')
  const msgId = opts.messageId || `<${Date.now()}.${Math.random().toString(36).slice(2)}@romylabs.com>`
  const inReplyTo = stripAngles(opts.inReplyTo)
  const refs = safeHeader(opts.references)
  let raw = [
    `From: ${safeHeader(opts.fromName)} <${safeHeader(opts.from)}>`,
    `To: ${toList}`,
    `Subject: ${safeHeader(opts.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${msgId}`,
    inReplyTo ? `In-Reply-To: <${inReplyTo}>` : '',
    refs ? `References: ${refs}` : '',
    'MIME-Version: 1.0',
  ].filter(Boolean).join('\r\n')

  if (opts.htmlBody) {
    raw += `\r\nContent-Type: multipart/alternative; boundary="${boundary}"\r\n`
    raw += `\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${opts.textBody}\r\n`
    raw += `\r\n--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${opts.htmlBody}\r\n`
    raw += `\r\n--${boundary}--\r\n`
  } else {
    raw += `\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${opts.textBody}\r\n`
  }
  return raw
}

async function sendViaSMTP(opts: {
  smtpHost: string, smtpPort: number, useSsl: boolean,
  username: string, password: string,
  rawEmail: string, from: string, to: string[],
}) {
  const encoder = new TextEncoder(), decoder = new TextDecoder()
  let conn: Deno.TcpConn | Deno.TlsConn
  if (opts.smtpPort === 465 || opts.useSsl) conn = await Deno.connectTls({ hostname: opts.smtpHost, port: opts.smtpPort })
  else conn = await Deno.connect({ hostname: opts.smtpHost, port: opts.smtpPort })

  const read = async () => { const buf = new Uint8Array(8192); const n = await conn.read(buf); return decoder.decode(buf.subarray(0, n || 0)) }
  const write = async (s: string) => { await conn.write(encoder.encode(s + '\r\n')) }

  await read()
  await write('EHLO romylabs.com')
  await read()
  if (opts.smtpPort === 587 && !opts.useSsl) {
    await write('STARTTLS'); const tlsResp = await read()
    if (!tlsResp.startsWith('220')) throw new Error('SMTP STARTTLS rejected')
    conn = await Deno.startTls(conn as Deno.TcpConn, { hostname: opts.smtpHost })
    await write('EHLO romylabs.com'); await read()
  }

  await write('AUTH LOGIN'); await read()
  await write(btoa(opts.username)); await read()
  await write(btoa(opts.password)); const authResp = await read()
  if (!authResp.startsWith('235')) throw new Error(`SMTP AUTH failed: ${authResp.slice(0, 100)}`)

  await write(`MAIL FROM:<${opts.from}>`); const mailResp = await read()
  if (!mailResp.startsWith('250')) throw new Error(`SMTP MAIL FROM rejected: ${mailResp.slice(0, 100)}`)
  for (const recipient of opts.to) {
    await write(`RCPT TO:<${recipient}>`); const rcptResp = await read()
    if (!rcptResp.startsWith('250') && !rcptResp.startsWith('251')) throw new Error(`SMTP recipient rejected: ${rcptResp.slice(0, 100)}`)
  }
  await write('DATA'); const dataReady = await read()
  if (!dataReady.startsWith('354')) throw new Error(`SMTP DATA rejected: ${dataReady.slice(0, 100)}`)
  await write(opts.rawEmail.replace(/\r?\n\./g, '\r\n..') + '\r\n.'); const dataResp = await read()
  if (!dataResp.startsWith('250')) throw new Error(`SMTP DATA rejected: ${dataResp.slice(0, 100)}`)
  await write('QUIT'); conn.close()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    const callerEmail = String(user?.email || '').toLowerCase()
    if (!callerEmail) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const {
      account_id, route_id, to, subject, text_body, html_body, from_name,
      in_reply_to, references, client_id, case_id, thread_id,
    } = await req.json()

    const toList = (Array.isArray(to) ? to : [to]).map((x: unknown) => safeHeader(x)).filter(validEmail).slice(0, 25)
    if (!toList.length || !safeHeader(subject)) throw new Error('Recipient and subject are required')

    let route: any = null
    let accountQuery = svc.from('email_accounts').select('*').eq('is_active', true)

    if (route_id) {
      if (!ROMYLABS_ADMINS.has(callerEmail)) return new Response(JSON.stringify({ error: 'Not authorized for RomyLabs routed email' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      const { data, error } = await svc.from('romylabs_mailboxes')
        .select('id,email_address,outbound_from,display_name,product_id,tenant_id,inbox_owner,active')
        .eq('id', route_id).eq('active', true).maybeSingle()
      if (error || !data) throw new Error('Mailbox route not found')
      route = data
      accountQuery = accountQuery.eq('tenant_id', route.tenant_id).ilike('email_address', route.outbound_from)
    } else if (account_id) {
      accountQuery = accountQuery.eq('id', account_id).ilike('employee_email', callerEmail)
    } else {
      accountQuery = accountQuery.ilike('employee_email', callerEmail)
    }

    const { data: account, error: accountError } = await accountQuery.limit(1).maybeSingle()
    if (accountError) throw accountError
    if (!account) {
      const identity = route?.outbound_from || callerEmail
      return new Response(JSON.stringify({ error: `No active SMTP account configured for ${identity}` }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (route && normalizeEmail(account.email_address) !== normalizeEmail(route.outbound_from)) throw new Error('SMTP identity does not match routed mailbox')

    const { data: password, error: decryptError } = await svc.rpc('decrypt_email_password', { p_encrypted: account.encrypted_password, p_key: ENCRYPT_KEY })
    if (decryptError || !password) throw new Error('Could not decrypt email password')

    const msgId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@${String(account.email_address).split('@')[1] || 'romylabs.com'}>`
    const rawEmail = buildRawEmail({
      from: account.email_address,
      fromName: from_name || route?.display_name || account.display_name || account.email_address,
      to: toList,
      subject: safeHeader(subject),
      textBody: String(text_body || ''),
      htmlBody: html_body ? String(html_body) : undefined,
      messageId: msgId,
      inReplyTo: stripAngles(in_reply_to),
      references: safeHeader(references),
    })

    await sendViaSMTP({
      smtpHost: account.smtp_host, smtpPort: account.smtp_port, useSsl: account.use_ssl,
      username: account.email_address, password, rawEmail, from: account.email_address, to: toList,
    })

    await svc.from('emails').insert([{
      tenant_id: route?.tenant_id || account.tenant_id,
      email_account_id: account.id,
      message_id: msgId,
      thread_id: thread_id || stripAngles(in_reply_to) || msgId,
      mailbox_owner: route?.inbox_owner || account.employee_email,
      sender: account.email_address,
      from_address: account.email_address,
      recipients: toList,
      recipient: toList[0],
      subject: safeHeader(subject),
      body: String(text_body || ''),
      body_html: html_body ? String(html_body) : '',
      direction: 'outbound',
      triage: 'Sent',
      status: 'Sent',
      is_read: true,
      client_id,
      case_id,
      received_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      received_mailbox: route?.email_address || null,
      reply_from: account.email_address,
      product_id: route?.product_id || null,
      in_reply_to: cleanNullable(in_reply_to),
      references_header: cleanNullable(references),
      route_id: route?.id || null,
    }])

    return new Response(JSON.stringify({ ok: true, message_id: msgId, from: account.email_address }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('smtp-send error:', err)
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})

function normalizeEmail(v: unknown) { return String(v ?? '').trim().toLowerCase() }
function cleanNullable(v: unknown) { const s = safeHeader(v); return s || null }
