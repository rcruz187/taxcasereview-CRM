// PhoneNumber — click to call immediately via RELAY dialer.
// Same behavior as InPlaceCaller on detail pages.
// No navigation, no popup, no app picker — just dials.
import { useCall } from '../context/CallContext'

export default function PhoneNumber({ val, name = '' }) {
  const { startCall, relayStatus } = useCall()
  if (!val) return <span style={{color:'var(--t3)'}}>—</span>

  function dial(e) {
    e.preventDefault()
    e.stopPropagation()
    startCall({ name: name || val, phone: val, entityType: 'reference', status: 'Reference' })
  }

  return (
    <span onClick={relayStatus === 'ready' ? dial : undefined}
      style={{
        color: relayStatus === 'ready' ? 'var(--blue)' : 'var(--t2)',
        fontWeight: 600, cursor: relayStatus === 'ready' ? 'pointer' : 'default',
        display: 'inline-flex', alignItems: 'center', gap: 5,
      }}
      title={relayStatus === 'ready' ? 'Click to call' : 'Dialer not connected'}
      onMouseEnter={e => { if (relayStatus === 'ready') e.currentTarget.style.textDecoration = 'underline' }}
      onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.18 1h3a2 2 0 012 1.72 12.05 12.05 0 00.7 2.81 2 2 0 01-.45 2.11L4.91 8.15a16 16 0 006.29 6.29l1.51-1.52a2 2 0 012.11-.45 12.05 12.05 0 002.81.7A2 2 0 0122 16.92z"/></svg>
      {val}
    </span>
  )
}
