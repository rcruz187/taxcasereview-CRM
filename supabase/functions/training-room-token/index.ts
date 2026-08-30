import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const OWNER_EMAILS = new Set(['info@romylabs.com','romy@romylabs.com','romy@taxrescrm.net','romy@taxcasereview.org'])
const encoder = new TextEncoder()

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
  const sig = b64url(await hmac(body, secret))
  return `${body}.${sig}`
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

function sanitizeRoom(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)
}

async function loadSignalWire(supabase: any) {
  const { data, error } = await supabase.from('settings')
    .select('sw_space_url,sw_project_id,sw_api_token')
    .not('sw_api_token', 'is', null)
    .not('sw_space_url', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error || !data?.sw_space_url || !data?.sw_project_id || !data?.sw_api_token) {
    throw new Error('SignalWire credentials are not configured')
  }
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
  const json = JSON.parse(text)
  if (!json?.token) throw new Error('SignalWire returned no room token')
  return json.token as string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })

  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)
    const input = await req.json().catch(() => ({}))
    const action = String(input?.action || '')
    const settings = await loadSignalWire(admin)

    if (action === 'create') {
      const authHeader = req.headers.get('Authorization') || ''
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
      const { data: { user }, error } = await userClient.auth.getUser()
      if (error || !user?.email || !OWNER_EMAILS.has(user.email.toLowerCase())) {
        return new Response(JSON.stringify({ error: 'Platform owner authorization required' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } })
      }

      const requested = sanitizeRoom(String(input?.room || ''))
      if (!requested) return new Response(JSON.stringify({ error: 'Invalid room' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
      const room = `romylabs_training_${requested}`
      const hostName = String(input?.name || 'RomyLabs Host').slice(0, 100)
      const exp = Date.now() + 12 * 60 * 60 * 1000
      const invite = await signInvite({ room, exp }, serviceKey)

      const hostToken = await createVideoToken(settings, {
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

      return new Response(JSON.stringify({ room, host_token: hostToken, invite, expires_at: new Date(exp).toISOString() }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    if (action === 'join') {
      const invite = String(input?.invite || '')
      const verified = await verifyInvite(invite, serviceKey)
      if (!verified) return new Response(JSON.stringify({ error: 'This training invite is invalid or expired' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } })
      const name = String(input?.name || '').trim().slice(0, 100)
      if (!name) return new Response(JSON.stringify({ error: 'Name is required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })

      const attendeeToken = await createVideoToken(settings, {
        room_name: verified.room,
        user_name: name,
        join_as: 'audience',
        auto_create_room: false,
        media_allowed: 'all',
        meta: { role: 'attendee', platform: 'RomyLabs' },
      })
      return new Response(JSON.stringify({ room: verified.room, token: attendeeToken, role: 'audience' }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('training-room-token:', err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
