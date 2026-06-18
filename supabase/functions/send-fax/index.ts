import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Pure send — no DB writes here. The caller (Fax.jsx) already logs to
// fax_logs itself with richer context (client_name, subject, notes, etc.)
// than this function has access to, so logging here would double it up.
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

    const { to, from, document_url } = await req.json()

    if (!to || !document_url) {
      return new Response(JSON.stringify({ error: 'to and document_url are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Explicit `from` from the caller wins (lets a specific fax go out from
    // a different number than the default); otherwise fall back to the
    // dedicated fax number, then the main inbound DID.
    const fromNumber = from || settings?.firm_fax_number || settings?.sw_inbound_did || ''

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
          from: fromNumber,
          to,
          media_url: document_url,
        }),
      })
      faxResult = await res.json()
      if (!res.ok) {
        return new Response(JSON.stringify({ error: faxResult.errors?.[0]?.detail || 'Telnyx fax error' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ success: true, sid: faxResult.data?.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } else if (settings?.sw_space_url) {
      const auth = btoa(`${settings.sw_project_id}:${settings.sw_api_token}`)
      const formData = new URLSearchParams({
        From: fromNumber,
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
      if (!res.ok) {
        return new Response(JSON.stringify({ error: faxResult.message || 'SignalWire fax error' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ success: true, sid: faxResult.sid }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } else {
      return new Response(JSON.stringify({ error: 'No fax provider configured (Telnyx or SignalWire)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
