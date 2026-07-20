import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Called BY the logged-in CRM (Dialer page) to get a short-lived RELAY JWT
// so the browser can connect to SignalWire directly and place/receive real
// calls. The real Project ID + API Token never leave this server-side
// function. JWT verification stays ON here (default) since only logged-in
// CRM users should ever be able to mint one of these.
//
// Each agent now gets their OWN RELAY resource name, derived server-side
// from their employees.extension (never trusted from the browser — looked
// up here using the caller's own verified session). This replaces the old
// shared "office" resource, which made every agent's self-dial calls
// indistinguishable from each other -- the root cause of the multi-agent
// call-collision risk. Anyone without an extension assigned yet falls back
// to the old shared "office" resource so nobody is broken mid-migration.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FALLBACK_RESOURCE = 'office' // used only if the logged-in user has no extension assigned yet

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Identify the calling agent from their own verified session -- never
    // from anything the browser passes in the request body, since that
    // could be spoofed. This is the same JWT the CRM already sent to pass
    // this function's own verify_jwt check, just decoded here so we know
    // who specifically it belongs to.
    let resource = FALLBACK_RESOURCE
    let agentExtension = null
    let agentTenantId = null
    const authHeader = req.headers.get('Authorization')
    if (authHeader) {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      )
      const { data: { user }, error: userErr } = await userClient.auth.getUser()
      if (userErr) console.error('signalwire-relay-token: could not resolve calling user:', userErr.message)
      if (user?.email) {
        const { data: emp, error: empErr } = await supabase
          .from('employees').select('extension,tenant_id').eq('email', user.email).maybeSingle()
        if (empErr) console.error('signalwire-relay-token: employee lookup error:', empErr.message)
        if (emp?.tenant_id) agentTenantId = emp.tenant_id
        if (emp?.extension) {
          agentExtension = emp.extension
          resource = `agent-${emp.extension}`
        } else {
          console.log('signalwire-relay-token: no extension on file for', user.email, '- using fallback shared resource')
        }
      }
    } else {
      console.error('signalwire-relay-token: no Authorization header on request - using fallback shared resource')
    }

    // Load THIS agent's tenant's SignalWire creds. Falls back to the single
    // settings row when the agent has no tenant yet or only one exists —
    // single-tenant behaves identically.
    let settings = null, sErr = null
    if (agentTenantId) {
      const r = await supabase.from('settings')
        .select('sw_space_url,sw_project_id,sw_api_token,sw_inbound_did,tenant_id')
        .eq('tenant_id', agentTenantId).limit(1).maybeSingle()
      settings = r.data || null; sErr = r.error
    }
    if (!settings) {
      const r = await supabase.from('settings')
        .select('sw_space_url,sw_project_id,sw_api_token,sw_inbound_did,tenant_id')
        .limit(1).maybeSingle()
      settings = r.data || null; if (!sErr) sErr = r.error
    }

    if (sErr || !settings?.sw_space_url || !settings?.sw_project_id || !settings?.sw_api_token) {
      return new Response(JSON.stringify({ error: 'SignalWire credentials are not fully set up in Settings yet.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const auth = 'Basic ' + btoa(`${settings.sw_project_id}:${settings.sw_api_token}`)
    const resp = await fetch(`https://${settings.sw_space_url}/api/relay/rest/jwt`, {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource, expires_in: 480 }) // 480 min = 8 hours, a full workday
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
      resource,
      agent_extension: agentExtension,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('signalwire-relay-token error:', err)
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
