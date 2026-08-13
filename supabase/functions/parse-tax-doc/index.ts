import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { base64, docType, fieldList } = await req.json()

    const GROQ_KEY = Deno.env.get('GROQ_API_KEY')
    if (!GROQ_KEY) throw new Error('GROQ_API_KEY not set')

    // Convert base64 PDF to text via Groq vision
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are a professional tax document parser. Extract ALL values from this ${docType} tax document encoded as base64 PDF below.\n\nReturn ONLY a valid JSON object with these exact keys: {${fieldList}}\n\nRules:\n- Use null for any field not found\n- For dollar amounts, return numbers only (no $ or commas) e.g. 52341.00\n- For EINs use format XX-XXXXXXX, for SSNs use XXX-XX-XXXX\n- Return ONLY the JSON object, no explanation, no markdown\n\nDocument (base64 PDF): ${base64.substring(0, 8000)}`
            }
          ]
        }]
      })
    })

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content || '{}'
    let parsed = {}
    try { parsed = JSON.parse(text.replace(/```json|```/g, '').trim()) } catch(_) {
      // Try to extract JSON from response
      const match = text.match(/\{[\s\S]*\}/)
      if (match) { try { parsed = JSON.parse(match[0]) } catch(_) {} }
    }

    return new Response(JSON.stringify({ parsed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
