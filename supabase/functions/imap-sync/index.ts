// imap-sync — polls each active email_accounts row via IMAP,
// pulls new messages, matches to clients/leads by sender email,
// and upserts into the emails table. Runs on a cron schedule.
// Password is decrypted server-side using pgcrypto — never sent to client.
//
// Uses the 'EmailEngine' HTTP bridge approach via Stalwart's built-in
// JMAP/REST access, falling back to raw IMAP via the `imap` npm package
// proxied through a Deno-compatible wrapper.
//
// Stalwart Mail Server exposes IMAP on port 993 (SSL/TLS) and
// SMTP on ports 587 (STARTTLS) / 465 (SSL). We connect via
// Deno's built-in Deno.connectTls() for the IMAP session.

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

// ── IMAP protocol helpers ────────────────────────────────────────────────────

async function imapCommand(conn: Deno.TlsConn, tag: string, command: string): Promise<string> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  await conn.write(encoder.encode(`${tag} ${command}\r\n`))

  let response = ''
  const buf = new Uint8Array(65536)
  while (true) {
    const n = await conn.read(buf)
    if (n === null) break
    response += decoder.decode(buf.subarray(0, n))
    // Look for tagged response completion
    if (response.includes(`${tag} OK`) || response.includes(`${tag} NO`) || response.includes(`${tag} BAD`)) break
    // For FETCH responses wait for end of literal content
    if (response.includes(`) \r\n${tag}`) || response.match(new RegExp(`\\)\\s*\\r\\n${tag}`))) break
  }
  return response
}

function parseEnvelope(fetchResponse: string): { subject: string, from: string, date: string, messageId: string } {
  // Basic ENVELOPE parse — extract Subject, From, Date, Message-ID from raw fetch
  const subjectMatch = fetchResponse.match(/Subject:\s*(.+?)(?:\r\n|\n)(?:\s|\S)/i)
  const fromMatch    = fetchResponse.match(/From:\s*(.+?)(?:\r\n|\n)/i)
  const dateMatch    = fetchResponse.match(/Date:\s*(.+?)(?:\r\n|\n)/i)
  const msgIdMatch   = fetchResponse.match(/Message-ID:\s*<([^>]+)>/i)

  return {
    subject:   subjectMatch?.[1]?.trim() || '(no subject)',
    from:      fromMatch?.[1]?.trim()    || '',
    date:      dateMatch?.[1]?.trim()    || new Date().toISOString(),
    messageId: msgIdMatch?.[1]?.trim()   || `${Date.now()}@taxrescrm.net`,
  }
}

function extractEmailAddress(headerValue: string): string {
  const match = headerValue.match(/<([^>]+)>/) || headerValue.match(/([^\s,]+@[^\s,]+)/)
  return match?.[1]?.toLowerCase().trim() || headerValue.toLowerCase().trim()
}

function extractBody(fetchResponse: string): { text: string, html: string } {
  // Extract plain text and HTML parts from raw IMAP BODY[] response
  const htmlMatch  = fetchResponse.match(/Content-Type: text\/html[^]*?\r\n\r\n([^]*?)(?:\r\n--|\r\n\r\n[A-Z0-9]+\s)/i)
  const textMatch  = fetchResponse.match(/Content-Type: text\/plain[^]*?\r\n\r\n([^]*?)(?:\r\n--|\r\n\r\n[A-Z0-9]+\s)/i)

  const html = htmlMatch?.[1]?.trim() || ''
  const text = textMatch?.[1]?.trim() || fetchResponse.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 5000)

  return { text, html }
}

async function matchToClient(senderEmail: string, tenantId: string): Promise<{ clientId: string | null, clientName: string | null }> {
  // Try clients first, then leads
  const { data: client } = await supabase
    .from('clients')
    .select('id, name')
    .eq('email', senderEmail)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (client) return { clientId: client.id, clientName: client.name }

  const { data: lead } = await supabase
    .from('leads')
    .select('id, name')
    .eq('email', senderEmail)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  return { clientId: lead?.id || null, clientName: lead?.name || null }
}

// ── Main sync function for one account ──────────────────────────────────────
async function syncAccount(account: Record<string, unknown>): Promise<{ synced: number, errors: string[] }> {
  const errors: string[] = []
  let synced = 0

  // Decrypt the stored password
  const { data: decrypted, error: decErr } = await supabase
    .rpc('decrypt_email_password', { p_encrypted: account.encrypted_password, p_key: ENCRYPT_KEY })

  if (decErr || !decrypted) {
    return { synced: 0, errors: [`Password decrypt failed: ${decErr?.message || 'empty'}`] }
  }

  let conn: Deno.TlsConn | null = null
  try {
    // Connect to IMAP over TLS
    conn = await Deno.connectTls({
      hostname: account.imap_host as string,
      port: account.imap_port as number,
    })

    const decoder = new TextDecoder()
    const greeting = new Uint8Array(1024)
    await conn.read(greeting)

    // LOGIN
    const loginResp = await imapCommand(conn, 'A1', `LOGIN "${account.email_address}" "${decrypted}"`)
    if (!loginResp.includes('A1 OK')) {
      throw new Error(`IMAP LOGIN failed: ${loginResp.slice(0, 200)}`)
    }

    // SELECT INBOX
    await imapCommand(conn, 'A2', 'SELECT INBOX')

    // SEARCH UNSEEN — only pull new messages
    const searchResp = await imapCommand(conn, 'A3', 'SEARCH UNSEEN')
    const seqNums = (searchResp.match(/\* SEARCH (.+?)\r\n/)?.[1] || '').trim().split(' ').filter(Boolean)

    if (seqNums.length === 0) {
      await imapCommand(conn, 'A99', 'LOGOUT')
      return { synced: 0, errors: [] }
    }

    // Fetch headers + body for each new message
    let tag = 10
    for (const seq of seqNums.slice(0, 50)) { // max 50 per sync run
      try {
        const fetchResp = await imapCommand(conn, `B${tag}`, `FETCH ${seq} (BODY[])`)
        tag++

        const { subject, from, date, messageId } = parseEnvelope(fetchResp)
        const senderEmail = extractEmailAddress(from)
        const { text, html } = extractBody(fetchResp)

        // Check for duplicate
        const { data: existing } = await supabase
          .from('emails')
          .select('id')
          .eq('message_id', messageId)
          .maybeSingle()

        if (existing) continue

        // Match to client/lead
        const { clientId, clientName } = await matchToClient(senderEmail, account.tenant_id as string)

        // Derive thread_id from Message-ID (simplified — production would chase In-Reply-To)
        const threadId = messageId.split('@')[0]

        // Insert into emails table
        await supabase.from('emails').insert([{
          tenant_id:        account.tenant_id,
          email_account_id: account.id,
          message_id:       messageId,
          thread_id:        threadId,
          mailbox_owner:    account.employee_email,
          sender:           senderEmail,
          from_address:     senderEmail,
          recipients:       [{ email: account.email_address as string }],
          subject,
          body:             text,
          body_html:        html,
          direction:        'inbound',
          triage:           'Inbox',
          status:           'Received',
          is_read:          false,
          received_at:      new Date(date).toISOString(),
          client_id:        clientId,
          clientName:       clientName,
          created_at:       new Date().toISOString(),
        }])

        synced++
      } catch (msgErr) {
        errors.push(`Seq ${seq}: ${(msgErr as Error).message}`)
      }
    }

    await imapCommand(conn, 'A99', 'LOGOUT')

  } catch (err) {
    errors.push((err as Error).message)
  } finally {
    try { conn?.close() } catch (_) {}
  }

  return { synced, errors }
}

// ── Entry point ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Fetch all active email accounts
    const { data: accounts, error } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('is_active', true)

    if (error) throw error

    const results: Record<string, unknown>[] = []

    for (const account of (accounts || [])) {
      const { synced, errors } = await syncAccount(account)

      // Log the sync attempt
      await supabase.from('email_sync_log').insert([{
        account_id:   account.id,
        tenant_id:    account.tenant_id,
        messages_new: synced,
        status:       errors.length ? 'error' : 'ok',
        error_message: errors.length ? errors.join('; ') : null,
      }])

      // Update last_sync on the account
      await supabase.from('email_accounts').update({
        last_sync_at: new Date().toISOString(),
        sync_status:  errors.length ? 'error' : 'ok',
        sync_error:   errors.length ? errors[0] : null,
      }).eq('id', account.id)

      results.push({ account: account.email_address, synced, errors })
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('imap-sync error:', err)
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
