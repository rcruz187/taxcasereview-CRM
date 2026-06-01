import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import Sidebar  from './components/layout/Sidebar'
import TopBar   from './components/layout/TopBar'
import { Modal, Toast } from './components/ui'

import Login      from './pages/Login'
import Dashboard  from './pages/Dashboard'
import Leads      from './pages/Leads'
import Clients    from './pages/Clients'
import Cases      from './pages/Cases'
import Tasks      from './pages/Tasks'
import Calendar   from './pages/Calendar'
import Transcripts from './pages/Transcripts'
import IrsForms   from './pages/IrsForms'
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

const style = document.createElement('style')
style.textContent = `@keyframes spin { to { transform: rotate(360deg) } }`
document.head.appendChild(style)

function RequireAuth({ children }) {
  const { user } = useApp()
  if (!user) return <Navigate to="/login" replace />
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
            <Route path="/leads"       element={<Leads />} />
            <Route path="/clients"     element={<Clients />} />
            <Route path="/clients/:id" element={<Clients />} />
            <Route path="/cases"       element={<Cases />} />
            <Route path="/cases/:id"   element={<Cases />} />
            <Route path="/tasks"       element={<Tasks />} />
            <Route path="/calendar"    element={<Calendar />} />
            <Route path="/transcripts" element={<Transcripts />} />
            <Route path="/irsforms"    element={<IrsForms />} />
            <Route path="/deadlines"   element={<Deadlines />} />
            <Route path="/estimates"   element={<Estimates />} />
            <Route path="/invoices"    element={<Invoices />} />
            <Route path="/payments"    element={<Payments />} />
            <Route path="/sms"         element={<Sms />} />
            <Route path="/email"       element={<Email />} />
            <Route path="/documents"   element={<Documents />} />
            <Route path="/esign"       element={<Esign />} />
            <Route path="/timeclock"   element={<TimeClock />} />
            <Route path="/payroll"     element={<Payroll />} />
            <Route path="/employees"   element={<Employees />} />
            <Route path="/reports"     element={<Reports />} />
            <Route path="/settings"    element={<Settings />} />
            <Route path="/dialer"      element={<Dialer />} />
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
