import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const REMINDER_MINUTES_BEFORE = 30
const WINDOW_MINUTES = 5

function easternWallClockToUTC(dateStr, timeStr) {
  const guess = new Date(`${dateStr}T${timeStr}:00Z`)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(guess)
  const get = t => parts.find(p => p.type === t)?.value
  const asIfUTC = new Date(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`)
  const offsetMs = guess.getTime() - asIfUTC.getTime()
  return new Date(guess.getTime() + offsetMs)
}

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function fmtDate(d) {
  if (!d) return ''
  const [y, mo, day] = d.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parseInt(mo)-1]} ${parseInt(day)}, ${y}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const now = new Date()
    const targetStart = new Date(now.getTime() + (REMINDER_MINUTES_BEFORE - WINDOW_MINUTES) * 60000)
    const targetEnd   = new Date(now.getTime() + (REMINDER_MINUTES_BEFORE + WINDOW_MINUTES) * 60000)

    const { data: events, error } = await supabase
      .from('calevents')
      .select('id, title, "clientName", "assignedTo", date, time, "eventType", notes, status, reminder_sent, tenant_id')
      .eq('status', 'scheduled')
      .or('reminder_sent.is.null,reminder_sent.eq.false')

    if (error) throw error

    // Load all employees and settings (all tenants — service role bypasses RLS)
    const { data: employees } = await supabase.from('employees').select('name, email, tenant_id')
    const { data: allSettings } = await supabase.from('settings').select('tenant_id, name, firmname, logourl, email, firmemail, phone, firmphone')

    const emailByName = Object.fromEntries((employees || []).filter(e => e.name && e.email).map(e => [e.name, { email: e.email, tenant_id: e.tenant_id }]))

    // Map tenant_id → settings row
    const settingsByTenant = Object.fromEntries((allSettings || []).map(s => [s.tenant_id, s]))

    let sent = 0
    for (const ev of events || []) {
      if (!ev.date || !ev.time) continue
      const evUTC = easternWallClockToUTC(ev.date, ev.time)
      if (evUTC < targetStart || evUTC > targetEnd) continue

      const empInfo = emailByName[ev.assignedTo] || null
      const recipientEmail = empInfo?.email || null
      if (!recipientEmail) continue

      // Get per-tenant branding
      const tenantId = ev.tenant_id || empInfo?.tenant_id
      const s = tenantId ? settingsByTenant[tenantId] : null
      const firmName = s?.name || s?.firmname || 'TaxRes CRM'
      const firmLogo = s?.logourl || ''
      const firmEmail = s?.email || s?.firmemail || ''
      const firmPhone = s?.phone || s?.firmphone || ''

      try {
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({
            to: recipientEmail,
            subject: `📅 Reminder: ${ev.title || 'Appointment'} at ${fmtTime(ev.time)}`,
            html: `
<div style="font-family:Arial,sans-serif;max-width:540px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0">
  <div style="background:#1e1b4b;padding:20px 24px;display:flex;align-items:center;gap:14px">
    ${firmLogo ? `<img src="${firmLogo}" style="height:36px;width:auto;object-fit:contain" alt="${firmName}" />` : ''}
    <div style="color:#fff;font-size:16px;font-weight:700">${firmName}</div>
  </div>
  <div style="padding:24px">
    <div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:6px">📅 Appointment in ${REMINDER_MINUTES_BEFORE} minutes</div>
    <p style="font-size:14px;color:#475569;margin:0 0 20px">You have an upcoming appointment starting soon.</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:20px">
      <table style="font-size:13px;border-collapse:collapse;width:100%">
        <tr>
          <td style="color:#64748b;padding:5px 12px 5px 0;white-space:nowrap;font-weight:600">Client</td>
          <td style="color:#1e293b;font-weight:700;padding:5px 0">${ev.clientName || ev.title || '—'}</td>
        </tr>
        <tr>
          <td style="color:#64748b;padding:5px 12px 5px 0;white-space:nowrap;font-weight:600">Type</td>
          <td style="color:#1e293b;padding:5px 0">${ev.eventType || '—'}</td>
        </tr>
        <tr>
          <td style="color:#64748b;padding:5px 12px 5px 0;white-space:nowrap;font-weight:600">Date</td>
          <td style="color:#1e293b;padding:5px 0">${fmtDate(ev.date)}</td>
        </tr>
        <tr>
          <td style="color:#64748b;padding:5px 12px 5px 0;white-space:nowrap;font-weight:600">Time</td>
          <td style="color:#1e293b;font-weight:700;padding:5px 0;color:#4f46e5">${fmtTime(ev.time)} ET</td>
        </tr>
        ${ev.notes ? `<tr><td style="color:#64748b;padding:5px 12px 5px 0;font-weight:600;vertical-align:top">Notes</td><td style="color:#475569;padding:5px 0">${ev.notes}</td></tr>` : ''}
      </table>
    </div>
    <p style="font-size:12px;color:#94a3b8;margin:0">This is an automatic reminder from ${firmName}${firmEmail ? ` · ${firmEmail}` : ''}${firmPhone ? ` · ${firmPhone}` : ''}</p>
  </div>
</div>`,
          }),
        })
      } catch (e) {
        console.error('reminder email send error:', e)
      }

      await supabase.from('calevents').update({ reminder_sent: true }).eq('id', ev.id)
      sent++
    }

    return new Response(JSON.stringify({ success: true, sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-appointment-reminders error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
