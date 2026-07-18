import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { fmt12, sendClientConfirmation } from '../lib/bookingEmails'

// ── Internal Book Appointment (Calendar header) ──
// For the caller who doesn't exist in the CRM yet: staff enter name/email/
// phone, pick from the SAME live availability as the public page, and book.
// booking_create does the rest — calendar event, auto-created lead, note on
// the record — and the client gets the confirmation email if they have one.

export default function InternalBooking({ onClose, onBooked }) {
  const { employeeName } = useApp()
  const [cfg, setCfg] = useState(undefined) // undefined=loading, null=disabled
  const [form, setForm] = useState({ name: '', email: '', phone: '', type: '', notes: '' })
  const [date, setDate] = useState('')
  const [slots, setSlots] = useState(null)
  const [time, setTime] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('booking_get_config')
      setCfg(error ? null : data)
      if (data?.types?.length) setForm(f => ({ ...f, type: data.types[0] }))
    })()
  }, [])

  function ff(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function pickDate(iso) {
    setDate(iso); setTime(''); setSlots(null)
    if (!iso) return
    const { data, error } = await supabase.rpc('booking_get_slots', { p_date: iso })
    setSlots(error ? [] : (data || []))
  }

  async function book() {
    if (!form.name.trim() || !date || !time) { setErr('Name, date, and time are required.'); return }
    setSaving(true); setErr('')
    const { data, error } = await supabase.rpc('booking_create', {
      p_name: form.name.trim(), p_email: form.email.trim(), p_phone: form.phone.trim(),
      p_event_type: form.type, p_date: date, p_time: time,
      p_notes: (form.notes.trim() ? form.notes.trim() + ' ' : '') + `(booked by ${employeeName || 'staff'})`,
    })
    setSaving(false)
    if (error) { setErr(error.message); return }
    if (data && data.ok === false) { setErr(data.message || 'That time was just taken.'); pickDate(date); return }
    if (sendEmail && form.email.trim()) {
      sendClientConfirmation({ name: form.name.trim(), email: form.email.trim(), type: form.type, date, time })
    }
    setDone(true)
    if (onBooked) onBooked()
  }

  const input = { width: '100%', boxSizing: 'border-box' }
  const chip = (active) => ({
    padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, textAlign: 'center',
    border: `1px solid ${active ? 'var(--blue, #2563eb)' : 'var(--line)'}`,
    background: active ? 'var(--blue, #2563eb)' : 'transparent', color: active ? '#fff' : 'var(--tx, inherit)',
  })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--s2)', border: '1px solid var(--line)', borderRadius: 12, padding: 20, width: 'min(560px, 94vw)', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>📅 Book Appointment</div>
          <button className="btn sec" style={{ fontSize: 11, padding: '4px 10px' }} onClick={onClose}>✕</button>
        </div>

        {cfg === undefined ? (
          <div style={{ color: 'var(--t3)', fontSize: 13 }}>Loading availability…</div>
        ) : cfg === null ? (
          <div style={{ color: 'var(--t3)', fontSize: 13 }}>
            Online booking is turned off, so live availability isn't running. Enable it in
            <b> Settings → Online Booking</b> (set your hours and toggle ON) — or use + New Event to place it manually.
          </div>
        ) : done ? (
          <div style={{ textAlign: 'center', padding: '18px 0' }}>
            <div style={{ fontSize: 34 }}>✅</div>
            <div style={{ fontWeight: 800, marginTop: 6 }}>Booked!</div>
            <div style={{ color: 'var(--t3)', fontSize: 12.5, marginTop: 6 }}>
              {form.name} · {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {fmt12(time)} ET<br />
              On the calendar, note on the record{form.email.trim() ? sendEmail ? ', confirmation emailed' : '' : ''} — new callers become a lead automatically.
            </div>
            <button className="btn" style={{ marginTop: 14 }} onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <div style={{ color: 'var(--t3)', fontSize: 11.5, marginBottom: 12 }}>
              No record needed — if this person isn't in the CRM yet, booking creates the lead automatically
              (matched by email/phone if they already exist).
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 11, color: 'var(--t3)' }}>Full name *</label>
                <input style={input} value={form.name} onChange={e => ff('name', e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--t3)' }}>Email</label>
                <input style={input} type="email" value={form.email} onChange={e => ff('email', e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--t3)' }}>Phone</label>
                <input style={input} value={form.phone} onChange={e => ff('phone', e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--t3)' }}>Appointment type</label>
                <select style={input} value={form.type} onChange={e => ff('type', e.target.value)}>
                  {(cfg.types || []).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--t3)' }}>Date</label>
                <input style={input} type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={e => pickDate(e.target.value)} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                {date && (slots === null ? (
                  <div style={{ color: 'var(--t3)', fontSize: 12 }}>Checking availability…</div>
                ) : slots.length === 0 ? (
                  <div style={{ color: 'var(--t3)', fontSize: 12 }}>No open times that day (closed, full, or too soon) — pick another date.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 6 }}>
                    {slots.map(s => <div key={s} style={chip(time === s)} onClick={() => setTime(s)}>{fmt12(s)}</div>)}
                  </div>
                ))}
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 11, color: 'var(--t3)' }}>Notes</label>
                <textarea style={{ ...input, resize: 'vertical' }} rows={2} value={form.notes} onChange={e => ff('notes', e.target.value)} />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, margin: '12px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} />
              Email them a confirmation{form.email.trim() ? '' : ' (needs an email above)'}
            </label>
            {err && <div style={{ color: '#f87171', fontSize: 12.5, marginBottom: 8 }}>{err}</div>}
            <button className="btn" disabled={saving || !form.name.trim() || !time} style={{ width: '100%' }} onClick={book}>
              {saving ? 'Booking…' : time ? `Book — ${fmt12(time)} on ${new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Book Appointment'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
