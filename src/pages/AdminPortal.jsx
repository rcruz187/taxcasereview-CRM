// AdminPortal — TaxRes CRM founder/admin shell.
// Only renders for romy@taxrescrm.net. Full platform control:
// impersonation, per-office deep dive, billing, provisioning,
// demo management, system health, audit log, support, email.

import React, { useState, useEffect, Suspense, lazy, useCallback } from 'react'
import { ScreenShareProvider, useScreenShare } from '../context/ScreenShareContext'
import { Routes, Route, NavLink, useNavigate, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { FIRM, loadFirmBranding, loadFirmBrandingPublic } from '../lib/firmBranding'
import { useApp } from '../context/AppContext'
import AIAssistant from '../components/AIAssistant'
const AdminChatPage = lazy(() => import('./AdminChat'))

const NewOffice    = lazy(() => import('./NewOffice'))
const Support      = lazy(() => import('./Support'))
const CalendarPage = lazy(() => import('./Calendar'))
const TrainingPage = lazy(() => import('./Training'))

// ── Constants ────────────────────────────────────────────────────────────────
const TCR_TENANT      = '61a89aef-0e7e-4ea2-b222-44ab2024655a'
const DEMO_TENANT     = '489ace07-1a6b-4864-833a-4f8420568b40'
const TAXRESCRM_TENANT = 'a0000000-0000-0000-0000-000000000001'
const STATUS_COLOR = { active:'#10b981', trial:'#f59e0b', past_due:'#f97316', cancelled:'#ef4444', suspended:'#ef4444' }
const TIER_COLOR   = { starter:'#6366f1', growth:'#0ea5e9', pro:'#10b981' }

// ── ErrorBoundary — catches crashes in individual routes without killing the portal ──
class AdminRouteErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null } }
  static getDerivedStateFromError(error) { return { hasError: true, error } }
  componentDidCatch(error, info) { console.error('[AdminPortal] Route crashed:', error, info) }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 }}>This page encountered an error</div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>{this.state.error?.message || 'Unknown error'}</div>
          <button onClick={() => this.setState({ hasError: false, error: null })}
            style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontSize: 13 }}>
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}


function fmtBytes(n) {
  if (!n) return '0 B'
  if (n < 1048576)    return (n/1024).toFixed(0) + ' KB'
  if (n < 1073741824) return (n/1048576).toFixed(1) + ' MB'
  return (n/1073741824).toFixed(2) + ' GB'
}
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—' }
function fmtAgo(d) {
  if (!d) return 'Never'
  const s = (Date.now()-new Date(d).getTime())/1000
  if (s < 60) return 'Just now'
  if (s < 3600) return Math.floor(s/60)+'m ago'
  if (s < 86400) return Math.floor(s/3600)+'h ago'
  if (s < 604800) return Math.floor(s/86400)+'d ago'
  return fmtDate(d)
}

// ── Shared UI primitives ─────────────────────────────────────────────────────
const S = {
  card: { background:'rgba(255,255,255,.03)', border:'1px solid rgba(99,102,241,.2)', borderRadius:14, overflow:'hidden' },
  th:   { padding:'10px 16px', fontSize:10, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.05em', textAlign:'left', borderBottom:'1px solid rgba(99,102,241,.12)' },
  td:   { padding:'11px 16px', borderBottom:'1px solid rgba(99,102,241,.07)', fontSize:13 },
  badge:(color,bg)=>({ fontSize:10, fontWeight:700, padding:'2px 9px', borderRadius:20, textTransform:'capitalize', background:bg||color+'22', color }),
  btn:  (variant='primary')=>({
    padding:'8px 18px', borderRadius:8, border:'none', cursor:'pointer', fontWeight:700, fontSize:13,
    ...(variant==='primary'   ? { background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff' }
      : variant==='danger'    ? { background:'rgba(239,68,68,.12)', color:'#ef4444', border:'1px solid rgba(239,68,68,.3)' }
      : variant==='ghost'     ? { background:'rgba(99,102,241,.1)', color:'#a5b4fc', border:'1px solid rgba(99,102,241,.25)' }
      :                         { background:'rgba(255,255,255,.06)', color:'#94a3b8', border:'1px solid rgba(255,255,255,.1)' })
  }),
}

function Toast({ msg, type='ok' }) {
  if (!msg) return null
  return (
    <div style={{ position:'fixed', bottom:24, right:24, zIndex:9999, padding:'12px 20px', borderRadius:10,
      background: type==='error' ? '#7f1d1d' : '#14532d', color:'#fff', fontWeight:600, fontSize:13,
      boxShadow:'0 8px 32px rgba(0,0,0,.4)' }}>{msg}</div>
  )
}

function Spinner() {
  return <div style={{ padding:48, textAlign:'center', color:'#475569', fontSize:13 }}>Loading…</div>
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
// Operational items only — Marketing/Content/LinkedIn/Search/System live in Command Center tabs
const NAV = [
  { path:'/crm-admin/command-center', label:'Command Center', icon:'⚡' },
  { path:'/crm-admin/email',          label:'Email',          icon:'📧' },
  { path:'/crm-admin/calendar',       label:'Calendar',       icon:'📅' },
  { path:'/crm-admin/chat',           label:'Chat (All)',      icon:'💬' },
  { path:'/crm-admin',                label:'Overview',        icon:'📊' },
  { path:'/crm-admin/provision',      label:'+ New Office',   icon:'➕' },
  { path:'/crm-admin/offices',        label:'Offices',         icon:'🏢' },
  { path:'/crm-admin/demo',           label:'Demo Mgmt',       icon:'🎭' },
  { path:'/crm-admin/employees',      label:'Employees',       icon:'👥' },
  { path:'/crm-admin/support',        label:'Support',         icon:'🎫' },
  { path:'/crm-admin/audit',          label:'Audit Log',       icon:'📋' },
  { path:'/crm-admin/billing',        label:'Billing',         icon:'💳' },
]

function Sidebar({ onSignOut }) {
  const location = useLocation()
  return (
    <div style={{ width:220, minHeight:'100vh', flexShrink:0, background:'#0f0e1a',
      borderRight:'1px solid rgba(99,102,241,.2)', display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'18px 16px 16px', borderBottom:'1px solid rgba(99,102,241,.15)' }}>
        <img src="/romylabs-logo.png" alt="RomyLabs"
          style={{ height:38, objectFit:'contain', display:'block', marginBottom:6 }}
          onError={e=>{e.target.style.display='none'}} />
        <div style={{ fontSize:10, color:'#C6FF00', letterSpacing:'.06em', fontWeight:700, textTransform:'uppercase' }}>Command Center</div>
      </div>

      <nav style={{ flex:1, padding:'10px 8px', overflowY:'auto' }}>
        {NAV.map(item => {
          const active = item.path === '/crm-admin'
            ? location.pathname === '/crm-admin' || location.pathname === '/crm-admin/'
            : location.pathname === item.path || location.pathname.startsWith(item.path + '/')
          return (
            <NavLink key={item.path} to={item.path}
              style={{ display:'flex', alignItems:'center', gap:9, padding:'8px 11px',
                borderRadius:8, marginBottom:1, textDecoration:'none', fontSize:13,
                fontWeight: active ? 700 : 400,
                background: active ? 'rgba(99,102,241,.18)' : 'transparent',
                color: active ? '#a5b4fc' : '#64748b' }}>
              <span style={{ fontSize:15, width:20, textAlign:'center' }}>{item.icon}</span>
              {item.label}
            </NavLink>
          )
        })}
      </nav>

      <div style={{ padding:'14px 14px', borderTop:'1px solid rgba(99,102,241,.15)' }}>
        <div style={{ fontSize:11, color:'#a5b4fc', fontWeight:600, marginBottom:2 }}>info@romylabs.com</div>
        <div style={{ fontSize:10, color:'#6366f1', fontWeight:700, marginBottom:10 }}>Platform Owner</div>
        <button onClick={onSignOut} style={{ ...S.btn('ghost'), width:'100%', justifyContent:'center', fontSize:12, padding:'7px 0' }}>
          Sign Out
        </button>
      </div>
    </div>
  )
}

// NOTE: Full file restored from the user-provided current AdminPortal source.
