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
  const expected = Deno.env.get('ROMYLABS_BILLING_CRON_SECRET')
  if (!expected || req.headers.get('x-cron-secret') !== expected) return json({ error: 'Unauthorized' }, 401)

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const entitlementSecret = Deno.env.get('ROMYLABS_ENTITLEMENT_SECRET')
  if (!entitlementSecret) return json({ error: 'ROMYLABS_ENTITLEMENT_SECRET is not configured' }, 503)
  const db = createClient(url, serviceKey, { auth: { persistSession: false } })
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const actions: Record<string, unknown>[] = []

  const { data: accounts, error: accountError } = await db.from('romylabs_billing_accounts').select('*').in('status', ['active','past_due','suspension_pending','suspended','restore_pending'])
  if (accountError) return json({ error: accountError.message }, 500)

  for (const account of accounts || []) {
    // A payment may cure the balance while the product adapter is temporarily unavailable.
    // Keep the central state truthful (`restore_pending`) and retry every daily cycle until
    // the product confirms access is actually restored.
    if (account.status === 'restore_pending') {
      try {
        const result = await enforce(url, entitlementSecret, account.id, 'restore')
        await db.from('romylabs_billing_accounts').update({
          status: 'active', suspended_at: null, suspension_reason: null,
          enforcement_error: null, enforcement_updated_at: now.toISOString(), updated_at: now.toISOString()
        }).eq('id', account.id)
        await db.from('romylabs_collection_events').insert({
          account_id: account.id,
          event_type: 'restored',
          detail: { reason: 'balance_cured_retry', enforced: true, adapter: result }
        })
        actions.push({ account: account.account_name, action: 'restored_after_retry' })
      } catch (e) {
        const message = String((e as Error)?.message || e)
        await db.from('romylabs_billing_accounts').update({
          enforcement_error: message, enforcement_updated_at: now.toISOString(), updated_at: now.toISOString()
        }).eq('id', account.id)
        actions.push({ account: account.account_name, action: 'restore_retry_pending', error: message })
      }
      continue
    }

    const day = Number(today.slice(8, 10))
    if (account.auto_invoice && day >= account.billing_day && ['active','past_due'].includes(account.status)) {
      const periodStart = `${today.slice(0,7)}-01`
      const periodEndDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
      const periodEnd = periodEndDate.toISOString().slice(0,10)
      const issued = new Date()
      const due = new Date(issued)
      due.setUTCDate(due.getUTCDate() + Number(account.notice_1_after_days || 10))
      const invoiceNumber = `RL-${today.slice(0,7).replace('-','')}-${String(account.id).slice(0,8).toUpperCase()}`
      const { data: created, error: createError } = await db.from('romylabs_invoices').upsert({
        account_id: account.id, invoice_number: invoiceNumber, period_start: periodStart, period_end: periodEnd,
        issued_at: issued.toISOString(), due_at: due.toISOString(), amount_cents: account.monthly_amount_cents, status: 'open'
      }, { onConflict: 'account_id,period_start,period_end', ignoreDuplicates: true }).select().maybeSingle()
      if (createError) return json({ error: createError.message }, 500)
      if (created) {
        await db.from('romylabs_collection_events').insert({
          account_id: account.id, invoice_id: created.id, event_type: 'invoice_created', channel: 'email',
          recipient: account.billing_email, detail: { amount_cents: created.amount_cents }
        })
        actions.push({ account: account.account_name, action: 'invoice_created', invoice: created.invoice_number })
      }
    }

    const { data: invoices, error: invoiceError } = await db.from('romylabs_invoices').select('*').eq('account_id', account.id).eq('status','open').order('issued_at', { ascending: true })
    if (invoiceError) return json({ error: invoiceError.message }, 500)
    for (const invoice of invoices || []) {
      const ageDays = Math.floor((now.getTime() - new Date(invoice.issued_at).getTime()) / 86400000)
      if (ageDays >= account.notice_1_after_days && !invoice.notice_1_sent_at) {
        await db.from('romylabs_invoices').update({ notice_1_sent_at: now.toISOString() }).eq('id', invoice.id)
        await db.from('romylabs_collection_events').insert({ account_id: account.id, invoice_id: invoice.id, event_type: 'notice_1_sent', channel: 'email', recipient: account.billing_email, detail: { days_since_invoice: ageDays } })
        if (account.status === 'active') await db.from('romylabs_billing_accounts').update({ status: 'past_due', updated_at: now.toISOString() }).eq('id', account.id)
        actions.push({ account: account.account_name, action: 'notice_1_due', invoice: invoice.invoice_number })
      }
      if (ageDays >= account.notice_2_after_days && !invoice.notice_2_sent_at) {
        const finalDeadline = new Date(new Date(invoice.issued_at).getTime() + account.suspend_after_days * 86400000)
        await db.from('romylabs_invoices').update({ notice_2_sent_at: now.toISOString(), final_deadline_at: finalDeadline.toISOString() }).eq('id', invoice.id)
        await db.from('romylabs_collection_events').insert({ account_id: account.id, invoice_id: invoice.id, event_type: 'notice_2_sent', channel: 'email', recipient: account.billing_email, detail: { final_deadline_at: finalDeadline.toISOString() } })
        actions.push({ account: account.account_name, action: 'final_notice_due', invoice: invoice.invoice_number })
      }
      if (account.auto_suspend && ageDays >= account.suspend_after_days && account.status !== 'suspended') {
        if (account.status !== 'suspension_pending') {
          await db.from('romylabs_billing_accounts').update({
            status: 'suspension_pending', suspension_reason: `Invoice ${invoice.invoice_number} unpaid after final grace period`,
            enforcement_error: null, enforcement_updated_at: now.toISOString(), updated_at: now.toISOString()
          }).eq('id', account.id)
          await db.from('romylabs_collection_events').insert({ account_id: account.id, invoice_id: invoice.id, event_type: 'suspension_due', detail: { reason: 'past_due_final_grace_expired' } })
        }
        try {
          const result = await enforce(url, entitlementSecret, account.id, 'suspend')
          await db.from('romylabs_billing_accounts').update({
            status: 'suspended', suspended_at: now.toISOString(), enforcement_error: null,
            enforcement_updated_at: now.toISOString(), updated_at: now.toISOString()
          }).eq('id', account.id)
          await db.from('romylabs_collection_events').insert({ account_id: account.id, invoice_id: invoice.id, event_type: 'suspended', detail: { reason: 'past_due_final_grace_expired', enforced: true, adapter: result } })
          actions.push({ account: account.account_name, action: 'suspended', invoice: invoice.invoice_number })
        } catch (e) {
          const message = String((e as Error)?.message || e)
          await db.from('romylabs_billing_accounts').update({ enforcement_error: message, enforcement_updated_at: now.toISOString(), updated_at: now.toISOString() }).eq('id', account.id)
          actions.push({ account: account.account_name, action: 'suspension_retry_pending', error: message })
        }
        break
      }
    }
  }

  return json({ ok: true, processed_at: now.toISOString(), actions })
})
