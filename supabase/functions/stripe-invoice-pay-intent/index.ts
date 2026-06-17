// stripe-invoice-pay-intent
// Powers the "Pay Invoice" button in the public Client Portal. Creates a
// one-time PaymentIntent for whatever a specific invoice's real balance is.
// The balance is computed here, server-side, from the invoices table —
// never trust a dollar amount sent from the browser, since this endpoint
// is reachable by anyone with a portal link (the portal itself still
// requires the client to pass the email + last-4-SSN check first).
//
// Reuses the client's stripe_customer_id if one already exists (e.g. from
// autopay setup), otherwise creates one and saves it back to the client.
//
// Needs the STRIPE_SECRET_KEY secret set in Supabase → Edge Functions → Secrets.
// Deploy via: Supabase Dashboard → Edge Functions → Deploy new function
// (paste this file in as index.ts), name it "stripe-invoice-pay-intent".

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

    const { invoiceId } = await req.json()
    if (!invoiceId) {
      return new Response(JSON.stringify({ error: 'Missing invoiceId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: inv } = await supabase.from('invoices').select('*').eq('id', invoiceId).maybeSingle()
    if (!inv) {
      return new Response(JSON.stringify({ error: 'Invoice not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const subtotal = parseFloat(inv.total || 0)
    const taxRate = parseFloat(inv.taxRate || 0)
    const tax = subtotal * (taxRate / 100)
    const paid = parseFloat(inv.paid || 0)
    const balance = Math.round(((subtotal + tax) - paid) * 100) / 100

    if (balance <= 0) {
      return new Response(JSON.stringify({ error: 'This invoice has no balance due' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: client } = await supabase.from('clients').select('id,name,email,stripe_customer_id').eq('name', inv.clientName).maybeSingle()
    let customerId = client?.stripe_customer_id || null

    if (!customerId && client) {
      const customer = await stripeRequest('customers', {
        name: client.name || '',
        ...(client.email ? { email: client.email } : {}),
        'metadata[client_id]': String(client.id),
      })
      customerId = customer.id
      await supabase.from('clients').update({ stripe_customer_id: customerId }).eq('id', client.id)
    }

    const intent = await stripeRequest('payment_intents', {
      amount: String(Math.round(balance * 100)),
      currency: 'usd',
      ...(customerId ? { customer: customerId } : {}),
      'payment_method_types[0]': 'card',
      'payment_method_types[1]': 'us_bank_account',
      description: `Invoice ${inv.invNum || ''} — ${inv.clientName || ''}`,
      'metadata[invoice_id]': String(invoiceId),
    })

    return new Response(JSON.stringify({
      client_secret: intent.client_secret,
      payment_intent_id: intent.id,
      balance,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('stripe-invoice-pay-intent error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Failed to create charge' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
