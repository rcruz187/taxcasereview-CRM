import { supabase } from './supabase'
import { FIRM } from './firmBranding'
import { emailHtml } from './emailTemplate'

// Firm branding for booking emails — cached lookup via the anon-safe
// booking_get_public_meta RPC (already deployed for the /book page), so
// booking-related emails show the real firm name/logo whether they're sent
// from the public anon pages (/book, /book/manage) or from inside the app.
// Falls back to the Tax Case Review defaults on any error — never blocks a
// send over a branding lookup.
let _firmMetaCache = null
async function getFirmMeta() {
  if (_firmMetaCache) return _firmMetaCache
  try {
    // Inside the app FIRM is already the signed-in tenant's branding; the
    // public meta RPC returns the FIRST settings row for every caller and is
    // only a fallback for anon contexts where FIRM never loaded.
    if (FIRM.loaded && FIRM.name) return { firmName: FIRM.name, logoUrl: FIRM.logoUrl || '' }
    const { data } = await supabase.rpc('booking_get_public_meta')
    _firmMetaCache = data && data.firm_name ? { firmName: data.firm_name, logoUrl: data.logo_url } : {}
  } catch (_) {
    _firmMetaCache = {}
  }
  return _firmMetaCache
}

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
// With a token, includes Calendly-style self-serve Reschedule / Cancel links.
export function sendClientConfirmation({ name, email, type, date, time, token }) {
  if (!email) return
  const manage = token ? `${window.location.origin}${import.meta.env.BASE_URL}book/manage/${token}` : null
  ;(async () => {
    const firm = await getFirmMeta()
    await supabase.functions.invoke('send-email', { body: {
      to: email,
      subject: `Appointment Confirmed — ${type}, ${whenShort(date, time)}`,
      html: emailHtml({ firmName: firm.firmName, logoUrl: firm.logoUrl, body: `
        <p>Hi <strong>${name}</strong>,</p>
        <p>Your appointment is confirmed:</p>
        <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;width:100%;margin:12px 0">
          <tr><td style="padding:16px 20px;font-size:14px;color:#0f172a;line-height:1.9">
            <strong>${type}</strong><br>${whenLong(date, time)}
          </td></tr>
        </table>
        ${manage ? `<p style="text-align:center;margin:20px 0">
          <a href="${manage}" style="background:#1d4ed8;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:700;font-size:13.5px;display:inline-block;margin:0 6px">🔁 Reschedule</a>
          <a href="${manage}?cancel=1" style="background:#f1f5f9;color:#b91c1c;border:1px solid #e2e8f0;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:700;font-size:13.5px;display:inline-block;margin:0 6px">Cancel</a>
        </p>` : `<p>Need to reschedule or cancel? Just reply to this email or call us and we'll take care of it.</p>`}
        <p style="margin-top:20px">Talk soon,<br><strong>${firm.firmName || 'Tax Case Review'}</strong></p>` }),
    } })
  })().catch(() => {})
}

// Cancellation notices (client + firm/rep). Best-effort.
export function sendCancelEmails({ name, email, type, date, time, notifyEmail }) {
  (async () => {
    const firm = await getFirmMeta()
    if (email) await supabase.functions.invoke('send-email', { body: {
      to: email,
      subject: `Appointment Canceled — ${type}, ${whenShort(date, time)}`,
      html: emailHtml({ firmName: firm.firmName, logoUrl: firm.logoUrl, body: `
        <p>Hi <strong>${name}</strong>,</p>
        <p>Your <strong>${type}</strong> on ${whenLong(date, time)} has been canceled.</p>
        <p>Changed your mind? You can grab a new time any time:</p>
        <p style="text-align:center;margin:20px 0"><a href="${BOOK_URL}" style="background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px;display:inline-block">📅 Book Again</a></p>
        <p style="margin-top:20px"><strong>${firm.firmName || 'Tax Case Review'}</strong></p>` }),
    } })
    await supabase.functions.invoke('send-email', { body: {
      to: notifyEmail || 'info@taxcasereview.org',
      subject: `❌ Booking canceled: ${name} — ${whenShort(date, time)}`,
      html: emailHtml({ firmName: firm.firmName, logoUrl: firm.logoUrl, body: `<p><strong>${name}</strong> canceled their <strong>${type}</strong> on ${whenLong(date, time)}. The slot is open again.</p>` }),
    } })
  })().catch(() => {})
}

// Reschedule notice to the firm/rep (client gets a fresh confirmation instead).
export function sendRescheduleNotice({ name, type, oldDate, oldTime, date, time, notifyEmail }) {
  (async () => {
    const firm = await getFirmMeta()
    await supabase.functions.invoke('send-email', { body: {
      to: notifyEmail || 'info@taxcasereview.org',
      subject: `🔁 Rescheduled: ${name} — now ${whenShort(date, time)}`,
      html: emailHtml({ firmName: firm.firmName, logoUrl: firm.logoUrl, body: `<p><strong>${name}</strong> moved their <strong>${type}</strong>:</p><p style="line-height:1.9">Was: ${whenLong(oldDate, oldTime)}<br>Now: <strong>${whenLong(date, time)}</strong></p><p>The calendar is already updated.</p>` }),
    } })
  })().catch(() => {})
}

// Heads-up to the assigned rep (or the firm inbox). Best-effort.
export function sendFirmNotification({ name, email, phone, notes, type, date, time, notifyEmail, bookedBy }) {
  (async () => {
    const firm = await getFirmMeta()
    await supabase.functions.invoke('send-email', { body: {
      to: notifyEmail || 'info@taxcasereview.org',
      subject: `📅 New booking: ${name} — ${whenShort(date, time)}`,
      html: emailHtml({ firmName: firm.firmName, logoUrl: firm.logoUrl, body: `
        <p><strong>${name}</strong> ${bookedBy ? `was booked by ${bookedBy}` : 'just booked online'}:</p>
        <p style="line-height:1.9"><strong>${type}</strong><br>${whenLong(date, time)}<br>
        Email: ${email || '—'}<br>Phone: ${phone || '—'}${notes ? `<br>Notes: ${notes}` : ''}</p>
        <p>The appointment is on the CRM calendar; a lead was created if they were new.</p>` }),
    } })
  })().catch(() => {})
}

// The Calendly invite: "here's our link, pick your time." Used by the
// Calendar's Send Booking Link modal and the lead/client scheduling strip.
export const BOOK_URL = `${window.location.origin}${import.meta.env.BASE_URL}book`

export async function sendBookingInvite({ name, email, phone }) {
  const first = (name || '').trim().split(' ')[0] || 'there'
  const q = new URLSearchParams()
  if ((name || '').trim()) q.set('name', name.trim())
  if ((email || '').trim()) q.set('email', email.trim())
  if ((phone || '').trim()) q.set('phone', phone.trim())
  const link = q.toString() ? `${BOOK_URL}?${q.toString()}` : BOOK_URL
  const firm = await getFirmMeta()
  const fName = firm.firmName || 'Tax Case Review'
  const { error } = await supabase.functions.invoke('send-email', { body: {
    to: email,
    subject: `Schedule Your Appointment — ${fName}`,
    html: emailHtml({ firmName: firm.firmName, logoUrl: firm.logoUrl, body: `<p>Hi <strong>${first}</strong>,</p><p>Pick whichever time works best for you — it takes less than a minute:</p><p style="text-align:center;margin:24px 0"><a href="${link}" style="background:#1d4ed8;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;display:inline-block">📅 Choose a Time</a></p><p>You'll see our live availability and get an instant confirmation. If nothing there works, just reply to this email or give us a call.</p><p style="margin-top:20px">Talk soon,<br><strong>${fName}</strong></p>` }),
  }})
  return !error
}
