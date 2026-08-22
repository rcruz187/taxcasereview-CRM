import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Called BY SignalWire once an inbound call's recording is ready.
// Downloads the recording, re-hosts it in Supabase Storage, saves a row,
// then async-fires call-ai-summary for Gemini transcription + action items.
// JWT verification must be OFF (SignalWire calls this directly).

serve(async (req) => {
  try {
    const form = await req.formData()
    // Basic structural validation: key SignalWire fields must be present
    const callSid = form.get('CallSid')
    const recordingUrl = form.get('RecordingUrl')
    if (!callSid || !recordingUrl) {
      console.warn('call-recorded: missing CallSid or RecordingUrl — rejected')
      return new Response('Bad Request', { status: 400 })
    }
    const recordingUrl = form.get('RecordingUrl')?.toString() || ''
    const callSid = form.get('CallSid')?.toString() || form.get('DialCallSid')?.toString() || ''
    const duration = form.get('RecordingDuration')?.toString() || null
    const from = form.get('From')?.toString() || ''
    const to = form.get('To')?.toString() || ''

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Resolve tenant from the called number (to) — multi-tenant safe
    let tenant_id = '61a89aef-0e7e-4ea2-b222-44ab2024655a' // fallback to TCR
    if (to) {
      const toClean = to.replace(/\D/g, '').slice(-10)
      const { data: setting } = await supabase
        .from('settings')
        .select('tenant_id')
        .ilike('signalwire_phone', `%${toClean}%`)
        .limit(1)
        .maybeSingle()
      if (setting?.tenant_id) tenant_id = setting.tenant_id
    }

    let storedUrl = recordingUrl
    if (recordingUrl) {
      try {
        const audioUrl = recordingUrl.endsWith('.mp3') ? recordingUrl : `${recordingUrl}.mp3`
        const audioRes = await fetch(audioUrl)
        if (audioRes.ok) {
          const blob = await audioRes.arrayBuffer()
          const path = `call-recordings/${callSid || Date.now()}.mp3`
          const { error: upErr } = await supabase.storage.from('documents').upload(path, blob, {
            contentType: 'audio/mpeg', upsert: true,
          })
          if (!upErr) {
            const { data: pub } = supabase.storage.from('documents').getPublicUrl(path)
            storedUrl = pub.publicUrl
          }
        }
      } catch (e) {
        console.error('call-recorded: re-host failed, falling back to SignalWire URL', e)
      }
    }

    await supabase.from('call_recordings').insert({
      call_sid: callSid,
      from_number: from,
      to_number: to,
      recording_url: storedUrl,
      duration_seconds: duration ? Number(duration) : null,
      created_at: new Date().toISOString(),
      tenant_id,
    })

    // Fire AI summary async — non-blocking so SignalWire gets 200 fast
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    fetch(`${supabaseUrl}/functions/v1/call-ai-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recording_url: storedUrl,
        call_sid: callSid,
        from_number: from,
        to_number: to,
        tenant_id,
        duration_seconds: duration ? Number(duration) : null,
      }),
    }).catch(e => console.error('call-recorded: failed to trigger ai-summary', e))

    return new Response('ok', { status: 200 })

  } catch (err) {
    console.error('call-recorded error:', err)
    return new Response('error', { status: 200 }) // 200 so SignalWire doesn't retry forever
  }
})
