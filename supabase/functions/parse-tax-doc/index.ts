import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { pdfText, docType, fieldList } = await req.json()

    const GROQ_KEY = Deno.env.get('GROQ_API_KEY')
    if (!GROQ_KEY) throw new Error('GROQ_API_KEY not set')

    if (!pdfText || pdfText.trim().length < 10) {
      return new Response(JSON.stringify({ parsed: {}, error: 'No text extracted from PDF' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1500,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: 'You are a professional tax document parser. Extract values from tax documents and return ONLY valid JSON. No explanation, no markdown, no backticks — just the raw JSON object.'
          },
          {
            role: 'user',
            content: `Extract ALL values from this ${docType} tax document text.\n\nReturn ONLY a valid JSON object with these exact keys: {${fieldList}}\n\nRules:\n- Use null for any field not found\n- For dollar amounts, return numbers only (no $ or commas) e.g. 52341.00\n- For EINs use format XX-XXXXXXX, for SSNs use XXX-XX-XXXX\n- Return ONLY the JSON object\n\nDocument text:\n${pdfText.substring(0, 6000)}`
          }
        ]
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Groq error:', response.status, errText)
      throw new Error(`Groq API error: ${response.status}`)
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content || '{}'
    let parsed = {}
    try {
      parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    } catch {
      const match = text.match(/\{[\s\S]*\}/)
      if (match) { try { parsed = JSON.parse(match[0]) } catch { parsed = {} } }
    }

    return new Response(JSON.stringify({ parsed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (e) {
    console.error('parse-tax-doc error:', e)
    return new Response(JSON.stringify({ error: (e as Error).message, parsed: {} }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
