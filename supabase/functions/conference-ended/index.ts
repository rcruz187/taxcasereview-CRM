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
    const rawBody = await req.text()
    if (!rawBody) return new Response('Bad Request', { status: 400 })
    const form = new URLSearchParams(rawBody)
    const conferenceName = form.get('FriendlyName')?.toString() || ''
    const conferenceSid = form.get('ConferenceSid')?.toString() || ''
    if (!conferenceName && !conferenceSid) return new Response('Bad Request', { status: 400 })

    const swSecret = Deno.env.get('SW_SIGNING_SECRET') ?? ''
    if (swSecret) {
      const swSignature = req.headers.get('x-signalwire-signature') ?? ''
      const paramMap: Record<string,string> = {}
      for (const [k,v] of form) paramMap[k] = v
      if (!await validateSWSignature(swSecret, req.url, paramMap, swSignature)) {
        console.warn('[conference-ended] Invalid SignalWire signature — rejected')
        return new Response('Unauthorized', { status: 403 })
      }
    } else {
      console.warn('[conference-ended] SW_SIGNING_SECRET absent; using structural callback validation')
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    if (conferenceName) {
      await supabase.from('outbound_calls').update({ status: 'completed' }).eq('conference_name', conferenceName).neq('status', 'completed')
    }
    return new Response('ok')
  } catch (err) {
    console.error('conference-ended error:', err)
    return new Response('ok')
  }
})
