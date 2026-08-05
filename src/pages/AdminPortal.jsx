// AdminPortal — the TaxRes CRM founder/admin experience.
// Only renders when romy@taxrescrm.net is logged in.
// Completely separate shell from the regular CRM — different layout,
// different branding, different navigation. This is the product owner
// view, not the tax-practice view.

import { useState, useEffect, Suspense, lazy } from 'react'
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'

const AdminConsole = lazy(() => import('./AdminConsole'))
const Support      = lazy(() => import('./Support'))

const BRAND = {
  name:    'TaxRes CRM',
  tagline: 'Platform Administration',
  color:   '#6366f1',      // indigo — distinct from TCR's blue
  bg:      '#0f0e1a',      // deep dark, different from CRM's dark mode
}

// ── Sidebar nav items ────────────────────────────────────────────────────────
const NAV = [
  { path: '/portal',            icon: '📊', label: 'Overview' },
  { path: '/portal/companies',  icon: '🏢', label: 'Offices' },
  { path: '/portal/search',     icon: '🔍', label: 'Search' },
  { path: '/portal/support',    icon: '🎫', label: 'Support' },
  { path: '/portal/billing',    icon: '💳', label: 'Billing' },
  { path: '/portal/email',      icon: '📧', label: 'Email' },
]

function AdminSidebar({ onSignOut }) {
  const location = useLocation()

  return (
    <div style={{
      width: 220, minHeight: '100vh', flexShrink: 0,
      background: BRAND.bg,
      borderRight: '1px solid rgba(99,102,241,.25)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Logo */}
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(99,102,241,.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 900, color: '#fff', flexShrink: 0,
          }}>T</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>TaxRes CRM</div>
            <div style={{ fontSize: 10, color: '#a5b4fc', letterSpacing: '.04em' }}>Admin Portal</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px' }}>
        {NAV.map(item => {
          const active = location.pathname === item.path ||
            (item.path !== '/portal' && location.pathname.startsWith(item.path))
          return (
            <NavLink key={item.path} to={item.path}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 8, marginBottom: 2,
                textDecoration: 'none', fontSize: 13, fontWeight: active ? 700 : 400,
                background: active ? 'rgba(99,102,241,.2)' : 'transparent',
                color: active ? '#a5b4fc' : '#64748b',
                transition: 'all .15s',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(99,102,241,.08)'; e.currentTarget.style.color = '#c7d2fe' }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b' } }}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </NavLink>
          )
        })}
      </nav>

      {/* Bottom */}
      <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(99,102,241,.2)' }}>
        <div style={{ fontSize: 11, color: '#475569', marginBottom: 10, lineHeight: 1.4 }}>
          <div style={{ color: '#a5b4fc', fontWeight: 600, fontSize: 12 }}>romy@taxrescrm.net</div>
          <div style={{ color: '#6366f1', fontSize: 10, fontWeight: 700 }}>Platform Owner</div>
        </div>
        <button onClick={onSignOut}
          style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: '1px solid rgba(99,102,241,.3)',
            background: 'rgba(99,102,241,.08)', color: '#a5b4fc', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
          Sign Out
        </button>
      </div>
    </div>
  )
}

// ── Overview page ────────────────────────────────────────────────────────────
function PortalOverview() {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    supabase.rpc('admin_tenant_overview').then(({ data }) => setStats(data || []))
  }, [])

  const totalMRR     = (stats || []).reduce((s, r) => s + (Number(r.effective_monthly) || 0), 0)
  const activeOff    = (stats || []).filter(r => r.status === 'active').length
  const totalSeats   = (stats || []).reduce((s, r) => s + (r.employee_count || 0), 0)
  const totalClients = (stats || []).reduce((s, r) => s + (r.client_count || 0), 0)

  const KPI = [
    { label: 'Monthly Recurring', value: `$${totalMRR.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, sub: 'MRR', color: '#10b981' },
    { label: 'Active Offices',    value: activeOff,    sub: `${(stats||[]).length} total`, color: '#6366f1' },
    { label: 'Total Seats',       value: totalSeats,   sub: 'platform-wide', color: '#f59e0b' },
    { label: 'Total Clients',     value: totalClients.toLocaleString(), sub: 'across all firms', color: '#0ea5e9' },
  ]

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1000 }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, Romy 👋
        </div>
        <div style={{ fontSize: 14, color: '#64748b' }}>TaxRes CRM — Platform overview</div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16, marginBottom: 32 }}>
        {KPI.map(k => (
          <div key={k.label} style={{
            background: 'rgba(255,255,255,.03)', border: '1px solid rgba(99,102,241,.2)',
            borderRadius: 14, padding: '20px 20px',
          }}>
            <div style={{ fontSize: 11, color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: k.color, lineHeight: 1 }}>{stats === null ? '…' : k.value}</div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Office table */}
      <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>All Offices</div>
      <div style={{ background: 'rgba(255,255,255,.02)', border: '1px solid rgba(99,102,241,.2)', borderRadius: 12, overflow: 'hidden' }}>
        {!stats ? (
          <div style={{ padding: 24, color: '#475569', fontSize: 13 }}>Loading…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(99,102,241,.15)' }}>
                {['Firm', 'Status', 'Seats', 'Clients', 'MRR'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid rgba(99,102,241,.08)' }}>
                  <td style={{ padding: '12px 16px', color: '#e2e8f0', fontWeight: 600 }}>
                    {r.brand_color && <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:r.brand_color, marginRight:8 }}/>}
                    {r.firm_name}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 20, textTransform: 'capitalize',
                      background: r.status === 'active' ? '#10b98122' : '#ef444422',
                      color: r.status === 'active' ? '#10b981' : '#ef4444' }}>
                      {r.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{r.employee_count}</td>
                  <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{r.client_count}</td>
                  <td style={{ padding: '12px 16px', color: '#10b981', fontWeight: 700 }}>
                    {r.effective_monthly != null ? `$${Number(r.effective_monthly).toFixed(0)}/mo` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Billing placeholder ──────────────────────────────────────────────────────
function PortalBilling() {
  return (
    <div style={{ padding: '32px 36px' }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 4 }}>💳 Billing</div>
      <div style={{ fontSize: 14, color: '#64748b', marginBottom: 32 }}>Revenue, invoices, and per-seat tracking across all offices.</div>
      <div style={{ background: 'rgba(99,102,241,.08)', border: '1px dashed rgba(99,102,241,.3)', borderRadius: 14, padding: '40px 0', textAlign: 'center', color: '#6366f1', fontSize: 14 }}>
        Stripe Connect billing dashboard coming soon — per-seat invoicing, MRR charts, failed charges.
      </div>
    </div>
  )
}

// ── Email placeholder ────────────────────────────────────────────────────────
function PortalEmail() {
  return (
    <div style={{ padding: '32px 36px' }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 4 }}>📧 Email</div>
      <div style={{ fontSize: 14, color: '#64748b', marginBottom: 32 }}>Your romy@taxrescrm.net inbox — connected via Stalwart.</div>
      <div style={{ background: 'rgba(99,102,241,.08)', border: '1px dashed rgba(99,102,241,.3)', borderRadius: 14, padding: '40px 0', textAlign: 'center', color: '#6366f1', fontSize: 14 }}>
        Connect your mailbox in Settings to see your inbox here.<br/>
        <span style={{ fontSize: 12, color: '#475569', marginTop: 8, display: 'block' }}>Stalwart IMAP: mail.taxrescrm.net:993</span>
      </div>
    </div>
  )
}

// ── Search wrapper ───────────────────────────────────────────────────────────
function PortalSearch() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)

  async function search() {
    if (!q.trim()) return
    setBusy(true)
    const { data } = await supabase.rpc('admin_search_all', { p_query: q.trim() })
    setBusy(false)
    setResults(data || [])
  }

  return (
    <div style={{ padding: '32px 36px', maxWidth: 780 }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 4 }}>🔍 Search All Offices</div>
      <div style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>Find any client or lead by name, email, or phone across every office.</div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Name, email, or phone…" autoFocus
          style={{ flex: 1, padding: '11px 16px', borderRadius: 10, border: '1px solid rgba(99,102,241,.3)',
            background: 'rgba(255,255,255,.04)', color: '#e2e8f0', fontSize: 14, outline: 'none' }}/>
        <button onClick={search} disabled={busy || !q.trim()}
          style={{ padding: '11px 24px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff',
            fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: busy || !q.trim() ? .5 : 1 }}>
          {busy ? '…' : 'Search'}
        </button>
      </div>
      {results !== null && (results.length === 0 ? (
        <div style={{ color: '#475569', fontSize: 14 }}>No matches found.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {results.map(r => (
            <div key={r.id} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(99,102,241,.2)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 6, textTransform: 'uppercase',
                background: r.record_type === 'client' ? '#10b98122' : '#f59e0b22',
                color: r.record_type === 'client' ? '#10b981' : '#f59e0b' }}>{r.record_type}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: '#e2e8f0' }}>{r.name}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{[r.email, r.phone].filter(Boolean).join(' · ') || '—'}</div>
              </div>
              <div style={{ fontSize: 12, color: '#6366f1', fontWeight: 600 }}>{r.tenant_name}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Companies wrapper (reuse existing NewOffice page) ────────────────────────
const NewOffice = lazy(() => import('./NewOffice'))

function PortalCompanies() {
  return (
    <div style={{ padding: '8px 0' }}>
      <Suspense fallback={<div style={{ padding: 32, color: '#475569' }}>Loading…</div>}>
        <NewOffice />
      </Suspense>
    </div>
  )
}

// ── Support wrapper ──────────────────────────────────────────────────────────
function PortalSupport() {
  return (
    <div style={{ padding: '8px 0' }}>
      <Suspense fallback={<div style={{ padding: 32, color: '#475569' }}>Loading…</div>}>
        <Support />
      </Suspense>
    </div>
  )
}

// ── Main AdminPortal shell ───────────────────────────────────────────────────
export default function AdminPortal() {
  const navigate   = useNavigate()
  const { logout } = useApp()

  async function handleSignOut() {
    await supabase.auth.signOut()
    logout?.()
    navigate('/login')
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0d0c1a', fontFamily: 'Arial, sans-serif' }}>
      <AdminSidebar onSignOut={handleSignOut} />

      <div style={{ flex: 1, overflowY: 'auto', minHeight: '100vh' }}>
        <Suspense fallback={<div style={{ padding: 40, color: '#475569', fontSize: 13 }}>Loading…</div>}>
          <Routes>
            <Route path="/"             element={<PortalOverview />} />
            <Route path="/companies"    element={<PortalCompanies />} />
            <Route path="/companies/*"  element={<PortalCompanies />} />
            <Route path="/search"       element={<PortalSearch />} />
            <Route path="/support"      element={<PortalSupport />} />
            <Route path="/billing"      element={<PortalBilling />} />
            <Route path="/email"        element={<PortalEmail />} />
            <Route path="*"             element={<PortalOverview />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  )
}
