// stripe-create-checkout-session
// Creates a Stripe Checkout Session — a hosted payment page that a lead or
// client fills in themselves (card never touches our servers, even less of
// our code in the loop than the embedded PaymentElement flow). Used by the
// "Send Payment Link" button on the Leads/Clients Payments tab.
//
// Also saves the card for future use (setup_future_usage: 'off_session'),
// so a paid Checkout link leaves a reusable payment method on file too —
// the actual save happens in stripe-checkout-webhook once Stripe confirms
// the session completed.
//
// Needs these Edge Function secrets:
//   STRIPE_SECRET_KEY, STRIPE_PRICE_NAME, STRIPE_SUCCESS_URL, STRIPE_CANCEL_URL
// Deploy via: Supabase Dashboard → Edge Functions → Deploy new function
// (paste this file in as index.ts), name it "stripe-create-checkout-session".

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STRIPE_SECRET_KEY  = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const STRIPE_PRICE_NAME  = Deno.env.get('STRIPE_PRICE_NAME') ?? 'Tax Case Review'
const STRIPE_SUCCESS_URL = Deno.env.get('STRIPE_SUCCESS_URL') ?? ''
const STRIPE_CANCEL_URL  = Deno.env.get('STRIPE_CANCEL_URL') ?? ''

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

  try {
    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY is not set in Edge Function secrets' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    if (!STRIPE_SUCCESS_URL || !STRIPE_CANCEL_URL) {
      return new Response(JSON.stringify({ error: 'STRIPE_SUCCESS_URL / STRIPE_CANCEL_URL not set in Edge Function secrets' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { recordType, recordId, name, email, amount, description } = await req.json()
    if (!recordId || !recordType || !amount) {
      return new Response(JSON.stringify({ error: 'Missing recordId, recordType, or amount' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const table = recordType === 'lead' ? 'leads' : 'clients'

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: record } = await supabase.from(table).select('stripe_customer_id').eq('id', recordId).maybeSingle()
    let customerId = record?.stripe_customer_id || null

    if (!customerId) {
      const customer = await stripeRequest('customers', {
        name: name || '',
        ...(email ? { email } : {}),
        [`metadata[${recordType === 'lead' ? 'lead_id' : 'client_id'}]`]: String(recordId),
      })
      customerId = customer.id
      await supabase.from(table).update({ stripe_customer_id: customerId }).eq('id', recordId)
    }

    const amountCents = Math.round(parseFloat(amount) * 100)
    if (!amountCents || amountCents <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid amount' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const session = await stripeRequest('checkout/sessions', {
      mode: 'payment',
      customer: customerId,
      'payment_method_types[0]': 'card',
      'payment_method_types[1]': 'us_bank_account',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(amountCents),
      'line_items[0][price_data][product_data][name]': description || STRIPE_PRICE_NAME,
      'payment_intent_data[setup_future_usage]': 'off_session',
      [`metadata[record_type]`]: recordType,
      [`metadata[record_id]`]: String(recordId),
      success_url: STRIPE_SUCCESS_URL,
      cancel_url: STRIPE_CANCEL_URL,
    })

    await supabase.from(table).update({
      stripe_checkout_url: session.url,
      stripe_checkout_sent_at: new Date().toISOString(),
    }).eq('id', recordId)

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('stripe-create-checkout-session error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Checkout session creation failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
