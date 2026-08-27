import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-portal-token',
}
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const OWNER_EMAILS = new Set(['info@romylabs.com','romy@romylabs.com','romy@taxrescrm.net','romy@taxcasereview.org'])
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type':'application/json' } })

async function stripeRequest(path: string, body: Record<string,string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method:'POST', headers:{ Authorization:`Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type':'application/x-www-form-urlencoded' }, body:new URLSearchParams(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || 'Stripe request failed')
  return data
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers:corsHeaders })
  try {
    if (!STRIPE_SECRET_KEY) return json({ error:'Payments are not configured' }, 503)
    const { invoiceId } = await req.json()
    if (!invoiceId) return json({ error:'Missing invoiceId' }, 400)

    const url = Deno.env.get('SUPABASE_URL') ?? ''
    const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(url, service)
    const { data: inv, error: invErr } = await supabase.from('invoices').select('*').eq('id', invoiceId).maybeSingle()
    if (invErr) throw invErr
    if (!inv) return json({ error:'Invoice not found' }, 404)

    const clientId = inv.client_id || null
    let authorized = false
    let staffEmail = ''
    const authHeader = req.headers.get('authorization') || ''
    if (authHeader && anon) {
      try {
        const uc = createClient(url, anon, { global:{ headers:{ Authorization:authHeader } } })
        const { data:{ user } } = await uc.auth.getUser()
        staffEmail = (user?.email || '').toLowerCase()
        if (user) {
          if (OWNER_EMAILS.has(staffEmail)) authorized = true
          else if (inv.tenant_id) {
            const { data: employee } = await supabase.from('employees').select('id').eq('tenant_id', inv.tenant_id).ilike('email', staffEmail).eq('status','Active').limit(1).maybeSingle()
            authorized = !!employee
          }
        }
      } catch {}
    }
    if (!authorized) {
      const token = req.headers.get('x-portal-token') || ''
      const { data: session } = token ? await supabase.from('portal_sessions').select('client_id,is_lead,expires_at').eq('token',token).maybeSingle() : { data:null }
      authorized = !!session && !session.is_lead && !!clientId && String(session.client_id)===String(clientId) && new Date(session.expires_at).getTime()>Date.now()
    }
    if (!authorized) return json({ error:'Unauthorized' }, 401)

    const subtotal = parseFloat(inv.total || inv.amount || 0)
    const taxRate = parseFloat(inv.taxRate || 0)
    const tax = subtotal * (taxRate / 100)
    const paid = parseFloat(inv.paid || 0)
    const balance = Math.round(((subtotal + tax) - paid) * 100) / 100
    if (balance <= 0) return json({ error:'This invoice has no balance due' }, 400)

    let client = null
    if (clientId) {
      const { data } = await supabase.from('clients').select('id,name,email,stripe_customer_id,tenant_id').eq('id', clientId).maybeSingle()
      client = data
    }
    if (!client && inv.clientName) {
      const q = supabase.from('clients').select('id,name,email,stripe_customer_id,tenant_id').eq('name', inv.clientName)
      if (inv.tenant_id) q.eq('tenant_id', inv.tenant_id)
      const { data } = await q.limit(1).maybeSingle()
      client = data
    }
    if (!client) return json({ error:'Invoice client not found' }, 409)

    let customerId = client.stripe_customer_id || null
    if (!customerId) {
      const customer = await stripeRequest('customers', {
        name: client.name || inv.clientName || '',
        ...(client.email ? { email:client.email } : {}),
        'metadata[client_id]':String(client.id),
        ...(inv.tenant_id ? { 'metadata[tenant_id]':String(inv.tenant_id) } : {}),
      })
      customerId = customer.id
      const { error } = await supabase.from('clients').update({ stripe_customer_id:customerId }).eq('id',client.id)
      if (error) throw error
    }

    const intent = await stripeRequest('payment_intents', {
      amount:String(Math.round(balance * 100)), currency:'usd', customer:customerId,
      'payment_method_types[0]':'card', 'payment_method_types[1]':'us_bank_account',
      description:`Invoice ${inv.invNum || ''} — ${inv.clientName || client.name || ''}`,
      'metadata[invoice_id]':String(invoiceId), 'metadata[client_id]':String(client.id),
      ...(inv.tenant_id ? { 'metadata[tenant_id]':String(inv.tenant_id) } : {}),
    })
    return json({ client_secret:intent.client_secret, payment_intent_id:intent.id, balance })
  } catch (err) {
    console.error('stripe-invoice-pay-intent error:', err)
    return json({ error:err?.message || 'Failed to create charge' }, 500)
  }
})
