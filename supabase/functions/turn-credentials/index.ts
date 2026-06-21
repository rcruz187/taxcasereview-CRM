// turn-credentials
// Returns a ready-to-use iceServers array for RTCPeerConnection, including
// a TURN relay (Metered.ca's free Open Relay Project, 20GB/month free)
// alongside plain STUN. Called by the browser (useWebRTCRoom) once per
// huddle/meeting join, not per peer connection.
//
// Without TURN, peer-to-peer video only connects when both people happen
// to be on networks that allow a direct connection -- a real chunk of
// real-world pairings (different ISPs, corporate firewalls, some
// cellular/CGNAT setups) can't, and silently fail to connect even though
// the signaling (offer/answer) completes fine.
//
// The Metered API key itself never reaches the browser -- only the
// short-lived credentials it hands back, which is what they're designed
// to expose. Falls back to STUN-only (no relay) if Metered isn't
// configured yet in Settings, rather than erroring the whole call out.
//
// Deploy via: Supabase Dashboard -> Edge Functions -> Deploy new function
// (paste this file in as index.ts), name it "turn-credentials".

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FALLBACK_STUN = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: settings } = await supabase
      .from('settings')
      .select('metered_app_name, metered_api_key')
      .limit(1)
      .maybeSingle()

    if (!settings?.metered_app_name || !settings?.metered_api_key) {
      // Not configured yet -- still return something usable rather than
      // failing the call outright. Direct connections will keep working;
      // only connections that actually need a relay will fail.
      return new Response(JSON.stringify(FALLBACK_STUN), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const res = await fetch(
      `https://${settings.metered_app_name}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(settings.metered_api_key)}`
    )
    if (!res.ok) {
      console.error('turn-credentials: Metered API error', res.status, await res.text())
      return new Response(JSON.stringify(FALLBACK_STUN), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const iceServers = await res.json()
    return new Response(JSON.stringify(iceServers), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('turn-credentials error:', err)
    return new Response(JSON.stringify(FALLBACK_STUN), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
