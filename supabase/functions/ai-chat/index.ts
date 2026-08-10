import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM_PROMPT = `You are an expert AI assistant embedded inside TaxRes CRM — a CRM built specifically for tax resolution firms. You have deep knowledge of IRS tax resolution processes, notices, transcript codes, forms, strategy, and case management. You can also help with general business, productivity, drafting, and any other questions. Be direct, concise, and practical.`

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { message, context, history } = await req.json()
    if (!message) return new Response(JSON.stringify({ error: 'missing message' }), { status: 400, headers: CORS })

    const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')!
    const PROJECT_ID = '994655076278'

    const contents = []
    if (context) {
      contents.push({ role: 'user', parts: [{ text: `Current CRM context:\n\n${context}` }] })
      contents.push({ role: 'model', parts: [{ text: 'Got it. How can I help?' }] })
    }
    if (history && Array.isArray(history)) {
      for (const h of history) {
        contents.push({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] })
      }
    }
    contents.push({ role: 'user', parts: [{ text: message }] })

    const body = JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
    })

    // Vertex AI endpoint — works with OAuth2 AQ. bearer tokens
    const endpoint = `https://us-central1-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/us-central1/publishers/google/models/gemini-1.5-flash:generateContent`

    const geminiRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GEMINI_KEY}`,
      },
      body
    })

    if (!geminiRes.ok) {
      const err = await geminiRes.text()
      console.error('ai-chat: Vertex error', geminiRes.status, err)
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
