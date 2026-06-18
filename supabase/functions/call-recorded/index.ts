import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Called BY SignalWire once an inbound call's recording is ready (set as
// recordingStatusCallback on the <Dial record="record-from-answer"> in
// receive-call). Downloads the recording and re-hosts it in our own
// Storage — same pattern as voicemail-recorded — and saves a row so staff
// can find and play it back from the CRM.
// JWT verification must be OFF on this function (SignalWire calls it directly).

serve(async (req) => {
  try {
    const form = await req.formData()
    const recordingUrl = form.get('RecordingUrl')?.toString() || ''
    const callSid = form.get('CallSid')?.toString() || form.get('DialCallSid')?.toString() || ''
    const duration = form.get('RecordingDuration')?.toString() || null
    const from = form.get('From')?.toString() || ''
    const to = form.get('To')?.toString() || ''

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

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
    })

    return new Response('ok', { status: 200 })

  } catch (err) {
    console.error('call-recorded error:', err)
    return new Response('error', { status: 200 }) // 200 so SignalWire doesn't retry forever
  }
})
