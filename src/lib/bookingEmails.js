import { supabase } from './supabase'
import { emailHtml } from './emailTemplate'

export const fmt12 = (t) => {
  const [h, m] = String(t).split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ap}`
}

export const whenLong = (date, time) =>
  `${new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at ${fmt12(time)} (Eastern)`

export const whenShort = (date, time) =>
  `${new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${fmt12(time)}`

// Confirmation to the person who booked. Best-effort — never blocks the booking.
export function sendClientConfirmation({ name, email, type, date, time }) {
  if (!email) return
  supabase.functions.invoke('send-email', { body: {
    to: email,
    subject: `Appointment Confirmed — ${type}, ${whenShort(date, time)}`,
    html: emailHtml({ body: `
      <p>Hi <strong>${name}</strong>,</p>
      <p>Your appointment is confirmed:</p>
      <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;width:100%;margin:12px 0">
        <tr><td style="padding:16px 20px;font-size:14px;color:#0f172a;line-height:1.9">
          <strong>${type}</strong><br>${whenLong(date, time)}
        </td></tr>
      </table>
      <p>Need to reschedule or cancel? Just reply to this email or call us and we'll take care of it.</p>
      <p style="margin-top:20px">Talk soon,<br><strong>Tax Case Review</strong></p>` }),
  } }).catch(() => {})
}

// Heads-up to the assigned rep (or the firm inbox). Best-effort.
export function sendFirmNotification({ name, email, phone, notes, type, date, time, notifyEmail, bookedBy }) {
  supabase.functions.invoke('send-email', { body: {
    to: notifyEmail || 'info@taxcasereview.org',
    subject: `📅 New booking: ${name} — ${whenShort(date, time)}`,
    html: emailHtml({ body: `
      <p><strong>${name}</strong> ${bookedBy ? `was booked by ${bookedBy}` : 'just booked online'}:</p>
      <p style="line-height:1.9"><strong>${type}</strong><br>${whenLong(date, time)}<br>
      Email: ${email || '—'}<br>Phone: ${phone || '—'}${notes ? `<br>Notes: ${notes}` : ''}</p>
      <p>The appointment is on the CRM calendar; a lead was created if they were new.</p>` }),
  } }).catch(() => {})
}

// The Calendly invite: "here's our link, pick your time." Used by the
// Calendar's Send Booking Link modal and the lead/client scheduling strip.
export const BOOK_URL = `${window.location.origin}${import.meta.env.BASE_URL}book`

export async function sendBookingInvite({ name, email }) {
  const first = (name || '').trim().split(' ')[0] || 'there'
  const { error } = await supabase.functions.invoke('send-email', { body: {
    to: email,
    subject: 'Schedule Your Appointment — Tax Case Review',
    html: emailHtml({ body: `<p>Hi <strong>${first}</strong>,</p><p>Pick whichever time works best for you — it takes less than a minute:</p><p style="text-align:center;margin:24px 0"><a href="${BOOK_URL}" style="background:#1d4ed8;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;display:inline-block">📅 Choose a Time</a></p><p>You'll see our live availability and get an instant confirmation. If nothing there works, just reply to this email or give us a call.</p><p style="margin-top:20px">Talk soon,<br><strong>Tax Case Review</strong></p>` }),
  }})
  return !error
}
