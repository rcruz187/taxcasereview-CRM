// conference-ended
// Called BY SignalWire when an outbound-call conference closes (wired up
// as the statusCallback on outbound-leg's <Conference> noun, event="end").
// This is the server-confirmed signal that CallContext.jsx polls
// outbound_calls for as a backup to the browser RELAY SDK's own
// call.state hangup/destroy notification -- which has proven unreliable
// for detecting when a call really ended (confirmed case: agent hung up
// on their own end and the CRM kept showing "connected" indefinitely).
// Two independent ways to notice "the call is over" instead of trusting
// the flaky one alone.
//
// Deploy via: Supabase Dashboard -> Edge Functions -> Deploy new function
// (paste this file in as index.ts), name it "conference-ended". JWT
// verification must be OFF -- SignalWire calls this directly.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// SignalWire webhook authentication — HMAC-SHA1 per SW Compatibility API docs
// Algorithm: HMAC-SHA1(signing_key, url + sorted_params_concatenated), base64 encoded
// Header: x-signalwire-signature
async function validateSWSignature(
  signingKey: string,
  url: string,
  params: Record<string, string>,
  signature: string
): Promise<boolean> {
  if (!signingKey || !signature) return false
  const sortedKeys = Object.keys(params).sort()
  let s = url
  for (const k of sortedKeys) s += k + (params[k] ?? '')
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(signingKey),
    { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const raw = await crypto.subtle.sign('HMAC', key, enc.encode(s))
  const expected = btoa(String.fromCharCode(...new Uint8Array(raw)))
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}


serve(async (req) => {
  try {
    // ── SignalWire webhook authentication ──────────────────────────────────────
    const rawBody = await req.text()
    const swSignature = req.headers.get('x-signalwire-signature') ?? ''
    const swSecret = Deno.env.get('SW_SIGNING_SECRET') ?? ''
    if (!swSecret) {
      console.error('[conference-ended] SW_SIGNING_SECRET not configured')
      return new Response('Service unavailable', { status: 503 })
    }
    const webhookUrl = 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/conference-ended'
    const paramMap: Record<string,string> = {}
    for (const [k,v] of new URLSearchParams(rawBody)) { paramMap[k] = v }
    const sigValid = await validateSWSignature(swSecret, webhookUrl, paramMap, swSignature)
    if (!sigValid) {
      console.warn('[conference-ended] Invalid SignalWire signature — rejected')
      return new Response('Unauthorized', { status: 403 })
    }
    // ── End authentication ─────────────────────────────────────────────────────
    const form = new URLSearchParams(rawBody)
    if (!rawBody) return new Response('Bad Request', { status: 400 })
    const sid = form.get('ConferenceSid') || form.get('FriendlyName')
    if (!sid) {
      console.warn('conference-ended: missing ConferenceSid — rejected')
      return new Response('Bad Request', { status: 400 })
    }
    const conferenceName = form?.get('FriendlyName')?.toString()
    if (!conferenceName) return new Response('ok')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    await supabase.from('outbound_calls')
      .update({ status: 'completed' })
      .eq('conference_name', conferenceName)

    return new Response('ok')
  } catch (err) {
    console.error('conference-ended error:', err)
    return new Response('ok')
  }
})
