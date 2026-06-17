// stripe-charge
// Charges a client's saved Stripe payment method off-session — used for both
// a manual "Charge Now" click and each step of the autopay batch run.
// Logs the result into the payments table and updates the client's autopay
// status so failures are visible, not silent.
//
// Needs the STRIPE_SECRET_KEY secret set in Supabase → Edge Functions → Secrets.
// Deploy via: Supabase Dashboard → Edge Functions → Deploy new function
// (paste this file in as index.ts), name it "stripe-charge".

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''

async function stripeRequest(path: string, body: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || 'Stripe request failed')
  return data
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  let clientId: string | null = null

  try {
    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY is not set in Edge Function secrets' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body = await req.json()
    clientId = body.clientId
    const { amount, description, source } = body // amount in dollars, source: 'manual' | 'autopay'
    if (!clientId || !amount) {
      return new Response(JSON.stringify({ error: 'Missing clientId or amount' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: client } = await supabase.from('clients')
      .select('name, stripe_customer_id, default_payment_method_id, payment_method_type')
      .eq('id', clientId).maybeSingle()

    if (!client?.stripe_customer_id || !client?.default_payment_method_id) {
      return new Response(JSON.stringify({ error: 'No saved payment method on file for this client' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const intent = await stripeRequest('payment_intents', {
      amount: String(Math.round(parseFloat(amount) * 100)),
      currency: 'usd',
      customer: client.stripe_customer_id,
      payment_method: client.default_payment_method_id,
      off_session: 'true',
      confirm: 'true',
      description: description || `Tax Case Review payment — ${client.name}`,
    })

    // Cards settle near-instantly ('succeeded'); ACH bank debits take days
    // and come back 'processing' first — both are a real, non-failed charge.
    const ok = intent.status === 'succeeded' || intent.status === 'processing'

    await supabase.from('payments').insert([{
      clientName: client.name, amount, method: client.payment_method_type === 'us_bank_account' ? 'ACH / Bank Transfer' : 'Credit Card',
      status: intent.status === 'succeeded' ? 'Cleared' : intent.status === 'processing' ? 'Pending' : 'Failed',
      date: new Date().toISOString().slice(0, 10),
      notes: description || null,
      stripe_payment_intent_id: intent.id,
      source: source || 'manual',
      created_at: new Date().toISOString(),
    }])

    await supabase.from('clients').update({
      autopay_last_result: ok ? 'succeeded' : 'failed',
      autopay_last_charged_at: new Date().toISOString(),
    }).eq('id', clientId)

    if (!ok) {
      return new Response(JSON.stringify({ error: `Charge ${intent.status}`, status: intent.status }), {
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ success: true, status: intent.status, payment_intent_id: intent.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('stripe-charge error:', err)
    if (clientId) {
      await supabase.from('clients').update({
        autopay_last_result: 'failed', autopay_last_charged_at: new Date().toISOString(),
      }).eq('id', clientId)
    }
    return new Response(JSON.stringify({ error: err.message || 'Charge failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
