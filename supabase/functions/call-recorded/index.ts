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
    const form = new URLSearchParams(rawBody)
    const recordingUrl = form.get('RecordingUrl')?.toString() || ''
    const callSid = form.get('CallSid')?.toString() || form.get('DialCallSid')?.toString() || ''
    if (!callSid || !recordingUrl) return new Response('Bad Request', { status: 400 })

    let parsedRecording: URL
    try { parsedRecording = new URL(recordingUrl) } catch { return new Response('Bad Request', { status: 400 }) }
    if (parsedRecording.protocol !== 'https:' || !parsedRecording.hostname.endsWith('.signalwire.com')) {
      console.warn('[call-recorded] rejected non-SignalWire recording URL')
      return new Response('Bad Request', { status: 400 })
    }

    const swSignature = req.headers.get('x-signalwire-signature') ?? ''
    const swSecret = Deno.env.get('SW_SIGNING_SECRET') ?? ''
    if (swSecret) {
      const paramMap: Record<string,string> = {}
      for (const [k,v] of form) paramMap[k] = v
      if (!await validateSWSignature(swSecret, req.url, paramMap, swSignature)) {
        console.warn('[call-recorded] Invalid SignalWire signature — rejected')
        return new Response('Unauthorized', { status: 403 })
      }
    } else {
      console.warn('[call-recorded] SW_SIGNING_SECRET absent; validating callback structure and SignalWire media host')
    }

    const duration = form.get('RecordingDuration')?.toString() || null
    const from = form.get('From')?.toString() || ''
    const to = form.get('To')?.toString() || ''
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    let tenant_id = '61a89aef-0e7e-4ea2-b222-44ab2024655a'
    if (to) {
      const toClean = to.replace(/\D/g, '').slice(-10)
      const { data: setting } = await supabase.from('settings').select('tenant_id').ilike('signalwire_phone', `%${toClean}%`).limit(1).maybeSingle()
      if (setting?.tenant_id) tenant_id = setting.tenant_id
    }

    // Provider retries must not create duplicate recording/AI rows.
    const { data: existing } = await supabase.from('call_recordings').select('id,recording_url').eq('call_sid', callSid).eq('tenant_id', tenant_id).limit(1).maybeSingle()
    if (existing) return new Response('ok', { status: 200 })

    let storedUrl = recordingUrl
    try {
      const audioUrl = recordingUrl.endsWith('.mp3') ? recordingUrl : `${recordingUrl}.mp3`
      const audioRes = await fetch(audioUrl)
      if (audioRes.ok) {
        const blob = await audioRes.arrayBuffer()
        const path = `call-recordings/${tenant_id}/${callSid}.mp3`
        const { error: upErr } = await supabase.storage.from('documents').upload(path, blob, { contentType: 'audio/mpeg', upsert: true })
        if (!upErr) {
          // Stored URLs are part of the call history, so use the archival signed
          // URL lifetime used by other persisted private-document references.
          const { data: signed } = await supabase.storage.from('documents').createSignedUrl(path, 94608000)
          if (signed?.signedUrl) storedUrl = signed.signedUrl
        }
      }
    } catch (e) {
      console.error('call-recorded: re-host failed, falling back to SignalWire URL', e)
    }

    const { error: insertErr } = await supabase.from('call_recordings').insert({
      call_sid: callSid, from_number: from, to_number: to, recording_url: storedUrl,
      duration_seconds: duration ? Number(duration) : null, created_at: new Date().toISOString(), tenant_id,
    })
    if (insertErr) throw insertErr

    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/call-ai-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-call-secret': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' },
      body: JSON.stringify({ recording_url: storedUrl, call_sid: callSid, from_number: from, to_number: to, tenant_id, duration_seconds: duration ? Number(duration) : null }),
    }).catch(e => console.error('call-recorded: failed to trigger ai-summary', e))

    return new Response('ok', { status: 200 })
  } catch (err) {
    console.error('call-recorded error:', err)
    return new Response('error', { status: 200 })
  }
})
