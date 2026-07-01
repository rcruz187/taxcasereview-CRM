// stripe-invoice-pay-confirm
// After the browser confirms payment with Stripe.js, this verifies the
// PaymentIntent's real status and amount directly with Stripe (never trust
// the browser alone for something this important), then:
//   1. Updates the invoice's paid amount/status
//   2. Logs a row in payments, linked to the invoice
//   3. Posts a client-visible note ("Payment of $X received...")
//
// Needs the STRIPE_SECRET_KEY secret set in Supabase → Edge Functions → Secrets.
// Deploy via: Supabase Dashboard → Edge Functions → Deploy new function
// (paste this file in as index.ts), name it "stripe-invoice-pay-confirm".

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

    const { paymentIntentId, invoiceId } = await req.json()
    if (!paymentIntentId || !invoiceId) {
      return new Response(JSON.stringify({ error: 'Missing paymentIntentId or invoiceId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const intent = await stripeGet(`payment_intents/${paymentIntentId}?expand[]=payment_method`)
    const ok = intent.status === 'succeeded' || intent.status === 'processing'
    if (!ok) {
      return new Response(JSON.stringify({ error: `Charge ${intent.status}`, status: intent.status }), {
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Trust Stripe's own amount, not anything the browser sent.
    const amountPaid = (intent.amount_received || intent.amount || 0) / 100
    const pm = intent.payment_method
    const method = pm?.type === 'us_bank_account' ? 'ACH / Bank Transfer' : 'Credit Card'

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
    const prevPaid = parseFloat(inv.paid || 0)
    const newPaid = prevPaid + amountPaid
    const newBalance = Math.round(((subtotal + tax) - newPaid) * 100) / 100
    const newStatus = newBalance <= 0 ? 'Paid' : newPaid > 0 ? 'Partial' : 'Unpaid'

    await supabase.from('invoices').update({
      paid: String(newPaid), status: newStatus, updated_at: new Date().toISOString()
    }).eq('id', invoiceId)

    await supabase.from('payments').insert([{
      clientName: inv.clientName, amount: amountPaid, method,
      status: intent.status === 'succeeded' ? 'Cleared' : 'Pending',
      date: new Date().toISOString().slice(0, 10),
      notes: `Online portal payment — Invoice #${inv.invNum || ''}`,
      invoiceId, invNum: inv.invNum,
      stripe_payment_intent_id: intent.id,
      source: 'client_portal',
      created_at: new Date().toISOString(),
    ,
      tenant_id: '61a89aef-0e7e-4ea2-b222-44ab2024655a'}])

    await supabase.from('client_notes').insert([{
      client_name: inv.clientName,
      content: `💳 Payment of $${amountPaid.toLocaleString('en-US',{minimumFractionDigits:2})} received online for Invoice #${inv.invNum || ''}. New balance: $${Math.max(newBalance,0).toLocaleString('en-US',{minimumFractionDigits:2})}.`,
      visible_to_client: true,
      created_at: new Date().toISOString(),
    ,
      tenant_id: '61a89aef-0e7e-4ea2-b222-44ab2024655a'}])

    return new Response(JSON.stringify({ success: true, status: intent.status, amountPaid, newBalance, newStatus }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('stripe-invoice-pay-confirm error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Confirmation failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
