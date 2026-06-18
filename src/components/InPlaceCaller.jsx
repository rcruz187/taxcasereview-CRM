import { useCall } from '../context/CallContext'

// Renders a clickable phone number on Lead and Client detail pages.
// Clicking it fires the real RELAY browser dialer (same connection used on
// the Dialer page) — no tel: link, no OS app picker popup, no page trip.
// The global ActiveCallBar that renders on every page handles the in-call
// timer and the "End & Log Call" flow, same as any call started from the
// Dialer page, so there's nothing duplicate to render here.
export default function InPlaceCaller({ phone, name, entityType, entityId }) {
  const { startCall, relayStatus } = useCall()

  if (!phone) return <span style={{ color: 'var(--t3)' }}>—</span>

  function dial(e) {
    e.preventDefault()
    e.stopPropagation()
    startCall({
      id: entityId || null,
      name: name || phone,
      first: '',
      last: '',
      phone,
      status: entityType === 'client' ? 'Client' : 'Lead',
      entityType: entityType || 'lead',
    })
  }

  return (
    <span
      onClick={relayStatus === 'ready' ? dial : undefined}
      title={relayStatus !== 'ready' ? 'Phone line connecting…' : `Call ${name || phone}`}
      style={{
        color: relayStatus === 'ready' ? 'var(--blue)' : 'var(--t3)',
        fontWeight: 600,
        cursor: relayStatus === 'ready' ? 'pointer' : 'default',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        textDecoration: 'none',
      }}
      onMouseEnter={e => { if (relayStatus === 'ready') e.currentTarget.style.textDecoration = 'underline' }}
      onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none' }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.18 1h3a2 2 0 012 1.72 12.05 12.05 0 00.7 2.81 2 2 0 01-.45 2.11L4.91 8.15a16 16 0 006.29 6.29l1.51-1.52a2 2 0 012.11-.45 12.05 12.05 0 002.81.7A2 2 0 0122 16.92z"/>
      </svg>
      {phone}
    </span>
  )
}
