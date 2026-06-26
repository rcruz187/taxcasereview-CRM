// PhoneNumber — click any phone number to dial it immediately via CRM dialer.
// No popup, no picker, no copy. Just dial.
import { useNavigate } from 'react-router-dom'

export default function PhoneNumber({ val, name = '' }) {
  const nav = useNavigate()
  if (!val) return <span style={{color:'var(--t3)'}}>—</span>
  const digits = val.replace(/\D/g,'')

  function dial(e) {
    e.stopPropagation()
    sessionStorage.setItem('dialerNumber', digits)
    sessionStorage.setItem('dialerName', name)
    nav('/dialer')
  }

  return (
    <span onClick={dial}
      style={{color:'var(--blue)',fontWeight:600,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:5,fontFamily:'monospace'}}
      onMouseEnter={e=>e.currentTarget.style.textDecoration='underline'}
      onMouseLeave={e=>e.currentTarget.style.textDecoration='none'}
      title="Click to dial">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.18 1h3a2 2 0 012 1.72 12.05 12.05 0 00.7 2.81 2 2 0 01-.45 2.11L4.91 8.15a16 16 0 006.29 6.29l1.51-1.52a2 2 0 012.11-.45 12.05 12.05 0 002.81.7A2 2 0 0122 16.92z"/></svg>
      {val}
    </span>
  )
}
