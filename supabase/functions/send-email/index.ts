import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SEND_URL  = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'

// Same approach as src/lib/gmailUtils.js, just running server-side in Deno
// instead of the browser — reads the one shared Gmail connection from the
// `settings` table, so it works the same regardless of which staff member
// (current or future) triggers the send.

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { to, subject, html, text } = await req.json()

    if (!to || !subject || (!html && !text)) {
      return new Response(JSON.stringify({ error: 'Missing required fields: to, subject, html/text' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const { data: settings } = await supabase.from('settings').select('*').limit(1).maybeSingle()

    if (!settings?.gmail_refresh_token || !settings?.gmail_client_id || !settings?.gmail_client_secret) {
      return new Response(JSON.stringify({ error: 'Gmail is not connected in Settings yet' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const token = await getValidGmailToken(supabase, settings)

    const fromDisplayName = settings.name || 'Tax Case Review'
    const from = settings.email ? `${encodeHeaderValue(fromDisplayName)} <${settings.email}>` : encodeHeaderValue(fromDisplayName)
    const encodedSubject = encodeHeaderValue(subject)
    const isHtml = !!html
    const sig = settings.email_signature ? `\n\n${settings.email_signature}` : ''
    const finalBody = isHtml ? html : `${text}${sig}`

    const headers = [
      `To: ${to}`,
      `From: ${from}`,
      `Subject: ${encodedSubject}`,
      `Date: ${new Date().toUTCString()}`,
      `Content-Type: ${isHtml ? 'text/html' : 'text/plain'}; charset="UTF-8"`,
      'MIME-Version: 1.0',
    ].join('\r\n')
    const message = `${headers}\r\n\r\n${finalBody}`
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

    return new Response(JSON.stringify({ success: true, id: sendData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('send-email error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Send failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
