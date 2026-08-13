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
        max_tokens: 2000,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: 'You are a professional tax document parser specializing in IRS forms. Extract values precisely and return ONLY valid JSON. No explanation, no markdown, no backticks — just the raw JSON object.'
          },
          {
            role: 'user',
            content: `You are parsing a ${docType} tax document. This PDF may contain multiple copies of the same form (e.g. multiple W-2s from different employers, or multiple copies for state/federal/employee).

IMPORTANT RULES:
- If there are multiple W-2s from DIFFERENT employers, aggregate the numeric values (add wages together, add withholding together)
- For employer name/EIN: use the FIRST employer listed
- For employee name/SSN: use the employee information (not the employer)
- For dollar amounts, return numbers only — no $ signs, no commas. Example: 53637.09
- For EINs use format XX-XXXXXXX
- For SSNs use format XXX-XX-XXXX
- Use null for any field not present in the document
- Return ONLY a valid JSON object with these exact keys: {${fieldList}}

Document text:
${pdfText.substring(0, 10000)}`
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
