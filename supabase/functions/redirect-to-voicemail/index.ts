import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Called BY THE BROWSER (CallContext.jsx) when an inbound call has been
// held too long without anyone answering, or when staff clicks "Decline".
// Holding a caller in a <Conference> doesn't have a built-in "give up
// after N seconds" the way dialing a destination did, so we trigger the
// fallback manually: use the SignalWire REST API to redirect the LIVE
// call over to the voicemail prompt.
//
// CORS is enabled because this is called directly from the browser.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { callsid } = await req.json()
    if (!callsid) {
      return new Response(JSON.stringify({ error: 'callsid required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: settings, error: sErr } = await supabase
      .from('settings')
      .select('sw_space_url,sw_project_id,sw_api_token')
      .limit(1)
      .maybeSingle()

    if (sErr || !settings?.sw_space_url || !settings?.sw_project_id || !settings?.sw_api_token) {
      console.error('redirect-to-voicemail: missing SignalWire credentials in settings', sErr)
      return new Response(JSON.stringify({ error: 'SignalWire credentials missing in Settings' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const spaceDomain = settings.sw_space_url.replace(/^https?:\/\//, '')
    const auth = 'Basic ' + btoa(`${settings.sw_project_id}:${settings.sw_api_token}`)

    const resp = await fetch(
      `https://${spaceDomain}/api/laml/2010-04-01/Accounts/${settings.sw_project_id}/Calls/${callsid}.json`,
      {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          Url: 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/voicemail-prompt',
          Method: 'POST',
        }),
      }
    )

    const text = await resp.text()
    if (!resp.ok) {
      console.error('redirect-to-voicemail: SignalWire rejected the redirect', resp.status, text)
      return new Response(JSON.stringify({ error: text }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { error: updErr } = await supabase
      .from('incoming_calls')
      .update({ status: 'missed' })
      .eq('callsid', callsid)
    if (updErr) console.error('incoming_calls status update error:', updErr)

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('redirect-to-voicemail error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
