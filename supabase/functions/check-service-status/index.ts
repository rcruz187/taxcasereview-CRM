import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SERVICES: Record<string, string> = {
  supabase:  'https://status.supabase.com/api/v2/status.json',
  stripe:    'https://status.stripe.com/api/v2/status.json',
  anthropic: 'https://status.anthropic.com/api/v2/status.json',
  github:    'https://www.githubstatus.com/api/v2/status.json',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const results: Record<string, any> = {}
    await Promise.all(
      Object.entries(SERVICES).map(async ([name, url]) => {
        try {
          const res = await fetch(url, {
            headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
          })
          if (!res.ok) { results[name] = { error: 'HTTP ' + res.status }; return }
          results[name] = await res.json()
        } catch (e) {
          results[name] = { error: String(e) }
        }
      })
    )
    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
