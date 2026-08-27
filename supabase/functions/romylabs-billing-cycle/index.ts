import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const expected = Deno.env.get('ROMYLABS_BILLING_CRON_SECRET')
  if (!expected || req.headers.get('x-cron-secret') !== expected) return json({ error: 'Unauthorized' }, 401)

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = createClient(url, serviceKey, { auth: { persistSession: false } })
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const actions: Record<string, unknown>[] = []

  const { data: accounts, error: accountError } = await db.from('romylabs_billing_accounts').select('*').in('status', ['active','past_due','suspended'])
  if (accountError) return json({ error: accountError.message }, 500)

  for (const account of accounts || []) {
    // Generate one monthly invoice on/after the configured billing day.
    const day = Number(today.slice(8, 10))
    if (account.auto_invoice && day >= account.billing_day && account.status !== 'cancelled') {
      const periodStart = `${today.slice(0,7)}-01`
      const periodEndDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
      const periodEnd = periodEndDate.toISOString().slice(0,10)
      const due = new Date(`${periodStart}T12:00:00Z`)
      due.setUTCDate(due.getUTCDate() + Number(account.notice_1_after_days || 10))
      const invoiceNumber = `RL-${today.slice(0,7).replace('-','')}-${String(account.id).slice(0,8).toUpperCase()}`
      const { data: created } = await db.from('romylabs_invoices').upsert({
        account_id: account.id, invoice_number: invoiceNumber, period_start: periodStart, period_end: periodEnd,
        due_at: due.toISOString(), amount_cents: account.monthly_amount_cents, status: 'open'
      }, { onConflict: 'account_id,period_start,period_end', ignoreDuplicates: true }).select().maybeSingle()
      if (created) {
        await db.from('romylabs_collection_events').insert({ account_id: account.id, invoice_id: created.id, event_type: 'invoice_created', detail: { amount_cents: created.amount_cents } })
        actions.push({ account: account.account_name, action: 'invoice_created', invoice: created.invoice_number })
      }
    }

    const { data: invoices } = await db.from('romylabs_invoices').select('*').eq('account_id', account.id).eq('status','open').lt('due_at', now.toISOString()).order('due_at', { ascending: true })
    for (const invoice of invoices || []) {
      const ageDays = Math.floor((now.getTime() - new Date(invoice.issued_at).getTime()) / 86400000)
      if (ageDays >= account.notice_1_after_days && !invoice.notice_1_sent_at) {
        await db.from('romylabs_invoices').update({ notice_1_sent_at: now.toISOString() }).eq('id', invoice.id)
        await db.from('romylabs_collection_events').insert({ account_id: account.id, invoice_id: invoice.id, event_type: 'notice_1_sent', channel: 'email', recipient: account.billing_email, detail: { days_since_invoice: ageDays } })
        await db.from('romylabs_billing_accounts').update({ status: 'past_due', updated_at: now.toISOString() }).eq('id', account.id).neq('status','suspended')
        actions.push({ account: account.account_name, action: 'notice_1_due', invoice: invoice.invoice_number })
      }
      if (ageDays >= account.notice_2_after_days && !invoice.notice_2_sent_at) {
        const finalDeadline = new Date(new Date(invoice.issued_at).getTime() + account.suspend_after_days * 86400000)
        await db.from('romylabs_invoices').update({ notice_2_sent_at: now.toISOString(), final_deadline_at: finalDeadline.toISOString() }).eq('id', invoice.id)
        await db.from('romylabs_collection_events').insert({ account_id: account.id, invoice_id: invoice.id, event_type: 'notice_2_sent', channel: 'email', recipient: account.billing_email, detail: { final_deadline_at: finalDeadline.toISOString() } })
        actions.push({ account: account.account_name, action: 'final_notice_due', invoice: invoice.invoice_number })
      }
      if (account.auto_suspend && ageDays >= account.suspend_after_days && account.status !== 'suspended') {
        await db.from('romylabs_billing_accounts').update({ status: 'suspended', suspended_at: now.toISOString(), suspension_reason: `Invoice ${invoice.invoice_number} unpaid after final grace period`, updated_at: now.toISOString() }).eq('id', account.id)
        await db.from('romylabs_collection_events').insert({ account_id: account.id, invoice_id: invoice.id, event_type: 'suspended', detail: { reason: 'past_due_final_grace_expired' } })
        actions.push({ account: account.account_name, action: 'suspension_due', invoice: invoice.invoice_number })
      }
    }
  }

  // IMPORTANT: this function records collection actions/state. Actual email delivery and product access enforcement
  // must be performed by server-side adapters so credentials never enter the browser.
  return json({ ok: true, processed_at: now.toISOString(), actions })
})
