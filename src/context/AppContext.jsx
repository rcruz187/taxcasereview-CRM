import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { playSound } from '../lib/notifySound'

const AppContext = createContext(null)

// ── Section → DB column map ──────────────────────────────────────────────
// Each route/section maps to a perm_* column on the employees table.
// 0 = No Access, 1 = View Only, 2 = Edit, 3 = Full Admin
export const SECTION_COLS = {
  leads:       'perm_leads',
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
  workflows:   'perm_settings',   // workflows use settings perm — Admin/Super Admin only
  dashboard:   null,   // always visible
  kiosk:       null,
}

// Access levels (match Employees.jsx UI)
export const ACCESS_LEVELS = {
  'Super Admin': { label: 'Super Admin', color: '#ef4444' },
  'Admin':       { label: 'Admin',       color: '#f59e0b' },
  'Tax Associate': { label: 'Tax Associate', color: '#3b82f6' },
  'View Only':   { label: 'View Only',   color: '#64748b' },
  'Tax Advisor': { label: 'Tax Advisor', color: '#10b981' },
  'Manager':     { label: 'Manager',     color: '#06b6d4' },
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
  'Tax Associate': {
    canView: ['dashboard','leads','clients','cases','tasks','calendar','deadlines','documents','chat','irsforms','irsreference','settings'],
    canEdit: ['tasks','chat','settings'],
  },
  'View Only': {
    canView: ['dashboard','leads','clients','cases','tasks','calendar','deadlines','documents','irsforms','irsreference'],
    canEdit: [],
  },
  // Sales rep / Tax Advisor — lead pipeline only. No Clients/Cases (that's
  // post-conversion work), no Billing/IRS/HR/Reports/Settings. Row-level
  // scoping to "my own assigned leads" is handled in Leads.jsx, not here.
  'Tax Advisor': {
    canView: ['dashboard','leads','calendar','sms','email','dialer','documents','esign','chat','tasks','settings'],
    canEdit: ['leads','calendar','sms','email','dialer','documents','esign','chat','tasks','settings'],
  },
  // Sales manager — oversees Tax Advisors, sees every rep's leads (no
  // my-leads-only lock, that only applies to the 'Tax Advisor' role),
  // plus Reports for team performance.
  'Manager': {
    canView: ['dashboard','leads','calendar','sms','email','dialer','documents','esign','chat','reports','tasks','settings'],
    canEdit: ['leads','calendar','sms','email','dialer','documents','esign','chat','tasks','settings'],
  },
}

export function AppProvider({ children }) {
  const [user, setUser]         = useState(null)
  const [role, setRole]         = useState('Admin')
  const [perms, setPerms]       = useState(null)   // per-section perm object from DB
  const [employeeName, setEmployeeName] = useState('')   // employees.name for the logged-in user — used to scope "my own leads" for Tax Advisor
  const [checking, setChecking] = useState(true)
  const [toast, setToast]       = useState({ msg: '', type: 'ok', show: false })
  const [modal, setModal]       = useState({ open: false, title: '', body: null })
  const [searchQ, setSearchQ]   = useState('')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
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
      if (session?.user) {
        loadRole(session.user.email); loadBrandColor()
        // Log login event
        if (_event === 'SIGNED_IN') {
          const name = session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Staff'
          import('../lib/activityLog').then(({ logActivity }) => {
            logActivity(supabase, {
              employeeName: name, employeeEmail: session.user.email,
              action: 'session_login', category: 'session',
              description: `${name} logged in`, meta: { event: _event }
            }).catch(() => {})
          })
        }
      } else {
        setRole('Tax Associate'); setPerms(null); setEmployeeName('')
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  // Global notification sounds — chat messages, leads/appointments via API,
  // new emails, huddle invites, inbound SMS, and inbound faxes. Active
  // whenever logged in. (Inbound-call ringing is handled in CallContext,
  // right where the ring is actually detected via incoming_calls polling —
  // calllog only ever gets a row written after a call ends, so listening
  // for it here never caught the ring in time.)
  //
  // Realtime websockets can silently drop after a backgrounded/idle tab,
  // laptop sleep, or brief network blip — Supabase doesn't always
  // reconnect cleanly on its own. Each channel watches its own subscribe()
  // status and rebuilds itself (only itself) if it reports CLOSED or
  // CHANNEL_ERROR. We deliberately do NOT tear down/rebuild all channels
  // together on tab-focus — reusing the same channel name before the old
  // one finishes closing causes the realtime client to silently drop the
  // new subscription, which is worse than doing nothing. Each channel
  // manages its own lifecycle independently.
  useEffect(() => {
    if (!user) return
    const myName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'You'
    const channels = []

    function withReconnect(name, table, handler) {
      function create() {
        const ch = supabase.channel(name)
        ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table }, handler)
          .subscribe(status => {
            if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              supabase.removeChannel(ch)
              setTimeout(create, 1500)
            }
          })
        channels.push(ch)
      }
      create()
    }

    withReconnect('global-chat-notify', 'chat_messages', ({ new: msg }) => {
      if (msg.huddle_id && msg.sender === '🔔 System') {
        playSound('huddle')
      } else if (msg.sender === '🔔 System') {
        playSound('lead') // new lead / appointment / payment notifications from LeadFlow etc.
      } else if (msg.sender !== myName) {
        playSound('message')
      }
    })

    withReconnect('global-email-notify', 'emails', ({ new: row }) => {
      if ((row.triage || 'Inbox') === 'Inbox' && row.status !== 'Sent') playSound('email')
    })

    withReconnect('global-sms-notify', 'sms_messages', ({ new: row }) => {
      if (row.direction === 'inbound') playSound('sms')
    })

    withReconnect('global-fax-notify', 'fax_logs', ({ new: row }) => {
      if (row.direction === 'inbound') playSound('fax')
    })

    withReconnect('global-task-notify', 'tasks', ({ new: row }) => {
      playSound('task')
    })

    withReconnect('global-esign-notify', 'esigns', ({ new: row }) => {
      if (row.status === 'Awaiting') playSound('esign')
    })

    return () => {
      channels.forEach(ch => { try { supabase.removeChannel(ch) } catch (_) {} })
    }
  }, [user])

  // Appointment reminders — browser notification + sound ~30 min before a
  // scheduled appointment. notifiedIds lives outside the effect so it
  // persists across re-renders and doesn't re-fire the same notification.
  const REMINDER_MINUTES_BEFORE = 30
  const notifiedIdsRef = useRef(new Set())
  const snoozedIdsRef  = useRef({}) // id → snooze-until timestamp

  useEffect(() => {
    if (!user) return
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    async function checkUpcoming() {
      const now = new Date()
      const windowEnd = new Date(now.getTime() + REMINDER_MINUTES_BEFORE * 60000)
      const { data, error } = await supabase
        .from('calevents')
        .select('id, title, "clientName", date, time, "eventType"')
        .eq('status', 'scheduled')
        .eq('date', now.toISOString().slice(0, 10))
      if (error || !data) return
      for (const ev of data) {
        if (!ev.time || notifiedIdsRef.current.has(ev.id)) continue
        // Check snooze
        const snoozedUntil = snoozedIdsRef.current[ev.id]
        if (snoozedUntil && now < new Date(snoozedUntil)) continue
        const evTime = new Date(`${ev.date}T${ev.time}:00`)
        if (evTime < now || evTime > windowEnd) continue
        notifiedIdsRef.current.add(ev.id)
        playSound('reminder')
        const who  = ev.clientName || ev.title || 'Appointment'
        const type = ev.eventType ? ` — ${ev.eventType}` : ''
        // Format time in 12-hour
        const fmtTime = evTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        if ('Notification' in window && Notification.permission === 'granted') {
          const n = new Notification('📅 Upcoming Appointment', {
            body: `${who} at ${fmtTime}${type} (in ~${REMINDER_MINUTES_BEFORE} min)\nClick to snooze 10 min`,
            icon: '/taxcasereview-CRM/icon-192.png',
            tag: `appt-${ev.id}`, // prevents duplicate OS-level popups
            requireInteraction: false,
          })
          n.onclick = () => {
            // Snooze: allow re-notification in 10 minutes, reset the fired flag
            snoozedIdsRef.current[ev.id] = new Date(Date.now() + 10 * 60000).toISOString()
            notifiedIdsRef.current.delete(ev.id)
            n.close()
          }
        }
      }
    }

    checkUpcoming()
    const poll = setInterval(checkUpcoming, 60000)
    return () => clearInterval(poll)
  }, [user])

  async function loadRole(email) {
    if (!email) return
    if (email === 'romy@taxcasereview.org') {
      setRole('Super Admin')
      setPerms(null)
      setEmployeeName('')
      return
    }
    const { data } = await supabase
      .from('employees')
      .select('name, access, perm_leads, perm_clients, perm_billing, perm_schedule, perm_documents, perm_reports, perm_hr, perm_settings, perm_comms, perm_irs')
      .eq('email', email)
      .maybeSingle()

    if (data) {
      setRole(data.access || 'Tax Associate')
      setEmployeeName(data.name || '')
      // Store per-section perms if they exist
      const hasCustomPerms = Object.keys(data).some(k => k.startsWith('perm_') && data[k] !== null)
      setPerms(hasCustomPerms ? data : null)
    } else {
      setRole('Admin')
      setEmployeeName('')
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
    const defaults = ROLE_DEFAULTS[role] || ROLE_DEFAULTS['Tax Associate']
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
    setRole('Tax Associate')
    setPerms(null)
    setEmployeeName('')
  }, [])

  return (
    <AppContext.Provider value={{
      user, login, logout, checking,
      role, perms, can, employeeName,
      toast, showToast,
      modal, openModal, closeModal,
      searchQ, setSearchQ,
      mobileNavOpen, setMobileNavOpen,
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

