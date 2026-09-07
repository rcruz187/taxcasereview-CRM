import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { tenant_id, channel_map, messages } = await req.json()
    // messages: array of Slack export message objects from the JSON export
    // channel_map: { "slack-channel-name": "crm-channel-name" }
    if (!tenant_id || !messages?.length) {
      return new Response(JSON.stringify({ error: 'tenant_id and messages required' }), { status: 400, headers: cors })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    let inserted = 0, skipped = 0

    for (const msg of messages) {
      // Skip system messages, bot messages, file shares without text
      if (!msg.text || msg.subtype === 'bot_message' || msg.subtype === 'channel_join') {
        skipped++; continue
      }

      const crmChannel = (channel_map && msg._channel && channel_map[msg._channel])
        || msg._channel || 'general'

      // Convert Slack user display name (pre-processed by importer) or use user_profile
      const sender = msg.user_profile?.display_name || msg.user_profile?.real_name
        || msg.username || msg.user || 'Slack User'

      // Convert Slack ts (Unix timestamp with microseconds) to ISO
      const ts = msg.ts ? new Date(parseFloat(msg.ts) * 1000).toISOString() : new Date().toISOString()

      // Convert Slack mentions/formatting to plain text
      const text = (msg.text || '')
        .replace(/<@[A-Z0-9]+>/g, '@user')
        .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1')
        .replace(/<([^|>]+)\|([^>]+)>/g, '$2')
        .replace(/<([^>]+)>/g, '$1')

      const { error } = await supabase.from('chat_messages').upsert({
        tenant_id,
        channel:     crmChannel,
        sender:      `[Slack] ${sender}`,
        text,
        source:      'slack',
        external_id: msg.ts,
        created_at:  ts,
      }, { onConflict: 'tenant_id,external_id', ignoreDuplicates: true })

      if (error) skipped++
      else inserted++
    }

    return new Response(JSON.stringify({ inserted, skipped, total: messages.length }), { headers: cors })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors })
  }
})
