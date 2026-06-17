// ─── Gmail OAuth + Send utilities ────────────────────────────────────────────
// Uses Google's token endpoint directly from the browser (no backend needed).
// Tokens are stored in the `settings` table.

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SEND_URL  = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'

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

// Sends an email via the Gmail API. Returns the Gmail message id.
// attachments (optional): [{ filename, mimeType, base64Data }] — base64Data
// is the standard (non-url) base64 encoding of the raw file bytes.
export async function sendGmailEmail(supabase, { to, subject, body, fromName, attachments = [] }) {
  const token = await getValidGmailToken(supabase)

  const { data: settings } = await supabase.from('settings').select('email,name').limit(1).maybeSingle()
  const from = fromName || settings?.name || 'Tax Case Review'

  let message
  if (attachments.length === 0) {
    const headers = [
      `To: ${to}`,
      `From: ${from}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'MIME-Version: 1.0',
    ].join('\r\n')
    message = `${headers}\r\n\r\n${body}`
  } else {
    const boundary = `====tcr_${Date.now()}====`
    const parts = [
      [
        `--${boundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: 7bit',
        '',
        body,
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
      `Subject: ${subject}`,
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
