// gmail-sync-cron
// Single shared Gmail sync job — runs on a schedule (Supabase Cron), once,
// no matter how many employees are logged into the CRM. Replaces the old
// approach of every browser tab independently polling every 30 seconds,
// which meant N employees logged in = N redundant copies of the same sync
// work, all hitting Supabase with the same queries at the same time. This
// is a straight port of the logic that used to live in
// src/context/GmailSyncContext.jsx (tick / runBackfillStep /
// runSteadyStateStep / maybeRunRetentionCleanup) — same behavior, one
// execution instead of one-per-tab.
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

async function getValidGmailToken(supabase: any, settings: any) {
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
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description || data.error || 'Token refresh failed')
  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString()
  await supabase.from('settings').update({ gmail_access_token: data.access_token, gmail_token_expiry: expiresAt }).eq('id', settings.id)
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

async function getAndParseGmailMessage(token: string, id: string, clients: any[]) {
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
  const attachments = findAttachments(msg.payload)

  return {
    recipient: isSent ? counterpartAddress : extractAddress(fromHeader),
    clientName: matchedClient?.name || counterpartName || counterpartAddress,
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

async function importIds(supabase: any, token: string, ids: string[], clients: any[], tenantId: string) {
  for (const id of ids) {
    try {
      const parsed = await getAndParseGmailMessage(token, id, clients)
      if (parsed) {
        const { error: insertError } = await supabase.from('emails').insert([{ ...parsed, tenant_id: tenantId }])
        if (insertError) console.error('Gmail emails insert error for', id, insertError)
        if (parsed.clientName && parsed.clientName !== parsed.recipient) {
          const direction = parsed.triage === 'Sent' ? 'Sent' : 'Received'
          const preview = (parsed.body || '').slice(0, 120).replace(/\n/g, ' ').trim()
          const noteContent = `📧 Email ${direction} — "${parsed.subject}"${preview ? `\n${preview}${parsed.body?.length > 120 ? '…' : ''}` : ''}`
          const { error: noteError } = await supabase.from('client_notes').insert({
            client_name: parsed.clientName, content: noteContent, note_type: 'Email',
            created_by: direction === 'Sent' ? 'Tax Case Review' : parsed.clientName,
            created_at: parsed.created_at || new Date().toISOString(),
            tenant_id: tenantId,
          })
          if (noteError) console.error('Gmail client_notes insert error for', id, noteError)
        }
      }
    } catch (e) {
      console.error('Gmail import error for', id, e)
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  let settingsId: number | null = null

  try {
    const { data: settings } = await supabase.from('settings')
      .select('id, tenant_id, gmail_refresh_token, gmail_client_id, gmail_client_secret, gmail_access_token, gmail_token_expiry, gmail_backfill_phase, gmail_backfill_page_token, gmail_last_sync_at, gmail_last_cleanup_at')
      .limit(1).maybeSingle()

    if (!settings?.gmail_refresh_token) {
      return new Response(JSON.stringify({ ok: true, skipped: 'Gmail not connected' }), { status: 200, headers: corsHeaders })
    }
    settingsId = settings.id

    const token = await getValidGmailToken(supabase, settings)
    const { data: clients } = await supabase.from('clients').select('id,name,email')

    const phase = settings.gmail_backfill_phase || 'inbox'
    if (phase !== 'done') {
      const label = phase === 'inbox' ? 'INBOX' : 'SENT'
      const { ids, nextPageToken } = await listGmailMessages(token, {
        labelIds: label,
        query: `after:${monthsAgoGmailDate(BACKFILL_MONTHS)}`,
        pageToken: settings.gmail_backfill_page_token || undefined,
        maxResults: 25,
      })
      const newIds = await filterUnknownIds(supabase, ids)
      await importIds(supabase, token, newIds, clients || [], settings.tenant_id)

      if (nextPageToken) {
        await supabase.from('settings').update({ gmail_backfill_page_token: nextPageToken, gmail_last_sync_at: new Date().toISOString(), gmail_last_error: null }).eq('id', settings.id)
      } else if (phase === 'inbox') {
        await supabase.from('settings').update({ gmail_backfill_phase: 'sent', gmail_backfill_page_token: null, gmail_last_sync_at: new Date().toISOString(), gmail_last_error: null }).eq('id', settings.id)
      } else {
        await supabase.from('settings').update({ gmail_backfill_phase: 'done', gmail_backfill_page_token: null, gmail_last_sync_at: new Date().toISOString(), gmail_last_error: null }).eq('id', settings.id)
      }
    } else {
      for (const label of ['INBOX', 'SENT']) {
        const { ids } = await listGmailMessages(token, { labelIds: label, maxResults: 20 })
        const newIds = await filterUnknownIds(supabase, ids)
        await importIds(supabase, token, newIds.slice(0, 15), clients || [], settings.tenant_id)
      }
      await supabase.from('settings').update({ gmail_last_sync_at: new Date().toISOString(), gmail_last_error: null }).eq('id', settings.id)

      const last = settings.gmail_last_cleanup_at ? new Date(settings.gmail_last_cleanup_at).getTime() : 0
      if (Date.now() - last >= 24 * 60 * 60 * 1000) {
        const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
        await supabase.from('emails').delete().lt('created_at', cutoff)
        await supabase.from('settings').update({ gmail_last_cleanup_at: new Date().toISOString() }).eq('id', settings.id)
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders })
  } catch (e) {
    console.error('gmail-sync-cron error:', e)
    if (settingsId != null) {
      await supabase.from('settings').update({ gmail_last_error: String((e as Error).message || e) }).eq('id', settingsId)
    }
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders })
  }
})
