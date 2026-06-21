import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Called BY THE BROWSER when staff clicks "End" on an active call.
// Hanging up the browser's own RELAY call object (liveCallRef.current)
// only ends THAT leg -- if it's ever in a stuck/half-connected state (as
// turned out to happen with the outbound conference bridge), .hangup()
// can be a no-op and the other party is left connected with no way to
// end it from our side. This forces the issue server-side: tell
// SignalWire directly to end the whole conference, which disconnects
// everyone in it regardless of what state any single leg is in.
//
// CORS is enabled because this is called directly from the browser.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { conferenceName } = await req.json()
    if (!conferenceName) {
      return new Response(JSON.stringify({ error: 'conferenceName required' }), {
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
      return new Response(JSON.stringify({ error: 'SignalWire credentials missing in Settings' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const spaceDomain = settings.sw_space_url.replace(/^https?:\/\//, '')
    const auth = 'Basic ' + btoa(`${settings.sw_project_id}:${settings.sw_api_token}`)
    const base = `https://${spaceDomain}/api/laml/2010-04-01/Accounts/${settings.sw_project_id}`

    // Find the live conference by its friendly name.
    const confResp = await fetch(
      `${base}/Conferences.json?FriendlyName=${encodeURIComponent(conferenceName)}&Status=in-progress`,
      { headers: { Authorization: auth } }
    )
    const confData = await confResp.json()
    const conferenceSid = confData?.conferences?.[0]?.sid
    console.log('end-conference: lookup for', conferenceName, '-> found', confData?.conferences?.length ?? 0, 'in-progress, sid:', conferenceSid)

    if (!conferenceSid) {
      // Already ended on SignalWire's side -- nothing to do, not an error.
      return new Response(JSON.stringify({ ok: true, note: 'Conference already ended' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const updResp = await fetch(`${base}/Conferences/${conferenceSid}.json`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ Status: 'completed' }),
    })

    if (!updResp.ok) {
      const text = await updResp.text()
      console.error('end-conference: SignalWire rejected the terminate request', updResp.status, text)
      return new Response(JSON.stringify({ error: text }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('end-conference: terminate request accepted for sid', conferenceSid)
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('end-conference error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
