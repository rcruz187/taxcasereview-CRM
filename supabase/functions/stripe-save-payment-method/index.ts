// stripe-save-payment-method
// After the browser confirms a SetupIntent with Stripe.js (card or bank
// account collected securely, never touching our server), this looks up the
// resulting payment method server-side and saves only safe display info
// (brand/last4/expiry/cardholder name — never the actual card or account
// number, which Stripe never even sends us) as a new row in payment_methods.
// A lead or client can have several saved cards; the first one saved (or
// the one explicitly marked) becomes the default, mirrored onto the fast-
// path columns on leads/clients that the autopay batch run reads directly.
//
// Needs the STRIPE_SECRET_KEY secret set in Supabase → Edge Functions → Secrets.
// Deploy via: Supabase Dashboard → Edge Functions → Deploy new function
// (paste this file in as index.ts), name it "stripe-save-payment-method".

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''

async function stripeGet(path: string) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
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

    const { clientId, setupIntentId, recordType } = await req.json()
    if (!clientId || !setupIntentId) {
      return new Response(JSON.stringify({ error: 'Missing clientId or setupIntentId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const table = recordType === 'lead' ? 'leads' : 'clients'
    const normalizedType = recordType === 'lead' ? 'lead' : 'client'

    const setupIntent = await stripeGet(`setup_intents/${setupIntentId}`)
    const pmId = setupIntent.payment_method
    if (!pmId) throw new Error('SetupIntent has no attached payment method yet')

    const pm = await stripeGet(`payment_methods/${pmId}`)

    const isCard = pm.type === 'card'
    const display = isCard
      ? {
          type: 'card', brand: pm.card?.brand || 'card', last4: pm.card?.last4 || '',
          exp_month: pm.card?.exp_month || null, exp_year: pm.card?.exp_year || null,
        }
      : { type: 'us_bank_account', brand: pm.us_bank_account?.bank_name || 'Bank account', last4: pm.us_bank_account?.last4 || '', exp_month: null, exp_year: null }
    const cardholderName = pm.billing_details?.name || null

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // First saved card for this record becomes the default automatically.
    const { count: existingCount } = await supabase.from('payment_methods')
      .select('id', { count: 'exact', head: true })
      .eq('record_type', normalizedType).eq('record_id', clientId)
    const makeDefault = !existingCount || existingCount === 0

    const { data: inserted, error: insErr } = await supabase.from('payment_methods').insert([{
      record_type: normalizedType, record_id: clientId,
      stripe_payment_method_id: pmId,
      type: display.type, brand: display.brand, last4: display.last4,
      exp_month: display.exp_month, exp_year: display.exp_year,
      cardholder_name: cardholderName,
      is_default: makeDefault,
      tenant_id: intent.metadata?.tenant_id || '61a89aef-0e7e-4ea2-b222-44ab2024655a',
    }]).select().single()
    if (insErr) throw new Error(insErr.message)

    if (makeDefault) {
      await supabase.from(table).update({
        default_payment_method_id: pmId,
        payment_method_type: display.type,
        payment_method_brand: display.brand,
        payment_method_last4: display.last4,
      }).eq('id', clientId)
    }

    return new Response(JSON.stringify({ success: true, ...display, id: inserted.id, is_default: makeDefault }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('stripe-save-payment-method error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Save failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
