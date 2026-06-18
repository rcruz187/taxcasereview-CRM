// ─── Gmail OAuth + Send utilities ────────────────────────────────────────────
// Uses Google's token endpoint directly from the browser (no backend needed).
// Tokens are stored in the `settings` table.

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SEND_URL  = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'
const LIST_URL  = 'https://gmail.googleapis.com/gmail/v1/users/me/messages'

export function getRedirectUri() {
  return window.location.origin + '/taxcasereview-CRM/auth/callback'
}

// Exchange an authorization code for access + refresh tokens, store in settings.
export async function exchangeCodeForTokens(supabase, code) {
  const { data: settings } = await supabase.from('settings').select('*').limit(1).maybeSingle()
  if (!settings?.gmail_client_id || !settings?.gmail_client_secret) {
    throw new Error('Gmail Client ID/Secret not configured in Settings')
  }

  const body = new URLSearchParams({
    code,
    client_id: settings.gmail_client_id,
    client_secret: settings.gmail_client_secret,
    redirect_uri: getRedirectUri(),
    grant_type: 'authorization_code',
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description || data.error || 'Token exchange failed')

  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString()
  const payload = {
    gmail_access_token: data.access_token,
    gmail_token_expiry: expiresAt,
  }
  // refresh_token is only returned on first consent — don't overwrite with null on re-auth
  if (data.refresh_token) payload.gmail_refresh_token = data.refresh_token

  await supabase.from('settings').update(payload).eq('id', settings.id)
  return data
}

// Returns a valid access token, refreshing it first if expired.
export async function getValidGmailToken(supabase) {
  const { data: settings } = await supabase.from('settings').select('*').limit(1).maybeSingle()
  if (!settings?.gmail_refresh_token) throw new Error('Gmail not connected')

  const expiry = settings.gmail_token_expiry ? new Date(settings.gmail_token_expiry).getTime() : 0
  if (settings.gmail_access_token && expiry > Date.now() + 60000) {
    return settings.gmail_access_token
  }

  // Refresh
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
  if (!res.ok) throw new Error(data.error_description || data.error || 'Token refresh failed')

  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString()
  await supabase.from('settings').update({
    gmail_access_token: data.access_token,
    gmail_token_expiry: expiresAt,
  }).eq('id', settings.id)

  return data.access_token
}

function base64UrlEncode(str) {
  // Encode a UTF-8 string to base64url (Gmail API requirement)
  const utf8 = new TextEncoder().encode(str)
  let binary = ''
  utf8.forEach(b => { binary += String.fromCharCode(b) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Email headers (Subject, the display-name part of From) are supposed to be
// plain ASCII. Putting raw UTF-8 characters like an em dash (—) directly in
// a header is non-conformant, and different mail systems handle that
// inconsistently — some show mojibake ("Ã¢Â€Â"" instead of "—"), and it can
// even cause a message to bounce. RFC 2047 encoded-word syntax sidesteps
// this entirely by explicitly declaring the charset, so only encode when
// the string actually contains non-ASCII characters.
function encodeHeaderValue(str) {
  if (!str || /^[\x00-\x7F]*$/.test(str)) return str
  const utf8 = new TextEncoder().encode(str)
  let binary = ''
  utf8.forEach(b => { binary += String.fromCharCode(b) })
  return `=?UTF-8?B?${btoa(binary)}?=`
}

// Sends an email via the Gmail API. Returns the Gmail message id.
// attachments (optional): [{ filename, mimeType, base64Data }] — base64Data
// is the standard (non-url) base64 encoding of the raw file bytes.
export async function sendGmailEmail(supabase, { to, subject, body, fromName, attachments = [] }) {
  const token = await getValidGmailToken(supabase)

  const { data: settings } = await supabase.from('settings').select('email,name,email_signature').limit(1).maybeSingle()
  const fromDisplayName = fromName || settings?.name || 'Tax Case Review'
  // A bare display name with no email address is malformed per the email
  // spec, and can get a message silently spam-filtered even when Gmail's
  // API reports success. Use a proper "Name <email>" format when we have
  // a real address on file; Gmail will still send as the authenticated
  // account either way, but a well-formed header improves deliverability.
  const from = settings?.email ? `${encodeHeaderValue(fromDisplayName)} <${settings.email}>` : encodeHeaderValue(fromDisplayName)
  const encodedSubject = encodeHeaderValue(subject)
  const finalBody = settings?.email_signature ? `${body}\n\n${settings.email_signature}` : body

  let message
  if (attachments.length === 0) {
    const headers = [
      `To: ${to}`,
      `From: ${from}`,
      `Subject: ${encodedSubject}`,
      `Date: ${new Date().toUTCString()}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'MIME-Version: 1.0',
    ].join('\r\n')
    message = `${headers}\r\n\r\n${finalBody}`
  } else {
    const boundary = `====tcr_${Date.now()}====`
    const parts = [
      [
        `--${boundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: 7bit',
        '',
        finalBody,
      ].join('\r\n'),
      ...attachments.map(att => [
        `--${boundary}`,
        `Content-Type: ${att.mimeType}; name="${att.filename}"`,
        `Content-Disposition: attachment; filename="${att.filename}"`,
        'Content-Transfer-Encoding: base64',
        '',
        // wrap at 76 chars — conventional, and some mail servers expect it
        att.base64Data.replace(/(.{76})/g, '$1\r\n'),
      ].join('\r\n')),
      `--${boundary}--`,
    ]
    const headers = [
      `To: ${to}`,
      `From: ${from}`,
      `Subject: ${encodedSubject}`,
      `Date: ${new Date().toUTCString()}`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      'MIME-Version: 1.0',
    ].join('\r\n')
    message = `${headers}\r\n\r\n${parts.join('\r\n')}`
  }

  const raw = base64UrlEncode(message)

  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Failed to send email')
  return data.id
}

// ─── Gmail Sync utilities ─────────────────────────────────────────────────
// Pulls real Inbox + Sent mail into the `emails` table so the CRM actually
// mirrors Gmail instead of only logging what's composed inside the CRM.

function base64UrlDecodeToString(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder('utf-8').decode(bytes)
}

function headerValue(headers, name) {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ''
}

// Pulls a single email address out of a "Name <email@x.com>" style header.
function extractAddress(headerVal) {
  const m = headerVal.match(/<([^>]+)>/)
  return (m ? m[1] : headerVal).trim()
}
function extractDisplayName(headerVal) {
  const m = headerVal.match(/^"?([^"<]*)"?\s*<[^>]+>$/)
  return m && m[1].trim() ? m[1].trim() : extractAddress(headerVal)
}

// Recursively finds a text/plain (preferred) or text/html part anywhere in
// a Gmail message payload, which can be nested arbitrarily for multipart
// messages (alternative/mixed/related all nest differently).
function findBodyPart(payload, mimeType) {
  if (!payload) return null
  if (payload.mimeType === mimeType && payload.body?.data) return payload.body.data
  for (const part of payload.parts || []) {
    const found = findBodyPart(part, mimeType)
    if (found) return found
  }
  return null
}
function stripHtml(html) {
  return html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

// List message ids matching a label (and optional date-bounded query for
// backfill, e.g. "after:2025/06/18"), paginating with pageToken.
// Returns { ids, nextPageToken }.
export async function listGmailMessages(supabase, { labelIds, query, pageToken, maxResults = 25 } = {}) {
  const token = await getValidGmailToken(supabase)
  const params = new URLSearchParams({ maxResults: String(maxResults) })
  if (labelIds) params.set('labelIds', labelIds)
  if (query) params.set('q', query)
  if (pageToken) params.set('pageToken', pageToken)
  const res = await fetch(`${LIST_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Gmail list failed')
  return { ids: (data.messages || []).map(m => m.id), nextPageToken: data.nextPageToken || null }
}

// Fetches one message and parses it into the shape the `emails` table uses.
// Returns null for label types we don't care about (drafts, spam, trash).
export async function getAndParseGmailMessage(supabase, id, clients = []) {
  const token = await getValidGmailToken(supabase)
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const msg = await res.json()
  if (!res.ok) throw new Error(msg.error?.message || 'Gmail get failed')

  const labels = msg.labelIds || []
  const isSent = labels.includes('SENT')
  const isInbox = labels.includes('INBOX')
  if (!isSent && !isInbox) return null // draft / spam / trash / promo-only, skip

  const headers = msg.payload?.headers || []
  const fromHeader = headerValue(headers, 'From')
  const toHeader = headerValue(headers, 'To')
  const subject = headerValue(headers, 'Subject') || '(no subject)'
  const dateHeader = headerValue(headers, 'Date')
  const receivedAt = dateHeader ? new Date(dateHeader).toISOString() : new Date(Number(msg.internalDate || Date.now())).toISOString()

  const plainData = findBodyPart(msg.payload, 'text/plain')
  const htmlData = plainData ? null : findBodyPart(msg.payload, 'text/html')
  let body = msg.snippet || ''
  if (plainData) body = base64UrlDecodeToString(plainData)
  else if (htmlData) body = stripHtml(base64UrlDecodeToString(htmlData))

  const counterpartHeader = isSent ? toHeader : fromHeader
  const counterpartAddress = extractAddress(counterpartHeader)
  const counterpartName = extractDisplayName(counterpartHeader)
  const matchedClient = clients.find(c => c.email && c.email.toLowerCase() === counterpartAddress.toLowerCase())

  return {
    recipient: isSent ? counterpartAddress : extractAddress(fromHeader),
    clientName: matchedClient?.name || counterpartName || counterpartAddress,
    subject,
    body,
    triage: isSent ? 'Sent' : 'Inbox',
    status: isSent ? 'Sent' : 'Received',
    gmail_message_id: msg.id,
    gmail_thread_id: msg.threadId,
    from_address: extractAddress(fromHeader),
    received_at: receivedAt,
    created_at: receivedAt,
  }
}

