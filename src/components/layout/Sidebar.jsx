import { useState, useEffect } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { supabase } from '../../lib/supabase'

const LOGO = '/taxcasereview-CRM/logo.png'

// Karbon-style accordion sections
const SECTIONS = [
  {
    key: 'overview',
    label: 'Overview',
    always: true,
    items: [
      { path: '/',          icon: GridIcon,    label: 'Home',     section: null },
      { path: '/email',     icon: EmailIcon,   label: 'Email',         section: 'email' },
      { path: '/chat',      icon: ChatIcon,    label: 'Team Chat',     section: 'chat' },
      { path: '/calendar',  icon: CalIcon,     label: 'Calendar',      section: 'calendar' },
      { path: '/tasks',     icon: TaskIcon,    label: 'Tasks',         section: 'tasks' },
    ]
  },
  {
    key: 'clientwork',
    label: 'Client Work',
    items: [
      { path: '/leads',     icon: LeadIcon,    label: 'Leads',         badge: 'leads',     section: 'leads' },
      { path: '/clients',   icon: ClientIcon,  label: 'Clients',       section: 'clients' },
      { path: '/cases',     icon: CaseIcon,    label: 'Cases',         badge: 'cases',     section: 'cases' },
      { path: '/deadlines', icon: ClockIcon,   label: 'Deadlines',     badge: 'deadlines', badgeWarn: true, section: 'deadlines' },
    ]
  },
  {
    key: 'comms',
    label: 'Communications',
    items: [
      { path: '/sms',       icon: SmsIcon,     label: 'SMS',           section: 'sms' },
      { path: '/dialer',    icon: DialIcon,    label: 'Dialer',        section: 'dialer' },
      { path: '/documents', icon: FolderIcon,  label: 'Documents',     section: 'documents' },
      { path: '/esign',     icon: SignIcon,    label: 'E-Signatures',  section: 'esign' },
      { path: '/fax',       icon: FaxIcon,     label: 'Fax',           section: 'fax' },
    ]
  },
  {
    key: 'billing',
    label: 'Billing',
    items: [
      { path: '/invoices',  icon: InvIcon,     label: 'Invoices',      section: 'invoices' },
      { path: '/payments',  icon: PayIcon,     label: 'Payments',      section: 'payments' },
      { path: '/books',       icon: BooksIcon,   label: 'Books & Ledger',    section: 'books' },
      { path: '/formacorp',    icon: CorpIcon,    label: 'FormaCorp',         section: 'formacorp' },
    ]
  },
  {
    key: 'irs',
    label: 'IRS Resolution',
    items: [
      { path: '/transcripts', icon: DocIcon,   label: 'Transcripts',   section: 'transcripts' },
      { path: '/irsforms',    icon: FormIcon,  label: 'IRS Forms',     section: 'irsforms' },
      { path: '/taxreturns',  icon: ReturnIcon,label: 'Tax Returns',   section: 'taxreturns' },
      { path: '/irsreference', icon: PhoneBookIcon, label: 'IRS Reference', section: 'irsreference' },
    ]
  },
  {
    key: 'hr',
    label: 'HR & Payroll',
    items: [
      { path: '/kiosk',     icon: KioskIcon,   label: 'Time Kiosk',    section: null },
      { path: '/timeclock', icon: ClockIcon,   label: 'Time Clock',    section: 'timeclock' },
      { path: '/payroll',   icon: PayrollIcon, label: 'Payroll',       section: 'payroll' },
    ]
  },
  {
    key: 'firm',
    label: 'Firm',
    items: [
      { path: '/employees', icon: EmpIcon,     label: 'Employees',     section: 'employees' },
      { path: '/reports',   icon: BarIcon,     label: 'Reports',       section: 'reports' },
      { path: '/settings',  icon: GearIcon,    label: 'Settings',      section: 'settings' },
    ]
  },
]

export default function Sidebar() {
  const { user, logout, can, role } = useApp()
  const location = useLocation()
  const navigate = useNavigate()
  const [logoUrl, setLogoUrl] = useState(LOGO)

  // Determine which section contains the active route
  function activeSection() {
    for (const s of SECTIONS) {
      if (s.always) continue
      if (s.items.some(i => i.path !== '/' && location.pathname.startsWith(i.path))) return s.key
    }
    return null
  }

  const [openKey, setOpenKey] = useState('clientwork')

  // Auto-open the section that contains the active page on navigation
  useEffect(() => {
    const active = activeSection()
    if (active) setOpenKey(active)
  }, [location.pathname])

  const [firmName, setFirmName] = useState('Tax Case Review')
  const [tagline,  setTagline]  = useState('IRS Resolution Services')

  useEffect(() => {
    async function loadBranding() {
      const { data: s } = await supabase.from('settings').select('name,tagline').limit(1).maybeSingle()
      if (s?.name)    setFirmName(s.name)
      if (s?.tagline) setTagline(s.tagline)
      const { data } = supabase.storage.from('firm-assets').getPublicUrl('logo')
      if (data?.publicUrl) {
        const img = new Image()
        img.onload = () => setLogoUrl(data.publicUrl + '?t=' + Date.now())
        img.src = data.publicUrl
      }
    }
    loadBranding()
  }, [])

  function toggle(key) {
    setOpenKey(prev => prev === key ? null : key)
  }

  return (
    <aside className="sidebar">
      <div className="brand" onClick={() => navigate('/')} style={{flexDirection:'column',alignItems:'center',padding:'16px 12px 12px',gap:8}}>
        {logoUrl
          ? <img src={logoUrl} alt={firmName} style={{width:'100%',maxWidth:140,height:56,objectFit:'contain'}}/>
          : <div style={{fontWeight:900,fontSize:18,color:'var(--blue)',textAlign:'center',lineHeight:1.2}}>{firmName}</div>
        }
        <div style={{textAlign:'center'}}>
          <div className="brand-name" style={{fontSize:13}}>{firmName}</div>
          <div className="brand-sub" style={{fontSize:10}}>{tagline || 'IRS Resolution Services'}</div>
        </div>
      </div>

      {SECTIONS.map(section => {
        const isOpen = section.always || openKey === section.key
        const hasActive = !section.always && section.items.some(i => i.path !== '/' && location.pathname.startsWith(i.path))

        return (
          <div key={section.key}>
            {/* Section header — clickable for non-always sections */}
            {section.always ? (
              <div className="nav-group">{section.label}</div>
            ) : (
              <div
                className="nav-group"
                onClick={() => toggle(section.key)}
                style={{
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingRight: 10,
                  color: hasActive ? 'var(--blue)' : 'var(--t2)',
                  userSelect: 'none',
                  fontSize: 12,
                }}
              >
                <span>{section.label}</span>
                <svg
                  width="10" height="10" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s', flexShrink: 0 }}
                >
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>
            )}

            {/* Items — only show when open */}
            {isOpen && section.items.map(item => {
              if (item.section && !can('view', item.section)) return null
              const Icon = item.icon
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                >
                  <Icon />
                  {item.label}
                  {item.badge && <span className={`nav-badge${item.badgeWarn ? ' warn' : ''}`} id={`badge-${item.badge}`}>0</span>}
                </NavLink>
              )
            })}
          </div>
        )
      })}

      <div style={{ flex: 1 }} />

      {user && (
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--br)', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 2 }}>Signed in as</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)', marginBottom: 2 }}>{user.user_metadata?.name || user.email}</div>
          <div style={{ fontSize: 10, color: 'var(--blue)', marginBottom: 8 }}>{role}</div>
          <button className="btn sm full" onClick={logout}>Sign Out</button>
        </div>
      )}
    </aside>
  )
}

/* ── SVG Icons ── */
function BooksIcon()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="12" y1="7" x2="16" y2="7"/><line x1="12" y1="11" x2="16" y2="11"/></svg> }
function DialIcon()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.39 2 2 0 0 1 3.6 1.21h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.69a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 16z"/></svg> }
function GridIcon()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> }
function CalIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> }
function LeadIcon()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg> }
function ClientIcon()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg> }
function CaseIcon()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> }
function TaskIcon()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> }
function DocIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg> }
function FormIcon()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> }
function ReturnIcon()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/></svg> }
function PhoneBookIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 3h13a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4z"/><path d="M4 7h2"/><path d="M4 12h2"/><path d="M4 17h2"/></svg> }
function ClockIcon()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> }
function EstIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg> }
function InvIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg> }
function PayIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> }
function SmsIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> }
function EmailIcon()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> }
function FolderIcon()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> }
function SignIcon()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg> }
function ChatIcon()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="9" y1="14" x2="13" y2="14"/></svg> }
function PayrollIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> }
function EmpIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg> }
function KioskIcon()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18.01"/><rect x="8" y="6" width="8" height="8" rx="1"/></svg> }
function BarIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> }
function GearIcon()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> }
function FaxIcon()   { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="4" height="16"/><path d="M22 7H6V3a1 1 0 011-1h14a1 1 0 011 1v4z"/><rect x="6" y="11" width="16" height="12"/></svg> }
function CorpIcon()   { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> }
