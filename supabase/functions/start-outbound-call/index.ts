import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-certification',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) return json({ error: 'Server configuration missing' }, 500)
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.toLowerCase().startsWith('bearer ')) return json({ error: 'Unauthorized' }, 401)
    const token = authHeader.slice(7).trim()
    const authClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } })
    const { data: { user }, error: userErr } = await authClient.auth.getUser(token)
    if (userErr || !user?.email) return json({ error: 'Unauthorized' }, 401)

    const { data: tenantId, error: tenantErr } = await authClient.rpc('current_tenant_id')
    if (tenantErr || !tenantId) return json({ error: 'No active office context' }, 403)

    const { destinationNumber, qa_certification, dry_run } = await req.json()
    const digits = String(destinationNumber || '').replace(/\D/g, '')
    const e164 = digits.length === 10 ? `+1${digits}` : (digits.length === 11 && digits.startsWith('1') ? `+${digits}` : '')
    if (!e164) return json({ error: 'Enter a valid 10-digit US phone number.' }, 400)

    const db = createClient(SUPABASE_URL, SERVICE_KEY)
    const { data: employee } = await db.from('employees')
      .select('tenant_id,name,extension,status,perm_comms')
      .eq('tenant_id', tenantId)
      .ilike('email', user.email)
      .limit(1)
      .maybeSingle()
    const { data: isPlatformAdmin } = await authClient.rpc('_is_platform_admin')
    const active = employee && String(employee.status || 'Active').toLowerCase() === 'active'
    if (!isPlatformAdmin && (!active || Number(employee?.perm_comms || 0) < 2)) return json({ error: 'Phone permission denied' }, 403)

    const { data: settings, error: sErr } = await db.from('settings')
      .select('sw_space_url,sw_project_id,sw_api_token,sw_inbound_did,sw_outbound_did,tenant_id')
      .eq('tenant_id', tenantId).limit(1).maybeSingle()
    if (sErr || !settings?.sw_space_url || !settings?.sw_project_id || !settings?.sw_api_token || (!settings?.sw_outbound_did && !settings?.sw_inbound_did)) {
      return json({ error: 'SignalWire credentials or caller ID missing for this office.' }, 422)
    }

    const fromDigits = String(settings.sw_outbound_did || settings.sw_inbound_did || '').replace(/\D/g, '')
    const fromNumber = fromDigits.length === 10 ? `+1${fromDigits}` : (fromDigits.length === 11 && fromDigits.startsWith('1') ? `+${fromDigits}` : '')
    if (!fromNumber) return json({ error: 'Configured outbound caller ID is invalid.' }, 422)

    // Real production authorization/provider validation, but guaranteed no call,
    // no outbound_calls insert and no SignalWire request.
    if (qa_certification === true && dry_run === true) {
      return json({ success: true, dry_run: true, delivery: false, provider: 'signalwire', tenant_id: tenantId })
    }

    const conferenceName = `outbound-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
    const { error: insErr } = await db.from('outbound_calls').insert({
      conference_name: conferenceName,
      destination_number: e164,
      status: 'pending',
      tenant_id: tenantId,
      agent_name: employee?.name || user.email,
      agent_extension: employee?.extension || null,
    })
    if (insErr) return json({ error: insErr.message }, 500)

    const spaceDomain = String(settings.sw_space_url).replace(/^https?:\/\//, '')
    const providerAuth = 'Basic ' + btoa(`${settings.sw_project_id}:${settings.sw_api_token}`)
    const outboundLegUrl = `${SUPABASE_URL}/functions/v1/outbound-leg?conf=${encodeURIComponent(conferenceName)}&tenant=${encodeURIComponent(tenantId)}`
    const statusCallbackUrl = `${SUPABASE_URL}/functions/v1/outbound-call-status?conf=${encodeURIComponent(conferenceName)}&tenant=${encodeURIComponent(tenantId)}`

    const resp = await fetch(`https://${spaceDomain}/api/laml/2010-04-01/Accounts/${settings.sw_project_id}/Calls.json`, {
      method: 'POST',
      headers: { Authorization: providerAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        To: e164,
        From: fromNumber,
        Url: outboundLegUrl,
        Method: 'POST',
        StatusCallback: statusCallbackUrl,
        StatusCallbackEvent: 'initiated ringing answered completed',
        StatusCallbackMethod: 'POST',
      }),
    })

    const text = await resp.text()
    if (!resp.ok) {
      await db.from('outbound_calls').update({ status: 'failed' }).eq('tenant_id', tenantId).eq('conference_name', conferenceName)
      let providerMessage = ''
      try {
        const parsed = JSON.parse(text)
        providerMessage = parsed?.message || parsed?.error || parsed?.errors?.[0]?.detail || ''
      } catch {}
      console.error('start-outbound-call: SignalWire rejected call', resp.status, providerMessage || text)
      return json({ error: providerMessage ? `SignalWire rejected the call: ${providerMessage}` : `SignalWire rejected the call (HTTP ${resp.status}).`, provider_status: resp.status }, 502)
    }

    let clientCallsid = null
    try { clientCallsid = JSON.parse(text)?.sid || null } catch {}
    return json({ ok: true, conferenceName, clientCallsid })
  } catch (err) {
    console.error('start-outbound-call error:', err)
    return json({ error: 'Unable to start call.' }, 500)
  }
})
