// turn-credentials
// Returns a ready-to-use iceServers array for RTCPeerConnection.
// Tenant-aware: reads the calling user's tenant's Metered credentials.
// Falls back to TCR's credentials if the tenant has none,
// then to free public TURN (Open Relay Project) if nothing is configured.
// The Metered API key never reaches the browser — only the short-lived
// credentials it returns, which is what they're designed to expose.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Free public TURN — Open Relay Project (no account needed, reasonable limits)
const FREE_TURN = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80',      username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443',     username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
]

const FALLBACK_STUN = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

async function getMeteredCredentials(appName: string, apiKey: string) {
  const res = await fetch(
    `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`
  )
  if (!res.ok) return null
  return await res.json()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Resolve calling user's tenant from the JWT
    const authHeader = req.headers.get('Authorization') || ''
    let tenantId: string | null = null
    if (authHeader.startsWith('Bearer ')) {
      const { data: { user } } = await createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      ).auth.getUser()

      if (user?.email) {
        const { data: emp } = await supabase
          .from('employees')
          .select('tenant_id')
          .eq('email', user.email)
          .single()
        tenantId = emp?.tenant_id || null
      }
    }

    // Try this tenant's Metered credentials first (authenticated users only)
    if (tenantId) {
      const { data: tenantSettings } = await supabase
        .from('settings')
        .select('metered_app_name, metered_api_key')
        .eq('tenant_id', tenantId)
        .maybeSingle()

      if (tenantSettings?.metered_app_name && tenantSettings?.metered_api_key) {
        const creds = await getMeteredCredentials(tenantSettings.metered_app_name, tenantSettings.metered_api_key)
        if (creds) {
          return new Response(JSON.stringify(creds), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
      }
    }

    // Fall back to TCR's Metered credentials (platform-level key)
    // Used for: unauthenticated participants (screenshare guests), tenants with no Metered key
    const { data: tcrSettings } = await supabase
      .from('settings')
      .select('metered_app_name, metered_api_key')
      .eq('tenant_id', '61a89aef-0e7e-4ea2-b222-44ab2024655a')
      .maybeSingle()

    if (tcrSettings?.metered_app_name && tcrSettings?.metered_api_key) {
      const creds = await getMeteredCredentials(tcrSettings.metered_app_name, tcrSettings.metered_api_key)
      if (creds) {
        return new Response(JSON.stringify(creds), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    // Final fallback: free public TURN — works for demo tenant with no Metered key
    return new Response(JSON.stringify(FREE_TURN), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('turn-credentials error:', err)
    return new Response(JSON.stringify(FREE_TURN), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
