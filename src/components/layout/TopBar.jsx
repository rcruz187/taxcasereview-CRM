import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'

const PAGE_TITLES = {
  '/':            'Dashboard',
  '/calendar':    'Calendar',
  '/leads':       'Leads',
  '/clients':     'Clients',
  '/cases':       'Cases',
  '/tasks':       'Tasks',
  '/transcripts': 'Transcripts',
  '/irsforms':    'IRS Forms',
  '/deadlines':   'Deadlines',
  '/estimates':   'Estimates',
  '/invoices':    'Invoices',
  '/payments':    'Payments',
  '/sms':         'SMS',
  '/email':       'Email',
  '/documents':   'Documents',
  '/esign':       'E-Signatures',
  '/timeclock':   'Time Clock',
  '/payroll':     'Payroll',
  '/employees':   'Employees',
  '/reports':     'Reports',
  '/settings':    'Settings',
}

export default function TopBar({ onNew }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { searchQ, setSearchQ } = useApp()
  const [clock, setClock] = useState('')

  const title = PAGE_TITLES[location.pathname] || 'Tax Resolution CRM'

  useEffect(() => {
    const tick = () => {
      const d = new Date()
      setClock(d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }))
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="topbar">
      <span className="page-title">{title}</span>
      <input
        className="search-input"
        placeholder="Search clients, cases, leads…"
        value={searchQ}
        onChange={e => setSearchQ(e.target.value)}
      />
      <span className="topbar-clock">{clock}</span>
      <button className="btn pri" onClick={onNew}>+ New</button>
    </div>
  )
}
