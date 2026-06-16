import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import Sidebar  from './components/layout/Sidebar'
import TopBar   from './components/layout/TopBar'
import { Modal, Toast } from './components/ui'

// Public, unauthenticated entry points stay eager — loaded immediately on
// first paint with no extra network round-trip, since these are the very
// first thing a visitor (employee or client) sees.
import Login      from './pages/Login'
import Kiosk      from './pages/Kiosk'
import SignPage     from './pages/SignPage'
import ClockIn       from './pages/ClockIn'
import ClientPortal  from './pages/ClientPortal'
import OrganizerPage from './pages/OrganizerPage'
import AuthCallback from './pages/AuthCallback'

// Everything behind login is lazy-loaded — each page's code only downloads
// when you actually navigate to it, instead of all ~30 pages loading upfront
// in one giant bundle. This is what was making the whole CRM feel slow.
const Dashboard     = lazy(() => import('./pages/Dashboard'))
const Leads         = lazy(() => import('./pages/Leads'))
const Clients       = lazy(() => import('./pages/Clients'))
const Cases         = lazy(() => import('./pages/Cases'))
const Tasks         = lazy(() => import('./pages/Tasks'))
const Calendar      = lazy(() => import('./pages/Calendar'))
const Transcripts   = lazy(() => import('./pages/Transcripts'))
const IrsForms      = lazy(() => import('./pages/IrsForms'))
const IrsReference  = lazy(() => import('./pages/IrsReference'))
const TaxReturns    = lazy(() => import('./pages/TaxReturns'))
const Deadlines     = lazy(() => import('./pages/Deadlines'))
const Estimates     = lazy(() => import('./pages/Estimates'))
const Invoices      = lazy(() => import('./pages/Invoices'))
const Payments      = lazy(() => import('./pages/Payments'))
const Sms           = lazy(() => import('./pages/Sms'))
const Email         = lazy(() => import('./pages/Email'))
const Documents     = lazy(() => import('./pages/Documents'))
const Esign         = lazy(() => import('./pages/Esign'))
const TimeClock     = lazy(() => import('./pages/TimeClock'))
const Payroll       = lazy(() => import('./pages/Payroll'))
const Employees     = lazy(() => import('./pages/Employees'))
const Reports       = lazy(() => import('./pages/Reports'))
const Settings      = lazy(() => import('./pages/Settings'))
const Dialer        = lazy(() => import('./pages/Dialer'))
const Chat          = lazy(() => import('./pages/Chat'))
const Books         = lazy(() => import('./pages/Books'))
const FormaCorp     = lazy(() => import('./pages/FormaCorp'))
const Fax           = lazy(() => import('./pages/Fax'))

const style = document.createElement('style')
style.textContent = `@keyframes spin { to { transform: rotate(360deg) } }`
document.head.appendChild(style)

function RequireAuth({ children }) {
  const { user } = useApp()
  if (!user) return <Navigate to="/login" replace />
  return children
}

// Blocks a route if the user doesn't have view permission for that section
function Guard({ section, children }) {
  const { can } = useApp()
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
  const { openModal } = useApp()

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
            <Route path="/transcripts" element={<Guard section="transcripts"><Transcripts /></Guard>} />
            <Route path="/irsforms"    element={<Guard section="irsforms"><IrsForms /></Guard>} />
            <Route path="/irsreference" element={<Guard section="irsreference"><IrsReference /></Guard>} />
            <Route path="/taxreturns"  element={<Guard section="taxreturns"><TaxReturns /></Guard>} />
            <Route path="/taxreturns/:id" element={<Guard section="taxreturns"><TaxReturns /></Guard>} />
            <Route path="/deadlines"   element={<Guard section="deadlines"><Deadlines /></Guard>} />
            <Route path="/estimates"   element={<Guard section="estimates"><Estimates /></Guard>} />
            <Route path="/invoices"    element={<Guard section="invoices"><Invoices /></Guard>} />
            <Route path="/payments"    element={<Guard section="payments"><Payments /></Guard>} />
            <Route path="/sms"         element={<Guard section="sms"><Sms /></Guard>} />
            <Route path="/email"       element={<Guard section="email"><Email /></Guard>} />
            <Route path="/documents"   element={<Guard section="documents"><Documents /></Guard>} />
            <Route path="/esign"       element={<Guard section="esign"><Esign /></Guard>} />
            <Route path="/timeclock"   element={<Guard section="timeclock"><TimeClock /></Guard>} />
            <Route path="/payroll"     element={<Guard section="payroll"><Payroll /></Guard>} />
            <Route path="/employees"   element={<Guard section="employees"><Employees /></Guard>} />
            <Route path="/reports"     element={<Guard section="reports"><Reports /></Guard>} />
            <Route path="/settings"    element={<Guard section="settings"><Settings /></Guard>} />
            <Route path="/dialer"      element={<Guard section="dialer"><Dialer /></Guard>} />
            <Route path="/chat"        element={<Guard section="chat"><Chat /></Guard>} />
            <Route path="/books"       element={<Guard section="books"><Books /></Guard>} />
            <Route path="/formacorp"   element={<Guard section="books"><FormaCorp /></Guard>} />
            <Route path="/fax"         element={<Guard section="email"><Fax /></Guard>} />
            <Route path="*"            element={<Navigate to="/" />} />
          </Routes>
          </Suspense>
        </div>
      </div>
      <Modal />
      <Toast />
    </div>
  )
}

function AuthRouter() {
  const { user, checking } = useApp()

  if (checking) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}>
      <div style={{ color:'var(--t3)', fontSize:13 }}>Loading…</div>
    </div>
  )

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/kiosk" element={<Kiosk />} />
      <Route path="/clockin" element={<ClockIn />} />
      <Route path="/sign/:id" element={<SignPage />} />
      <Route path="/portal/:id" element={<ClientPortal />} />
      <Route path="/organizer/:id" element={<OrganizerPage />} />
      <Route path="*" element={<RequireAuth><Shell /></RequireAuth>} />
    </Routes>
  )
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter basename="/taxcasereview-CRM">
        <AuthRouter />
      </BrowserRouter>
    </AppProvider>
  )
}
