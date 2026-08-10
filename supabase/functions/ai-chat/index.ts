import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM_PROMPT = `You are a helpful AI assistant embedded inside TaxRes CRM. You can answer ANY question on any topic — weather, general knowledge, business, writing, coding, tax resolution, IRS processes, or anything else. Be direct, concise, and practical. Never refuse a question by saying you are only a tax expert.`

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { message, context, history } = await req.json()
    if (!message) return new Response(JSON.stringify({ error: 'missing message' }), { status: 400, headers: CORS })

    const GROQ_KEY = Deno.env.get('GROQ_API_KEY')!

    const messages = [{ role: 'system', content: SYSTEM_PROMPT }]

    if (context) {
      messages.push({ role: 'user', content: `Current CRM context:\n\n${context}` })
      messages.push({ role: 'assistant', content: 'Got it. How can I help?' })
    }

    if (history && Array.isArray(history)) {
      for (const h of history) {
        messages.push({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content })
      }
    }

    messages.push({ role: 'user', content: message })

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        max_tokens: 2048,
        temperature: 0.3,
      })
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('ai-chat: Groq error', res.status, err)
      return new Response(JSON.stringify({ error: 'AI service error' }), { status: 500, headers: CORS })
    }

    const data = await res.json()
    const reply = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.'

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('ai-chat error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS })
  }
})
