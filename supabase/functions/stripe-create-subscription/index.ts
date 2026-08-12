// stripe-create-subscription
// Creates a Stripe Subscription for 2nd Trade installment plans.
// If client has a saved card → creates subscription immediately.
// If no card on file → returns a Checkout Session URL to collect card.
// JWT: OFF required in Supabase dashboard after deploy.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''

async function stripePost(path: string, body: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || 'Stripe error')
  return data
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY not set' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { clientId, clientName, email, totalAmount, months, description } = await req.json()
    if (!clientId || !totalAmount || !months) {
      return new Response(JSON.stringify({ error: 'Missing clientId, totalAmount, or months' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: client } = await supabase
      .from('clients')
      .select('stripe_customer_id, stripe_default_pm')
      .eq('id', clientId)
      .maybeSingle()

    let customerId = client?.stripe_customer_id || null
    if (!customerId) {
      const customer = await stripePost('customers', {
        name: clientName || '',
        ...(email ? { email } : {}),
        'metadata[client_id]': String(clientId),
      })
      customerId = customer.id
      await supabase.from('clients').update({ stripe_customer_id: customerId }).eq('id', clientId)
    }

    const monthlyAmountCents = Math.round((parseFloat(totalAmount) / parseInt(months)) * 100)
    const label = description || `Tax Resolution Services — ${months}-Month Plan`

    const price = await stripePost('prices', {
      unit_amount: String(monthlyAmountCents),
      currency: 'usd',
      'recurring[interval]': 'month',
      'recurring[interval_count]': '1',
      'product_data[name]': label,
    })

    const hasSavedCard = !!client?.stripe_default_pm

    if (hasSavedCard) {
      const subscription = await stripePost('subscriptions', {
        customer: customerId,
        'items[0][price]': price.id,
        default_payment_method: client!.stripe_default_pm,
        'metadata[client_id]': String(clientId),
        'metadata[months]': String(months),
        'metadata[total_amount]': String(totalAmount),
        'metadata[trade_type]': '2nd Trade',
        collection_method: 'charge_automatically',
      })

      return new Response(JSON.stringify({
        mode: 'subscription',
        subscription_id: subscription.id,
        monthly_amount: monthlyAmountCents / 100,
        months: parseInt(months),
        status: subscription.status,
        current_period_start: subscription.current_period_start,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    } else {
      // No card on file — send client to Checkout to collect card + start subscription
      const session = await stripePost('checkout/sessions', {
        mode: 'subscription',
        customer: customerId,
        'line_items[0][price]': price.id,
        'line_items[0][quantity]': '1',
        'subscription_data[metadata][client_id]': String(clientId),
        'subscription_data[metadata][months]': String(months),
        'subscription_data[metadata][total_amount]': String(totalAmount),
        'subscription_data[metadata][trade_type]': '2nd Trade',
        success_url: 'https://taxrescrm.app/',
        cancel_url: 'https://taxrescrm.app/',
      })

      return new Response(JSON.stringify({
        mode: 'checkout',
        checkout_url: session.url,
        monthly_amount: monthlyAmountCents / 100,
        months: parseInt(months),
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

  } catch (err) {
    console.error('stripe-create-subscription error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Subscription creation failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
