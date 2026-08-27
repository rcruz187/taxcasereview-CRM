import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const money = (c:number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100)

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const expected = Deno.env.get('ROMYLABS_BILLING_CRON_SECRET')
  if (!expected || req.headers.get('x-cron-secret') !== expected) return json({ error: 'Unauthorized' }, 401)
  const brevoKey = Deno.env.get('BREVO_API_KEY')
  const fromEmail = Deno.env.get('ROMYLABS_BILLING_FROM_EMAIL') || 'billing@romylabs.com'
  if (!brevoKey) return json({ error: 'BREVO_API_KEY is not configured' }, 503)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: events, error } = await db.from('romylabs_collection_events').select('*, romylabs_billing_accounts(account_name,billing_email), romylabs_invoices(invoice_number,amount_cents,due_at,final_deadline_at)').in('event_type',['invoice_created','notice_1_sent','notice_2_sent']).eq('channel','email').is('detail->>delivered_at', null).order('created_at',{ascending:true}).limit(100)
  if (error) return json({ error: error.message }, 500)
  const results:any[] = []

  for (const event of events || []) {
    const account:any = event.romylabs_billing_accounts
    const invoice:any = event.romylabs_invoices
    const to = event.recipient || account?.billing_email
    if (!to || !invoice) { results.push({event_id:event.id,ok:false,error:'missing recipient or invoice'}); continue }
    const final = event.event_type === 'notice_2_sent'
    const first = event.event_type === 'notice_1_sent'
    const subject = final ? `Final payment notice — ${invoice.invoice_number}` : first ? `Payment reminder — ${invoice.invoice_number}` : `RomyLabs invoice ${invoice.invoice_number}`
    const deadline = final && invoice.final_deadline_at ? new Date(invoice.final_deadline_at).toLocaleDateString('en-US') : new Date(invoice.due_at).toLocaleDateString('en-US')
    const message = final
      ? `This is the second and final notice for ${invoice.invoice_number}. Payment of ${money(invoice.amount_cents)} is required by ${deadline}. If the balance remains unpaid after the final grace period, access may be suspended under your RomyLabs subscription terms. Your data will not be deleted.`
      : first
      ? `Our records show invoice ${invoice.invoice_number} for ${money(invoice.amount_cents)} remains unpaid. Please remit payment as soon as possible. If you have already paid, please disregard this reminder.`
      : `Invoice ${invoice.invoice_number} for ${money(invoice.amount_cents)} has been issued for your RomyLabs subscription. Payment is due ${deadline}.`
    const res = await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':brevoKey,'content-type':'application/json'},body:JSON.stringify({sender:{name:'RomyLabs Billing',email:fromEmail},to:[{email:to,name:account?.account_name}],subject,htmlContent:`<div style="font-family:Arial,sans-serif;max-width:640px"><h2>${subject}</h2><p>${message}</p><p>Questions? Reply to this email and we will help.</p><p>Best Regards,<br><strong>RomyLabs Billing</strong></p></div>`})})
    if (res.ok) {
      await db.from('romylabs_collection_events').update({detail:{...(event.detail||{}),delivered_at:new Date().toISOString()}}).eq('id',event.id)
      if (event.event_type === 'invoice_created') await db.from('romylabs_collection_events').insert({account_id:event.account_id,invoice_id:event.invoice_id,event_type:'invoice_sent',channel:'email',recipient:to,detail:{source_event_id:event.id}})
      results.push({event_id:event.id,ok:true})
    } else results.push({event_id:event.id,ok:false,status:res.status,error:await res.text()})
  }
  return json({ok:true,processed:results.length,results})
})
