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

  const label = { display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 5 }
  const input = {
    width: '100%', boxSizing: 'border-box', background: 'rgba(15,23,42,0.55)',
    border: '1px solid var(--line)', borderRadius: 8, color: 'inherit',
    padding: '10px 12px', fontSize: 13.5, outline: 'none', fontFamily: 'inherit',
  }
  const chip = (active) => ({
    padding: '8px 4px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, textAlign: 'center',
    border: `1px solid ${active ? '#2563eb' : 'var(--line)'}`,
    background: active ? '#2563eb' : 'rgba(15,23,42,0.4)', color: active ? '#fff' : 'inherit',
    transition: 'all 0.12s ease',
  })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--s2)', border: '1px solid var(--line)', borderRadius: 14, width: 'min(560px, 96vw)', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>

        {/* Header band */}
        <div style={{ background: 'linear-gradient(135deg, #1d4ed8, #2563eb 60%, #3b82f6)', padding: '16px 20px', borderRadius: '13px 13px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#fff', letterSpacing: '0.01em' }}>📅 Book Appointment</div>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11.5, marginTop: 2 }}>Live availability · new callers become a lead automatically</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', width: 28, height: 28, fontSize: 13, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: 20 }}>
          {cfg === undefined ? (
            <div style={{ color: 'var(--t3)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Loading availability…</div>
          ) : cfg === null ? (
            <div style={{ color: 'var(--t3)', fontSize: 13, lineHeight: 1.6 }}>
              Online booking is turned off, so live availability isn't running. Enable it in
              <b> Settings → Online Booking</b> — or use + New Event to place it manually.
            </div>
          ) : done ? (
            <div style={{ textAlign: 'center', padding: '14px 0 6px' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, margin: '0 auto' }}>✅</div>
              <div style={{ fontWeight: 800, fontSize: 17, marginTop: 12 }}>Booked!</div>
              <div style={{ color: 'var(--t3)', fontSize: 12.5, marginTop: 8, lineHeight: 1.7 }}>
                <b style={{ color: 'inherit' }}>{form.name}</b> · {form.type}<br />
                {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at {fmt12(time)} ET<br />
                On the calendar, note on the record{form.email.trim() && sendEmail ? ', confirmation emailed' : ''}.
              </div>
              <button onClick={onClose} style={{ marginTop: 16, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 28px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Done</button>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={label}>Full name *</label>
                  <input style={input} value={form.name} onChange={e => ff('name', e.target.value)} placeholder="Jane Taxpayer" autoFocus />
                </div>
                <div>
                  <label style={label}>Email</label>
                  <input style={input} type="email" value={form.email} onChange={e => ff('email', e.target.value)} placeholder="jane@email.com" />
                </div>
                <div>
                  <label style={label}>Phone</label>
                  <input style={input} value={form.phone} onChange={e => ff('phone', e.target.value)} placeholder="(561) 555-0100" />
                </div>
                <div>
                  <label style={label}>Appointment type</label>
                  <select style={{ ...input, cursor: 'pointer' }} value={form.type} onChange={e => ff('type', e.target.value)}>
                    {(cfg.types || []).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={label}>Date</label>
                  <input style={{ ...input, cursor: 'pointer', colorScheme: 'dark' }} type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={e => pickDate(e.target.value)} />
                </div>
                {date && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={label}>Available times <span style={{ textTransform: 'none', fontWeight: 400 }}>(Eastern)</span></label>
                    {slots === null ? (
                      <div style={{ color: 'var(--t3)', fontSize: 12.5, padding: '6px 0' }}>Checking availability…</div>
                    ) : slots.length === 0 ? (
                      <div style={{ color: 'var(--t3)', fontSize: 12.5, background: 'rgba(15,23,42,0.4)', border: '1px dashed var(--line)', borderRadius: 8, padding: '12px 14px' }}>
                        No open times that day — closed, fully booked, or inside the minimum-notice window. Try another date.
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 7 }}>
                        {slots.map(s => <div key={s} style={chip(time === s)} onClick={() => setTime(s)}>{fmt12(s)}</div>)}
                      </div>
                    )}
                  </div>
                )}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={label}>Notes</label>
                  <textarea style={{ ...input, resize: 'vertical', minHeight: 54 }} rows={2} value={form.notes} onChange={e => ff('notes', e.target.value)} placeholder="Anything the rep should know before the call…" />
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, margin: '14px 0 12px', cursor: 'pointer', color: form.email.trim() ? 'inherit' : 'var(--t3)' }}>
                <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} style={{ width: 15, height: 15 }} />
                Email them a confirmation{form.email.trim() ? '' : ' — needs an email above'}
              </label>

              {err && (
                <div style={{ color: '#fca5a5', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, marginBottom: 12 }}>{err}</div>
              )}

              <button disabled={saving || !form.name.trim() || !time} onClick={book}
                style={{
                  width: '100%', border: 'none', borderRadius: 10, padding: '13px 0',
                  fontSize: 14.5, fontWeight: 800, cursor: saving || !form.name.trim() || !time ? 'not-allowed' : 'pointer',
                  background: saving || !form.name.trim() || !time ? 'rgba(37,99,235,0.35)' : 'linear-gradient(135deg, #1d4ed8, #2563eb)',
                  color: '#fff', boxShadow: saving || !form.name.trim() || !time ? 'none' : '0 6px 18px rgba(37,99,235,0.35)',
                  transition: 'all 0.15s ease',
                }}>
                {saving ? 'Booking…' : time
                  ? `Book — ${fmt12(time)} on ${new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
                  : !form.name.trim() ? 'Enter a name to book' : 'Pick a date & time to book'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
