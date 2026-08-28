// turn-credentials
// Returns ICE servers for WebRTC. Authenticated active staff may receive tenant/platform
// Metered short-lived TURN credentials. Anonymous screen-share guests receive
// only public TURN/STUN so paid Metered quota cannot be harvested anonymously.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FREE_TURN = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
]

async function getMeteredCredentials(appName: string, apiKey: string) {
  const res = await fetch(`https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`)
  if (!res.ok) return null
  return await res.json()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify(FREE_TURN), { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
    }

    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } })
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user?.email) {
      return new Response(JSON.stringify(FREE_TURN), { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
    }

    const { data: emp } = await admin.from('employees').select('tenant_id,status').ilike('email', user.email).maybeSingle()
    const tenantId = emp?.tenant_id || null
    if (!tenantId || String(emp?.status || '').toLowerCase() !== 'active') {
      return new Response(JSON.stringify(FREE_TURN), { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
    }

    const { data: tenantSettings } = await admin
      .from('settings')
      .select('metered_app_name,metered_api_key')
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (tenantSettings?.metered_app_name && tenantSettings?.metered_api_key) {
      const creds = await getMeteredCredentials(tenantSettings.metered_app_name, tenantSettings.metered_api_key)
      if (creds) return new Response(JSON.stringify(creds), { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
    }

    // Authenticated active staff only may use the platform fallback paid TURN account.
    const { data: platformSettings } = await admin
      .from('settings')
      .select('metered_app_name,metered_api_key')
      .not('metered_app_name', 'is', null)
      .not('metered_api_key', 'is', null)
      .limit(1)
      .maybeSingle()

    if (platformSettings?.metered_app_name && platformSettings?.metered_api_key) {
      const creds = await getMeteredCredentials(platformSettings.metered_app_name, platformSettings.metered_api_key)
      if (creds) return new Response(JSON.stringify(creds), { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
    }

    return new Response(JSON.stringify(FREE_TURN), { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('turn-credentials error:', err)
    return new Response(JSON.stringify(FREE_TURN), { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  }
})
