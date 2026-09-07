import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-portal-token',
}
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type':'application/json' } }) }
async function stripeGet(path: string) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } })
  const data = await res.json(); if (!res.ok) throw new Error(data?.error?.message || 'Stripe request failed'); return data
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    if (!STRIPE_SECRET_KEY) return json({ error:'STRIPE_SECRET_KEY is not set in Edge Function secrets' }, 422)
    const { clientId, setupIntentId, paymentMethodId, recordType, setAsDefault } = await req.json()
    if (!clientId || (!setupIntentId && !paymentMethodId)) return json({ error:'Missing clientId or payment method reference' }, 400)

    const url = Deno.env.get('SUPABASE_URL') ?? ''
    const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(url, service)
    const table = recordType === 'lead' ? 'leads' : 'clients'
    const normalizedType = recordType === 'lead' ? 'lead' : 'client'
    const { data: record } = await supabase.from(table).select('id,tenant_id,stripe_customer_id').eq('id', clientId).maybeSingle()
    if (!record) return json({ error:'Record not found' }, 404)

    let authorized = false
    const authHeader = req.headers.get('authorization') || ''
    if (authHeader && anon) {
      try {
        const uc = createClient(url, anon, { global:{ headers:{ Authorization:authHeader } } })
        const { data:{ user } } = await uc.auth.getUser(); authorized = !!user
      } catch {}
    }
    if (!authorized) {
      if (normalizedType !== 'client') return json({ error:'Unauthorized' }, 401)
      const token = req.headers.get('x-portal-token') || ''
      const { data: session } = token ? await supabase.from('portal_sessions').select('client_id,is_lead,expires_at').eq('token', token).maybeSingle() : { data:null }
      authorized = !!session && !session.is_lead && String(session.client_id) === String(clientId) && new Date(session.expires_at).getTime() > Date.now()
    }
    if (!authorized) return json({ error:'Unauthorized' }, 401)

    let pmId = paymentMethodId || null
    if (setupIntentId) {
      const intent = await stripeGet(`setup_intents/${encodeURIComponent(setupIntentId)}`)
      if (record.stripe_customer_id && intent.customer && String(intent.customer) !== String(record.stripe_customer_id)) return json({ error:'Payment method does not belong to this client' }, 403)
      pmId = intent.payment_method || pmId
    }
    if (!pmId) return json({ error:'No payment method attached' }, 400)
    const pm = await stripeGet(`payment_methods/${encodeURIComponent(pmId)}`)
    if (record.stripe_customer_id && pm.customer && String(pm.customer) !== String(record.stripe_customer_id)) return json({ error:'Payment method does not belong to this client' }, 403)

    const isCard = pm.type === 'card'
    const display = isCard
      ? { type:'card', brand:pm.card?.brand || 'card', last4:pm.card?.last4 || '', exp_month:pm.card?.exp_month || null, exp_year:pm.card?.exp_year || null }
      : { type:'us_bank_account', brand:pm.us_bank_account?.bank_name || 'Bank account', last4:pm.us_bank_account?.last4 || '', exp_month:null, exp_year:null }

    const { count } = await supabase.from('payment_methods').select('id', { count:'exact', head:true }).eq('record_type', normalizedType).eq('record_id', clientId)
    const makeDefault = setAsDefault === true || !count
    if (makeDefault) await supabase.from('payment_methods').update({ is_default:false }).eq('record_type', normalizedType).eq('record_id', clientId)

    const { data: inserted, error: insErr } = await supabase.from('payment_methods').insert([{
      record_type:normalizedType, record_id:clientId, stripe_payment_method_id:pmId,
      type:display.type, brand:display.brand, last4:display.last4, exp_month:display.exp_month, exp_year:display.exp_year,
      cardholder_name:pm.billing_details?.name || null, is_default:makeDefault, tenant_id:record.tenant_id,
    }]).select().single()
    if (insErr) throw new Error(insErr.message)

    if (makeDefault) {
      await supabase.from(table).update({
        default_payment_method_id:pmId, stripe_default_pm:pmId,
        payment_method_type:display.type, payment_method_brand:display.brand, payment_method_last4:display.last4,
      }).eq('id', clientId)
    }
    return json({ success:true, ...display, id:inserted.id, is_default:makeDefault })
  } catch (err) {
    console.error('stripe-save-payment-method error:', err)
    return json({ error:err.message || 'Save failed' }, 500)
  }
})
