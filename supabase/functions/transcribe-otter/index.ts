// transcribe-otter
// Sends a call recording URL to Otter.ai for transcription.
// Requires an Otter API key stored in the settings table.
// JWT Verification: ON (called from authenticated browser)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { recordingUrl, title } = await req.json()
    if (!recordingUrl) {
      return new Response(JSON.stringify({ error: 'recordingUrl required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: settings } = await supabase.from('settings').select('otter_api_key').limit(1).maybeSingle()
    const otterKey = settings?.otter_api_key
    if (!otterKey) {
      return new Response(JSON.stringify({ error: 'Otter API key not configured. Add it in Settings → AI Transcription.' }), { status: 422, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // Submit to Otter for transcription
    const res = await fetch('https://api.otter.ai/v1/speech?include_summary=true', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${otterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: title || 'Call Recording',
        url: recordingUrl,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      return new Response(JSON.stringify({ error: data?.message || 'Otter API error', details: data }), {
        status: res.status, headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({
      success: true,
      speechId: data.speech?.speech_id,
      otterUrl: data.speech?.speech_id ? `https://otter.ai/u/${data.speech.speech_id}` : null,
      status: data.speech?.process_status,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('transcribe-otter error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
