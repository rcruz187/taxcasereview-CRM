import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Called BY the logged-in CRM (Dialer page) to get a short-lived RELAY JWT
// so the browser can connect to SignalWire directly and place/receive real
// calls. The real Project ID + API Token never leave this server-side
// function. JWT verification stays ON here (default) since only logged-in
// CRM users should ever be able to mint one of these.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RELAY_RESOURCE = 'office' // shared line name — all staff dial in/out as "office" for now

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const { data: settings, error: sErr } = await supabase.from('settings')
      .select('sw_space_url,sw_project_id,sw_api_token,sw_inbound_did')
      .limit(1).maybeSingle()

    if (sErr || !settings?.sw_space_url || !settings?.sw_project_id || !settings?.sw_api_token) {
      return new Response(JSON.stringify({ error: 'SignalWire credentials are not fully set up in Settings yet.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const auth = 'Basic ' + btoa(`${settings.sw_project_id}:${settings.sw_api_token}`)
    const resp = await fetch(`https://${settings.sw_space_url}/api/relay/rest/jwt`, {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource: RELAY_RESOURCE, expires_in: 480 }) // 480 min = 8 hours, a full workday
    })

    if (!resp.ok) {
      const text = await resp.text()
      return new Response(JSON.stringify({ error: 'SignalWire rejected the JWT request: ' + text }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { jwt_token } = await resp.json()

    return new Response(JSON.stringify({
      jwt_token,
      project_id: settings.sw_project_id,
      caller_number: settings.sw_inbound_did || null,
      resource: RELAY_RESOURCE,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('signalwire-relay-token error:', err)
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
