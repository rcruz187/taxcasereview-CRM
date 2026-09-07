// stripe-remove-payment-method
// Detaches a saved card from the Stripe Customer and deletes its row here.
// If it was the default, promotes another saved card (if any) to default,
// or clears the fast-path columns on leads/clients if none remain.
//
// Needs the STRIPE_SECRET_KEY secret set in Supabase → Edge Functions → Secrets.
// Deploy via: Supabase Dashboard → Edge Functions → Deploy new function
// (paste this file in as index.ts), name it "stripe-remove-payment-method".

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''

async function stripePost(path: string) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
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

    const { recordType, recordId, paymentMethodRowId } = await req.json()
    if (!recordType || !recordId || !paymentMethodRowId) {
      return new Response(JSON.stringify({ error: 'Missing recordType, recordId, or paymentMethodRowId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const table = recordType === 'lead' ? 'leads' : 'clients'

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: target, error: findErr } = await supabase.from('payment_methods')
      .select('*').eq('id', paymentMethodRowId).eq('record_type', recordType).eq('record_id', recordId).maybeSingle()
    if (findErr || !target) throw new Error('Saved card not found')

    try {
      await stripePost(`payment_methods/${target.stripe_payment_method_id}/detach`)
    } catch (e) {
      // Already detached on Stripe's side is fine -- keep going and clean up our row regardless.
      console.error('stripe-remove-payment-method: detach warning:', e.message)
    }

    await supabase.from('payment_methods').delete().eq('id', paymentMethodRowId)

    if (target.is_default) {
      const { data: remaining } = await supabase.from('payment_methods')
        .select('*').eq('record_type', recordType).eq('record_id', recordId)
        .order('created_at', { ascending: true }).limit(1)
      const next = remaining?.[0]
      if (next) {
        await supabase.from('payment_methods').update({ is_default: true }).eq('id', next.id)
        await supabase.from(table).update({
          default_payment_method_id: next.stripe_payment_method_id,
          payment_method_type: next.type,
          payment_method_brand: next.brand,
          payment_method_last4: next.last4,
        }).eq('id', recordId)
      } else {
        await supabase.from(table).update({
          default_payment_method_id: null, payment_method_type: null,
          payment_method_brand: null, payment_method_last4: null,
        }).eq('id', recordId)
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('stripe-remove-payment-method error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Failed to remove card' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
