import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json()
    const { message, context, history } = body

    if (!message) {
      return new Response(JSON.stringify({ error: 'missing message' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    const GROQ_KEY = Deno.env.get('GROQ_API_KEY')
    if (!GROQ_KEY) {
      return new Response(JSON.stringify({ error: 'AI service not configured — GROQ_API_KEY missing' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    const messages: any[] = [
      { role: 'system', content: 'You are a helpful AI assistant for a tax resolution CRM. Help with tax resolution, IRS processes, case strategy, and drafting communications.' }
    ]

    if (context) {
      messages.push({ role: 'user', content: 'Current page context:\n' + context })
      messages.push({ role: 'assistant', content: 'Got it.' })
    }

    if (history && Array.isArray(history)) {
      for (const h of history) {
        messages.push({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content })
      }
    }

    messages.push({ role: 'user', content: message })

    let groqRes: Response
    try {
      groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + GROQ_KEY,
        },
        body: JSON.stringify({
          model: 'llama3-70b-8192',
          messages,
          max_tokens: 1024,
          temperature: 0.3,
        })
      })
    } catch (fetchErr) {
      // Surface the actual fetch error so we can diagnose it
      return new Response(JSON.stringify({ error: 'Groq fetch failed: ' + String(fetchErr) }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    const data = await groqRes.json()

    if (!groqRes.ok) {
      return new Response(JSON.stringify({ error: 'Groq API error ' + groqRes.status + ': ' + (data?.error?.message || JSON.stringify(data)) }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    const reply = data.choices?.[0]?.message?.content
    if (!reply) {
      return new Response(JSON.stringify({ error: 'Empty Groq response' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Exception: ' + String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  }
})
