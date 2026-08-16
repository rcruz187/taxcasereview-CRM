// run-autopay-batch
// Invoked once a day by a pg_cron job (see sql/autopay_batch_cron.sql) so
// client-enrolled (and staff-enrolled) monthly autopay actually charges
// itself instead of waiting for someone to click "Run Today's Batch" on
// the Payments page. Same due-client logic and same advance-the-date
// behavior as that manual button (src/pages/Payments.jsx runAutopayBatch)
// — this just runs it automatically and emails a summary afterward so a
// failed card doesn't sit there silently.
//
// Unlike the portal-facing Stripe functions, this one is only ever called
// by pg_cron with the service role key as a real bearer token, so leave
// "Enforce JWT Verification" ON for this function (the default) — no need
// to turn it off.
//
// Deploy via: Supabase Dashboard → Edge Functions → Deploy new function
// (paste this file in as index.ts), name it "run-autopay-batch".
// Then run sql/autopay_batch_cron.sql in the SQL Editor to schedule it.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function advanceDate(dateStr, frequency) {
  const d = new Date(dateStr + 'T00:00:00')
  if (frequency === 'weekly') d.setDate(d.getDate() + 7)
  else if (frequency === 'biweekly') d.setDate(d.getDate() + 14)
  else d.setMonth(d.getMonth() + 1) // monthly (one-time disables itself below instead of advancing)
  return d.toISOString().slice(0, 10)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const today = new Date().toISOString().slice(0, 10)
    const { data: clients, error } = await supabase.from('clients')
      .select('id,name,autopay_enabled,autopay_amount,autopay_frequency,autopay_next_charge')
      .eq('autopay_enabled', true)
      .not('autopay_amount', 'is', null)
      .not('autopay_next_charge', 'is', null)
      .lte('autopay_next_charge', today)

    if (error) throw new Error(error.message)
    const due = clients || []

    if (due.length === 0) {
      return new Response(JSON.stringify({ success: true, charged: 0, message: 'Nothing due today' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const results = []
    for (const c of due) {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-charge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
          body: JSON.stringify({ clientId: c.id, amount: c.autopay_amount, source: 'autopay' }),
        })
        const data = await res.json()
        const ok = res.ok && !data?.error
        results.push({ name: c.name, amount: c.autopay_amount, ok, msg: ok ? 'Charged' : (data?.error || 'Charge failed') })

        if (ok) {
          const nextDate = c.autopay_frequency === 'one-time' ? null : advanceDate(c.autopay_next_charge, c.autopay_frequency)
          await supabase.from('clients').update({
            autopay_next_charge: nextDate,
            autopay_enabled: c.autopay_frequency !== 'one-time',
          }).eq('id', c.id)
        }
      } catch (e) {
        results.push({ name: c.name, amount: c.autopay_amount, ok: false, msg: e.message || 'Charge failed' })
      }
    }

    // Best-effort summary email to Super Admin/Admin staff — never blocks
    // or fails the batch itself if email sending has an issue.
    try {
      const { data: admins } = await supabase.from('employees')
        .select('email').in('access', ['Super Admin', 'Admin']).not('email', 'is', null)
      const recipients = [...new Set((admins || []).map(a => a.email).filter(Boolean))]
      const succeeded = results.filter(r => r.ok)
      const failed = results.filter(r => !r.ok)
      const rowsHtml = results.map(r =>
        `<tr><td style="padding:4px 8px;color:#334155">${r.name}</td><td style="padding:4px 8px;text-align:right">$${Number(r.amount).toFixed(2)}</td><td style="padding:4px 8px;color:${r.ok ? '#16a34a' : '#dc2626'}">${r.ok ? '✅ Charged' : '❌ ' + r.msg}</td></tr>`
      ).join('')
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <div style="font-size:18px;font-weight:800;color:#1d4ed8;margin-bottom:8px">${firmName}</div>
        <p style="font-size:14px;color:#334155">Today's autopay batch ran automatically: <strong>${succeeded.length} charged</strong>${failed.length ? `, <strong style="color:#dc2626">${failed.length} failed</strong>` : ''}.</p>
        <table style="font-size:13px;border-collapse:collapse;margin-top:10px">${rowsHtml}</table>
        ${failed.length ? `<p style="font-size:12px;color:#64748b;margin-top:14px">Failed charges will be retried automatically tomorrow, or you can charge a client manually from Payments → Autopay.</p>` : ''}
      </div>`
      await Promise.all(recipients.map(to =>
        fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
          body: JSON.stringify({ to, subject: `Autopay batch — ${succeeded.length} charged${failed.length ? `, ${failed.length} failed` : ''}`, html }),
        }).catch(() => {})
      ))
    } catch (e) {
      console.error('autopay summary email error:', e)
    }

    return new Response(JSON.stringify({ success: true, charged: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('run-autopay-batch error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Batch run failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
