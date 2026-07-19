// gmail-sync-cron
// Runs on a schedule (Supabase Cron), once, no matter how many employees
// are logged into the CRM — but now loops through EVERY employee's own
// connected Gmail account and syncs each one separately (previously this
// synced one single shared firm account, and every employee saw the exact
// same inbox regardless of who they were — a real data-exposure bug, not
// just a UX quirk). Each employee's backfill progress, sync status, and
// tokens now live in `employee_gmail_accounts`, one row per employee.
//
// JWT Verification must be OFF — Supabase Cron calls this with no user
// auth token.
//
// Schedule this to run every 1 minute via Database → Cron Jobs.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const LIST_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages'
const RETENTION_DAYS = 365
const BACKFILL_MONTHS = 12

function monthsAgoGmailDate(months: number) {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

function base64UrlDecodeToString(b64url: string) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder('utf-8').decode(bytes)
}
function headerValue(headers: any[], name: string) {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || ''
}
function extractAddress(headerVal: string) {
  const m = headerVal.match(/<([^>]+)>/)
  return (m ? m[1] : headerVal).trim()
}
function extractDisplayName(headerVal: string) {
  const m = headerVal.match(/^"?([^"<]*)"?\s*<[^>]+>$/)
  return m && m[1].trim() ? m[1].trim() : extractAddress(headerVal)
}
function findBodyPart(payload: any, mimeType: string): string | null {
  if (!payload) return null
  if (payload.mimeType === mimeType && payload.body?.data) return payload.body.data
  for (const part of payload.parts || []) {
    const found = findBodyPart(part, mimeType)
    if (found) return found
  }
  return null
}
function stripHtml(html: string) {
  const noStyle = html.replace(new RegExp('<style[^]*?<' + '/style>', 'gi'), '')
  return noStyle.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}
function findAttachments(payload: any, out: any[] = []) {
  if (!payload) return out
  if (payload.filename && payload.body?.attachmentId) {
    out.push({
      filename: payload.filename,
      mimeType: payload.mimeType || 'application/octet-stream',
      size: payload.body.size || 0,
      attachmentId: payload.body.attachmentId,
    })
  }
  for (const part of payload.parts || []) findAttachments(part, out)
  return out
}

// Refreshes THIS employee's own access token, using the shared app
// credentials (client_id/secret — the app's identity, not a personal
// secret) but this account's own refresh token.
async function getValidGmailToken(supabase: any, acct: any, appCreds: any) {
  const expiry = acct.gmail_token_expiry ? new Date(acct.gmail_token_expiry).getTime() : 0
  if (acct.gmail_access_token && expiry > Date.now() + 60000) {
    return acct.gmail_access_token
  }
  const body = new URLSearchParams({
    refresh_token: acct.gmail_refresh_token,
    client_id: appCreds.gmail_client_id,
    client_secret: appCreds.gmail_client_secret,
    grant_type: 'refresh_token',
  })
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description || data.error || 'Token refresh failed')
  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString()
  await supabase.from('employee_gmail_accounts').update({ gmail_access_token: data.access_token, gmail_token_expiry: expiresAt }).eq('employee_email', acct.employee_email)
  return data.access_token
}

async function listGmailMessages(token: string, { labelIds, query, pageToken, maxResults = 25 }: any) {
  const params = new URLSearchParams({ maxResults: String(maxResults) })
  if (labelIds) params.set('labelIds', labelIds)
  if (query) params.set('q', query)
  if (pageToken) params.set('pageToken', pageToken)
  const res = await fetch(`${LIST_URL}?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Gmail list failed')
  return { ids: (data.messages || []).map((m: any) => m.id), nextPageToken: data.nextPageToken || null }
}

async function getAndParseGmailMessage(token: string, id: string, clients: any[], leads: any[]) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers: { Authorization: `Bearer ${token}` } })
  const msg = await res.json()
  if (!res.ok) throw new Error(msg.error?.message || 'Gmail get failed')

  const labels = msg.labelIds || []
  const isSent = labels.includes('SENT')
  const isInbox = labels.includes('INBOX')
  if (!isSent && !isInbox) return null

  const headers = msg.payload?.headers || []
  const fromHeader = headerValue(headers, 'From')
  const toHeader = headerValue(headers, 'To')
  const subject = headerValue(headers, 'Subject') || '(no subject)'
  const dateHeader = headerValue(headers, 'Date')
  const receivedAt = dateHeader ? new Date(dateHeader).toISOString() : new Date(Number(msg.internalDate || Date.now())).toISOString()

  const plainData = findBodyPart(msg.payload, 'text/plain')
  const htmlData = findBodyPart(msg.payload, 'text/html')
  let body = msg.snippet || ''
  if (plainData) body = base64UrlDecodeToString(plainData)
  else if (htmlData) body = stripHtml(base64UrlDecodeToString(htmlData))
  const bodyHtmlRaw = htmlData ? base64UrlDecodeToString(htmlData) : null

  const counterpartHeader = isSent ? toHeader : fromHeader
  const counterpartAddress = extractAddress(counterpartHeader)
  const counterpartName = extractDisplayName(counterpartHeader)
  const matchedClient = clients.find((c) => c.email && c.email.toLowerCase() === counterpartAddress.toLowerCase())
  const matchedLead = matchedClient ? null : leads.find((l) => l.email && l.email.toLowerCase() === counterpartAddress.toLowerCase())
  const attachments = findAttachments(msg.payload)

  return {
    matched_kind: matchedClient ? 'client' : matchedLead ? 'lead' : null,
    matched_lead_id: matchedLead?.id ?? null,
    matched_name: matchedClient?.name || matchedLead?.name || null,
    recipient: isSent ? counterpartAddress : extractAddress(fromHeader),
    clientName: matchedClient?.name || matchedLead?.name || counterpartName || counterpartAddress,
    subject, body, body_html: bodyHtmlRaw,
    triage: isSent ? 'Sent' : 'Inbox',
    status: isSent ? 'Sent' : 'Received',
    gmail_message_id: msg.id,
    gmail_thread_id: msg.threadId,
    from_address: extractAddress(fromHeader),
    received_at: receivedAt, created_at: receivedAt,
    is_read: isSent,
    attachments,
  }
}

async function filterUnknownIds(supabase: any, ids: string[]) {
  if (!ids.length) return []
  const { data } = await supabase.from('emails').select('gmail_message_id').in('gmail_message_id', ids)
  const known = new Set((data || []).map((r: any) => r.gmail_message_id))
  return ids.filter((id) => !known.has(id))
}

async function importIds(supabase: any, token: string, ids: string[], clients: any[], leads: any[], tenantId: string, mailboxOwner: string) {
  for (const id of ids) {
    try {
      const parsed = await getAndParseGmailMessage(token, id, clients, leads)
      if (parsed) {
        const { matched_kind, matched_lead_id, matched_name, ...emailRow } = parsed
        const { error: insertError } = await supabase.from('emails').insert([{ ...emailRow, tenant_id: tenantId, mailbox_owner: mailboxOwner }])
        if (insertError) console.error('Gmail emails insert error for', id, insertError)
        // Note ONLY when the email row actually inserted — writing notes for
        // failed inserts breaks gmail_message_id dedup and re-notes every
        // sweep (the duplicate factory found on the Romy Cruz test client).
        if (!insertError && matched_kind && matched_name) {
          const direction = parsed.triage === 'Sent' ? 'Sent' : 'Received'
          const preview = (parsed.body || '').slice(0, 120).replace(/\n/g, ' ').trim()
          const noteContent = `📧 Email ${direction} — "${parsed.subject}"${preview ? `\n${preview}${parsed.body?.length > 120 ? '…' : ''}` : ''}`
          if (matched_kind === 'client') {
            const { error: noteError } = await supabase.from('client_notes').insert({
              clientname: matched_name, text: noteContent, note_type: 'Email',
              author: direction === 'Sent' ? mailboxOwner : matched_name,
              created_at: parsed.created_at || new Date().toISOString(),
              tenant_id: tenantId,
            })
            if (noteError) console.error('Gmail client_notes insert error for', id, noteError)
          } else {
            const { error: noteError } = await supabase.from('lead_notes').insert({
              lead_id: matched_lead_id, lead_name: matched_name, text: noteContent, type: 'Email',
              author: direction === 'Sent' ? mailboxOwner : matched_name,
              created_at: parsed.created_at || new Date().toISOString(),
              tenant_id: tenantId,
            })
            if (noteError) console.error('Gmail lead_notes insert error for', id, noteError)
          }
        }
      }
    } catch (e) {
      console.error('Gmail import error for', id, e)
    }
  }
}

// Runs the full sync (backfill-or-steady-state, plus retention cleanup)
// for ONE employee's connected mailbox. Isolated in its own try/catch so
// one broken/revoked connection can't stop everyone else's sync from
// running in the same pass.
async function syncOneAccount(supabase: any, acct: any, appCreds: any, tenantId: string, clients: any[], leads: any[]) {
  try {
    const token = await getValidGmailToken(supabase, acct, appCreds)

    const phase = acct.gmail_backfill_phase || 'inbox'
    if (phase !== 'done') {
      const label = phase === 'inbox' ? 'INBOX' : 'SENT'
      const { ids, nextPageToken } = await listGmailMessages(token, {
        labelIds: label,
        query: `after:${monthsAgoGmailDate(BACKFILL_MONTHS)}`,
        pageToken: acct.gmail_backfill_page_token || undefined,
        maxResults: 25,
      })
      const newIds = await filterUnknownIds(supabase, ids)
      await importIds(supabase, token, newIds, clients, leads, tenantId, acct.employee_email)

      if (nextPageToken) {
        await supabase.from('employee_gmail_accounts').update({ gmail_backfill_page_token: nextPageToken, gmail_last_sync_at: new Date().toISOString(), gmail_last_error: null }).eq('employee_email', acct.employee_email)
      } else if (phase === 'inbox') {
        await supabase.from('employee_gmail_accounts').update({ gmail_backfill_phase: 'sent', gmail_backfill_page_token: null, gmail_last_sync_at: new Date().toISOString(), gmail_last_error: null }).eq('employee_email', acct.employee_email)
      } else {
        await supabase.from('employee_gmail_accounts').update({ gmail_backfill_phase: 'done', gmail_backfill_page_token: null, gmail_last_sync_at: new Date().toISOString(), gmail_last_error: null }).eq('employee_email', acct.employee_email)
      }
    } else {
      for (const label of ['INBOX', 'SENT']) {
        const { ids } = await listGmailMessages(token, { labelIds: label, maxResults: 20 })
        const newIds = await filterUnknownIds(supabase, ids)
        await importIds(supabase, token, newIds.slice(0, 15), clients, leads, tenantId, acct.employee_email)
      }
      await supabase.from('employee_gmail_accounts').update({ gmail_last_sync_at: new Date().toISOString(), gmail_last_error: null }).eq('employee_email', acct.employee_email)

      const last = acct.gmail_last_cleanup_at ? new Date(acct.gmail_last_cleanup_at).getTime() : 0
      if (Date.now() - last >= 24 * 60 * 60 * 1000) {
        const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
        await supabase.from('emails').delete().lt('created_at', cutoff).eq('mailbox_owner', acct.employee_email)
        await supabase.from('employee_gmail_accounts').update({ gmail_last_cleanup_at: new Date().toISOString() }).eq('employee_email', acct.employee_email)
      }
    }
  } catch (e) {
    console.error('gmail-sync-cron error for', acct.employee_email, e)
    await supabase.from('employee_gmail_accounts').update({ gmail_last_error: String((e as Error).message || e) }).eq('employee_email', acct.employee_email)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const { data: settings } = await supabase.from('settings')
      .select('tenant_id, gmail_client_id, gmail_client_secret').limit(1).maybeSingle()

    if (!settings?.gmail_client_id || !settings?.gmail_client_secret) {
      return new Response(JSON.stringify({ ok: true, skipped: 'Gmail app credentials not configured' }), { status: 200, headers: corsHeaders })
    }

    const { data: accounts } = await supabase.from('employee_gmail_accounts')
      .select('employee_email, gmail_refresh_token, gmail_access_token, gmail_token_expiry, gmail_backfill_phase, gmail_backfill_page_token, gmail_last_cleanup_at')
      .not('gmail_refresh_token', 'is', null)

    if (!accounts || accounts.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: 'No employees have connected Gmail yet' }), { status: 200, headers: corsHeaders })
    }

    const { data: clients } = await supabase.from('clients').select('id,name,email')
    const { data: leads } = await supabase.from('leads').select('id,name,email')

    // Sequential, not parallel — these all share the same Gmail API rate
    // limits, and running N employees' syncs at once would just make all
    // of them more likely to hit rate-limit errors together.
    for (const acct of accounts) {
      await syncOneAccount(supabase, acct, settings, settings.tenant_id, clients || [], leads || [])
    }

    return new Response(JSON.stringify({ ok: true, synced: accounts.length }), { status: 200, headers: corsHeaders })
  } catch (e) {
    console.error('gmail-sync-cron error:', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders })
  }
})
