import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// Called by the browser (IRSPortal.jsx) with a base64 IRS transcript PDF.
// Sends it to Claude and returns structured analysis: balances, penalties,
// interest, assessment dates, transaction history, wage & income docs,
// compliance flags, and a CSED estimate computed deterministically here
// (assessment date + 10 years) rather than trusting the model with date
// math. Same key-gating pattern as parse-tax-doc: clear error until
// ANTHROPIC_API_KEY is set.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { base64 } = await req.json()
    if (!base64) return json({ error: 'base64 PDF required' }, 400)

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return json({ error: 'ANTHROPIC_API_KEY not set — add credits at console.anthropic.com then add the key to Supabase secrets' }, 400)
    }

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: `You are an expert IRS transcript analyst for a tax resolution firm. Analyze this IRS transcript and return ONLY a valid JSON object with exactly these keys:

{
  "transcript_type": one of "Account Transcript" | "Return Transcript" | "Record of Account" | "Wage and Income" | "Verification of Non-Filing" | "Other",
  "tax_year": the tax period as a string e.g. "2021",
  "taxpayer_name": name as shown (may be masked),
  "filing_status": filing status if shown else null,
  "account_balance": total balance including accruals as a number, 0 if none, null if not an account-type transcript,
  "accrued_penalty": accrued penalty amount as a number or null,
  "accrued_interest": accrued interest amount as a number or null,
  "adjusted_gross_income": number or null,
  "taxable_income": number or null,
  "return_filed_date": date the return was filed (from TC 150 or as shown) as MM/DD/YYYY or null,
  "assessment_date": the TC 150 assessment date as MM/DD/YYYY or null,
  "transactions": array of { "code": "150", "date": "MM/DD/YYYY", "description": "...", "amount": number or null } for every transaction line on an account transcript (empty array otherwise),
  "wage_income": array of { "form": "W-2", "payer": "...", "amount": number or null } for wage & income transcripts (empty array otherwise),
  "flags": {
    "unfiled_return": true if this shows no return filed / substitute for return,
    "balance_due": true if any balance is owed,
    "installment_agreement": true if an installment agreement transaction (TC 971 AC 063 or similar) appears,
    "currently_not_collectible": true if CNC status (TC 530) appears,
    "lien_filed": true if a lien filing (TC 582 or lien indicator) appears,
    "levy_issued": true if levy activity appears
  }
}

Rules:
- Numbers only for amounts: no $ signs, no commas, negatives allowed as shown.
- Use null when a value genuinely is not on the document. Never invent values.
- Include EVERY transaction row from an account transcript, in document order.
- Return ONLY the JSON object. No explanation, no markdown fences.` },
          ],
        }],
      }),
    })

    const data = await resp.json()
    if (!resp.ok) {
      console.error('parse-transcript: Anthropic API error', resp.status, JSON.stringify(data))
      return json({ error: data?.error?.message || 'AI request failed' }, 502)
    }

    const text = (data?.content || []).filter((c: { type: string }) => c.type === 'text')
      .map((c: { text: string }) => c.text).join('\n')
    let analysis
    try {
      analysis = JSON.parse(text.replace(/```json|```/g, '').trim())
    } catch {
      console.error('parse-transcript: model returned non-JSON:', text.slice(0, 400))
      return json({ error: 'Could not parse the analysis — try re-uploading the PDF' }, 502)
    }

    // Deterministic CSED estimate: assessment date + 10 years. The model
    // never does date math — we do. Tolling events are NOT accounted for;
    // the UI labels this clearly as an estimate.
    analysis.csed_estimate = null
    if (analysis.assessment_date && /^\d{2}\/\d{2}\/\d{4}$/.test(analysis.assessment_date)) {
      const [m, d, y] = analysis.assessment_date.split('/').map(Number)
      analysis.csed_estimate = `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y + 10}`
    }

    return json({ ok: true, analysis })

  } catch (err) {
    console.error('parse-transcript error:', err)
    return json({ error: String(err) }, 500)
  }
})
