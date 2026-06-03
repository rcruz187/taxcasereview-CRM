import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import Sidebar  from './components/layout/Sidebar'
import TopBar   from './components/layout/TopBar'
import { Modal, Toast } from './components/ui'

import Login      from './pages/Login'
import Kiosk      from './pages/Kiosk'
import Dashboard  from './pages/Dashboard'
import Leads      from './pages/Leads'
import Clients    from './pages/Clients'
import Cases      from './pages/Cases'
import Tasks      from './pages/Tasks'
import Calendar   from './pages/Calendar'
import Transcripts from './pages/Transcripts'
import IrsForms   from './pages/IrsForms'
import TaxReturns from './pages/TaxReturns'
import Deadlines  from './pages/Deadlines'
import Estimates  from './pages/Estimates'
import Invoices   from './pages/Invoices'
import Payments   from './pages/Payments'
import Sms        from './pages/Sms'
import Email      from './pages/Email'
import Documents  from './pages/Documents'
import Esign      from './pages/Esign'
import TimeClock  from './pages/TimeClock'
import Payroll    from './pages/Payroll'
import Employees  from './pages/Employees'
import Reports    from './pages/Reports'
import Settings   from './pages/Settings'
import Dialer     from './pages/Dialer'
import Chat       from './pages/Chat'
import Books         from './pages/Books'
import FormaCorp     from './pages/FormaCorp'

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
          <Routes>
            <Route path="/"            element={<Dashboard />} />
            <Route path="/leads"       element={<Guard section="leads"><Leads /></Guard>} />
            <Route path="/clients"     element={<Guard section="clients"><Clients /></Guard>} />
            <Route path="/clients/:id" element={<Guard section="clients"><Clients /></Guard>} />
            <Route path="/cases"       element={<Guard section="cases"><Cases /></Guard>} />
            <Route path="/cases/:id"   element={<Guard section="cases"><Cases /></Guard>} />
            <Route path="/tasks"       element={<Guard section="tasks"><Tasks /></Guard>} />
            <Route path="/calendar"    element={<Guard section="calendar"><Calendar /></Guard>} />
            <Route path="/transcripts" element={<Guard section="transcripts"><Transcripts /></Guard>} />
            <Route path="/irsforms"    element={<Guard section="irsforms"><IrsForms /></Guard>} />
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
            <Route path="*"            element={<Navigate to="/" />} />
          </Routes>
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
      <Route path="/kiosk" element={<Kiosk />} />
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
