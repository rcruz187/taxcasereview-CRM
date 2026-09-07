import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// "Polish Notes" helper. Uses the shared Groq free-tier AI path.
// Keeps the historical { recap } response contract intact.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL = 'llama-3.3-70b-versatile'
const MAX_INPUT_CHARS = 6000

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { bullets, contactName, outcome } = await req.json()
    const notes = String(bullets || '').trim()

    if (!notes) {
      return new Response(JSON.stringify({ error: 'Type a couple quick notes first, then polish them.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (notes.length > MAX_INPUT_CHARS) {
      return new Response(JSON.stringify({ error: 'Call notes are too long to polish in one request.' }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = Deno.env.get('GROQ_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'AI recap is not configured.' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const prompt = `Turn these rough call notes into a tight, professional call-log entry: 2-4 plain sentences, past tense, no headers, no bullet points, no markdown. Write it the way a staff member would document a call for the case file. Do not invent any detail that wasn't given — if something is unclear, leave it out rather than guessing.\n\nContact: ${String(contactName || 'Unknown').slice(0, 300)}\nOutcome: ${String(outcome || 'Unknown').slice(0, 300)}\nRep's rough notes: ${notes}`

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        temperature: 0.2,
        messages: [
          { role: 'system', content: 'You rewrite tax-resolution call notes. Never invent facts. Return only the polished call note.' },
          { role: 'user', content: prompt },
        ],
      }),
    })

    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      console.error('call-recap Groq error', resp.status, data)
      return new Response(JSON.stringify({ error: 'AI recap service is temporarily unavailable.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const recap = data?.choices?.[0]?.message?.content?.trim() || ''
    if (!recap) {
      return new Response(JSON.stringify({ error: 'AI recap returned an empty response.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ recap }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('call-recap error:', err)
    return new Response(JSON.stringify({ error: 'AI recap request failed.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
