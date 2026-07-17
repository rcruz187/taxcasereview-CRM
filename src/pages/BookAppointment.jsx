import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { emailHtml } from '../lib/emailTemplate'

// ── Public booking page (Calendly-style), served at #/book with no login ──
// All data access goes through SECURITY DEFINER RPCs (booking_get_config,
// booking_get_slots, booking_create) — anon never touches tables directly,
// consistent with the RLS lockdown.

const C = {
  bg: '#0f172a', card: '#1e293b', line: '#334155',
  text: '#f1f5f9', dim: '#94a3b8', accent: '#2563eb', ok: '#22c55e',
}

const fmt12 = (t) => {
  const [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ap}`
}

export default function BookAppointment() {
  const [cfg, setCfg] = useState(null)
  const [loadErr, setLoadErr] = useState('')
  const [type, setType] = useState('')
  const [date, setDate] = useState('')
  const [slots, setSlots] = useState(null)
  const [time, setTime] = useState('')
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(null)

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('booking_get_config')
      if (error || !data) { setLoadErr('Online booking is unavailable right now. Please call us instead.'); return }
      setCfg(data)
      if ((data.types || []).length) setType(data.types[0])
    })()
  }, [])

  // Next N days from config
  const days = []
  if (cfg) {
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
    const now = new Date()
    for (let i = 0; i < (cfg.maxDaysOut || 30); i++) {
      const d = new Date(now); d.setDate(now.getDate() + i)
      const key = dayKeys[d.getDay()]
      if (cfg.hours && cfg.hours[key]) {
        days.push({ iso: d.toISOString().slice(0, 10), label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) })
      }
      if (days.length >= 21) break
    }
  }

  async function pickDate(iso) {
    setDate(iso); setTime(''); setSlots(null)
    const { data, error } = await supabase.rpc('booking_get_slots', { p_date: iso })
    setSlots(error ? [] : (data || []))
  }

  async function book() {
    if (!form.name.trim() || (!form.email.trim() && !form.phone.trim())) {
      setErr('Please enter your name and at least an email or phone number.'); return
    }
    setSaving(true); setErr('')
    const { data, error } = await supabase.rpc('booking_create', {
      p_name: form.name.trim(), p_email: form.email.trim(), p_phone: form.phone.trim(),
      p_event_type: type, p_date: date, p_time: time, p_notes: form.notes.trim(),
    })
    setSaving(false)
    if (error) { setErr(error.message); return }
    if (data && data.ok === false) {
      setErr(data.message || 'That time was just taken — please pick another slot.')
      pickDate(date)
      return
    }

    // Confirmation to the client + notification to the firm — best-effort,
    // the booking stands even if email sending hiccups.
    const whenLong = `${new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at ${fmt12(time)} (Eastern)`
    if (form.email.trim()) {
      supabase.functions.invoke('send-email', { body: {
        to: form.email.trim(),
        subject: `Appointment Confirmed — ${type}, ${new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${fmt12(time)}`,
        html: emailHtml({ body: `
          <p>Hi <strong>${form.name.trim()}</strong>,</p>
          <p>Your appointment is confirmed:</p>
          <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;width:100%;margin:12px 0">
            <tr><td style="padding:16px 20px;font-size:14px;color:#0f172a;line-height:1.9">
              <strong>${type}</strong><br>${whenLong}
            </td></tr>
          </table>
          <p>Need to reschedule or cancel? Just reply to this email or call us and we'll take care of it.</p>
          <p style="margin-top:20px">Talk soon,<br><strong>Tax Case Review</strong></p>` }),
      } }).catch(() => {})
    }
    supabase.functions.invoke('send-email', { body: {
      to: (data && data.notify_email) || 'info@taxcasereview.org',
      subject: `📅 New online booking: ${form.name.trim()} — ${new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${fmt12(time)}`,
      html: emailHtml({ body: `
        <p><strong>${form.name.trim()}</strong> just booked online:</p>
        <p style="line-height:1.9"><strong>${type}</strong><br>${whenLong}<br>
        Email: ${form.email.trim() || '—'}<br>Phone: ${form.phone.trim() || '—'}${form.notes.trim() ? `<br>Notes: ${form.notes.trim()}` : ''}</p>
        <p>The appointment is on the CRM calendar${form.email.trim() || form.phone.trim() ? '; a lead was created if they were new' : ''}.</p>` }),
    } }).catch(() => {})

    setDone({ date, time, type })
  }

  const box = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20 }
  const input = { width: '100%', boxSizing: 'border-box', background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, color: C.text, padding: '10px 12px', fontSize: 14 }
  const chip = (active) => ({
    padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, textAlign: 'center',
    border: `1px solid ${active ? C.accent : C.line}`, background: active ? C.accent : 'transparent', color: C.text,
  })

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, -apple-system, sans-serif', padding: '32px 16px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 24, fontWeight: 800 }}>Tax Case Review</div>
          <div style={{ color: C.dim, fontSize: 14, marginTop: 4 }}>Schedule an appointment</div>
        </div>

        {loadErr ? (
          <div style={{ ...box, textAlign: 'center', color: C.dim }}>{loadErr}</div>
        ) : !cfg ? (
          <div style={{ ...box, textAlign: 'center', color: C.dim }}>Loading…</div>
        ) : done ? (
          <div style={{ ...box, textAlign: 'center' }}>
            <div style={{ fontSize: 40 }}>✅</div>
            <div style={{ fontWeight: 800, fontSize: 18, marginTop: 8 }}>You're booked!</div>
            <div style={{ color: C.dim, marginTop: 8, fontSize: 14 }}>
              {done.type}<br />
              {new Date(done.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at {fmt12(done.time)} (Eastern)
            </div>
            <div style={{ color: C.dim, marginTop: 12, fontSize: 12.5 }}>We'll reach out to confirm. If anything changes, just give us a call.</div>
          </div>
        ) : (
          <div style={box}>
            {cfg.types.length > 1 && (
              <>
                <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>What is this about?</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginBottom: 18 }}>
                  {cfg.types.map(t => <div key={t} style={chip(type === t)} onClick={() => setType(t)}>{t}</div>)}
                </div>
              </>
            )}

            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Pick a day</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginBottom: 18 }}>
              {days.map(d => <div key={d.iso} style={chip(date === d.iso)} onClick={() => pickDate(d.iso)}>{d.label}</div>)}
            </div>

            {date && (
              <>
                <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Pick a time <span style={{ color: C.dim, fontWeight: 400 }}>(Eastern)</span></div>
                {slots === null ? (
                  <div style={{ color: C.dim, fontSize: 13, marginBottom: 18 }}>Checking availability…</div>
                ) : slots.length === 0 ? (
                  <div style={{ color: C.dim, fontSize: 13, marginBottom: 18 }}>No open times that day — try another date.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8, marginBottom: 18 }}>
                    {slots.map(s => <div key={s} style={chip(time === s)} onClick={() => setTime(s)}>{fmt12(s)}</div>)}
                  </div>
                )}
              </>
            )}

            {time && (
              <>
                <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Your details</div>
                <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
                  <input style={input} placeholder="Full name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                  <input style={input} placeholder="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                  <input style={input} placeholder="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                  <textarea style={{ ...input, resize: 'vertical' }} rows={2} placeholder="Anything we should know? (optional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
                {err && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>{err}</div>}
                <button disabled={saving}
                  style={{ width: '100%', background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '12px 0', fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}
                  onClick={book}>
                  {saving ? 'Booking…' : `Confirm — ${fmt12(time)} on ${new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                </button>
              </>
            )}
          </div>
        )}

        <div style={{ textAlign: 'center', color: C.dim, fontSize: 11.5, marginTop: 16 }}>
          Tax Case Review · North Palm Beach, FL
        </div>
      </div>
    </div>
  )
}
