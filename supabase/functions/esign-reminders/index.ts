import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// esign-reminders: runs daily via cron, sends up to 3 reminders
// for unsigned e-sign documents across all tenants.
// Reminder schedule: Day 1, Day 3, Day 7 after sent_at
// verify_jwt = false (called by cron scheduler)

const REMINDER_DAYS = [1, 3, 7]

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const now = new Date()
    let totalSent = 0
    let totalSkipped = 0

    // Get all unsigned docs sent more than 1 day ago, across all tenants
    const { data: unsignedDocs, error } = await supabase
      .from('esigns')
      .select(`
        id, tenant_id, client_name, client_email, doc_type,
        sent_at, opened_at, reminder_count,
        reminder_1_sent_at, reminder_2_sent_at, reminder_3_sent_at
      `)
      .is('signed_at', null)
      .not('sent_at', 'is', null)
      .not('client_email', 'is', null)
      .lt('reminder_count', 3)

    if (error) {
      console.error('esign-reminders: query error', error)
      return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }

    for (const doc of (unsignedDocs || [])) {
      const sentAt = new Date(doc.sent_at)
      const daysSinceSent = Math.floor((now.getTime() - sentAt.getTime()) / (1000 * 60 * 60 * 24))
      const reminderCount = doc.reminder_count || 0

      // Determine which reminder to send
      let shouldSend = false
      let reminderNum = reminderCount + 1
      const targetDay = REMINDER_DAYS[reminderCount] // 1, 3, or 7

      if (daysSinceSent >= targetDay && reminderNum <= 3) {
        shouldSend = true
      }

      if (!shouldSend) { totalSkipped++; continue }

      // Get tenant settings for firm name and signing URL base
      const { data: settings } = await supabase
        .from('settings')
        .select('firm_name, email, phone')
        .eq('tenant_id', doc.tenant_id)
        .maybeSingle()

      const firmName = settings?.firm_name || 'Tax Resolution CRM'
      const signingUrl = `${Deno.env.get('SUPABASE_URL')!.replace('mpxgxfqdbquzkrvvejkh.supabase.co', 'taxrescrm.app')}/sign?id=${doc.id}`

      const subject = reminderNum === 1
        ? `Action Required: Please sign your ${doc.doc_type || 'document'}`
        : reminderNum === 2
        ? `Reminder: Your ${doc.doc_type || 'document'} is still awaiting your signature`
        : `Final Reminder: Please sign your ${doc.doc_type || 'document'} today`

      const openedLine = doc.opened_at
        ? `<p style="font-size:13px;color:#64748b;">✅ You opened this document on ${new Date(doc.opened_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.</p>`
        : ''

      const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#fff;">
          <div style="margin-bottom:24px;">
            <div style="font-size:22px;font-weight:800;color:#0f172a;">${firmName}</div>
          </div>
          <p style="font-size:15px;color:#0f172a;margin:0 0 16px;">Dear ${doc.client_name || 'Valued Client'},</p>
          ${reminderNum === 3
            ? `<p style="font-size:14px;color:#dc2626;font-weight:600;margin:0 0 12px;">⚠️ This is your final reminder.</p>`
            : ''}
          <p style="font-size:14px;color:#334155;line-height:1.6;margin:0 0 16px;">
            We are reaching out because your <strong>${doc.doc_type || 'document'}</strong> is still awaiting your signature.
            ${reminderNum === 1 ? 'This document requires your attention before we can proceed with your case.' : ''}
            ${reminderNum === 2 ? 'We need your signature to continue working on your behalf with the IRS.' : ''}
            ${reminderNum === 3 ? 'Please sign today to avoid any delays in your case resolution.' : ''}
          </p>
          ${openedLine}
          <div style="text-align:center;margin:28px 0;">
            <a href="${signingUrl}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:700;">
              Sign Document Now →
            </a>
          </div>
          <p style="font-size:13px;color:#64748b;line-height:1.6;">
            If you have any questions or need assistance, please contact us at ${settings?.phone || ''}.
          </p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
          <p style="font-size:11px;color:#94a3b8;">
            This is reminder ${reminderNum} of 3. Sent by ${firmName}. If you have already signed, please disregard this message.
          </p>
        </div>
      `

      // Send the reminder email
      const { error: emailErr } = await supabase.functions.invoke('send-email', {
        body: {
          tenant_id: doc.tenant_id,
          to: doc.client_email,
          subject,
          html,
        }
      })

      if (emailErr) {
        console.error(`esign-reminders: failed to send reminder ${reminderNum} for ${doc.id}`, emailErr)
        totalSkipped++
        continue
      }

      // Update the reminder tracking columns
      const updateField = reminderNum === 1 ? 'reminder_1_sent_at'
        : reminderNum === 2 ? 'reminder_2_sent_at'
        : 'reminder_3_sent_at'

      await supabase.from('esigns').update({
        [updateField]: now.toISOString(),
        reminder_count: reminderNum,
      }).eq('id', doc.id)

      totalSent++
    }

    console.log(`esign-reminders: sent ${totalSent}, skipped ${totalSkipped}`)
    return new Response(JSON.stringify({ ok: true, sent: totalSent, skipped: totalSkipped }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('esign-reminders error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
