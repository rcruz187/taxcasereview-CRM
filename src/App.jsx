import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { Suspense, lazy, useEffect } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import { CallProvider } from './context/CallContext'
import { GmailSyncProvider } from './context/GmailSyncContext'
import { ScreenShareProvider } from './context/ScreenShareContext'
import Sidebar  from './components/layout/Sidebar'
import AIAssistant from './components/AIAssistant'
import TopBar   from './components/layout/TopBar'
import { Modal, Toast } from './components/ui'
import ActiveCallBar from './components/calling/ActiveCallBar'
import ImpersonationBanner from './components/ImpersonationBanner'

// Public, unauthenticated entry points stay eager — loaded immediately on
// first paint with no extra network round-trip, since these are the very
// first thing a visitor (employee or client) sees.
import Login      from './pages/Login'
const Kiosk = lazy(() => import('./pages/Kiosk'))
const BookAppointment = lazy(() => import('./pages/BookAppointment'))
const ManageBooking = lazy(() => import('./pages/ManageBooking'))
const SignPage = lazy(() => import('./pages/SignPage'))
const MeetingRoom = lazy(() => import('./pages/MeetingRoom'))
const ScreenShareJoin = lazy(() => import('./pages/ScreenShareJoin'))
const ScreenShareHost = lazy(() => import('./pages/ScreenShareHost'))
const ClockIn = lazy(() => import('./pages/ClockIn'))
const EmployeePortal = lazy(() => import('./pages/EmployeePortal'))
const ClientPortal = lazy(() => import('./pages/ClientPortal'))
const OrganizerPage = lazy(() => import('./pages/OrganizerPage'))
const FinancialIntakePage = lazy(() => import('./pages/FinancialIntakePage'))
const AuthCallback = lazy(() => import('./pages/AuthCallback'))
const QuickBooksCallback  = lazy(() => import('./pages/QuickBooksCallback'))
const NewOffice = lazy(() => import('./pages/NewOffice'))
const AdminConsole = lazy(() => import('./pages/AdminConsole'))
const ImpersonateGate = lazy(() => import('./pages/ImpersonateGate'))
const AdminPortal = lazy(() => import('./pages/AdminPortal'))
const Training = lazy(() => import('./pages/Training'))
const Manual   = lazy(() => import('./pages/Manual'))
const Support = lazy(() => import('./pages/Support'))

// Everything behind login is lazy-loaded — each page's code only downloads
// when you actually navigate to it, instead of all ~30 pages loading upfront
// in one giant bundle. This is what was making the whole CRM feel slow.
const Dashboard     = lazy(() => import('./pages/Dashboard'))
const TimeOff       = lazy(() => import('./pages/TimeOff'))
const Leads         = lazy(() => import('./pages/Leads'))
const Clients       = lazy(() => import('./pages/Clients'))
const Cases         = lazy(() => import('./pages/Cases'))
const Tasks         = lazy(() => import('./pages/Tasks'))
const Calendar      = lazy(() => import('./pages/Calendar'))
const Transcripts   = lazy(() => import('./pages/Transcripts'))
const IRSPortal     = lazy(() => import('./pages/IRSPortal'))
const IrsForms      = lazy(() => import('./pages/IrsForms'))
const StateForms    = lazy(() => import('./pages/StateForms'))
const IrsReference  = lazy(() => import('./pages/IrsReference'))
const TaxReturns    = lazy(() => import('./pages/TaxReturns'))
const Deadlines     = lazy(() => import('./pages/Deadlines'))
const Estimates     = lazy(() => import('./pages/Estimates'))
const Invoices      = lazy(() => import('./pages/Invoices'))
const Payments      = lazy(() => import('./pages/Payments'))
const AccountsReceivable = lazy(() => import('./pages/AccountsReceivable'))
const Transactions = lazy(() => import('./pages/Transactions'))
const Sms           = lazy(() => import('./pages/Sms'))
const Email         = lazy(() => import('./pages/Email'))
const Documents     = lazy(() => import('./pages/Documents'))
const Esign         = lazy(() => import('./pages/Esign'))
const TimeClock     = lazy(() => import('./pages/TimeClock'))
const Payroll       = lazy(() => import('./pages/Payroll'))
const Employees     = lazy(() => import('./pages/Employees'))
const ActivityReport= lazy(() => import('./pages/ActivityReport'))
const Reports       = lazy(() => import('./pages/Reports'))
const Settings      = lazy(() => import('./pages/Settings'))
const Dialer        = lazy(() => import('./pages/Dialer'))
const Chat          = lazy(() => import('./pages/Chat'))
const Books         = lazy(() => import('./pages/Books'))
const FormaCorp     = lazy(() => import('./pages/FormaCorp'))
const Fax           = lazy(() => import('./pages/Fax'))
const Workflows     = lazy(() => import('./pages/Workflows'))
const TimeEntry     = lazy(() => import('./pages/TimeEntry'))

const style = document.createElement('style')
style.textContent = `@keyframes spin { to { transform: rotate(360deg) } }`
document.head.appendChild(style)

function RequireAuth({ children }) {
  const { user, checking } = useApp()
  if (checking) return null
  if (!user) return <Navigate to="/login" replace />
  return children
}

// Tier gate maps — module-level, never change at runtime
const TIER_ORDER = { starter: 0, growth: 1, pro: 2 }
const TIER_REQUIRED = {
  dialer: 'growth', workflows: 'growth', irsforms: 'growth',
  irsreference: 'growth', taxreturns: 'growth', transcripts: 'growth',
  payments: 'growth', invoices: 'growth', estimates: 'growth',
  books: 'growth', stateforms: 'growth',
  payroll: 'pro', timeoff: 'pro', employees: 'pro', reports: 'pro', deadlines: 'pro',
}

// Blocks a route by role permission OR plan tier
function Guard({ section, children }) {
  const { can, planTier } = useApp()
  const requiredTier = TIER_REQUIRED[section]
  const tierBlocked = requiredTier && (TIER_ORDER[planTier] || 0) < (TIER_ORDER[requiredTier] || 0)
  if (tierBlocked) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        height: '60vh', gap: 16, color: 'var(--t3)', textAlign: 'center', padding: 32
      }}>
        <div style={{ fontSize: 48 }}>⭐</div>
        <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--tx)' }}>
          {requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1)} Plan Required
        </div>
        <div style={{ fontSize: 14, color: 'var(--t2)', maxWidth: 340, lineHeight: 1.6 }}>
          This feature requires the <strong>{requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1)}</strong> plan.
          Contact <strong>romy@taxrescrm.net</strong> to upgrade.
        </div>
      </div>
    )
  }
  if (!can('view', section)) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        height: '60vh', gap: 12, color: 'var(--t3)'
      }}>
        <div style={{ fontSize: 40 }}>🔒</div>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--tx)' }}>Access Restricted</div>
        <div style={{ fontSize: 13 }}>You don't have permission to view this page.</div>
        <div style={{ fontSize: 12 }}>Contact Romy Cruz to request access.</div>
      </div>
    )
  }
  return children
}

function Shell() {
  const { openModal, realtimeOk } = useApp()

  function handleNew() {
    openModal('Quick Add', (
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        {[
          ['👤 Lead',    '/leads'],
          ['🏢 Client',  '/clients'],
          ['📁 Case',    '/cases'],
          ['✅ Task',    '/tasks'],
          ['📄 Invoice', '/invoices'],
          ['💰 Payment', '/payments'],
        ].map(([label, _]) => (
          <button key={label} className="btn lg full" style={{ justifyContent:'flex-start', gap:10 }}>
            {label}
          </button>
        ))}
      </div>
    ))
  }

  return (
    <ScreenShareProvider>
    <CallProvider>
    <GmailSyncProvider>
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <TopBar onNew={handleNew} />
        <div className="page-content">
          <Suspense fallback={
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'40vh', color:'var(--t3)', fontSize:13 }}>
              Loading…
            </div>
          }>
          <Routes>
            <Route path="/"            element={<Dashboard />} />
            <Route path="/leads/:id"    element={<Guard section="leads"><Leads /></Guard>} />
            <Route path="/leads"       element={<Guard section="leads"><Leads /></Guard>} />
            <Route path="/clients"     element={<Guard section="clients"><Clients /></Guard>} />
            <Route path="/clients/:id" element={<Guard section="clients"><Clients /></Guard>} />
            <Route path="/cases"       element={<Guard section="cases"><Cases /></Guard>} />
            <Route path="/cases/:id"   element={<Guard section="cases"><Cases /></Guard>} />
            <Route path="/tasks"       element={<Guard section="tasks"><Tasks /></Guard>} />
            <Route path="/calendar"    element={<Guard section="calendar"><Calendar /></Guard>} />
            <Route path="/transcripts" element={<Navigate to="/irsportal" replace />} />
            <Route path="/irsportal" element={<Guard section="transcripts"><IRSPortal /></Guard>} />
            <Route path="/irsforms"    element={<Guard section="irsforms"><IrsForms /></Guard>} />
            <Route path="/stateforms"  element={<Guard section="stateforms"><StateForms /></Guard>} />
            <Route path="/irsreference" element={<Guard section="irsreference"><IrsReference /></Guard>} />
            <Route path="/taxreturns"  element={<Guard section="taxreturns"><TaxReturns /></Guard>} />
            <Route path="/taxreturns/:id" element={<Guard section="taxreturns"><TaxReturns /></Guard>} />
            <Route path="/deadlines"   element={<Guard section="deadlines"><Deadlines /></Guard>} />
            <Route path="/estimates"   element={<Guard section="estimates"><Estimates /></Guard>} />
            <Route path="/invoices"    element={<Guard section="invoices"><Invoices /></Guard>} />
            <Route path="/payments"    element={<Guard section="payments"><Payments /></Guard>} />
            <Route path="/ar"          element={<Guard section="payments"><AccountsReceivable /></Guard>} />
            <Route path="/transactions" element={<Guard section="payments"><Transactions /></Guard>} />
            <Route path="/sms"         element={<Guard section="sms"><Sms /></Guard>} />
            <Route path="/email"       element={<Guard section="email"><Email /></Guard>} />
            <Route path="/documents"   element={<Guard section="documents"><Documents /></Guard>} />
            <Route path="/esign"       element={<Guard section="esign"><Esign /></Guard>} />
            <Route path="/timeclock"   element={<TimeClock />} />
            <Route path="/payroll"     element={<Guard section="payroll"><Payroll /></Guard>} />
            <Route path="/timeoff"     element={<Guard section="timeoff"><TimeOff /></Guard>} />
            <Route path="/employees"   element={<Guard section="employees"><Employees /></Guard>} />
            <Route path="/activity-report" element={<Guard section="employees"><ActivityReport /></Guard>} />
            <Route path="/reports"     element={<Guard section="reports"><Reports /></Guard>} />
            <Route path="/settings"    element={<Guard section="settings"><Settings /></Guard>} />
            <Route path="/dialer"      element={<Guard section="dialer"><Dialer /></Guard>} />
            <Route path="/chat"        element={<Guard section="chat"><Chat /></Guard>} />
            <Route path="/books"       element={<Guard section="books"><Books /></Guard>} />
            <Route path="/formacorp"   element={<Guard section="books"><FormaCorp /></Guard>} />
            <Route path="/fax"         element={<Guard section="email"><Fax /></Guard>} />
            <Route path="/workflows"   element={<Guard section="workflows"><Workflows /></Guard>} />
            <Route path="/timeentry"   element={<Guard section="payments"><TimeEntry /></Guard>} />
            <Route path="/new-office"  element={<NewOffice />} />
            <Route path="/admin"       element={<AdminConsole />} />
            <Route path="/training"    element={<Training />} />
            <Route path="/manual"      element={<Manual />} />
            <Route path="/support"     element={<Support />} />
            <Route path="*"            element={<Navigate to="/" />} />
          </Routes>
          </Suspense>
        </div>
      </div>
      {!realtimeOk && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
          background: '#f59e0b', color: '#1c1917', padding: '8px 16px',
          fontSize: 12, fontWeight: 700, textAlign: 'center', display: 'flex',
          alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          ⚠️ Connection interrupted — real-time updates paused. Reconnecting...
        </div>
      )}
      <ActiveCallBar />
      <Modal />
      <Toast />
    </div>
    </GmailSyncProvider>
    </CallProvider>
      <AIAssistant />
    </ScreenShareProvider>
  )
}

const ADMIN_EMAIL = 'romy@taxrescrm.net'

// Renders the admin portal for the product owner, regular CRM for everyone else.
// When ?imp=1 is in the URL, we're in an impersonation session — skip the
// redirect to /crm-admin and render the CRM shell with the tenant override.
function AdminGate() {
  const { user } = useApp()
  const navigate = useNavigate()

  // Check for active impersonation session
  const isImpersonating = !!sessionStorage.getItem('admin_impersonation')
  const impParam = new URLSearchParams(window.location.search).get('imp')

  useEffect(() => {
    // Only redirect to admin portal if NOT in an impersonation session
    if (user?.email?.toLowerCase() === ADMIN_EMAIL && !isImpersonating && !impParam) {
      navigate('/crm-admin', { replace: true })
    }
  }, [user])

  // If impersonating, always show the CRM shell regardless of email
  if (isImpersonating || impParam) return <Shell />
  if (user?.email?.toLowerCase() === ADMIN_EMAIL && !isImpersonating) return null
  return <Shell />
}

function AuthRouter() {
  const { user, checking } = useApp()

  // Public routes must render immediately — never block them on the auth check.
  // /book, /sign, /portal etc are anonymous; showing a spinner loses prospects.
  const publicPaths = ['/book', '/sign', '/portal', '/clockin', '/kiosk',
    '/employee', '/meet', '/screenshare', '/financial-intake', '/organizer']
  const isPublicPath = publicPaths.some(p =>
    window.location.pathname.startsWith(p)
  )

  if (checking && !isPublicPath) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}>
      <div style={{ color:'var(--t3)', fontSize:13 }}>Loading…</div>
    </div>
  )

  return (
    <Routes>
      <Route path="/impersonate" element={<ImpersonateGate />} />
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/auth/quickbooks-callback" element={<QuickBooksCallback />} />
      <Route path="/kiosk" element={<Kiosk />} />
      <Route path="/book" element={<BookAppointment />} />
      <Route path="/book/manage/:token" element={<ManageBooking />} />
      <Route path="/clockin" element={<ClockIn />} />
      <Route path="/employee" element={<EmployeePortal />} />
      <Route path="/sign/:id" element={<SignPage />} />
      <Route path="/meet/:id"          element={<MeetingRoom />} />
      <Route path="/screenshare"       element={<ScreenShareJoin />} />
      <Route path="/screenshare-host"  element={<ScreenShareHost />} />
      <Route path="/portal/:id" element={<ClientPortal />} />
      <Route path="/organizer/:id" element={<OrganizerPage />} />
      <Route path="/financial-intake/:id" element={<FinancialIntakePage />} />
      <Route path="/crm-admin/*" element={
        <RequireAuth adminOnly>
          <Suspense fallback={<div style={{minHeight:'100vh',background:'#0d0c1a'}}/>}>
            <AdminPortal />
          </Suspense>
        </RequireAuth>
      } />
      <Route path="*" element={
        <RequireAuth>
          {/* romy@taxrescrm.net always goes to the admin portal */}
          <AdminGate />
        </RequireAuth>
      } />
    </Routes>
  )
}

export default function App() {
  // Auto-logout after 3.5 hours of inactivity — all employees
  useEffect(() => {
    const IDLE_MS = 3.5 * 60 * 60 * 1000
    let timer = null
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        await supabase.auth.signOut()
        window.location.href = '/'
      }, IDLE_MS)
    }
    const events = ['mousedown','mousemove','keydown','scroll','touchstart','click']
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => {
      clearTimeout(timer)
      events.forEach(e => window.removeEventListener(e, reset))
    }
  }, [])

  return (
    <AppProvider>
      <BrowserRouter basename="/">
        <AuthRouter />
      </BrowserRouter>
    </AppProvider>
  )
}

