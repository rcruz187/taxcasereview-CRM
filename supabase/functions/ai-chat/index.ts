import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SYSTEM_PROMPT = `You are an expert AI assistant embedded inside TaxRes CRM — a CRM built specifically for tax resolution firms. You have deep knowledge of:
- IRS tax resolution processes (OIC, IA, CNC, CDP, PPIA, TFRP)
- IRS notices, transcript codes, CSED calculations
- Forms 2848, 8821, 433-A, 433-B, 433-F, 656
- Tax resolution strategy and case management
- How to work with the IRS on behalf of clients

You have access to context about the current client or case the user is viewing. Use that context to give specific, actionable answers. Be direct, concise, and practical. You are speaking to an Enrolled Agent or tax professional.`

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, content-type',
    }})
  }

  try {
    const { message, context, history } = await req.json()
    if (!message) return new Response(JSON.stringify({ error: 'missing message' }), { status: 400 })

    const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')!
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
      console.error('ai-chat: Gemini error', err)
      return new Response(JSON.stringify({ error: 'AI service error' }), { status: 500 })
    }

    const data = await geminiRes.json()
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not generate a response.'

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })

  } catch (err) {
    console.error('ai-chat error:', err)
    return new Response(JSON.stringify({ error: 'internal error' }), { status: 500 })
  }
})
