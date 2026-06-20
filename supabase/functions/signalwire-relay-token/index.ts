import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Called BY the logged-in CRM (Dialer page) to get a short-lived RELAY JWT
// so the browser can connect to SignalWire directly and place/receive real
// calls. The real Project ID + API Token never leave this server-side
// function. JWT verification stays ON here (default) since only logged-in
// CRM users should ever be able to mint one of these.
//
// Each agent gets their OWN resource name (office-<slug of their email>)
// rather than everyone sharing the literal 'office' string. With only
// Romy using the system this didn't matter, but it's unconfirmed/risky
// behavior for what happens when a second browser registers under the
// exact same RELAY resource at the same time -- rather than gamble on
// that with real staff on the phones, each agent now gets an isolated
// registration so simultaneous logins can't possibly interfere with each
// other's RELAY connection.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function resourceNameFor(email) {
  const slug = (email || 'unknown').split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase()
  return `office-${slug || 'unknown'}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Identify the calling agent from their own auth token (not a body
    // param) so the resource name can't be spoofed by passing someone
    // else's email.
    let agentEmail = null
    if (authHeader) {
      const { data: userData } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
      agentEmail = userData?.user?.email || null
    }
    const relayResource = resourceNameFor(agentEmail)

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
      body: JSON.stringify({ resource: relayResource, expires_in: 480 }) // 480 min = 8 hours, a full workday
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
      resource: relayResource,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('signalwire-relay-token error:', err)
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
