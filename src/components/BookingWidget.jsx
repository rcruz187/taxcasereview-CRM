import { useState } from 'react'

// cfoservicesnow.com booking widget — embedded in our own Tax Case Review modal chrome.
const BOOKING_URL = 'https://link.cfoservicesnow.com/widget/booking/EKuBby9X6CzBZpDVN6Mu'

export default function BookingWidget({ contact, onClose }) {
  const [copied, setCopied] = useState(false)

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
        <div style={{ padding: '8px 18px', borderTop: '1px solid var(--br)', fontSize: 11, color: 'var(--t3)' }}>
          Once booked, this appointment will sync to your CRM Calendar and the team will be notified automatically.
        </div>
      </div>
    </div>
  )
}
