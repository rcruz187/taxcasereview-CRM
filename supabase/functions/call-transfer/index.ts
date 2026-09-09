import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const CALL_RECORDED_URL = `${SUPABASE_URL}/functions/v1/call-recorded`
const CALLER_HANGUP_URL = `${SUPABASE_URL}/functions/v1/caller-hangup`
const HOLD_MUSIC_URL = `${SUPABASE_URL}/functions/v1/hold-music`
const SELF_URL = `${SUPABASE_URL}/functions/v1/call-transfer`

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
function xml(body: string, status = 200) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    status, headers: { 'Content-Type': 'text/xml' },
  })
}
function serviceDb() { return createClient(SUPABASE_URL, SERVICE_KEY) }

async function hmac(input: string) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const raw = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(input)))
  return Array.from(raw).map(b => b.toString(16).padStart(2, '0')).join('')
}
function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function browserIdentity(req: Request) {
  const auth = req.headers.get('authorization') || ''
  if (!auth.toLowerCase().startsWith('bearer ')) return null
  const token = auth.slice(7).trim()
  const client = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data: { user }, error } = await client.auth.getUser(token)
  if (error || !user?.email) return null
  const db = serviceDb()
  const { data: employee } = await db.from('employees')
    .select('tenant_id,status,email')
    .ilike('email', user.email)
    .limit(1)
    .maybeSingle()
  if (!employee?.tenant_id || String(employee.status || 'Active').toLowerCase() !== 'active') return null
  const { data: isPlatformAdmin } = await client.rpc('_is_platform_admin')
  return { user, tenantId: employee.tenant_id as string, isPlatformAdmin: isPlatformAdmin === true }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const url = new URL(req.url)

  // SignalWire callback mode. Supabase verify_jwt must stay OFF because the provider
  // does not send a Supabase user token. The callback is instead authenticated with
  // a short HMAC embedded by the already-authenticated browser request.
  if (url.searchParams.get('laml') === '1') {
    try {
      const mode = url.searchParams.get('mode') || ''
      const tenantId = url.searchParams.get('tenant') || ''
      const target = mode === 'ext' ? (url.searchParams.get('ext') || '') : (url.searchParams.get('num') || '')
      const sig = url.searchParams.get('sig') || ''
      const body = await req.text()
      const form = new URLSearchParams(body)
      const callSid = form.get('CallSid') || ''
      const from = form.get('From') || ''

      if (!callSid || !tenantId || !['ext', 'num'].includes(mode)) {
        return xml('<Say>We are sorry, this transfer is no longer available. Goodbye.</Say><Hangup/>', 400)
      }
      const expected = await hmac(`${callSid}|${tenantId}|${mode}|${target}`)
      if (!safeEqual(sig, expected)) {
        console.warn('call-transfer: rejected unauthenticated LaML callback')
        return xml('<Say>We are sorry, this transfer is no longer available. Goodbye.</Say><Hangup/>', 403)
      }

      const db = serviceDb()
      const { data: settings } = await db.from('settings')
        .select('sw_inbound_did').eq('tenant_id', tenantId).limit(1).maybeSingle()

      if (mode === 'num') {
        if (!/^\+1\d{10}$/.test(target)) return xml('<Say>We are sorry, this transfer is no longer available. Goodbye.</Say><Hangup/>')
        const callerId = tenantId === 'a0000000-0000-0000-0000-000000000001' ? (Deno.env.get('ROMYLABS_PHONE_NUMBER') || '') : (settings?.sw_inbound_did || '')
        return xml(
          '<Say voice="Polly.Joanna-Neural">Please hold while we transfer your call.</Say>' +
          `<Dial timeout="30"${callerId ? ` callerId="${callerId}"` : ''}>${target}</Dial>` +
          '<Say voice="Polly.Joanna-Neural">The party you are trying to reach is unavailable. Please call back later. Goodbye.</Say><Hangup/>'
        )
      }

      if (!/^\d{1,6}$/.test(target)) return xml('<Say>We are sorry, this transfer is no longer available. Goodbye.</Say><Hangup/>')
      const { data: emp } = await db.from('employees')
        .select('name').eq('tenant_id', tenantId).eq('extension', target).limit(1)
      if (!emp?.length) return xml('<Say>The requested extension is unavailable. Goodbye.</Say><Hangup/>')
      const empName = emp[0]?.name || ''
      const confName = `xfer-${target}-${callSid}`.replace(/[^A-Za-z0-9_-]/g, '')

      const { error: insErr } = await db.from('incoming_calls').insert({
        callsid: callSid,
        conference_name: confName,
        from_number: from,
        department: `Extension ${target}${empName ? ' — ' + empName : ''}`,
        status: 'ringing',
        tenant_id: tenantId,
      })
      if (insErr) {
        console.error('call-transfer: incoming_calls insert error', insErr)
        return xml('<Say>We are sorry, this transfer could not be completed. Goodbye.</Say><Hangup/>')
      }

      return xml(
        '<Say voice="Polly.Joanna-Neural">Please hold while we transfer your call.</Say>' +
        `<Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false" waitUrl="${HOLD_MUSIC_URL}" waitMethod="GET" ` +
        `statusCallback="${CALLER_HANGUP_URL}?conf=${encodeURIComponent(confName)}" statusCallbackEvent="leave end" statusCallbackMethod="POST" ` +
        `record="record-from-start" recordingStatusCallback="${CALL_RECORDED_URL}">${confName}</Conference></Dial>`
      )
    } catch (err) {
      console.error('call-transfer laml error:', err)
      return xml('<Say>We are sorry, an error occurred. Goodbye.</Say><Hangup/>')
    }
  }

  // Browser control mode: authenticate the employee explicitly because verify_jwt
  // is disabled at the gateway for the mixed browser/provider endpoint.
  try {
    const identity = await browserIdentity(req)
    if (!identity) return json({ error: 'Unauthorized' }, 401)

    const { callsid, target_type, extension, number, phoneContext } = await req.json()
    if (!callsid || !target_type) return json({ error: 'callsid and target_type required' }, 400)

    const db = serviceDb()
    const isRomyLabs = phoneContext === 'romylabs' && identity.isPlatformAdmin === true
    const effectiveTenantId = isRomyLabs ? 'a0000000-0000-0000-0000-000000000001' : identity.tenantId
    let { data: settings, error: sErr } = await db.from('settings')
      .select('sw_space_url,sw_project_id,sw_api_token')
      .eq('tenant_id', effectiveTenantId).limit(1).maybeSingle()
    if (isRomyLabs && (!settings?.sw_space_url || !settings?.sw_project_id || !settings?.sw_api_token)) {
      const fallback = await db.from('settings')
        .select('sw_space_url,sw_project_id,sw_api_token')
        .not('sw_api_token','is',null).not('sw_space_url','is',null).limit(1).maybeSingle()
      if (fallback.data) settings = fallback.data
      if (!sErr) sErr = fallback.error
    }
    if (sErr || !settings?.sw_space_url || !settings?.sw_project_id || !settings?.sw_api_token) {
      return json({ error: 'SignalWire credentials missing in Settings' }, 400)
    }

    let mode = ''
    let target = ''
    if (target_type === 'extension') {
      target = String(extension || '').replace(/\D/g, '')
      if (!target) return json({ error: 'Pick a teammate to transfer to.' }, 400)
      const { data: emp } = await db.from('employees')
        .select('id').eq('tenant_id', effectiveTenantId).eq('extension', target).limit(1)
      if (!emp?.length) return json({ error: `No employee has extension ${target}.` }, 404)
      mode = 'ext'
    } else if (target_type === 'external') {
      const digits = String(number || '').replace(/\D/g, '')
      if (digits.length === 10) target = '+1' + digits
      else if (digits.length === 11 && digits.startsWith('1')) target = '+' + digits
      else return json({ error: 'Enter a valid 10-digit US phone number.' }, 400)
      mode = 'num'
    } else return json({ error: 'target_type must be extension or external' }, 400)

    const sig = await hmac(`${callsid}|${effectiveTenantId}|${mode}|${target}`)
    const params = new URLSearchParams({ laml: '1', mode, tenant: effectiveTenantId, sig })
    if (mode === 'ext') params.set('ext', target); else params.set('num', target)
    const lamlUrl = `${SELF_URL}?${params.toString()}`

    const spaceDomain = settings.sw_space_url.replace(/^https?:\/\//, '')
    const auth = 'Basic ' + btoa(`${settings.sw_project_id}:${settings.sw_api_token}`)
    const resp = await fetch(`https://${spaceDomain}/api/laml/2010-04-01/Accounts/${settings.sw_project_id}/Calls/${callsid}.json`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ Url: lamlUrl, Method: 'POST' }),
    })
    const text = await resp.text()
    if (!resp.ok) {
      console.error('call-transfer: SignalWire rejected redirect', resp.status, text)
      return json({ error: 'Could not transfer: the call may have already ended.' }, 502)
    }

    await db.from('incoming_calls').update({ status: 'completed' })
      .eq('tenant_id', effectiveTenantId).eq('callsid', callsid).eq('status', 'answered')
    return json({ ok: true })
  } catch (err) {
    console.error('call-transfer error:', err)
    return json({ error: 'Transfer failed' }, 500)
  }
})
