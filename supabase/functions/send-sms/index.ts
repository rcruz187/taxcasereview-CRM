import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get SignalWire credentials from settings
    const { data: settings } = await supabase
      .from('settings')
      .select('sw_space_url, sw_project_id, sw_api_token, sw_inbound_did, sw_outbound_did')
      .limit(1)
      .maybeSingle()

    if (!settings?.sw_space_url) {
      return new Response(JSON.stringify({ error: 'SignalWire not configured' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { to, body, lead_id, client_id, user_id } = await req.json()

    if (!to || !body) {
      return new Response(JSON.stringify({ error: 'to and body are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Always send outbound SMS from toll-free number, never the fax/inbound line
    const fromNumber = settings.sw_outbound_did || settings.sw_inbound_did

    // Send SMS via SignalWire REST API
    const auth = btoa(`${settings.sw_project_id}:${settings.sw_api_token}`)
    const formData = new URLSearchParams({
      From: fromNumber,
      To: to,
      Body: body,
    })

    const swRes = await fetch(
      `https://${settings.sw_space_url}/api/laml/2010-04-01/Accounts/${settings.sw_project_id}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      }
    )

    const swData = await swRes.json()

    if (!swRes.ok) {
      return new Response(JSON.stringify({ error: swData.message || 'SignalWire error' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Log to sms_logs
    await supabase.from('sms_logs').insert({
      direction: 'outbound',
      from_number: fromNumber,
      to_number: to,
      body,
      status: swData.status || 'sent',
      lead_id: lead_id || null,
      client_id: client_id || null,
      user_id: user_id || null,
    })

    return new Response(JSON.stringify({ success: true, sid: swData.sid }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
