import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { tenant_id, channel, sender, text } = await req.json()
    if (!tenant_id || !channel || !text) {
      return new Response(JSON.stringify({ error: 'missing params' }), { status: 400, headers: cors })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: settings } = await supabase.from('settings')
      .select('slack_bot_token, slack_channel_map, slack_sync_enabled')
      .eq('tenant_id', tenant_id).single()

    if (!settings?.slack_bot_token || !settings?.slack_sync_enabled) {
      return new Response(JSON.stringify({ ok: false, reason: 'slack not configured' }), { headers: cors })
    }

    // Find the Slack channel ID for this CRM channel name
    const channelMap = settings.slack_channel_map || {}
    const slackChannelId = Object.entries(channelMap).find(([, v]) => v === channel)?.[0]
    if (!slackChannelId) {
      return new Response(JSON.stringify({ ok: false, reason: 'channel not mapped' }), { headers: cors })
    }

    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.slack_bot_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: slackChannelId,
        text: `*${sender}* (CRM): ${text}`,
      })
    })

    const result = await res.json()
    return new Response(JSON.stringify({ ok: result.ok, error: result.error }), { headers: cors })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors })
  }
})
