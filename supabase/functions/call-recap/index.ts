import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// Called BY the "✨ Polish Notes" button in the Log Call modal. Takes the
// rep's rough bullet points and turns them into a clean, professional
// call note. Deliberately uses Haiku (the cheapest Claude model) since
// this is a short rewrite task, not anything that needs a bigger model —
// keeps the per-call cost a small fraction of a cent.
//
// Requires ANTHROPIC_API_KEY as an Edge Function secret:
// Supabase Dashboard → Edge Functions → Secrets → add ANTHROPIC_API_KEY
// (get a key at console.anthropic.com). Nothing else to configure.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { bullets, contactName, outcome } = await req.json()

    if (!bullets?.trim()) {
      return new Response(JSON.stringify({ error: 'Type a couple quick notes first, then polish them.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'AI recap isn\'t set up yet — add ANTHROPIC_API_KEY as an Edge Function secret in the Supabase dashboard (Edge Functions → Secrets). Get a key at console.anthropic.com.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const prompt = `Turn these rough call notes into a tight, professional call-log entry: 2-4 plain sentences, past tense, no headers, no bullet points, no markdown. Write it the way a staff member would document a call for the case file. Do not invent any detail that wasn't given — if something is unclear, leave it out rather than guessing.

Contact: ${contactName || 'Unknown'}
Outcome: ${outcome || 'Unknown'}
Rep's rough notes: ${bullets}`

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!resp.ok) {
      const text = await resp.text()
      return new Response(JSON.stringify({ error: 'Anthropic API error: ' + text }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const data = await resp.json()
    const recap = (data?.content || []).find((b) => b.type === 'text')?.text?.trim() || ''

    return new Response(JSON.stringify({ recap }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('call-recap error:', err)
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
