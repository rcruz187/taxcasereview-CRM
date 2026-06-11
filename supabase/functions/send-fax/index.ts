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

    const { data: settings } = await supabase
      .from('settings')
      .select('sw_space_url, sw_project_id, sw_api_token, sw_inbound_did, telnyx_api_key, firm_fax_number')
      .limit(1)
      .maybeSingle()

    const { to, document_url, lead_id, client_id, user_id, notes } = await req.json()

    if (!to || !document_url) {
      return new Response(JSON.stringify({ error: 'to and document_url are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let faxResult: any = null

    // Prefer Telnyx if configured, else SignalWire
    if (settings?.telnyx_api_key) {
      const res = await fetch('https://api.telnyx.com/v2/faxes', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.telnyx_api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          connection_id: Deno.env.get('TELNYX_CONNECTION_ID') || '',
          from: settings.firm_fax_number || '',
          to,
          media_url: document_url,
        }),
      })
      faxResult = await res.json()
      if (!res.ok) throw new Error(faxResult.errors?.[0]?.detail || 'Telnyx fax error')
    } else if (settings?.sw_space_url) {
      const auth = btoa(`${settings.sw_project_id}:${settings.sw_api_token}`)
      const formData = new URLSearchParams({
        From: settings.sw_inbound_did || '',
        To: to,
        MediaUrl: document_url,
      })
      const res = await fetch(
        `https://${settings.sw_space_url}/api/laml/2010-04-01/Accounts/${settings.sw_project_id}/Faxes.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString(),
        }
      )
      faxResult = await res.json()
      if (!res.ok) throw new Error(faxResult.message || 'SignalWire fax error')
    } else {
      return new Response(JSON.stringify({ error: 'No fax provider configured (Telnyx or SignalWire)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Log to fax_logs
    await supabase.from('fax_logs').insert({
      direction: 'outbound',
      from_number: settings?.firm_fax_number || settings?.sw_inbound_did || '',
      to_number: to,
      fax_url: document_url,
      status: 'sent',
      notes: notes || null,
      lead_id: lead_id || null,
      client_id: client_id || null,
      user_id: user_id || null,
    })

    return new Response(JSON.stringify({ success: true, result: faxResult }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
