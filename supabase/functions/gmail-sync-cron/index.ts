import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const LIST_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages'
const RETENTION_DAYS = 365
const ACTIONS = new Set(['archive', 'trash', 'read', 'unread', 'inbox'])

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}
function b64urlDecode(v = '') {
  if (!v) return ''
  const b64 = v.replace(/-/g, '+').replace(/_/g, '/')
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const binary = atob(b64 + pad)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder('utf-8').decode(bytes)
}
function header(headers: any[], name: string) {
  return headers?.find((h: any) => String(h.name).toLowerCase() === name.toLowerCase())?.value || ''
}
function address(v = '') {
  const m = v.match(/<([^>]+)>/)
  return (m ? m[1] : v).trim()
}
function displayName(v = '') {
  const m = v.match(/^"?([^"<]*)"?\s*<[^>]+>$/)
  return m && m[1].trim() ? m[1].trim() : address(v)
}
function bodyPart(payload: any, mime: string): string | null {
  if (!payload) return null
  if (payload.mimeType === mime && payload.body?.data) return payload.body.data
  for (const p of payload.parts || []) {
    const found = bodyPart(p, mime)
    if (found) return found
  }
  return null
}
function stripHtml(html = '') {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}
function attachments(payload: any, out: any[] = []) {
  if (!payload) return out
  if (payload.filename && payload.body?.attachmentId) out.push({
    filename: payload.filename,
    mimeType: payload.mimeType || 'application/octet-stream',
    size: payload.body.size || 0,
    attachmentId: payload.body.attachmentId,
  })
  for (const p of payload.parts || []) attachments(p, out)
  return out
}

async function validToken(sb: any, acct: any, creds: any) {
  const expiry = acct.gmail_token_expiry ? new Date(acct.gmail_token_expiry).getTime() : 0
  if (acct.gmail_access_token && expiry > Date.now() + 60000) return acct.gmail_access_token
  const body = new URLSearchParams({
    refresh_token: acct.gmail_refresh_token,
    client_id: creds.gmail_client_id,
    client_secret: creds.gmail_client_secret,
    grant_type: 'refresh_token',
  })
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description || data.error || `Token refresh failed (${res.status})`)
  const expiresAt = new Date(Date.now() + Number(data.expires_in || 3600) * 1000).toISOString()
  await sb.from('employee_gmail_accounts').update({ gmail_access_token: data.access_token, gmail_token_expiry: expiresAt }).eq('employee_email', acct.employee_email)
  return data.access_token
}

async function listIds(token: string, label: string, maxResults = 100) {
  const qs = new URLSearchParams({ maxResults: String(maxResults), labelIds: label })
  const res = await fetch(`${LIST_URL}?${qs}`, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || `Gmail list failed (${res.status})`)
  return (data.messages || []).map((m: any) => m.id)
}

async function listAllIds(token: string, label: string, maxPages = 10) {
  const out: string[] = []
  let pageToken = ''
  for (let page = 0; page < maxPages; page++) {
    const qs = new URLSearchParams({ maxResults: '500', labelIds: label })
    if (pageToken) qs.set('pageToken', pageToken)
    const res = await fetch(`${LIST_URL}?${qs}`, { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.message || `Gmail list failed (${res.status})`)
    out.push(...(data.messages || []).map((m: any) => m.id))
    pageToken = data.nextPageToken || ''
    if (!pageToken) break
  }
  return out
}

async function parseMessage(token: string, id: string, clients: any[], leads: any[]) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers: { Authorization: `Bearer ${token}` } })
  const msg = await res.json()
  if (!res.ok) throw new Error(msg.error?.message || `Gmail get failed (${res.status})`)
  const labels = msg.labelIds || []
  const isSent = labels.includes('SENT')
  const isInbox = labels.includes('INBOX')
  if (!isSent && !isInbox) return null
  const hs = msg.payload?.headers || []
  const fromH = header(hs, 'From')
  const toH = header(hs, 'To')
  const subject = header(hs, 'Subject') || '(no subject)'
  const dateH = header(hs, 'Date')
  const receivedAt = dateH && !Number.isNaN(Date.parse(dateH)) ? new Date(dateH).toISOString() : new Date(Number(msg.internalDate || Date.now())).toISOString()
  const plain = bodyPart(msg.payload, 'text/plain')
  const html = bodyPart(msg.payload, 'text/html')
  const htmlRaw = html ? b64urlDecode(html) : null
  const body = plain ? b64urlDecode(plain) : htmlRaw ? stripHtml(htmlRaw) : (msg.snippet || '')
  const counterpartH = isSent ? toH : fromH
  const counterpart = address(counterpartH)
  const client = clients.find((c: any) => c.email && String(c.email).toLowerCase() === counterpart.toLowerCase())
  const lead = client ? null : leads.find((l: any) => l.email && String(l.email).toLowerCase() === counterpart.toLowerCase())
  return {
    row: {
      recipient: isSent ? counterpart : address(fromH),
      clientName: client?.name || lead?.name || displayName(counterpartH) || counterpart,
      subject,
      body,
      body_html: htmlRaw,
      triage: isSent ? 'Sent' : 'Inbox',
      status: isSent ? 'Sent' : 'Received',
      gmail_message_id: msg.id,
      gmail_thread_id: msg.threadId,
      from_address: address(fromH),
      received_at: receivedAt,
      created_at: receivedAt,
      is_read: isSent || !labels.includes('UNREAD'),
      attachments: attachments(msg.payload),
    },
    match: client ? { kind: 'client', id: client.id, name: client.name } : lead ? { kind: 'lead', id: lead.id, name: lead.name } : null,
  }
}

async function reconcileUnread(sb: any, token: string, mailboxOwner: string) {
  const unreadIds = await listAllIds(token, 'UNREAD')
  const unread = new Set(unreadIds)
  const { data: rows } = await sb.from('emails')
    .select('id,gmail_message_id,is_read')
    .eq('mailbox_owner', mailboxOwner)
    .is('deleted_at', null)
    .not('gmail_message_id', 'is', null)
    .limit(1000)
  if (!rows?.length) return { unread: 0, changed: 0 }
  const toUnread = rows.filter((r: any) => unread.has(r.gmail_message_id) && r.is_read !== false).map((r: any) => r.id)
  const toRead = rows.filter((r: any) => !unread.has(r.gmail_message_id) && r.is_read !== true).map((r: any) => r.id)
  if (toUnread.length) await sb.from('emails').update({ is_read: false }).in('id', toUnread)
  if (toRead.length) await sb.from('emails').update({ is_read: true }).in('id', toRead)
  return { unread: unreadIds.length, changed: toUnread.length + toRead.length }
}

async function syncAccount(sb: any, acct: any, tenantId: string, creds: any) {
  const token = await validToken(sb, acct, creds)
  const [{ data: clients }, { data: leads }] = await Promise.all([
    sb.from('clients').select('id,name,email').eq('tenant_id', tenantId),
    sb.from('leads').select('id,name,email').eq('tenant_id', tenantId),
  ])
  let inserted = 0
  for (const label of ['INBOX', 'SENT']) {
    const ids = await listIds(token, label, 100)
    if (!ids.length) continue
    const { data: knownRows } = await sb.from('emails').select('gmail_message_id').eq('mailbox_owner', acct.employee_email).in('gmail_message_id', ids)
    const known = new Set((knownRows || []).map((r: any) => r.gmail_message_id))
    for (const id of ids.filter((x: string) => !known.has(x))) {
      try {
        const parsed = await parseMessage(token, id, clients || [], leads || [])
        if (!parsed) continue
        const { error } = await sb.from('emails').insert({ ...parsed.row, tenant_id: tenantId, mailbox_owner: acct.employee_email })
        if (error) { console.error('email insert', id, error); continue }
        inserted++
        const m = parsed.match
        if (m) {
          const direction = parsed.row.triage === 'Sent' ? 'Sent' : 'Received'
          const preview = String(parsed.row.body || '').slice(0, 120).replace(/\n/g, ' ').trim()
          const text = `📧 Email ${direction} — "${parsed.row.subject}"${preview ? `\n${preview}${String(parsed.row.body || '').length > 120 ? '…' : ''}` : ''}`
          if (m.kind === 'client') await sb.from('client_notes').insert({ clientname: m.name, text, note_type: 'Email', author: direction === 'Sent' ? acct.employee_email : m.name, created_at: parsed.row.created_at, tenant_id: tenantId })
          else await sb.from('lead_notes').insert({ lead_id: m.id, lead_name: m.name, text, type: 'Email', author: direction === 'Sent' ? acct.employee_email : m.name, created_at: parsed.row.created_at, tenant_id: tenantId })
        }
      } catch (e) { console.error('message import', id, e) }
    }
  }
  const unreadResult = await reconcileUnread(sb, token, acct.employee_email)
  const now = new Date().toISOString()
  await sb.from('employee_gmail_accounts').update({ gmail_last_sync_at: now, gmail_last_error: null, gmail_backfill_phase: 'done', gmail_backfill_page_token: null }).eq('employee_email', acct.employee_email)
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString()
  await sb.from('emails').delete().lt('created_at', cutoff).eq('mailbox_owner', acct.employee_email)
  return { inserted, unreadChanged: unreadResult.changed }
}

async function handleMessageAction(req: Request, sb: any, payload: any) {
  const authHeader = req.headers.get('authorization') || ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) return json({ ok: false, error: 'Unauthorized' }, 401)
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: userErr } = await userClient.auth.getUser()
  if (userErr || !user?.email) return json({ ok: false, error: 'Unauthorized' }, 401)
  const action = String(payload.action || '')
  if (!ACTIONS.has(action)) return json({ ok: false, error: 'Invalid email action' }, 400)
  const requested = Array.isArray(payload.email_ids) ? payload.email_ids : [payload.email_id]
  const ids = [...new Set(requested.filter(Boolean))].slice(0, 100)
  if (!ids.length) return json({ ok: false, error: 'No emails selected' }, 400)

  const owner = String(user.email).toLowerCase()
  const { data: rows, error: rowErr } = await sb.from('emails')
    .select('id,gmail_message_id,mailbox_owner,tenant_id,is_read,triage,deleted_at')
    .in('id', ids)
  if (rowErr) throw rowErr
  const owned = (rows || []).filter((r: any) => String(r.mailbox_owner || '').toLowerCase() === owner)
  if (owned.length !== ids.length) return json({ ok: false, error: 'One or more emails are not available for this mailbox' }, 403)

  const { data: emp } = await sb.from('employees').select('tenant_id').ilike('email', user.email).limit(1).maybeSingle()
  const tenantId = owned[0]?.tenant_id || emp?.tenant_id
  if (!tenantId) return json({ ok: false, error: 'Employee tenant not found' }, 400)
  if (owned.some((r: any) => r.tenant_id && r.tenant_id !== tenantId)) return json({ ok: false, error: 'Cross-tenant email action blocked' }, 403)

  const { data: acct } = await sb.from('employee_gmail_accounts')
    .select('employee_email,gmail_refresh_token,gmail_access_token,gmail_token_expiry')
    .ilike('employee_email', user.email).limit(1).maybeSingle()
  const gmailRows = owned.filter((r: any) => r.gmail_message_id)
  let token = ''
  if (gmailRows.length) {
    if (!acct?.gmail_refresh_token) return json({ ok: false, error: 'Gmail is not connected for this employee' }, 409)
    const { data: creds } = await sb.from('settings').select('gmail_client_id,gmail_client_secret').eq('tenant_id', tenantId).limit(1).maybeSingle()
    if (!creds?.gmail_client_id || !creds?.gmail_client_secret) return json({ ok: false, error: 'Gmail OAuth settings missing for this office' }, 500)
    token = await validToken(sb, acct, creds)
  }

  const succeeded: any[] = []
  const failures: any[] = []
  for (const row of owned) {
    try {
      if (row.gmail_message_id) {
        const id = encodeURIComponent(row.gmail_message_id)
        let endpoint = `${LIST_URL}/${id}/modify`
        let requestBody: any = null
        if (action === 'archive') requestBody = { removeLabelIds: ['INBOX'] }
        else if (action === 'inbox') requestBody = { addLabelIds: ['INBOX'] }
        else if (action === 'read') requestBody = { removeLabelIds: ['UNREAD'] }
        else if (action === 'unread') requestBody = { addLabelIds: ['UNREAD'] }
        else if (action === 'trash') endpoint = `${LIST_URL}/${id}/trash`
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          ...(requestBody ? { body: JSON.stringify(requestBody) } : {}),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error?.message || `Gmail ${action} failed (${res.status})`)
      }

      const patch: any = action === 'trash' ? { deleted_at: new Date().toISOString(), triage: 'Archive' }
        : action === 'archive' ? { triage: 'Archive' }
        : action === 'inbox' ? { triage: 'Inbox', deleted_at: null }
        : action === 'read' ? { is_read: true }
        : { is_read: false }
      const { error: updateErr } = await sb.from('emails').update(patch).eq('id', row.id).eq('mailbox_owner', row.mailbox_owner)
      if (updateErr) throw updateErr
      succeeded.push(row.id)
    } catch (e) {
      failures.push({ id: row.id, error: String((e as Error).message || e) })
    }
  }
  return json({ ok: failures.length === 0, action, succeeded, failures }, failures.length ? 207 : 200)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  try {
    let payload: any = {}
    const ct = req.headers.get('content-type') || ''
    if (req.method === 'POST' && ct.includes('application/json')) payload = await req.json().catch(() => ({}))
    if (payload?.mode === 'message_action') return await handleMessageAction(req, sb, payload)

    const [{ data: settingsRows }, { data: accounts }] = await Promise.all([
      sb.from('settings').select('tenant_id,gmail_client_id,gmail_client_secret').not('gmail_client_id', 'is', null),
      sb.from('employee_gmail_accounts').select('employee_email,gmail_refresh_token,gmail_access_token,gmail_token_expiry').not('gmail_refresh_token', 'is', null),
    ])
    if (!accounts?.length) return json({ ok: true, synced: 0, failed: 0, inserted: 0, unreadChanged: 0 })
    const tenantCreds = new Map((settingsRows || []).filter((r: any) => r.tenant_id && r.gmail_client_id && r.gmail_client_secret).map((r: any) => [r.tenant_id, r]))
    const employeeEmails = accounts.map((a: any) => a.employee_email)
    const { data: employees } = await sb.from('employees').select('email,tenant_id').in('email', employeeEmails)
    const tenantByEmail = new Map((employees || []).map((e: any) => [String(e.email).toLowerCase(), e.tenant_id]))
    let synced = 0, failed = 0, inserted = 0, unreadChanged = 0
    const errors: any[] = []
    for (const acct of accounts) {
      const tenantId = tenantByEmail.get(String(acct.employee_email).toLowerCase())
      const creds = tenantId ? tenantCreds.get(tenantId) : null
      if (!tenantId || !creds) {
        const msg = !tenantId ? 'Employee tenant not found' : 'Gmail OAuth credentials not configured for employee tenant'
        failed++; errors.push({ employee_email: acct.employee_email, error: msg })
        await sb.from('employee_gmail_accounts').update({ gmail_last_error: msg }).eq('employee_email', acct.employee_email)
        continue
      }
      try {
        const result = await syncAccount(sb, acct, tenantId, creds)
        inserted += result.inserted
        unreadChanged += result.unreadChanged
        synced++
      } catch (e) {
        const msg = String((e as Error).message || e)
        failed++; errors.push({ employee_email: acct.employee_email, error: msg })
        await sb.from('employee_gmail_accounts').update({ gmail_last_error: msg }).eq('employee_email', acct.employee_email)
      }
    }
    return json({ ok: failed === 0, synced, failed, inserted, unreadChanged, errors }, failed === 0 ? 200 : 207)
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message || e) }, 500)
  }
})
