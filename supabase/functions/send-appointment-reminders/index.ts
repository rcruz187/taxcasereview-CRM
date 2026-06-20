import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Invoked every 5 minutes by a pg_cron job (see sql/appointment_reminders_migration.sql
// note in the deploy checklist). Finds scheduled calevents rows whose start time falls
// REMINDER_MINUTES_BEFORE from now (within a window wide enough to not miss one between
// cron ticks), emails the assigned staff member, then marks reminder_sent so it doesn't
// fire again on the next tick. Browser-side "popup" reminders are handled separately and
// independently in AppContext.jsx (client-side poll, not tied to this flag).
const REMINDER_MINUTES_BEFORE = 30
const WINDOW_MINUTES = 5

// Same DST-safe approach as receive-call/index.ts's isWithinBusinessHours — appointment
// date/time are entered by staff as plain Eastern wall-clock values with no zone info,
// but this function runs in UTC, so we have to convert deliberately rather than assume.
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
      .select('id, title, "clientName", "assignedTo", date, time, "eventType", notes, status, reminder_sent')
      .eq('status', 'scheduled')
      .or('reminder_sent.is.null,reminder_sent.eq.false')

    if (error) throw error

    const { data: employees } = await supabase.from('employees').select('name, email')
    const emailByName = Object.fromEntries((employees || []).filter(e => e.name && e.email).map(e => [e.name, e.email]))

    let sent = 0
    for (const ev of events || []) {
      if (!ev.date || !ev.time) continue
      const evUTC = easternWallClockToUTC(ev.date, ev.time)
      if (evUTC < targetStart || evUTC > targetEnd) continue

      const recipientEmail = emailByName[ev.assignedTo] || null
      if (recipientEmail) {
        try {
          await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              to: recipientEmail,
              subject: `Reminder: ${ev.title || 'Appointment'} at ${fmtTime(ev.time)}`,
              html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:20px">
                <div style="font-size:16px;font-weight:700;color:#1d4ed8;margin-bottom:10px">📅 Appointment Reminder</div>
                <p style="font-size:14px;color:#334155">You have an upcoming appointment in about ${REMINDER_MINUTES_BEFORE} minutes.</p>
                <table style="font-size:13px;margin:14px 0;border-collapse:collapse">
                  <tr><td style="color:#64748b;padding:3px 8px 3px 0">Client/Lead:</td><td><strong>${ev.clientName || '—'}</strong></td></tr>
                  <tr><td style="color:#64748b;padding:3px 8px 3px 0">Type:</td><td>${ev.eventType || '—'}</td></tr>
                  <tr><td style="color:#64748b;padding:3px 8px 3px 0">Date:</td><td>${ev.date}</td></tr>
                  <tr><td style="color:#64748b;padding:3px 8px 3px 0">Time:</td><td>${fmtTime(ev.time)}</td></tr>
                </table>
                ${ev.notes ? `<p style="font-size:12px;color:#64748b">Notes: ${ev.notes}</p>` : ''}
                <p style="font-size:11px;color:#94a3b8;margin-top:24px">Tax Case Review CRM — automatic appointment reminder</p>
              </div>`,
            }),
          })
        } catch (e) {
          console.error('reminder email send error:', e)
        }
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
