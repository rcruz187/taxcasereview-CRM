import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-portal-token',
}
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers:{ ...corsHeaders, 'Content-Type':'application/json' } }) }
async function stripeRequest(path:string, body:Record<string,string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { method:'POST', headers:{ Authorization:`Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type':'application/x-www-form-urlencoded' }, body:new URLSearchParams(body) })
  const data = await res.json(); if (!res.ok) throw new Error(data?.error?.message || 'Stripe request failed'); return data
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers:corsHeaders })
  try {
    if (!STRIPE_SECRET_KEY) return json({ error:'STRIPE_SECRET_KEY is not set in Edge Function secrets' }, 422)
    const { clientId, clientName, email, recordType } = await req.json()
    if (!clientId) return json({ error:'Missing clientId' }, 400)

    const url = Deno.env.get('SUPABASE_URL') ?? ''
    const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(url, service)
    const table = recordType === 'lead' ? 'leads' : 'clients'
    const normalizedType = recordType === 'lead' ? 'lead' : 'client'
    const { data: record } = await supabase.from(table).select('id,tenant_id,stripe_customer_id,name,email').eq('id', clientId).maybeSingle()
    if (!record) return json({ error:'Record not found' }, 404)

    let authorized = false
    const authHeader = req.headers.get('authorization') || ''
    if (authHeader && anon) {
      try { const uc=createClient(url,anon,{global:{headers:{Authorization:authHeader}}}); const {data:{user}}=await uc.auth.getUser(); authorized=!!user } catch {}
    }
    if (!authorized) {
      if (normalizedType !== 'client') return json({ error:'Unauthorized' }, 401)
      const token = req.headers.get('x-portal-token') || ''
      const { data: session } = token ? await supabase.from('portal_sessions').select('client_id,is_lead,expires_at').eq('token',token).maybeSingle() : { data:null }
      authorized = !!session && !session.is_lead && String(session.client_id)===String(clientId) && new Date(session.expires_at).getTime()>Date.now()
    }
    if (!authorized) return json({ error:'Unauthorized' }, 401)

    let customerId = record.stripe_customer_id || null
    if (!customerId) {
      const customer = await stripeRequest('customers', {
        name: record.name || clientName || '',
        ...(record.email || email ? { email:String(record.email || email) } : {}),
        [`metadata[${normalizedType}_id]`]:String(clientId),
        ...(record.tenant_id ? { 'metadata[tenant_id]':String(record.tenant_id) } : {}),
      })
      customerId = customer.id
      await supabase.from(table).update({ stripe_customer_id:customerId }).eq('id',clientId)
    }
    const setupIntent = await stripeRequest('setup_intents', {
      customer:customerId,
      'payment_method_types[0]':'card',
      'payment_method_types[1]':'us_bank_account',
      [`metadata[${normalizedType}_id]`]:String(clientId),
      ...(record.tenant_id ? { 'metadata[tenant_id]':String(record.tenant_id) } : {}),
    })
    return json({ client_secret:setupIntent.client_secret, setup_intent_id:setupIntent.id, customer_id:customerId })
  } catch (err) {
    console.error('stripe-setup-intent error:', err)
    return json({ error:err.message || 'Setup failed' }, 500)
  }
})
