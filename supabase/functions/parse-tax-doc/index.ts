import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { base64, docType, fieldList } = await req.json()

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 }
            },
            {
              type: 'text',
              text: `You are a professional tax document parser. Extract ALL values from this ${docType} tax document.\n\nReturn ONLY a valid JSON object with these exact keys: {${fieldList}}\n\nRules:\n- Use null for any field not found in the document\n- For dollar amounts, return numbers only (no $ or commas) e.g. 52341.00\n- For EINs use format XX-XXXXXXX, for SSNs use XXX-XX-XXXX\n- For Box 12 codes, return just the letter code (e.g. "D")\n- Be precise — extract exact values as printed on the document\n- Return ONLY the JSON object, no explanation, no markdown`
            }
          ]
        }]
      })
    })

    const data = await response.json()
    const text = data.content?.[0]?.text || '{}'
    let parsed = {}
    try { parsed = JSON.parse(text.replace(/```json|```/g, '').trim()) } catch(_) {}

    return new Response(JSON.stringify({ parsed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
