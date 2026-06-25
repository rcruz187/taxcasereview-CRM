// stripe-set-autopay
// Lets a CLIENT (never a lead — autopay is clients-only) turn monthly autopay
// on or off for themselves from the Client Portal. Writes only go through
// here with the service role key, never as a direct table update from the
// portal's anon key — same "never trust the browser alone" pattern as
// stripe-invoice-pay-confirm. This does NOT charge a card; it only saves the
// plan. Actual charging still happens via the existing stripe-charge
// function, run manually (or on a schedule, if one gets added later) from
// Payments → Autopay → Run Today's Batch.
//
// Needs no new secrets beyond what's already set for the other Stripe
// functions (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).
// Deploy via: Supabase Dashboard → Edge Functions → Deploy new function
// (paste this file in as index.ts), name it "stripe-set-autopay".
// Remember to turn OFF "Enforce JWT Verification" for this function —
// it's called from the unauthenticated Client Portal.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function defaultNextCharge() {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { clientId, enabled, amount, nextChargeDate } = await req.json()
    if (!clientId) {
      return new Response(JSON.stringify({ error: 'Missing clientId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Only ever look in `clients` — leads are intentionally never eligible
    // for autopay, so a lead's id will simply come back not found here.
    const { data: client, error: lookupErr } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .maybeSingle()
    if (lookupErr) throw new Error(lookupErr.message)
    if (!client) {
      return new Response(JSON.stringify({ error: 'Client not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Turning OFF: just flip the flag, leave amount/frequency/next-charge
    // alone so it's easy to turn back on without re-entering everything.
    if (enabled === false) {
      const { error: updErr } = await supabase.from('clients')
        .update({ autopay_enabled: false })
        .eq('id', clientId)
      if (updErr) throw new Error(updErr.message)
      return new Response(JSON.stringify({ success: true, enabled: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Turning ON: just needs a valid amount. Payment method can be added
    // later before the autopay batch runs — we don't require it here because
    // clients may have paid manually (no Stripe card on file) and still need
    // to set a plan schedule.
    const numAmount = parseFloat(amount)
    if (!numAmount || numAmount <= 0) {
      return new Response(JSON.stringify({ error: 'Enter a valid monthly amount' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const chargeDate = /^\d{4}-\d{2}-\d{2}$/.test(nextChargeDate || '') ? nextChargeDate : defaultNextCharge()

    const { error: updErr } = await supabase.from('clients').update({
      autopay_enabled: true,
      autopay_amount: numAmount,
      autopay_frequency: 'monthly',
      autopay_next_charge: chargeDate,
    }).eq('id', clientId)
    if (updErr) throw new Error(updErr.message)

    return new Response(JSON.stringify({ success: true, enabled: true, amount: numAmount, next_charge: chargeDate }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('stripe-set-autopay error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Save failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
