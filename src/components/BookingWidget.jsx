import { useState } from 'react'
import { supabase } from '../lib/supabase'

// cfoservicesnow.com booking widget — embedded in our own Tax Case Review modal chrome.
const BOOKING_URL = 'https://link.cfoservicesnow.com/widget/booking/EKuBby9X6CzBZpDVN6Mu'

export default function BookingWidget({ contact, onClose }) {
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  // Confirmation form (shown after clicking "Booked — Add to Calendar")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const today = new Date().toISOString().slice(0,10)
  const [form, setForm] = useState({
    date: today, time: '', eventType: 'Consultation Call', notes: '',
  })
  function fld(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // Pre-fill the booking widget with the lead/client's info via query params
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
    const { data, error } = await supabase.from('calevents').insert([{
      title, clientName: contact?.name || '', date: form.date, time: form.time,
      eventType: form.eventType, color: 'bb', status: 'scheduled',
      notes: form.notes, source: 'booking_widget',
      created_at: new Date().toISOString(),
    }]).select().single()
    setSaving(false)
    if (error) { alert('Error saving: ' + error.message); return }

    // Team notification
    await supabase.from('chat_messages').insert([{
      channel: 'general', sender: '🔔 System',
      text: `📅 New appointment booked online: **${contact?.name || 'Client'}** on ${form.date} at ${form.time}${form.eventType ? ` (${form.eventType})` : ''}.`,
      created_at: new Date().toISOString()
    }])

    setConfirmed(true)
    setTimeout(() => { setConfirmed(false); setConfirmOpen(false) }, 2000)
  }

  return (
    <div className="modal-bg open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 720, maxWidth: '96vw', height: '85vh', maxHeight: '85vh', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="mh" style={{ padding: '14px 18px', borderBottom: '1px solid var(--br)' }}>
          <div>
            <span className="mt">📅 Schedule Appointment — Tax Case Review</span>
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
          title="Tax Case Review — Schedule Appointment"
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
                      {['Consultation Call','Tax Investigation Review','Document Signing','Follow-Up Call','In-Person Meeting','Other'].map(o => <option key={o}>{o}</option>)}
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
