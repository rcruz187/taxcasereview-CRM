import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.toLowerCase().startsWith('bearer ')) return json({ error: 'Unauthorized' }, 401)
    const token = authHeader.slice(7).trim()
    const authClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } })
    const { data: { user }, error: userErr } = await authClient.auth.getUser(token)
    if (userErr || !user?.email) return json({ error: 'Unauthorized' }, 401)

    const { callsid, phoneContext } = await req.json()
    if (!callsid) return json({ error: 'callsid required' }, 400)

    const db = createClient(SUPABASE_URL, SERVICE_KEY)
    const { data: isPlatformAdmin } = await authClient.rpc('_is_platform_admin')
    const isRomyLabs = phoneContext === 'romylabs' && isPlatformAdmin === true
    const { data: employee } = await db.from('employees')
      .select('tenant_id,status').ilike('email', user.email).limit(1).maybeSingle()
    const tenantId = isRomyLabs ? 'a0000000-0000-0000-0000-000000000001' : employee?.tenant_id
    if (!tenantId || (!isRomyLabs && String(employee?.status || 'Active').toLowerCase() !== 'active')) return json({ error: 'Unauthorized' }, 403)

    const { data: claimed, error: claimErr } = await db.from('incoming_calls')
      .update({ status: 'missed' })
      .eq('tenant_id', tenantId)
      .eq('callsid', callsid)
      .eq('status', 'ringing')
      .select('callsid')
    if (claimErr) return json({ error: 'Unable to claim ringing call.' }, 500)
    if (!claimed?.length) return json({ ok: true, skipped: true })

    const { data: settings, error: sErr } = await db.from('settings')
      .select('sw_space_url,sw_project_id,sw_api_token')
      .eq('tenant_id', tenantId).limit(1).maybeSingle()
    if (sErr || !settings?.sw_space_url || !settings?.sw_project_id || !settings?.sw_api_token) {
      // Put the row back so another attempt can safely handle it once config is corrected.
      await db.from('incoming_calls').update({ status: 'ringing' })
        .eq('tenant_id', tenantId).eq('callsid', callsid).eq('status', 'missed')
      return json({ error: 'SignalWire credentials missing for this office.' }, 400)
    }

    const spaceDomain = settings.sw_space_url.replace(/^https?:\/\//, '')
    const providerAuth = 'Basic ' + btoa(`${settings.sw_project_id}:${settings.sw_api_token}`)
    const resp = await fetch(`https://${spaceDomain}/api/laml/2010-04-01/Accounts/${settings.sw_project_id}/Calls/${callsid}.json`, {
      method: 'POST',
      headers: { Authorization: providerAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ Url: `${SUPABASE_URL}/functions/v1/${isRomyLabs ? 'romylabs-voicemail-prompt' : 'voicemail-prompt'}`, Method: 'POST' }),
    })
    const text = await resp.text()
    if (!resp.ok) {
      await db.from('incoming_calls').update({ status: 'ringing' })
        .eq('tenant_id', tenantId).eq('callsid', callsid).eq('status', 'missed')
      console.error('redirect-to-voicemail: provider rejected redirect', resp.status, text)
      return json({ error: 'Could not redirect the call to voicemail.' }, 502)
    }

    return json({ ok: true })
  } catch (err) {
    console.error('redirect-to-voicemail error:', err)
    return json({ error: 'Unable to redirect call to voicemail.' }, 500)
  }
})
