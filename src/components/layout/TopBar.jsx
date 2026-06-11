import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'

const PAGE_TITLES = {
  '/':            'Dashboard',  '/calendar':    'Calendar',
  '/leads':       'Leads',      '/clients':     'Clients',
  '/cases':       'Cases',      '/tasks':       'Tasks',
  '/transcripts': 'Transcripts','/irsforms':    'IRS Forms',
  '/deadlines':   'Deadlines',  '/invoices':    'Invoices',
  '/payments':    'Payments',   '/sms':         'SMS',
  '/email':       'Email',      '/documents':   'Documents',
  '/esign':       'E-Signatures','/timeclock':  'Time Clock',
  '/payroll':     'Payroll',    '/employees':   'Employees',
  '/reports':     'Reports',    '/settings':    'Settings',
  '/books':       'Books & FormACorp', '/dialer': 'Dialer',
  '/chat':        'Team Chat',  '/taxreturns':  'Tax Returns',
}

const NEW_ITEMS = [
  { icon: '📅', label: 'New Event',      sub: 'Add to calendar',       path: '/calendar',    color: '#8b5cf6' },
  { icon: '📧', label: 'New Email',      sub: 'Compose email',         path: '/email',       color: '#0ea5e9' },
  { icon: '✍️', label: 'New E-Sign',     sub: 'Request signature',     path: '/esign',       color: '#7c3aed' },
  { icon: '📊', label: 'New Entry',      sub: 'Books & Ledger',        path: '/books',       color: '#10b981' },
  { icon: '📠', label: 'New Fax',        sub: 'Send a fax',            path: '/fax',         color: '#dc2626' },
  { icon: '🏢', label: 'New Corp',       sub: 'Formation case',        path: '/formacorp',   color: '#6366f1' },
  { icon: '📋', label: 'New Case',       sub: 'Open a case',           path: '/cases',       color: '#f59e0b' },
  { icon: '👤', label: 'New Client',     sub: 'Add a client file',     path: '/clients',     color: '#3b82f6' },
  { icon: '📁', label: 'New Document',   sub: 'Upload document',       path: '/documents',   color: '#f97316' },
  { icon: '🧾', label: 'New Invoice',    sub: 'Bill a client',         path: '/invoices',    color: '#ef4444' },
  { icon: '👥', label: 'New Lead',       sub: 'Add a prospect',        path: '/leads',       color: '#a855f7' },
  { icon: '💳', label: 'New Payment',    sub: 'Record a payment',      path: '/payments',    color: '#22c55e' },
  { icon: '✅', label: 'New Task',       sub: 'Assign work',           path: '/tasks',       color: '#06b6d4' },
  { icon: '📝', label: 'New Transcript', sub: 'Add transcript',        path: '/transcripts', color: '#14b8a6' },
]

export default function TopBar({ onNew }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { searchQ, setSearchQ } = useApp()
  const [clock, setClock] = useState('')
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)
  const btnRef   = useRef(null)

  const title = PAGE_TITLES[location.pathname] || 'Tax Resolution CRM'

  useEffect(() => {
    const tick = () => {
      const d = new Date()
      setClock(d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }))
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (!panelRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on route change
  useEffect(() => { setOpen(false) }, [location.pathname])

  const MODAL_PATHS = new Set(['/leads','/clients','/cases','/tasks','/invoices','/payments','/documents','/calendar','/email','/esign','/fax'])
  function go(path) {
    setOpen(false)
    navigate(MODAL_PATHS.has(path) ? path + '?new=1' : path)
  }

  return (
    <div className="topbar" style={{ position: 'relative' }}>
      <span className="page-title">{title}</span>
      <input
        className="search-input"
        placeholder="Search clients, cases, leads…"
        value={searchQ}
        onChange={e => setSearchQ(e.target.value)}
      />
      <span className="topbar-clock">{clock}</span>

      {/* Jobber-style + New button */}
      <button ref={btnRef} className="btn pri" onClick={() => setOpen(o => !o)}
        style={{ position: 'relative', minWidth: 72 }}>
        {open ? '✕ Close' : '+ New'}
      </button>

      {/* Slide-out panel */}
      {open && (
        <>
          {/* backdrop */}
          <div style={{
            position: 'fixed', inset: 0, zIndex: 998,
            background: 'rgba(0,0,0,.25)',
          }} onClick={() => setOpen(false)}/>

          {/* panel */}
          <div ref={panelRef} style={{
            position: 'fixed', top: 52, right: 0, bottom: 0,
            width: 280, background: 'var(--sf)', borderLeft: '1px solid var(--br)',
            zIndex: 999, display: 'flex', flexDirection: 'column',
            boxShadow: '-8px 0 32px rgba(0,0,0,.35)',
            animation: 'slideInRight .18s ease-out',
          }}>
            <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--br)', flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)' }}>Create New</div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>What would you like to add?</div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
              {NEW_ITEMS.map(item => (
                <button key={item.path} onClick={() => go(item.path)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px', borderRadius: 8, border: 'none', background: 'none',
                    cursor: 'pointer', textAlign: 'left', marginBottom: 2,
                    transition: 'background .12s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                    background: item.color + '22', border: `1px solid ${item.color}44`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                  }}>{item.icon}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)' }}>{item.sub}</div>
                  </div>
                  <svg style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--t3)' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              ))}
            </div>
          </div>

          <style>{`@keyframes slideInRight { from { transform: translateX(100%); opacity: 0 } to { transform: translateX(0); opacity: 1 } }`}</style>
        </>
      )}
    </div>
  )
}
