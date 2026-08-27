import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

async function validateSWSignature(signingKey: string, url: string, params: Record<string, string>, signature: string): Promise<boolean> {
  if (!signingKey || !signature) return false
  const sortedKeys = Object.keys(params).sort()
  let s = url
  for (const k of sortedKeys) s += k + (params[k] ?? '')
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(signingKey), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const raw = await crypto.subtle.sign('HMAC', key, enc.encode(s))
  const expected = btoa(String.fromCharCode(...new Uint8Array(raw)))
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}

serve(async (req) => {
  try {
    const url = new URL(req.url)
    const confFromQuery = url.searchParams.get('conf')
    const body = await req.text()
    const params = new URLSearchParams(body)

    const swSignature = req.headers.get('x-signalwire-signature') ?? ''
    const swSecret = Deno.env.get('SW_SIGNING_SECRET') ?? ''
    if (!swSecret) {
      console.error('[caller-hangup] SW_SIGNING_SECRET not configured')
      return new Response('Service unavailable', { status: 503 })
    }

    const paramMap: Record<string,string> = {}
    for (const [k,v] of params) paramMap[k] = v
    // SignalWire signs the EXACT callback URL, including ?conf=. The old
    // code dropped the query string, so every real conference callback
    // failed HMAC verification and the CRM never learned the caller left.
    const sigValid = await validateSWSignature(swSecret, req.url, paramMap, swSignature)
    if (!sigValid) {
      console.warn('[caller-hangup] Invalid SignalWire signature — rejected', req.url)
      return new Response('Unauthorized', { status: 403 })
    }

    const event = params.get('StatusCallbackEvent') || ''
    const confFromBody = params.get('FriendlyName') || ''
    const callSid = params.get('CallSid') || ''
    const confName = confFromQuery || confFromBody

    console.log('caller-hangup fired | event:', event, '| conf:', confName, '| callSid:', callSid)
    if (event && !event.includes('leave') && !event.includes('end')) return new Response('ok')

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    if (confName) {
      await supabase.from('incoming_calls').update({ status: 'completed' }).eq('conference_name', confName).eq('status', 'answered')
      await supabase.from('incoming_calls').update({ status: 'missed' }).eq('conference_name', confName).eq('status', 'ringing')
    } else if (callSid) {
      await supabase.from('incoming_calls').update({ status: 'completed' }).eq('callsid', callSid).eq('status', 'answered')
      await supabase.from('incoming_calls').update({ status: 'missed' }).eq('callsid', callSid).eq('status', 'ringing')
    }
    return new Response('ok')
  } catch (err) {
    console.error('caller-hangup error:', err)
    return new Response('ok')
  }
})
