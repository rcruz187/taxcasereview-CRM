import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { playSound } from '../lib/notifySound'

const AppContext = createContext(null)

// ── Section → DB column map ──────────────────────────────────────────────
// Each route/section maps to a perm_* column on the employees table.
// 0 = No Access, 1 = View Only, 2 = Edit, 3 = Full Admin
export const SECTION_COLS = {
  leads:       'perm_clients',
  clients:     'perm_clients',
  cases:       'perm_clients',
  tasks:       'perm_clients',
  deadlines:   'perm_clients',
  estimates:   'perm_billing',
  invoices:    'perm_billing',
  payments:    'perm_billing',
  books:       'perm_billing',
  calendar:    'perm_schedule',
  documents:   'perm_documents',
  esign:       'perm_documents',
  transcripts: 'perm_irs',
  irsforms:    'perm_irs',
  irsreference:'perm_irs',
  taxreturns:  'perm_irs',
  reports:     'perm_reports',
  timeclock:   'perm_hr',
  payroll:     'perm_hr',
  employees:   'perm_hr',
  timeoff:     'perm_hr',
  sms:         'perm_comms',
  email:       'perm_comms',
  dialer:      'perm_comms',
  chat:        'perm_comms',
  settings:    'perm_settings',
  dashboard:   null,   // always visible
  kiosk:       null,
}

// Access levels (match Employees.jsx UI)
export const ACCESS_LEVELS = {
  'Super Admin': { label: 'Super Admin', color: '#ef4444' },
  'Admin':       { label: 'Admin',       color: '#f59e0b' },
  'Staff':       { label: 'Staff',       color: '#3b82f6' },
  'View Only':   { label: 'View Only',   color: '#64748b' },
}

// Role-based defaults (used when no per-section perms exist)
const ROLE_DEFAULTS = {
  'Super Admin': { canView: ['*'], canEdit: ['*'] },
  'Admin': {
    canView: ['*'],
    canEdit: ['leads','clients','cases','tasks','calendar','deadlines','transcripts',
              'irsforms','irsreference','taxreturns','estimates','invoices','payments','sms','email',
              'documents','esign','timeclock','reports','dialer','chat','books','irs'],
  },
  'Staff': {
    canView: ['dashboard','leads','clients','cases','tasks','calendar','deadlines','documents','chat','irsforms','irsreference'],
    canEdit: ['tasks','chat'],
  },
  'View Only': {
    canView: ['dashboard','leads','clients','cases','tasks','calendar','deadlines','documents','irsforms','irsreference'],
    canEdit: [],
  },
}

export function AppProvider({ children }) {
  const [user, setUser]         = useState(null)
  const [role, setRole]         = useState('Admin')
  const [perms, setPerms]       = useState(null)   // per-section perm object from DB
  const [checking, setChecking] = useState(true)
  const [toast, setToast]       = useState({ msg: '', type: 'ok', show: false })
  const [modal, setModal]       = useState({ open: false, title: '', body: null })
  const [searchQ, setSearchQ]   = useState('')
  const toastTimer = useRef(null)

  function applyBrandColor(hex) {
    if (!hex || !hex.startsWith('#')) return
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
    const rgb = `${r},${g},${b}`
    const root = document.documentElement
    root.style.setProperty('--blue', hex)
    root.style.setProperty('--b2', hex)
    root.style.setProperty('--blt', `rgba(${rgb},.18)`)
    root.style.setProperty('--b2c', `rgba(${rgb},.14)`)
    localStorage.setItem('tcr_brand_color', hex)
    localStorage.setItem('tcr_brand_rgb', rgb)
    let s = document.getElementById('tcr-brand-override')
    if (!s) { s = document.createElement('style'); s.id = 'tcr-brand-override'; document.head.appendChild(s) }
    s.textContent = `
      .nav-item.active { background: rgba(${rgb},.18) !important; color: ${hex} !important; border-left-color: ${hex} !important; }
      .btn.pri { background: ${hex} !important; border-color: ${hex} !important; }
      .btn.pri:hover { filter: brightness(1.15) !important; }
      .bdg.blue, .bdg.bb { background: rgba(${rgb},.18) !important; color: ${hex} !important; }
      .chip.active, .chip.on { background: rgba(${rgb},.18) !important; color: ${hex} !important; border-color: ${hex} !important; }
      .cal-event { background: ${hex} !important; }
      .cal-day.today { border-color: ${hex} !important; }
    `
  }

  async function loadBrandColor() {
    try {
      const { data } = await supabase.from('settings').select('primary_color').limit(1).maybeSingle()
      if (data?.primary_color) applyBrandColor(data.primary_color)
    } catch(e) {}
  }

  useEffect(() => {
    loadBrandColor()
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setUser(data.session.user)
        loadRole(data.session.user.email)
      }
      setChecking(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) { loadRole(session.user.email); loadBrandColor() }
      else { setRole('Staff'); setPerms(null) }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  // Global notification sounds — chat messages, leads/appointments via API,
  // new emails, huddle invites, inbound SMS, and inbound faxes. Active
  // whenever logged in. (Inbound-call ringing is handled in CallContext,
  // right where the ring is actually detected via incoming_calls polling —
  // calllog only ever gets a row written after a call ends, so listening
  // for it here never caught the ring in time.)
  useEffect(() => {
    if (!user) return
    const myName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'You'

    const chCh = supabase.channel('global-chat-notify')
    chCh.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, ({ new: msg }) => {
      if (msg.huddle_id && msg.sender === '🔔 System') {
        playSound('huddle')
      } else if (msg.sender === '🔔 System') {
        playSound('lead') // new lead / appointment / payment notifications from LeadFlow etc.
      } else if (msg.sender !== myName) {
        playSound('message')
      }
    }).subscribe()

    const emailCh = supabase.channel('global-email-notify')
    emailCh.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'emails' }, ({ new: row }) => {
      if ((row.triage || 'Inbox') === 'Inbox' && row.status !== 'Sent') playSound('email')
    }).subscribe()

    const smsCh = supabase.channel('global-sms-notify')
    smsCh.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sms_messages' }, ({ new: row }) => {
      if (row.direction === 'inbound') playSound('sms')
    }).subscribe()

    const faxCh = supabase.channel('global-fax-notify')
    faxCh.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'fax_logs' }, ({ new: row }) => {
      if (row.direction === 'inbound') playSound('fax')
    }).subscribe()

    return () => {
      supabase.removeChannel(chCh)
      supabase.removeChannel(emailCh)
      supabase.removeChannel(smsCh)
      supabase.removeChannel(faxCh)
    }
  }, [user])

  async function loadRole(email) {
    if (!email) return
    if (email === 'romy@taxcasereview.org') {
      setRole('Super Admin')
      setPerms(null)
      return
    }
    const { data } = await supabase
      .from('employees')
      .select('access, perm_clients, perm_billing, perm_schedule, perm_documents, perm_reports, perm_hr, perm_settings, perm_comms, perm_irs')
      .eq('email', email)
      .maybeSingle()

    if (data) {
      setRole(data.access || 'Staff')
      // Store per-section perms if they exist
      const hasCustomPerms = Object.keys(data).some(k => k.startsWith('perm_') && data[k] !== null)
      setPerms(hasCustomPerms ? data : null)
    } else {
      setRole('Admin')
      setPerms(null)
    }
  }

  const can = useCallback((action, section) => {
    // Super Admin always yes
    if (role === 'Super Admin') return true

    // Dashboard/kiosk always visible
    if (section === 'dashboard' || section === 'kiosk') return true

    // If we have per-section perms, use them
    if (perms) {
      const col = SECTION_COLS[section]
      if (col && perms[col] !== null && perms[col] !== undefined) {
        const level = perms[col] // 0=none, 1=view, 2=edit, 3=full
        if (action === 'view') return level >= 1
        if (action === 'edit') return level >= 2
        return false
      }
    }

    // Fall back to role-based defaults
    const defaults = ROLE_DEFAULTS[role] || ROLE_DEFAULTS['Staff']
    if (action === 'view') return defaults.canView.includes('*') || defaults.canView.includes(section)
    if (action === 'edit') return defaults.canEdit.includes('*') || defaults.canEdit.includes(section)
    return false
  }, [role, perms])

  const showToast = useCallback((msg, type = 'ok') => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, type, show: true })
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 3000)
  }, [])

  const openModal  = useCallback((title, body) => setModal({ open: true, title, body }), [])
  const closeModal = useCallback(() => setModal({ open: false, title: '', body: null }), [])
  const login  = useCallback((u) => setUser(u), [])
  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
    setRole('Staff')
    setPerms(null)
  }, [])

  return (
    <AppContext.Provider value={{
      user, login, logout, checking,
      role, perms, can,
      toast, showToast,
      modal, openModal, closeModal,
      searchQ, setSearchQ,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be inside AppProvider')
  return ctx
}

