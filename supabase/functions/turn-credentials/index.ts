// turn-credentials
// Returns ICE servers for WebRTC. Authenticated active staff may receive tenant/platform
// Metered short-lived TURN credentials. Anonymous screen-share guests receive only public
// TURN/STUN. This function also mints secure SignalWire large-training room tokens so we
// can reuse the existing RTC function slot instead of adding another Edge Function.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FREE_TURN = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
]

const OWNER_EMAILS = new Set(['info@romylabs.com','romy@romylabs.com','romy@taxrescrm.net','romy@taxcasereview.org'])
const encoder = new TextEncoder()
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

async function getMeteredCredentials(appName: string, apiKey: string) {
  const res = await fetch(`https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`)
  if (!res.ok) return null
  return await res.json()
}

function b64url(bytes: Uint8Array) {
  let s = ''
  bytes.forEach(b => { s += String.fromCharCode(b) })
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
function fromB64url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
  const raw = atob(normalized)
  return new Uint8Array([...raw].map(ch => ch.charCodeAt(0)))
}
async function hmac(data: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data)))
}
async function signInvite(payload: Record<string, unknown>, secret: string) {
  const body = b64url(encoder.encode(JSON.stringify(payload)))
  return `${body}.${b64url(await hmac(body, secret))}`
}
async function verifyInvite(token: string, secret: string) {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = await hmac(body, secret)
  const actual = fromB64url(sig)
  if (expected.length !== actual.length) return null
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i]
  if (diff !== 0) return null
  const payload = JSON.parse(new TextDecoder().decode(fromB64url(body)))
  if (!payload?.room || !payload?.exp || Number(payload.exp) < Date.now()) return null
  return payload as { room: string; exp: number }
}
function sanitizeRoom(value: string) { return value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) }

async function loadSignalWire(admin: any) {
  const { data, error } = await admin.from('settings')
    .select('sw_space_url,sw_project_id,sw_api_token')
    .not('sw_api_token', 'is', null)
    .not('sw_space_url', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error || !data?.sw_space_url || !data?.sw_project_id || !data?.sw_api_token) throw new Error('SignalWire credentials are not configured')
  return data
}

async function createVideoToken(settings: any, body: Record<string, unknown>) {
  const auth = 'Basic ' + btoa(`${settings.sw_project_id}:${settings.sw_api_token}`)
  const resp = await fetch(`https://${settings.sw_space_url}/api/video/room_tokens`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await resp.text()
  if (!resp.ok) throw new Error(`SignalWire video token failed (${resp.status}): ${text}`)
  const parsed = JSON.parse(text)
  if (!parsed?.token) throw new Error('SignalWire returned no room token')
  return parsed.token as string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
    const authHeader = req.headers.get('Authorization') || ''

    let body: any = null
    if (req.method === 'POST') body = await req.json().catch(() => null)
    const action = String(body?.action || '')

    if (action === 'training-create') {
      if (!authHeader.startsWith('Bearer ')) return json({ error: 'Platform owner authorization required' }, 403)
      const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } })
      const { data: { user }, error } = await authClient.auth.getUser()
      if (error || !user?.email || !OWNER_EMAILS.has(user.email.toLowerCase())) return json({ error: 'Platform owner authorization required' }, 403)
      const requested = sanitizeRoom(String(body?.room || ''))
      if (!requested) return json({ error: 'Invalid room' }, 400)
      const room = `romylabs_training_${requested}`
      const hostName = String(body?.name || 'RomyLabs Host').slice(0, 100)
      const exp = Date.now() + 12 * 60 * 60 * 1000
      const invite = await signInvite({ room, exp }, serviceKey)
      const sw = await loadSignalWire(admin)
      const hostToken = await createVideoToken(sw, {
        room_name: room,
        room_display_name: 'RomyLabs Live Training',
        user_name: hostName,
        join_as: 'member',
        auto_create_room: true,
        join_audio_muted: false,
        join_video_muted: false,
        permissions: [
          'room.self.audio_mute','room.self.audio_unmute','room.self.video_mute','room.self.video_unmute',
          'room.self.deaf','room.self.undeaf','room.self.screenshare','room.self.additional_source',
          'room.member.audio_mute','room.member.video_mute','room.member.promote','room.member.demote',
          'room.recording','room.set_layout','room.set_position','room.set_meta','room.list_available_layouts'
        ],
        meta: { role: 'host', platform: 'RomyLabs' },
      })
      return json({ room, host_token: hostToken, invite, expires_at: new Date(exp).toISOString() })
    }

    if (action === 'training-join') {
      const verified = await verifyInvite(String(body?.invite || ''), serviceKey)
      if (!verified) return json({ error: 'This training invite is invalid or expired' }, 403)
      const name = String(body?.name || '').trim().slice(0, 100)
      if (!name) return json({ error: 'Name is required' }, 400)
      const sw = await loadSignalWire(admin)
      const attendeeToken = await createVideoToken(sw, {
        room_name: verified.room,
        user_name: name,
        join_as: 'audience',
        auto_create_room: false,
        media_allowed: 'all',
        meta: { role: 'attendee', platform: 'RomyLabs' },
      })
      return json({ room: verified.room, token: attendeeToken, role: 'audience' })
    }

    // Existing TURN credential behavior remains unchanged for all ordinary calls.
    if (!authHeader.startsWith('Bearer ')) return json(FREE_TURN)
    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } })
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user?.email) return json(FREE_TURN)

    const { data: emp } = await admin.from('employees').select('tenant_id,status').ilike('email', user.email).maybeSingle()
    const tenantId = emp?.tenant_id || null
    if (!tenantId || String(emp?.status || '').toLowerCase() !== 'active') return json(FREE_TURN)

    const { data: tenantSettings } = await admin.from('settings').select('metered_app_name,metered_api_key').eq('tenant_id', tenantId).maybeSingle()
    if (tenantSettings?.metered_app_name && tenantSettings?.metered_api_key) {
      const creds = await getMeteredCredentials(tenantSettings.metered_app_name, tenantSettings.metered_api_key)
      if (creds) return json(creds)
    }

    const { data: platformSettings } = await admin.from('settings').select('metered_app_name,metered_api_key').not('metered_app_name', 'is', null).not('metered_api_key', 'is', null).limit(1).maybeSingle()
    if (platformSettings?.metered_app_name && platformSettings?.metered_api_key) {
      const creds = await getMeteredCredentials(platformSettings.metered_app_name, platformSettings.metered_api_key)
      if (creds) return json(creds)
    }
    return json(FREE_TURN)
  } catch (err) {
    console.error('turn-credentials error:', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
