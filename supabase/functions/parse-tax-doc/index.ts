import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { pdfText, base64Pages, docType, fieldList } = await req.json()

    const GROQ_KEY = Deno.env.get('GROQ_API_KEY')
    if (!GROQ_KEY) throw new Error('GROQ_API_KEY not set')

    const hasText = pdfText && pdfText.trim().length > 30
    const hasImages = base64Pages && base64Pages.length > 0

    if (!hasText && !hasImages) {
      return new Response(JSON.stringify({ parsed: {}, error: 'No content extracted from PDF' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const systemPrompt = 'You are a professional tax document parser specializing in IRS forms. Extract values precisely and return ONLY valid JSON. No explanation, no markdown, no backticks — just the raw JSON object.'

    const userPrompt = `You are parsing a ${docType} tax document. This PDF may contain multiple copies of the same form (e.g. multiple W-2s from different employers).

IMPORTANT RULES:
- If there are multiple W-2s from DIFFERENT employers, ADD the wages together and ADD the withholding together
- For employer name/EIN: use the FIRST employer listed
- For employee name/SSN: use the employee's info (not the employer)
- For dollar amounts: numbers only, no $ or commas. Example: 53637.09
- For EINs: format XX-XXXXXXX
- For SSNs: format XXX-XX-XXXX  
- Use null for any field not in the document
- Return ONLY a valid JSON object with these exact keys: {${fieldList}}`

    let messages

    if (hasImages) {
      // Vision mode — scanned/image PDF: send page images to Groq vision model
      const imageContents = base64Pages.slice(0, 4).map((b64: string) => ({
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${b64}` }
      }))
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: [...imageContents, { type: 'text', text: userPrompt }] }
      ]
    } else {
      // Text mode — text-based PDF
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `${userPrompt}\n\nDocument text:\n${pdfText.substring(0, 10000)}` }
      ]
    }

    const model = hasImages ? 'meta-llama/llama-4-maverick-17b-128e-instruct' : 'llama-3.3-70b-versatile'

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        temperature: 0,
        messages
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Groq error:', response.status, errText)
      return new Response(JSON.stringify({ error: `Groq error ${response.status}: ${errText}`, parsed: {} }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
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
