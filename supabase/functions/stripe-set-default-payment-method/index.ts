// stripe-set-default-payment-method
// Marks one of a lead/client's saved cards as the default — the one autopay
// and one-click "Charge Now" use. Mirrors the choice onto the fast-path
// columns on leads/clients that the existing autopay batch run reads
// directly, so nothing else has to change to respect the new default.
//
// Needs the STRIPE_SECRET_KEY secret set in Supabase → Edge Functions → Secrets
// (not actually called here, but kept consistent with the other Stripe
// functions' required-secret check since it's part of the same feature set).
// Deploy via: Supabase Dashboard → Edge Functions → Deploy new function
// (paste this file in as index.ts), name it "stripe-set-default-payment-method".

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
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

    await supabase.from('payment_methods').update({ is_default: false }).eq('record_type', recordType).eq('record_id', recordId)
    await supabase.from('payment_methods').update({ is_default: true }).eq('id', paymentMethodRowId)

    await supabase.from(table).update({
      default_payment_method_id: target.stripe_payment_method_id,
      payment_method_type: target.type,
      payment_method_brand: target.brand,
      payment_method_last4: target.last4,
    }).eq('id', recordId)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('stripe-set-default-payment-method error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Failed to set default' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
