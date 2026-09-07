import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

// Verify Slack request signature to prevent spoofing
async function verifySlack(req: Request, body: string, signingSecret: string): Promise<boolean> {
  const ts = req.headers.get('X-Slack-Request-Timestamp') || ''
  const sig = req.headers.get('X-Slack-Signature') || ''
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false // replay protection
  const baseStr = `v0:${ts}:${body}`
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(baseStr))
  const hex = 'v0=' + Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('')
  return hex === sig
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const body = await req.text()
  const payload = JSON.parse(body)

  // Slack URL verification challenge (one-time, when first configuring the webhook)
  if (payload.type === 'url_verification') {
    return new Response(JSON.stringify({ challenge: payload.challenge }), { headers: cors })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Find the tenant by matching the team_id (Slack workspace ID)
  // We store team_id in slack_channel_map as a top-level key for lookup
  // Actually look up by checking all tenants' slack_signing_secret to verify
  const { data: settings } = await supabase.from('settings')
    .select('tenant_id, slack_bot_token, slack_signing_secret, slack_channel_map, slack_sync_enabled')
    .not('slack_bot_token', 'is', null)

  let matched: any = null
  for (const s of settings || []) {
    if (s.slack_signing_secret && await verifySlack(new Request(req.url, { headers: req.headers }), body, s.slack_signing_secret)) {
      matched = s
      break
    }
  }

  if (!matched) return new Response('unauthorized', { status: 401 })
  if (!matched.slack_sync_enabled) return new Response('sync disabled', { status: 200 })

  const event = payload.event
  if (!event || event.type !== 'message' || event.subtype) {
    return new Response('ok', { headers: cors })
  }

  // Map Slack channel ID to CRM channel name
  const channelMap = matched.slack_channel_map || {}
  const crmChannel = channelMap[event.channel]
  if (!crmChannel) return new Response('channel not mapped', { status: 200 })

  // Get sender display name from Slack user ID
  let senderName = event.user || 'Slack'
  try {
    const userRes = await fetch(`https://slack.com/api/users.info?user=${event.user}`, {
      headers: { Authorization: `Bearer ${matched.slack_bot_token}` }
    })
    const userData = await userRes.json()
    if (userData.ok) senderName = userData.user?.real_name || userData.user?.name || senderName
  } catch (_) {}

  // Insert into chat_messages — skip if already imported
  await supabase.from('chat_messages').upsert({
    tenant_id:   matched.tenant_id,
    channel:     crmChannel,
    sender:      `[Slack] ${senderName}`,
    text:        event.text || '',
    source:      'slack',
    external_id: event.ts,
    created_at:  new Date(Number(event.ts) * 1000).toISOString(),
  }, { onConflict: 'tenant_id,external_id', ignoreDuplicates: true })

  return new Response('ok', { headers: cors })
})
