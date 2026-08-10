import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM_PROMPT = `You are an expert AI assistant embedded inside TaxRes CRM — a CRM built specifically for tax resolution firms. You have deep knowledge of:
- IRS tax resolution processes (OIC, IA, CNC, CDP, PPIA, TFRP)
- IRS notices, transcript codes, CSED calculations
- Forms 2848, 8821, 433-A, 433-B, 433-F, 656
- Tax resolution strategy and case management
- How to work with the IRS on behalf of clients
- General business, legal, and productivity questions

You have access to context about the current client or case the user is viewing. Use that context to give specific, actionable answers. Be direct, concise, and practical.`

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const { message, context, history } = await req.json()
    if (!message) return new Response(JSON.stringify({ error: 'missing message' }), { status: 400, headers: CORS })

    const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_KEY) {
      console.error('GEMINI_API_KEY not set')
      return new Response(JSON.stringify({ error: 'AI service not configured' }), { status: 500, headers: CORS })
    }

    const contents = []

    if (context) {
      contents.push({ role: 'user', parts: [{ text: `Current CRM context:\n\n${context}` }] })
      contents.push({ role: 'model', parts: [{ text: 'Got it, I have the context. How can I help?' }] })
    }

    if (history && Array.isArray(history)) {
      for (const h of history) {
        contents.push({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] })
      }
    }

    contents.push({ role: 'user', parts: [{ text: message }] })

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
        })
      }
    )

    if (!geminiRes.ok) {
      const err = await geminiRes.text()
      console.error('ai-chat: Gemini error', geminiRes.status, err)
      return new Response(JSON.stringify({ error: 'AI service error', detail: err }), { status: 500, headers: CORS })
    }

    const data = await geminiRes.json()
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not generate a response.'

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('ai-chat error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS })
  }
})
