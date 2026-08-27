import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

async function enforce(url: string, secret: string, accountId: string, action: 'suspend'|'restore') {
  const res = await fetch(`${url}/functions/v1/romylabs-billing-enforce`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-entitlement-secret': secret },
    body: JSON.stringify({ account_id: accountId, action }),
  })
  const payload = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
  if (!res.ok || payload?.ok !== true) throw new Error(payload?.error || `Entitlement enforcement failed (${res.status})`)
  return payload
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const expected = Deno.env.get('ROMYLABS_BILLING_WEBHOOK_SECRET')
  if (!expected || req.headers.get('x-billing-secret') !== expected) return json({ error: 'Unauthorized' }, 401)

  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  const { provider, provider_payment_id, provider_invoice_id, invoice_id, amount_cents, status = 'succeeded', failure_reason } = body || {}
  if (!provider || !provider_payment_id || (!invoice_id && !provider_invoice_id) || !Number.isInteger(amount_cents) || amount_cents <= 0) {
    return json({ error: 'provider, provider_payment_id, invoice reference, and positive integer amount_cents are required' }, 400)
  }
  if (!['pending','succeeded','failed','refunded','partially_refunded'].includes(status)) return json({ error: 'Invalid status' }, 400)

  const url = Deno.env.get('SUPABASE_URL')!
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  let query = db.from('romylabs_invoices').select('*')
  query = invoice_id ? query.eq('id', invoice_id) : query.eq('provider_invoice_id', provider_invoice_id)
  const { data: invoice, error: invoiceError } = await query.maybeSingle()
  if (invoiceError) return json({ error: invoiceError.message }, 500)
  if (!invoice) return json({ error: 'Invoice not found' }, 404)

  const { data: existing } = await db.from('romylabs_subscription_payments').select('*').eq('provider', provider).eq('provider_payment_id', provider_payment_id).maybeSingle()
  if (existing) return json({ ok: true, duplicate: true, payment_id: existing.id, invoice_id: invoice.id })

  const paidAt = status === 'succeeded' ? new Date().toISOString() : null
  const { data: payment, error: paymentError } = await db.from('romylabs_subscription_payments').insert({
    invoice_id: invoice.id, account_id: invoice.account_id, amount_cents, status, provider, provider_payment_id,
    failure_reason: failure_reason || null, paid_at: paidAt
  }).select().single()
  if (paymentError) return json({ error: paymentError.message }, 500)

  if (status === 'failed') {
    await db.from('romylabs_collection_events').insert({ account_id: invoice.account_id, invoice_id: invoice.id, event_type: 'payment_failed', detail: { provider, provider_payment_id, failure_reason: failure_reason || null } })
    return json({ ok: true, payment_id: payment.id, invoice_id: invoice.id, status })
  }
  if (status !== 'succeeded') return json({ ok: true, payment_id: payment.id, invoice_id: invoice.id, status })

  const newPaid = Math.min(Number(invoice.amount_cents), Number(invoice.amount_paid_cents || 0) + amount_cents)
  const fullyPaid = newPaid >= Number(invoice.amount_cents)
  await db.from('romylabs_invoices').update({ amount_paid_cents: newPaid, status: fullyPaid ? 'paid' : 'open', paid_at: fullyPaid ? paidAt : null, updated_at: paidAt }).eq('id', invoice.id)
  await db.from('romylabs_collection_events').insert({ account_id: invoice.account_id, invoice_id: invoice.id, event_type: 'payment_received', detail: { provider, provider_payment_id, amount_cents, fully_paid: fullyPaid } })

  let restoreDue = false
  let restored = false
  let restoreError: string | null = null
  if (fullyPaid) {
    const { count, error: countError } = await db.from('romylabs_invoices').select('id', { count: 'exact', head: true }).eq('account_id', invoice.account_id).eq('status', 'open').lt('due_at', paidAt)
    if (countError) return json({ error: countError.message }, 500)
    if ((count || 0) === 0) {
      const { data: account, error: accountError } = await db.from('romylabs_billing_accounts').select('status').eq('id', invoice.account_id).single()
      if (accountError) return json({ error: accountError.message }, 500)
      restoreDue = ['suspended','suspension_pending','restore_pending'].includes(account?.status)
      if (restoreDue) {
        const entitlementSecret = Deno.env.get('ROMYLABS_ENTITLEMENT_SECRET')
        if (!entitlementSecret) restoreError = 'ROMYLABS_ENTITLEMENT_SECRET is not configured'
        await db.from('romylabs_billing_accounts').update({ status: 'restore_pending', last_paid_at: paidAt, enforcement_error: restoreError, enforcement_updated_at: paidAt, updated_at: paidAt }).eq('id', invoice.account_id)
        if (!restoreError) {
          try {
            const result = await enforce(url, entitlementSecret!, invoice.account_id, 'restore')
            await db.from('romylabs_billing_accounts').update({ status: 'active', suspended_at: null, suspension_reason: null, last_paid_at: paidAt, enforcement_error: null, enforcement_updated_at: paidAt, updated_at: paidAt }).eq('id', invoice.account_id)
            await db.from('romylabs_collection_events').insert({ account_id: invoice.account_id, invoice_id: invoice.id, event_type: 'restored', detail: { reason: 'balance_cured', enforced: true, adapter: result } })
            restored = true
          } catch (e) {
            restoreError = String((e as Error)?.message || e)
            await db.from('romylabs_billing_accounts').update({ enforcement_error: restoreError, enforcement_updated_at: paidAt, updated_at: paidAt }).eq('id', invoice.account_id)
          }
        }
      } else {
        await db.from('romylabs_billing_accounts').update({ status: 'active', last_paid_at: paidAt, enforcement_error: null, updated_at: paidAt }).eq('id', invoice.account_id)
      }
    } else {
      await db.from('romylabs_billing_accounts').update({ last_paid_at: paidAt, updated_at: paidAt }).eq('id', invoice.account_id)
    }
  }

  return json({ ok: true, payment_id: payment.id, invoice_id: invoice.id, fully_paid: fullyPaid, restore_due: restoreDue, restored, restore_error: restoreError })
})
