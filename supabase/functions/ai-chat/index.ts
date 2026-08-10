import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM_PROMPT = `You are an expert AI assistant embedded inside TaxRes CRM — a CRM built specifically for tax resolution firms. You have deep knowledge of IRS tax resolution processes, notices, transcript codes, forms, strategy, and case management. You can also help with general business, productivity, drafting, and any other questions. Be direct, concise, and practical.`

async function getAccessToken(refreshToken: string): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || '764086051850-6qr4p6gpi6hn506pt8ejuq83di341hur.apps.googleusercontent.com'
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') || 'd-FL95Q19q7MQmFpd7hHD0Ty'
  
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    })
  })
  
  const data = await res.json()
  if (!data.access_token) {
    throw new Error(`Token exchange failed: ${JSON.stringify(data)}`)
  }
  return data.access_token
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { message, context, history } = await req.json()
    if (!message) return new Response(JSON.stringify({ error: 'missing message' }), { status: 400, headers: CORS })

    const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')!

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

    // Exchange AQ. refresh token for access token
    const accessToken = await getAccessToken(GEMINI_KEY)

    const geminiRes = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'x-goog-user-project': Deno.env.get('GOOGLE_PROJECT_ID') || '994655076278',
        },
        body
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
