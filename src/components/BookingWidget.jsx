import { useState } from 'react'
import { supabase } from '../lib/supabase'

// cfoservicesnow.com booking widget — used for NEW LEAD intake only.
const BOOKING_URL = 'https://link.cfoservicesnow.com/widget/booking/EKuBby9X6CzBZpDVN6Mu'

const EVENT_TYPES = ['Consultation Call','Tax Investigation Review','Case Discussion','Document Signing','Follow-Up Call','In-Person Meeting','Other']

// Icon-paired types for the client scheduler's quick-select chips
const CLIENT_EVENT_TYPES = [
  { type: 'Case Discussion',          icon: '💬' },
  { type: 'Tax Investigation Review', icon: '🔍' },
  { type: 'Document Signing',         icon: '✍️' },
  { type: 'Follow-Up Call',           icon: '📞' },
  { type: 'In-Person Meeting',        icon: '🤝' },
  { type: 'Other',                    icon: '📌' },
]

// mode: 'client' = internal-only scheduler (no external widget, no irrelevant questions)
//       'lead'   = external cfoservicesnow intake widget + manual confirm fallback
export default function BookingWidget({ contact, onClose, mode = 'lead' }) {
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const today = new Date().toISOString().slice(0,10)
  const [form, setForm] = useState({
    date: today, time: '', eventType: mode === 'client' ? 'Case Discussion' : 'Consultation Call', notes: '',
  })
  function fld(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // For lead mode: pre-fill the external widget with the lead's info via query params
  const params = new URLSearchParams()
  if (contact?.name)  params.set('name', contact.name)
  if (contact?.email) params.set('email', contact.email)
  if (contact?.phone) params.set('phone', contact.phone)
  const src = params.toString() ? `${BOOKING_URL}?${params.toString()}` : BOOKING_URL

  function copyLink() {
    navigator.clipboard.writeText(src)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function confirmBooking() {
    if (!form.date || !form.time) return
    setSaving(true)
    const title = `${contact?.name || 'Appointment'} - ${form.eventType}`
    const { error } = await supabase.from('calevents').insert([{
      title, clientName: contact?.name || '', date: form.date, time: form.time,
      eventType: form.eventType, color: 'bb', status: 'scheduled',
      notes: form.notes, source: mode === 'client' ? 'internal' : 'booking_widget',
      created_at: new Date().toISOString(),
    }])
    setSaving(false)
    if (error) { alert('Error saving: ' + error.message); return }

    // Team notification
    await supabase.from('chat_messages').insert([{
      channel: 'general', sender: '🔔 System',
      text: `📅 New appointment scheduled: **${contact?.name || 'Client'}** on ${form.date} at ${form.time}${form.eventType ? ` (${form.eventType})` : ''}.`,
      created_at: new Date().toISOString()
    }])

    setConfirmed(true)
    setTimeout(() => { setConfirmed(false); onClose() }, 1500)
  }

  // ── Internal scheduler (clients) — no external widget, no irrelevant questions ──
  if (mode === 'client') {
    const initials = (contact?.name || '?').split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()
    const dateLabel = form.date ? new Date(form.date+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}) : null

    return (
      <div className="modal-bg open" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal" style={{ width: 460, padding: 0, overflow: 'hidden' }}>

          {/* Header band */}
          <div style={{ padding: '18px 20px', background: 'linear-gradient(135deg, var(--blue), var(--b2))', position: 'relative' }}>
            <button className="xbtn" onClick={onClose} style={{ position: 'absolute', top: 12, right: 14, color: '#fff' }}>&times;</button>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.75)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
              Schedule Appointment
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,255,255,.18)', border: '1px solid rgba(255,255,255,.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, color: '#fff', flexShrink: 0 }}>
                {initials}
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>{contact?.name || 'Client'}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.8)' }}>Tax Case Review</div>
              </div>
            </div>
          </div>

          <div style={{ padding: '18px 20px' }}>
            {confirmed ? (
              <div style={{ textAlign: 'center', color: 'var(--ok)', fontWeight: 700, fontSize: 14, padding: '24px 0' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                Appointment scheduled & team notified!
              </div>
            ) : (
              <>
                {/* Appointment type chips */}
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                  What's this about?
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 18 }}>
                  {CLIENT_EVENT_TYPES.map(({type, icon}) => (
                    <button key={type} onClick={() => fld('eventType', type)}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        padding: '10px 4px', borderRadius: 10, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                        border: form.eventType === type ? '1.5px solid var(--blue)' : '1px solid var(--br)',
                        background: form.eventType === type ? 'var(--blt)' : 'var(--s2)',
                        color: form.eventType === type ? 'var(--b2)' : 'var(--t2)',
                        transition: 'all .12s',
                      }}>
                      <span style={{ fontSize: 18 }}>{icon}</span>
                      <span style={{ textAlign: 'center', lineHeight: 1.2 }}>{type}</span>
                    </button>
                  ))}
                </div>

                {/* Date & Time */}
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                  When?
                </div>
                <div className="fg2" style={{ marginBottom: 14 }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label>📅 Date</label>
                    <input type="date" value={form.date} onChange={e => fld('date', e.target.value)} />
                    {dateLabel && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>{dateLabel}</div>}
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>🕐 Time</label>
                    <input type="time" value={form.time} onChange={e => fld('time', e.target.value)} />
                  </div>
                </div>

                {/* Notes */}
                <div className="field" style={{ marginBottom: 18 }}>
                  <label>📝 Notes <span style={{ fontWeight: 400, color: 'var(--t3)', textTransform: 'none' }}>(optional)</span></label>
                  <textarea rows={3} value={form.notes} onChange={e => fld('notes', e.target.value)} placeholder="What will be discussed on this call..." />
                </div>

                <button className="btn pri" style={{ width: '100%', justifyContent: 'center', padding: 11, fontSize: 14, fontWeight: 700, gap: 8 }}
                  onClick={confirmBooking} disabled={saving || !form.date || !form.time}>
                  {saving ? 'Saving…' : <>✅ Schedule & Notify Team</>}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── External widget (leads) — new prospect intake via cfoservicesnow ──
  return (
    <div className="modal-bg open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 720, maxWidth: '96vw', height: '85vh', maxHeight: '85vh', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="mh" style={{ padding: '14px 18px', borderBottom: '1px solid var(--br)' }}>
          <div>
            <span className="mt">📅 Schedule Appointment</span>
            {contact?.name && (
              <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>for {contact.name}</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn sec" style={{ fontSize: 11, padding: '5px 10px' }} onClick={copyLink}>
              {copied ? '✅ Copied!' : '🔗 Copy Link'}
            </button>
            <button className="xbtn" onClick={onClose}>&times;</button>
          </div>
        </div>
        <iframe
          src={src}
          title="Schedule Appointment"
          style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }}
        />

        {!confirmOpen ? (
          <div style={{ padding: '10px 18px', borderTop: '1px solid var(--br)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 11, color: 'var(--t3)' }}>
              Booked an appointment above? Add it to your CRM Calendar and notify the team.
            </div>
            <button className="btn pri" style={{ fontSize: 12, padding: '7px 14px', whiteSpace: 'nowrap' }} onClick={() => setConfirmOpen(true)}>
              ✅ Booked — Add to Calendar
            </button>
          </div>
        ) : (
          <div style={{ padding: '14px 18px', borderTop: '1px solid var(--br)', background: 'var(--s2)' }}>
            {confirmed ? (
              <div style={{ textAlign: 'center', color: 'var(--ok)', fontWeight: 700, fontSize: 13, padding: '6px 0' }}>
                ✅ Added to Calendar & team notified!
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                  Confirm Appointment Details
                </div>
                <div className="fg3" style={{ marginBottom: 8 }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Date</label>
                    <input type="date" value={form.date} onChange={e => fld('date', e.target.value)} />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Time</label>
                    <input type="time" value={form.time} onChange={e => fld('time', e.target.value)} />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Type</label>
                    <select value={form.eventType} onChange={e => fld('eventType', e.target.value)}>
                      {EVENT_TYPES.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn sec" style={{ flex: 1, justifyContent: 'center', padding: 9 }} onClick={() => setConfirmOpen(false)}>Cancel</button>
                  <button className="btn pri" style={{ flex: 2, justifyContent: 'center', padding: 9 }} onClick={confirmBooking} disabled={saving || !form.date || !form.time}>
                    {saving ? 'Saving…' : '✅ Confirm & Notify Team'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
