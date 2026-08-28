import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TCR_TENANT = '61a89aef-0e7e-4ea2-b222-44ab2024655a'
const emptyXml = '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Ruth-Neural" language="en-US"><speak>Thank you. <break time="300ms"/> Your message has been recorded and we\'ll be in touch soon. <break time="300ms"/> Have a great day.</speak></Say></Response>'

function isExpectedSignalWireUrl(raw: string) {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && (u.hostname === 'signalwire.com' || u.hostname.endsWith('.signalwire.com'))
  } catch { return false }
}

serve(async (req) => {
  try {
    if (req.method !== 'POST') return new Response(emptyXml, { status: 405, headers: { 'Content-Type': 'text/xml' } })
    const form = await req.formData()
    const from = form.get('From')?.toString() || ''
    const to = form.get('To')?.toString() || ''
    const recordingUrl = form.get('RecordingUrl')?.toString() || ''
    const durationStr = form.get('RecordingDuration')?.toString() || null
    const callSid = form.get('CallSid')?.toString() || form.get('DialCallSID')?.toString() || null

    // Availability-safe structural validation while the provider signing secret is unavailable.
    // Reject arbitrary URLs so this public webhook cannot be used as an SSRF/storage relay.
    if (!callSid || !recordingUrl || !isExpectedSignalWireUrl(recordingUrl)) {
      console.warn('[voicemail-recorded] rejected malformed callback', { callSid: !!callSid, recordingHostOk: isExpectedSignalWireUrl(recordingUrl) })
      return new Response(emptyXml, { status: 400, headers: { 'Content-Type': 'text/xml' } })
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    let storedUrl = recordingUrl

    try {
      const { data: settings } = await supabase.from('settings')
        .select('sw_project_id,sw_api_token').eq('tenant_id', TCR_TENANT).maybeSingle()

      if (settings?.sw_project_id && settings?.sw_api_token) {
        const auth = 'Basic ' + btoa(`${settings.sw_project_id}:${settings.sw_api_token}`)
        const audioUrl = recordingUrl.endsWith('.mp3') ? recordingUrl : `${recordingUrl}.mp3`
        const audioResp = await fetch(audioUrl, { headers: { Authorization: auth } })

        if (audioResp.ok) {
          const bytes = new Uint8Array(await audioResp.arrayBuffer())
          const fileName = `${TCR_TENANT}/vm_${callSid}_${Math.random().toString(36).slice(2, 8)}.mp3`
          await supabase.storage.createBucket('voicemails', { public: false }).catch(() => {})
          const { error: upErr } = await supabase.storage.from('voicemails').upload(fileName, bytes, { contentType: 'audio/mpeg', upsert: false })
          if (!upErr) {
            const { data: signed, error: signErr } = await supabase.storage.from('voicemails').createSignedUrl(fileName, 60 * 60 * 24 * 365 * 3)
            if (!signErr && signed?.signedUrl) storedUrl = signed.signedUrl
          } else {
            console.error('[voicemail-recorded] storage upload failed', upErr.message)
          }
        } else {
          console.error('[voicemail-recorded] provider audio fetch failed', audioResp.status)
        }
      }
    } catch (e) {
      console.error('[voicemail-recorded] re-host failed; retaining provider URL', e)
    }

    // Idempotent on provider CallSid to prevent duplicate webhook rows.
    const { data: existing } = await supabase.from('voicemails').select('id').eq('tenant_id', TCR_TENANT).eq('call_sid', callSid).maybeSingle()
    if (!existing) {
      const parsedDuration = durationStr && /^\d+$/.test(durationStr) ? parseInt(durationStr, 10) : null
      const { error } = await supabase.from('voicemails').insert({
        from_number: from.slice(0, 32), to_number: to.slice(0, 32), recording_url: storedUrl,
        duration_seconds: parsedDuration, call_sid: callSid, is_read: false,
        created_at: new Date().toISOString(), tenant_id: TCR_TENANT,
      })
      if (error) console.error('[voicemail-recorded] insert failed', error.message)
    }

    return new Response(emptyXml, { headers: { 'Content-Type': 'text/xml' } })
  } catch (err) {
    console.error('[voicemail-recorded] error', err)
    return new Response(emptyXml, { headers: { 'Content-Type': 'text/xml' } })
  }
})
