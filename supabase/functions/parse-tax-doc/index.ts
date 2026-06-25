import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── MOCK DATA — returned when PARSE_TAX_DOC_MOCK=true ────────────────────────
// Simulates a real parse response so you can test the full UI flow
// without spending Anthropic credits. Set env var to disable.
const MOCK_RESPONSES: Record<string, Record<string, string|number|null>> = {
  'W-2': {
    employerName: 'ACME Corporation', employerEIN: '12-3456789',
    employerAddress: '123 Main St, New York, NY 10001',
    employeeName: 'John A. Smith', employeeSSN: '***-**-1234',
    employeeAddress: '456 Oak Ave, Miami, FL 33101',
    wages: 85000.00, federalWithheld: 12500.00, socialSecurityWages: 85000.00,
    socialSecurityWithheld: 5270.00, medicareWages: 85000.00, medicareWithheld: 1232.50,
    stateWages: 85000.00, stateWithheld: 4250.00, state: 'FL', taxYear: '2024',
    box12Code: 'D', box12Amount: 6500.00
  },
  '1099': {
    payerName: 'Client LLC', payerEIN: '98-7654321',
    payerAddress: '789 Business Blvd, Austin, TX 78701',
    recipientName: 'Jane B. Doe', recipientSSN: '***-**-5678',
    recipientAddress: '321 Pine St, Dallas, TX 75201',
    nonEmployeeCompensation: 45000.00, federalWithheld: 0, taxYear: '2024'
  },
  'default': {
    name: 'TEST TAXPAYER', ssn: '***-**-9999', taxYear: '2024',
    totalIncome: 75000.00, adjustedGrossIncome: 68000.00,
    taxableIncome: 55000.00, totalTax: 8200.00, note: '[MOCK DATA — test mode]'
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { base64, docType, fieldList } = await req.json()

    // ── MOCK MODE ─────────────────────────────────────────────────────────────
    // Set PARSE_TAX_DOC_MOCK=true in Supabase Edge Function secrets to enable.
    // Remove or set to false when Anthropic API credits are loaded.
    const mockMode = Deno.env.get('PARSE_TAX_DOC_MOCK') === 'true'
    if (mockMode) {
      const mockKey = Object.keys(MOCK_RESPONSES).find(k => docType?.toUpperCase().includes(k)) || 'default'
      const parsed = MOCK_RESPONSES[mockKey]
      console.log('[parse-tax-doc] MOCK MODE — returning test data for:', docType)
      return new Response(JSON.stringify({ parsed, mock: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── LIVE MODE ─────────────────────────────────────────────────────────────
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set — add credits at console.anthropic.com then add key to Supabase secrets')

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
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
