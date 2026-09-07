import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-portal-token',
}
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const OWNER_EMAILS = new Set(['info@romylabs.com','romy@romylabs.com','romy@taxrescrm.net','romy@taxcasereview.org'])
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers:{ ...corsHeaders, 'Content-Type':'application/json' } })

async function stripeGet(path:string) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { headers:{ Authorization:`Bearer ${STRIPE_SECRET_KEY}` } })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || 'Stripe request failed')
  return data
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers:corsHeaders })
  try {
    if (!STRIPE_SECRET_KEY) return json({ error:'Payments are not configured' }, 503)
    const { paymentIntentId, invoiceId } = await req.json()
    if (!paymentIntentId || !invoiceId) return json({ error:'Missing paymentIntentId or invoiceId' }, 400)

    const url = Deno.env.get('SUPABASE_URL') ?? ''
    const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(url, service)
    const { data: inv, error: invErr } = await supabase.from('invoices').select('*').eq('id', invoiceId).maybeSingle()
    if (invErr) throw invErr
    if (!inv) return json({ error:'Invoice not found' }, 404)

    let authorized = false
    const authHeader = req.headers.get('authorization') || ''
    if (authHeader && anon) {
      try {
        const uc = createClient(url, anon, { global:{ headers:{ Authorization:authHeader } } })
        const { data:{ user } } = await uc.auth.getUser()
        const email = (user?.email || '').toLowerCase()
        if (user) {
          if (OWNER_EMAILS.has(email)) authorized = true
          else if (inv.tenant_id) {
            const { data: employee } = await supabase.from('employees').select('id').eq('tenant_id',inv.tenant_id).ilike('email',email).eq('status','Active').limit(1).maybeSingle()
            authorized = !!employee
          }
        }
      } catch {}
    }
    if (!authorized) {
      const token = req.headers.get('x-portal-token') || ''
      const { data: session } = token ? await supabase.from('portal_sessions').select('client_id,is_lead,expires_at').eq('token',token).maybeSingle() : { data:null }
      authorized = !!session && !session.is_lead && !!inv.client_id && String(session.client_id)===String(inv.client_id) && new Date(session.expires_at).getTime()>Date.now()
    }
    if (!authorized) return json({ error:'Unauthorized' }, 401)

    const intent = await stripeGet(`payment_intents/${encodeURIComponent(paymentIntentId)}?expand[]=payment_method`)
    if (String(intent.metadata?.invoice_id || '') !== String(invoiceId)) return json({ error:'Payment does not belong to this invoice' }, 409)
    if (inv.client_id && intent.metadata?.client_id && String(intent.metadata.client_id) !== String(inv.client_id)) return json({ error:'Payment client mismatch' }, 409)
    if (inv.tenant_id && intent.metadata?.tenant_id && String(intent.metadata.tenant_id) !== String(inv.tenant_id)) return json({ error:'Payment tenant mismatch' }, 409)

    if (intent.status === 'processing') {
      return json({ success:true, status:'processing', pending:true, message:'Bank payment is processing. The invoice will be credited after Stripe confirms it.' })
    }
    if (intent.status !== 'succeeded') return json({ error:`Charge ${intent.status}`, status:intent.status }, 402)

    const { data: existing } = await supabase.from('payments').select('id,amount,status').eq('stripe_payment_intent_id',intent.id).limit(1).maybeSingle()
    const subtotal = parseFloat(inv.total || inv.amount || 0)
    const tax = subtotal * (parseFloat(inv.taxRate || 0) / 100)
    const currentPaid = parseFloat(inv.paid || 0)
    if (existing) {
      const balance = Math.round(((subtotal + tax) - currentPaid) * 100) / 100
      return json({ success:true, idempotent:true, status:intent.status, amountPaid:parseFloat(existing.amount || 0), newBalance:Math.max(balance,0), newStatus:inv.status })
    }

    const amountPaid = (intent.amount_received || intent.amount || 0) / 100
    if (!(amountPaid > 0)) return json({ error:'Stripe reported a zero payment amount' }, 409)
    const pm = intent.payment_method
    const method = pm?.type === 'us_bank_account' ? 'ACH / Bank Transfer' : 'Credit Card'
    const newPaid = Math.round((currentPaid + amountPaid) * 100) / 100
    const newBalance = Math.round(((subtotal + tax) - newPaid) * 100) / 100
    const newStatus = newBalance <= 0 ? 'Paid' : 'Partial'

    const { error: payErr } = await supabase.from('payments').insert({
      clientName: inv.clientName || inv.clientname || '',
      client_id: inv.client_id || null,
      amount:String(amountPaid), method, status:'Cleared', date:new Date().toISOString().slice(0,10),
      notes:`Online portal payment — Invoice #${inv.invNum || ''}`,
      invoiceid:String(invoiceId), invNum:inv.invNum || null,
      stripe_payment_intent_id:intent.id, source:'client_portal',
      tenant_id:inv.tenant_id || null,
    })
    if (payErr) {
      if (payErr.code === '23505') return json({ success:true, idempotent:true, status:intent.status })
      throw payErr
    }

    const { error: updErr } = await supabase.from('invoices').update({ paid:String(newPaid), balance:String(Math.max(newBalance,0)), status:newStatus }).eq('id',invoiceId)
    if (updErr) throw updErr

    if (inv.client_id || inv.clientName || inv.clientname) {
      const { error: noteErr } = await supabase.from('client_notes').insert({
        client_id: inv.client_id || null,
        clientname: inv.clientName || inv.clientname || '',
        text:`💳 Payment of $${amountPaid.toLocaleString('en-US',{minimumFractionDigits:2})} received online for Invoice #${inv.invNum || ''}. New balance: $${Math.max(newBalance,0).toLocaleString('en-US',{minimumFractionDigits:2})}.`,
        author:'Payment System', type:'Payment', note_type:'Payment', visible_to_client:true,
        tenant_id:inv.tenant_id || null,
      })
      if (noteErr) console.error('[stripe-invoice-pay-confirm] note insert failed:', noteErr.message)
    }

    return json({ success:true, status:intent.status, amountPaid, newBalance:Math.max(newBalance,0), newStatus })
  } catch (err) {
    console.error('stripe-invoice-pay-confirm error:', err)
    return json({ error:err?.message || 'Confirmation failed' }, 500)
  }
})
