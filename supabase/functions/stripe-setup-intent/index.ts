// stripe-setup-intent
// Creates (or reuses) a Stripe Customer for a client, then creates a
// SetupIntent so the browser can securely collect a card or US bank account
// via Stripe.js — the actual card/bank numbers never touch this server or
// the Supabase database, only Stripe sees them.
//
// Needs the STRIPE_SECRET_KEY secret set in Supabase → Edge Functions → Secrets.
// Deploy via: Supabase Dashboard → Edge Functions → Deploy new function
// (paste this file in as index.ts), name it "stripe-setup-intent".

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

  try {
    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY is not set in Edge Function secrets' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { clientId, clientName, email } = await req.json()
    if (!clientId) {
      return new Response(JSON.stringify({ error: 'Missing clientId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: client } = await supabase.from('clients').select('stripe_customer_id').eq('id', clientId).maybeSingle()

    let customerId = client?.stripe_customer_id || null

    if (!customerId) {
      const customer = await stripeRequest('customers', {
        name: clientName || '',
        ...(email ? { email } : {}),
        'metadata[client_id]': String(clientId),
      })
      customerId = customer.id
      await supabase.from('clients').update({ stripe_customer_id: customerId }).eq('id', clientId)
    }

    // payment_method_types[] supports both card and ACH bank debits in one SetupIntent
    const setupIntent = await stripeRequest('setup_intents', {
      customer: customerId,
      'payment_method_types[0]': 'card',
      'payment_method_types[1]': 'us_bank_account',
    })

    return new Response(JSON.stringify({
      client_secret: setupIntent.client_secret,
      customer_id: customerId,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('stripe-setup-intent error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Setup failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
