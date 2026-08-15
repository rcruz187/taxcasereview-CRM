import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Called BY SignalWire after a caller leaves a voicemail (the <Record> verb
// inside receive-call's fallback). Downloads the actual audio file using the
// SignalWire credentials (server-side only) and re-hosts it in Supabase
// Storage so the CRM can just play it back with a normal <audio> tag.

const emptyXml = '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Ruth-Neural" language="en-US"><speak>Thank you. <break time="300ms"/> Your message has been recorded and we'll be in touch soon. <break time="300ms"/> Have a great day.</speak></Say></Response>'

serve(async (req) => {
  try {
    const form = await req.formData()
    const from = form.get('From')?.toString() || ''
    const to = form.get('To')?.toString() || ''
    const recordingUrl = form.get('RecordingUrl')?.toString() || ''
    const durationStr = form.get('RecordingDuration')?.toString() || null
    const callSid = form.get('CallSid')?.toString() || form.get('DialCallSID')?.toString() || null

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    let storedUrl = recordingUrl

    if (recordingUrl) {
      try {
        const { data: settings } = await supabase.from('settings')
          .select('sw_project_id,sw_api_token').limit(1).maybeSingle()

        if (settings?.sw_project_id && settings?.sw_api_token) {
          const auth = 'Basic ' + btoa(`${settings.sw_project_id}:${settings.sw_api_token}`)
          const audioUrl = recordingUrl.endsWith('.mp3') ? recordingUrl : `${recordingUrl}.mp3`
          const audioResp = await fetch(audioUrl, { headers: { Authorization: auth } })

          if (audioResp.ok) {
            const bytes = new Uint8Array(await audioResp.arrayBuffer())
            const fileName = `vm_${callSid || Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`

            // Make sure the bucket exists -- harmless if it already does.
            await supabase.storage.createBucket('voicemails', { public: true }).catch(() => {})

            const { error: upErr } = await supabase.storage
              .from('voicemails')
              .upload(fileName, bytes, { contentType: 'audio/mpeg', upsert: true })

            if (!upErr) {
              const { data: pub } = supabase.storage.from('voicemails').getPublicUrl(fileName)
              storedUrl = pub.publicUrl
            } else {
              console.error('voicemail storage upload error:', upErr)
            }
          } else {
            console.error('voicemail audio fetch failed:', audioResp.status)
          }
        }
      } catch (e) {
        console.error('voicemail download/re-host failed, falling back to raw SignalWire URL:', e)
      }
    }

    await supabase.from('voicemails').insert({
      from_number: from,
      to_number: to,
      recording_url: storedUrl,
      duration_seconds: durationStr ? parseInt(durationStr) : null,
      call_sid: callSid,
      is_read: false,
      created_at: new Date().toISOString(),
      tenant_id: '61a89aef-0e7e-4ea2-b222-44ab2024655a',
    })

    return new Response(emptyXml, { headers: { 'Content-Type': 'text/xml' } })

  } catch (err) {
    console.error('voicemail-recorded error:', err)
    return new Response(emptyXml, { headers: { 'Content-Type': 'text/xml' } })
  }
})
