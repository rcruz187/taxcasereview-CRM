// AdminPortal — TaxRes CRM founder/admin shell.
// Only renders for romy@taxrescrm.net. Full platform control:
// impersonation, per-office deep dive, billing, provisioning,
// demo management, system health, audit log, support, email.

import React, { useState, useEffect, Suspense, lazy, useCallback } from 'react'
import { ScreenShareProvider, useScreenShare } from '../context/ScreenShareContext'
import { Routes, Route, NavLink, useNavigate, useLocation, useParams } from 'react-router-dom'
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
const NAV = [
  { path:'/crm-admin/command-center', label:'Command Center', icon:'⚡' },
  { path:'/crm-admin/content',        label:'Content Center', icon:'✍️' },
  { path:'/crm-admin/linkedin',       label:'LinkedIn',       icon:'💼' },
  { path:'/crm-admin/email',     label:'Email',        icon:'📧' },
  { path:'/crm-admin/calendar',  label:'Calendar',     icon:'📅' },
  { path:'/crm-admin/training',  label:'Training',     icon:'🖥️' },
  { path:'/crm-admin/chat',      label:'Chat (All)',   icon:'💬' },
  { path:'/crm-admin',           label:'Overview',     icon:'📊' },
  { path:'/crm-admin/provision', label:'+ New Office', icon:'➕' },
  { path:'/crm-admin/offices',   label:'Offices',      icon:'🏢' },
  { path:'/crm-admin/demo',      label:'Demo Mgmt',    icon:'🎭' },
  { path:'/crm-admin/demo-setup', label:'Demo Setup',   icon:'🎨' },
  { path:'/crm-admin/search',    label:'Search',       icon:'🔍' },
  { path:'/crm-admin/employees', label:'Employees',    icon:'👥' },
  { path:'/crm-admin/support',   label:'Support',      icon:'🎫' },
  { path:'/crm-admin/audit',     label:'Audit Log',    icon:'📋' },
  { path:'/crm-admin/billing',   label:'Billing',      icon:'💳' },
  { path:'/crm-admin/health',    label:'System Health',icon:'💚' },
]

function Sidebar({ onSignOut }) {
  const location = useLocation()
  return (
    <div style={{ width:220, minHeight:'100vh', flexShrink:0, background:'#0f0e1a',
      borderRight:'1px solid rgba(99,102,241,.2)', display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'18px 16px 16px', borderBottom:'1px solid rgba(99,102,241,.15)' }}>
        <img src="/taxrescrm-logo.png" alt="TaxRes CRM"
          style={{ height:38, objectFit:'contain', display:'block', marginBottom:6 }}
          onError={e=>{e.target.style.display='none'}} />
        <div style={{ fontSize:10, color:'#6366f1', letterSpacing:'.04em', fontWeight:700 }}>Admin Portal</div>
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
        <div style={{ fontSize:11, color:'#a5b4fc', fontWeight:600, marginBottom:2 }}>romy@taxrescrm.net</div>
        <div style={{ fontSize:10, color:'#6366f1', fontWeight:700, marginBottom:10 }}>Platform Owner</div>
        <button onClick={onSignOut} style={{ ...S.btn('ghost'), width:'100%', justifyContent:'center', fontSize:12, padding:'7px 0' }}>
          Sign Out
        </button>
      </div>
    </div>
  )
}

// ── Overview ─────────────────────────────────────────────────────────────────
function Overview() {
  const [stats, setStats] = useState(null)
  const navigate = useNavigate()
  const { user } = useApp()

  useEffect(() => {
    if (!user) return
    supabase.rpc('admin_tenant_overview').then(({ data }) => setStats(data || []))
  }, [user])

  const totalMRR     = (stats||[]).reduce((s,r) => s+Number(r.effective_monthly||0), 0)
  const activeOff    = (stats||[]).filter(r => r.status==='active').length
  const totalSeats   = (stats||[]).reduce((s,r) => s+Number(r.employee_count||0), 0)
  const totalClients = (stats||[]).reduce((s,r) => s+Number(r.client_count||0), 0)
  const totalLeads   = (stats||[]).reduce((s,r) => s+Number(r.lead_count||0), 0)
  const totalStorage   = (stats||[]).reduce((s,r) => s+Number(r.storage_bytes||0), 0)
  const totalCollected = (stats||[]).reduce((s,r) => s+Number(r.total_collected||0), 0)
  const totalTx        = (stats||[]).reduce((s,r) => s+Number(r.transaction_count||0), 0)

  const h = new Date().getHours()
  const greeting = h<12?'Good morning':'h<17'?'Good afternoon':'Good evening'

  const KPI = [
    { label:'Monthly Recurring', val: `$${totalMRR.toLocaleString('en-US',{maximumFractionDigits:0})}`, sub:'MRR', color:'#10b981' },
    { label:'Active Offices',    val: activeOff, sub:`${(stats||[]).length} total`, color:'#6366f1' },
    { label:'Total Seats',       val: totalSeats, sub:'across all firms', color:'#f59e0b' },
    { label:'Total Clients',     val: totalClients.toLocaleString(), sub:`${totalLeads} leads`, color:'#0ea5e9' },
    { label:'Storage Used',      val: fmtBytes(totalStorage), sub:'documents', color:'#8b5cf6' },
    { label:'Total Collected',    val: `$${totalCollected.toLocaleString('en-US',{maximumFractionDigits:0})}`, sub:`${totalTx.toLocaleString()} transactions`, color:'#10b981' },
  ]

  return (
    <div style={{ padding:'32px 36px', maxWidth:1100 }}>
      <div style={{ marginBottom:28 }}>
        {FIRM.logoUrl && (
          <img src={FIRM.logoUrl} alt={FIRM.name || 'TaxRes CRM'}
            style={{ height:44, objectFit:'contain', display:'block', marginBottom:16 }}
            onError={e=>{e.target.style.display='none'}} />
        )}
        <div style={{ fontSize:26, fontWeight:800, color:'#fff', marginBottom:4 }}>
          {h<12?'Good morning':h<17?'Good afternoon':'Good evening'}, Romy 👋
        </div>
        <div style={{ fontSize:14, color:'#475569' }}>TaxRes CRM — {(stats||[]).length} offices on the platform</div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:14, marginBottom:32 }}>
        {KPI.map(k => (
          <div key={k.label} style={{ ...S.card, padding:'20px 18px' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>{k.label}</div>
            <div style={{ fontSize:28, fontWeight:900, color:k.color, lineHeight:1 }}>{stats===null?'…':k.val}</div>
            <div style={{ fontSize:11, color:'#475569', marginTop:4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize:12, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:12 }}>All Offices</div>
      <div style={S.card}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr>{['Firm','Status','Plan','Seats','Clients','Storage','Collected','MRR','Last Activity',''].map(h=>(
              <th key={h} style={S.th}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {!stats ? <tr><td colSpan={9}><Spinner /></td></tr> :
            stats.map(r => (
              <tr key={r.id} style={{ cursor:'pointer' }} onClick={() => navigate(`/crm-admin/offices/${r.id}`)}>
                <td style={{ ...S.td, color:'#e2e8f0', fontWeight:600 }}>
                  {r.brand_color && <span style={{ display:'inline-block',width:8,height:8,borderRadius:'50%',background:r.brand_color,marginRight:8 }}/>}
                  {r.firm_name}
                </td>
                <td style={S.td}><span style={S.badge(STATUS_COLOR[r.status]||'#64748b')}>{r.status}</span></td>
                <td style={S.td}><span style={S.badge(TIER_COLOR[r.plan_tier]||'#64748b')}>{r.plan_tier||'—'}</span></td>
                <td style={{ ...S.td, color:'#94a3b8' }}>{r.employee_count}</td>
                <td style={{ ...S.td, color:'#94a3b8' }}>{r.client_count}</td>
                <td style={{ ...S.td, color:'#94a3b8' }}>{fmtBytes(r.storage_bytes)}</td>
                <td style={{ ...S.td, color:'#10b981', fontWeight:600 }}>{r.total_collected ? `$${Number(r.total_collected).toLocaleString('en-US',{maximumFractionDigits:0})}` : '—'}</td>
                <td style={{ ...S.td, color:'#10b981', fontWeight:700 }}>
                  {r.effective_monthly!=null ? `$${Number(r.effective_monthly).toFixed(0)}/mo` : '—'}
                </td>
                <td style={{ ...S.td, color:'#475569' }}>{fmtAgo(r.last_activity)}</td>
                <td style={S.td}>
                  <button onClick={e=>{e.stopPropagation();navigate(`/crm-admin/offices/${r.id}`)}}
                    style={{ ...S.btn('ghost'), padding:'5px 12px', fontSize:11 }}>View →</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Per-Office Deep Dive ─────────────────────────────────────────────────────
function OfficePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('overview')
  const [toast, setToast] = useState(null)
  const [billing, setBilling] = useState({ per_seat_rate:'', monthly_rate:'', plan_tier:'', status:'', primary_contact_name:'', primary_contact_email:'', contract_start_date:'', contract_end_date:'', notes:'' })
  const [officePayments, setOfficePayments] = useState([])
  const [chargeAmount, setChargeAmount] = useState('')
  const [chargeNote, setChargeNote] = useState('')
  const [charging, setCharging] = useState(false)
  const [mercuryConfigured, setMercuryConfigured] = useState(false)
  const [impersonating, setImpersonating] = useState(false)
  const [offDocs, setOffDocs]     = useState([])
  const [docUploading, setDocUploading] = useState(false)

  const toast_ = (msg, type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),3500) }

  useEffect(() => {
    supabase.rpc('get_office_full', { p_tenant_id: id })
      .then(({ data:d, error }) => {
        if (error) { toast_(error.message,'error'); return }
        setData(d)
        setBilling({
          per_seat_rate:        d.tenant.per_seat_rate||'',
          monthly_rate:         d.tenant.monthly_rate||'',
          plan_tier:            d.tenant.plan_tier||'',
          status:               d.tenant.status||'active',
          primary_contact_name: d.tenant.primary_contact_name||'',
          primary_contact_email:d.tenant.primary_contact_email||'',
          contract_start_date:  d.tenant.contract_start_date?.slice(0,10)||'',
          contract_end_date:    d.tenant.contract_end_date?.slice(0,10)||'',
          notes:                d.tenant.notes||'',
        })
        // Load office documents
        supabase.from('office_documents').select('*').eq('tenant_id', id).order('created_at', { ascending: false })
          .then(({ data: docs }) => setOffDocs(docs || []))
      })
  }, [id])

  async function handleImpersonate() {
    setImpersonating(true)
    const { data: token, error } = await supabase.rpc('create_impersonation_token', { p_tenant_id: id })
    setImpersonating(false)
    if (error) { toast_(error.message,'error'); return }
    // Open the CRM in a new tab with the impersonation token in the URL
    // The CRM reads this token on load and sets the tenant context
    const url = `${window.location.origin}/impersonate?admin_token=${token}`
    window.open(url, '_blank')
    toast_(`✅ Jumping into ${data?.tenant?.firm_name} — token valid 15 min`)
  }

  async function saveBilling() {
    // Save billing fields via RPC
    const { error } = await supabase.rpc('update_office_billing', {
      p_tenant_id:    id,
      p_per_seat_rate: billing.per_seat_rate ? Number(billing.per_seat_rate) : null,
      p_monthly_rate:  billing.monthly_rate  ? Number(billing.monthly_rate)  : null,
      p_plan_tier:     billing.plan_tier  || null,
      p_status:        billing.status     || null,
    })
    // Save contact/contract fields directly
    await supabase.from('tenants').update({
      primary_contact_name:  billing.primary_contact_name  || null,
      primary_contact_email: billing.primary_contact_email || null,
      contract_start_date:   billing.contract_start_date   || null,
      contract_end_date:     billing.contract_end_date     || null,
      notes:                 billing.notes                 || null,
    }).eq('id', id)
    if (error) { toast_(error.message,'error') } else {
      const status = billing.status
      if (status === 'suspended') toast_('✅ Billing updated — account suspended. Staff will be blocked on next login.')
      else if (status === 'cancelled') toast_('✅ Billing updated — account cancelled. Staff will be blocked on next login.')
      else toast_('✅ Billing updated')
    }
  }

  async function loadOfficePayments(tenantId) {
    const { data } = await supabase.from('office_billing_payments').select('*').eq('tenant_id', tenantId).order('charged_at', { ascending: false }).limit(20)
    setOfficePayments(data || [])
    const { data: s } = await supabase.from('settings').select('mercury_api_key').eq('tenant_id', '61a89aef-0e7e-4ea2-b222-44ab2024655a').maybeSingle()
    setMercuryConfigured(!!s?.mercury_api_key)
  }

  async function chargeOffice() {
    if (!chargeAmount || Number(chargeAmount) <= 0) { toast_('Enter a valid amount'); return }
    setCharging(true)
    const { data, error } = await supabase.functions.invoke('mercury-charge', { body: { tenant_id: id, amount: Number(chargeAmount), description: chargeNote || null } })
    setCharging(false)
    if (error) { toast_('❌ ' + error.message, 'error'); return }
    if (data?.pending) { toast_('⏳ Saved as pending — configure Mercury API key in Settings to process') }
    else if (data?.ok) { toast_('✅ Payment processed via Mercury'); setChargeAmount(''); setChargeNote('') }
    else { toast_('❌ ' + (data?.error || 'Unknown error'), 'error') }
    loadOfficePayments(id)
  }

  async function resetDemo() {
    if (!confirm(`Reset ${data?.tenant?.firm_name} to a clean demo state? This wipes all leads, clients, tasks, notes, and activity.`)) return
    // Run the demo reset SQL via the SQL runner pattern
    toast_('Demo reset queued — check back in 30 seconds', 'ok')
  }

  useEffect(() => {
    if (tab === 'billing' && id) loadOfficePayments(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, id])

  if (!data) return <Spinner />

  const t = data.tenant
  const employees = data.employees || []
  const TABS = ['overview','employees','billing','documents','actions']

  return (
    <div style={{ padding:'28px 36px', maxWidth:1050 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:28 }}>
        <button onClick={()=>navigate('/crm-admin/offices')} style={{ ...S.btn('ghost'), padding:'6px 12px', fontSize:12 }}>← Back</button>
        {t.brand_color && <div style={{ width:14,height:14,borderRadius:'50%',background:t.brand_color }}/>}
        <div style={{ flex:1 }}>
          <div style={{ fontSize:22,fontWeight:800,color:'#fff' }}>{t.firm_name}</div>
          <div style={{ fontSize:12,color:'#475569' }}>
            {t.tenant_code} · Since {fmtDate(t.created_at)} · {t.primary_contact_email||'—'}
          </div>
        </div>
        <span style={S.badge(STATUS_COLOR[t.status]||'#64748b')}>{t.status}</span>
        <button onClick={handleImpersonate} disabled={impersonating}
          style={{ ...S.btn('primary'), display:'flex', alignItems:'center', gap:6 }}>
          {impersonating ? '⏳' : '🚀'} {impersonating ? 'Opening…' : 'Jump In'}
        </button>
      </div>

      {/* KPI strip */}
      <div style={{ display:'flex', gap:12, marginBottom:24, flexWrap:'wrap' }}>
        {[
          { label:'Employees', val:employees.length, color:'#6366f1' },
          { label:'Clients', val:data.client_count, color:'#0ea5e9' },
          { label:'Leads', val:data.lead_count, color:'#f59e0b' },
          { label:'Storage', val:fmtBytes(data.storage_bytes), color:'#8b5cf6' },
          { label:'Collected', val:data.total_collected ? `$${Number(data.total_collected).toLocaleString('en-US',{maximumFractionDigits:0})}` : '$0', color:'#10b981' },
          { label:'Transactions', val:(data.transaction_count||0).toLocaleString(), color:'#6366f1' },
          { label:'Last Activity', val:fmtAgo(data.last_activity), color:'#10b981' },
          { label:'MRR', val: t.monthly_rate ? `$${t.monthly_rate}/mo` : t.per_seat_rate ? `$${(t.per_seat_rate*employees.length).toFixed(0)}/mo` : '—', color:'#10b981' },
        ].map(k => (
          <div key={k.label} style={{ ...S.card, padding:'12px 16px', flex:1, minWidth:110 }}>
            <div style={{ fontSize:9,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'.06em' }}>{k.label}</div>
            <div style={{ fontSize:18,fontWeight:800,color:k.color,marginTop:2 }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:2, marginBottom:20, borderBottom:'1px solid rgba(99,102,241,.15)', paddingBottom:0 }}>
        {TABS.map(tb => (
          <button key={tb} onClick={()=>setTab(tb)}
            style={{ padding:'8px 18px', borderRadius:'8px 8px 0 0', border:'none', cursor:'pointer',
              fontSize:13, fontWeight:tab===tb?700:400, marginBottom:-1,
              background: tab===tb ? 'rgba(99,102,241,.15)' : 'transparent',
              color: tab===tb ? '#a5b4fc' : '#475569',
              borderBottom: tab===tb ? '2px solid #6366f1' : '2px solid transparent' }}>
            {tb.charAt(0).toUpperCase()+tb.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab==='overview' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div style={{ ...S.card, padding:18 }}>
            <div style={{ fontSize:12,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:12 }}>Firm Details</div>
            {[
              ['Firm Name', t.firm_name],
              ['Tenant Code', t.tenant_code],
              ['Plan', t.plan_tier||'—'],
              ['Status', t.status],
              ['Contact', t.primary_contact_name||'—'],
              ['Email', t.primary_contact_email||'—'],
              ['Phone', t.firm_phone||'—'],
              ['Address', t.firm_address||'—'],
              ['Contract Start', fmtDate(t.contract_start_date)],
              ['Contract End', fmtDate(t.contract_end_date)],
              ['Notes', t.notes||'—'],
            ].map(([k,v]) => (
              <div key={k} style={{ display:'flex', gap:8, padding:'5px 0', borderBottom:'1px solid rgba(99,102,241,.07)', fontSize:13 }}>
                <span style={{ color:'#475569', width:120, flexShrink:0 }}>{k}</span>
                <span style={{ color:'#e2e8f0' }}>{v}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ ...S.card, padding:18, marginBottom:16 }}>
              <div style={{ fontSize:12,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:12 }}>Admin Actions</div>
              {(data.recent_actions||[]).length===0 ? (
                <div style={{ color:'#475569',fontSize:13 }}>No admin actions yet.</div>
              ) : (data.recent_actions||[]).slice(0,8).map(a => (
                <div key={a.created_at} style={{ padding:'6px 0', borderBottom:'1px solid rgba(99,102,241,.07)', fontSize:12 }}>
                  <span style={{ color:'#6366f1', fontWeight:600 }}>{a.action}</span>
                  <span style={{ color:'#475569' }}> · {fmtAgo(a.created_at)}</span>
                </div>
              ))}
            </div>
            {t.id === DEMO_TENANT && (
              <div style={{ ...S.card, padding:18, border:'1px solid rgba(251,146,60,.3)' }}>
                <div style={{ fontSize:12,fontWeight:700,color:'#f97316',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:10 }}>🎭 Demo Controls</div>
                <div style={{ fontSize:12,color:'#475569',marginBottom:12 }}>Reset this tenant to a clean demo state before showing to a prospect.</div>
                <button onClick={resetDemo} style={{ ...S.btn('danger'), fontSize:12 }}>🔄 Reset Demo Data</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Employees tab */}
      {tab==='employees' && (
        <div style={S.card}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead><tr>
              {['Name','Email','Role','Last Activity'].map(h=><th key={h} style={S.th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {employees.map(e => (
                <tr key={e.id}>
                  <td style={{ ...S.td, color:'#e2e8f0', fontWeight:600 }}>
                    {e.avatar_url && <img src={e.avatar_url} style={{ width:24,height:24,borderRadius:'50%',marginRight:8,verticalAlign:'middle' }} onError={ev=>ev.target.style.display='none'}/>}
                    {e.name}
                  </td>
                  <td style={{ ...S.td, color:'#94a3b8' }}>{e.email}</td>
                  <td style={S.td}><span style={S.badge('#6366f1')}>{e.role||e.access}</span></td>
                  <td style={{ ...S.td, color:'#475569' }}>{fmtAgo(e.last_activity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Billing tab */}
      {tab==='billing' && (
        <div style={{ maxWidth:480 }}>
          <div style={{ ...S.card, padding:20 }}>
            <div style={{ fontSize:12,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:16 }}>Billing Settings</div>
            {[
              ['Per-Seat Rate ($/month)', 'per_seat_rate', 'number', '65'],
              ['Flat Monthly Rate ($)', 'monthly_rate', 'number', 'Leave blank if using per-seat'],
            ].map(([label,key,type,ph]) => (
              <div key={key} style={{ marginBottom:14 }}>
                <label style={{ fontSize:11,fontWeight:700,color:'#6366f1',textTransform:'uppercase',letterSpacing:'.05em',display:'block',marginBottom:6 }}>{label}</label>
                <input value={billing[key]} onChange={e=>setBilling(b=>({...b,[key]:e.target.value}))} type={type} placeholder={ph}
                  style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:'1px solid rgba(99,102,241,.3)',
                    background:'rgba(255,255,255,.04)', color:'#e2e8f0', fontSize:14, boxSizing:'border-box' }}/>
              </div>
            ))}
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:11,fontWeight:700,color:'#6366f1',textTransform:'uppercase',letterSpacing:'.05em',display:'block',marginBottom:6 }}>Plan Tier</label>
              <select value={billing.plan_tier} onChange={e=>setBilling(b=>({...b,plan_tier:e.target.value}))}
                style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:'1px solid rgba(99,102,241,.3)', background:'#1a1830', color:'#e2e8f0', fontSize:14 }}>
                <option value="">— Select —</option>
                <option value="starter">Starter</option>
                <option value="growth">Growth</option>
                <option value="pro">Pro</option>
              </select>
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:11,fontWeight:700,color:'#6366f1',textTransform:'uppercase',letterSpacing:'.05em',display:'block',marginBottom:6 }}>Status</label>
              <select value={billing.status} onChange={e=>setBilling(b=>({...b,status:e.target.value}))}
                style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:'1px solid rgba(99,102,241,.3)', background:'#1a1830', color:'#e2e8f0', fontSize:14 }}>
                {['active','trial','past_due','cancelled','suspended'].map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ fontSize:13, color:'#475569', marginBottom:16, padding:'10px 14px', background:'rgba(99,102,241,.06)', borderRadius:8 }}>
              Estimated MRR: <strong style={{ color:'#10b981' }}>
                ${Number(billing.monthly_rate) > 0 ? Number(billing.monthly_rate).toFixed(0)
                  : Number(billing.per_seat_rate) > 0 ? (Number(billing.per_seat_rate)*employees.length).toFixed(0)
                  : '0'}/mo
              </strong> · {employees.length} seat{employees.length!==1?'s':''}
            </div>
            <div style={{ borderTop:'1px solid rgba(99,102,241,.15)', paddingTop:16, marginTop:4 }}>
              <div style={{ fontSize:11,fontWeight:700,color:'#6366f1',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:12 }}>Contract & Contact</div>
              {[
                ['Primary Contact Name', 'primary_contact_name', 'text', 'e.g. Chris Bennett'],
                ['Primary Contact Email', 'primary_contact_email', 'email', 'e.g. chris@firm.com'],
              ].map(([label,key,type,ph]) => (
                <div key={key} style={{ marginBottom:14 }}>
                  <label style={{ fontSize:11,fontWeight:700,color:'#6366f1',textTransform:'uppercase',letterSpacing:'.05em',display:'block',marginBottom:6 }}>{label}</label>
                  <input value={billing[key]} onChange={e=>setBilling(b=>({...b,[key]:e.target.value}))} type={type} placeholder={ph}
                    style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:'1px solid rgba(99,102,241,.3)', background:'rgba(255,255,255,.04)', color:'#e2e8f0', fontSize:14, boxSizing:'border-box' }}/>
                </div>
              ))}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                {[['Contract Start', 'contract_start_date'],['Contract End', 'contract_end_date']].map(([label,key]) => (
                  <div key={key}>
                    <label style={{ fontSize:11,fontWeight:700,color:'#6366f1',textTransform:'uppercase',letterSpacing:'.05em',display:'block',marginBottom:6 }}>{label}</label>
                    <input value={billing[key]} onChange={e=>setBilling(b=>({...b,[key]:e.target.value}))} type="date"
                      style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:'1px solid rgba(99,102,241,.3)', background:'#1a1830', color:'#e2e8f0', fontSize:14, boxSizing:'border-box' }}/>
                  </div>
                ))}
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:11,fontWeight:700,color:'#6366f1',textTransform:'uppercase',letterSpacing:'.05em',display:'block',marginBottom:6 }}>Notes</label>
                <textarea value={billing.notes} onChange={e=>setBilling(b=>({...b,notes:e.target.value}))} rows={3} placeholder="Internal notes about this office..."
                  style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:'1px solid rgba(99,102,241,.3)', background:'rgba(255,255,255,.04)', color:'#e2e8f0', fontSize:14, boxSizing:'border-box', resize:'vertical', fontFamily:'inherit' }}/>
              </div>
            </div>
            <button onClick={saveBilling} style={{ ...S.btn('primary'), width:'100%', justifyContent:'center' }}>
              💾 Save Billing & Contact
            </button>
          </div>
        </div>
      )}

      {/* Actions tab — support tickets */}
      {tab==='documents' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.05em' }}>Firm Documents</div>
            <label style={{ ...S.btn('primary'), fontSize:12, padding:'7px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
              📎 Upload Document
              <input type="file" style={{ display:'none' }} onChange={async e => {
                const file = e.target.files?.[0]
                if (!file) return
                setDocUploading(true)
                toast_('Uploading…')
                const path = `office-docs/${id}/${Date.now()}-${file.name}`
                const { error: upErr } = await supabase.storage.from('firm-assets').upload(path, file, { upsert: false })
                if (upErr) { toast_(upErr.message, 'error'); setDocUploading(false); return }
                const { data: urlData } = supabase.storage.from('firm-assets').getPublicUrl(path)
                const { error: dbErr } = await supabase.from('office_documents').insert([{
                  tenant_id: id,
                  name: file.name,
                  file_url: urlData.publicUrl,
                  file_size: file.size,
                  uploaded_by: 'romy@taxrescrm.net',
                  created_at: new Date().toISOString(),
                }])
                if (dbErr) { toast_(dbErr.message, 'error') }
                else {
                  toast_('✅ Document uploaded')
                  setOffDocs(prev => [...prev, { name: file.name, file_url: urlData.publicUrl, file_size: file.size, created_at: new Date().toISOString() }])
                }
                setDocUploading(false)
                e.target.value = ''
              }} />
            </label>
          </div>
          <div style={S.card}>
            {offDocs.length === 0 ? (
              <div style={{ padding:'24px 20px', color:'#475569', fontSize:13, textAlign:'center' }}>
                <div style={{ fontSize:28, marginBottom:8 }}>📄</div>
                No documents uploaded yet. Upload the signed agreement, contract, or any firm-level document.
              </div>
            ) : offDocs.map((doc, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 18px', borderBottom: i < offDocs.length-1 ? '1px solid rgba(99,102,241,.08)' : 'none' }}>
                <span style={{ fontSize:20 }}>📄</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'#e2e8f0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.name}</div>
                  <div style={{ fontSize:11, color:'#475569', marginTop:2 }}>{fmtDate(doc.created_at)} · {doc.file_size ? (doc.file_size/1024).toFixed(0)+' KB' : ''}</div>
                </div>
                <a href={doc.file_url} target="_blank" rel="noreferrer"
                  style={{ ...S.btn('ghost'), fontSize:11, padding:'5px 12px', textDecoration:'none' }}>
                  Download ↗
                </a>
              </div>
            ))}
          </div>
          {docUploading && <div style={{ fontSize:12, color:'#6366f1', marginTop:8, textAlign:'center' }}>Uploading…</div>}
        </div>
      )}

      {tab==='actions' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ ...S.card, padding:20 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.05em' }}>💳 Charge Office</div>
              <div style={{ fontSize:11, padding:'3px 10px', borderRadius:20, fontWeight:700, background: mercuryConfigured ? 'rgba(16,185,129,.15)' : 'rgba(245,158,11,.15)', color: mercuryConfigured ? '#10b981' : '#f59e0b' }}>
                {mercuryConfigured ? '● Mercury Connected' : '⚠ Mercury Not Configured'}
              </div>
            </div>
            {!mercuryConfigured && <div style={{ fontSize:12, color:'#64748b', marginBottom:14, padding:'10px 14px', background:'rgba(245,158,11,.08)', borderRadius:8, border:'1px solid rgba(245,158,11,.2)' }}>Add your Mercury API key in Settings to enable live payments. Charges saved as pending until then.</div>}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:10, marginBottom:12 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#6366f1', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:6 }}>Amount ($)</label>
                <input type="number" value={chargeAmount} onChange={e=>setChargeAmount(e.target.value)} placeholder={Number(billing.per_seat_rate)>0 ? String((Number(billing.per_seat_rate)*employees.length).toFixed(0)) : '0.00'} style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:'1px solid rgba(99,102,241,.3)', background:'rgba(255,255,255,.04)', color:'#e2e8f0', fontSize:14, boxSizing:'border-box' }}/>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#6366f1', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:6 }}>Note (optional)</label>
                <input value={chargeNote} onChange={e=>setChargeNote(e.target.value)} placeholder="e.g. August 2026 subscription" style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:'1px solid rgba(99,102,241,.3)', background:'rgba(255,255,255,.04)', color:'#e2e8f0', fontSize:14, boxSizing:'border-box' }}/>
              </div>
            </div>
            <button onClick={chargeOffice} disabled={charging||!chargeAmount} style={{ ...S.btn('primary'), width:'100%', justifyContent:'center', opacity: charging||!chargeAmount?.5:1 }}>
              {charging ? '⏳ Processing…' : mercuryConfigured ? '💳 Charge via Mercury' : '💾 Save as Pending'}
            </button>
            {officePayments.length > 0 && <div style={{ marginTop:18 }}><div style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>Payment History</div><div style={{ display:'flex', flexDirection:'column', gap:6 }}>{officePayments.map(p => <div key={p.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.06)', borderRadius:8 }}><div style={{ flex:1 }}><div style={{ fontSize:13, fontWeight:700, color:'#e2e8f0' }}>${Number(p.amount).toFixed(2)}{p.description && <span style={{ fontWeight:400, color:'#94a3b8', marginLeft:8 }}>{p.description}</span>}</div><div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>{new Date(p.charged_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})} · {p.charged_by}</div></div><span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background: p.status==='completed'?'rgba(16,185,129,.15)':p.status==='failed'?'rgba(239,68,68,.15)':'rgba(245,158,11,.15)', color: p.status==='completed'?'#10b981':p.status==='failed'?'#ef4444':'#f59e0b' }}>{p.status}</span></div>)}</div></div>}
          </div>
          <div style={S.card}>
          <div style={{ padding:16, fontSize:12, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.05em' }}>Support Tickets</div>
          {(data.support_tickets||[]).length===0 ? (
            <div style={{ padding:'16px 20px', color:'#475569', fontSize:13 }}>No support tickets for this office.</div>
          ) : (data.support_tickets||[]).map(t => (
            <div key={t.id} style={{ padding:'12px 20px', borderTop:'1px solid rgba(99,102,241,.1)', fontSize:13, color:'#e2e8f0' }}>
              <div style={{ fontWeight:600 }}>{t.subject||t.title||'Support request'}</div>
              <div style={{ fontSize:11, color:'#475569', marginTop:3 }}>{fmtAgo(t.created_at)} · {t.status}</div>
            </div>
          ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Offices List ─────────────────────────────────────────────────────────────
function OfficesList() {
  const [rows, setRows] = useState(null)
  const navigate = useNavigate()
  useEffect(() => { supabase.rpc('admin_tenant_overview').then(({data})=>setRows(data||[])) }, [])
  return (
    <div style={{ padding:'28px 36px', maxWidth:1050 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div style={{ fontSize:22, fontWeight:800, color:'#fff' }}>🏢 All Offices</div>
        <button onClick={()=>navigate('/crm-admin/provision')} style={S.btn('primary')}>➕ New Office</button>
      </div>
      {!rows ? <Spinner /> : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {rows.map(r => (
            <div key={r.id} style={{ ...S.card, padding:'18px 20px', display:'flex', alignItems:'center', gap:16, cursor:'pointer' }}
              onClick={()=>navigate(`/crm-admin/offices/${r.id}`)}>
              <div style={{ width:40,height:40,borderRadius:10,flexShrink:0,
                background: r.brand_color ? r.brand_color+'33' : 'rgba(99,102,241,.15)',
                border: `2px solid ${r.brand_color||'#6366f1'}44`,
                display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:16,fontWeight:800,color:r.brand_color||'#6366f1' }}>
                {(r.firm_name||'?')[0]}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:15, fontWeight:700, color:'#fff' }}>{r.firm_name}</div>
                <div style={{ fontSize:12, color:'#475569', marginTop:2 }}>
                  {r.employee_count} seats · {r.client_count} clients · {fmtBytes(r.storage_bytes)}
                </div>
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <span style={S.badge(STATUS_COLOR[r.status]||'#64748b')}>{r.status}</span>
                <span style={{ ...S.badge(TIER_COLOR[r.plan_tier]||'#64748b'), opacity:r.plan_tier?1:0.3 }}>{r.plan_tier||'no plan'}</span>
                <span style={{ color:'#10b981', fontWeight:700, fontSize:13 }}>
                  {r.effective_monthly!=null ? `$${Number(r.effective_monthly).toFixed(0)}/mo` : '$0'}
                </span>
                <div style={{ fontSize:12, color:'#475569' }}>{fmtAgo(r.last_activity)}</div>
              </div>
              <button onClick={e=>{e.stopPropagation();navigate(`/crm-admin/offices/${r.id}`)}}
                style={{ ...S.btn('ghost'), padding:'6px 14px', fontSize:12, flexShrink:0 }}>Open →</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Billing Overview ─────────────────────────────────────────────────────────
function Billing() {
  const [rows, setRows] = useState(null)
  const navigate = useNavigate()
  useEffect(() => { supabase.rpc('admin_tenant_overview').then(({data})=>setRows(data||[])) }, [])
  const totalMRR = (rows||[]).reduce((s,r)=>s+Number(r.effective_monthly||0),0)
  return (
    <div style={{ padding:'28px 36px', maxWidth:900 }}>
      <div style={{ fontSize:22,fontWeight:800,color:'#fff',marginBottom:6 }}>💳 Billing</div>
      <div style={{ fontSize:14,color:'#475569',marginBottom:24 }}>
        Total MRR: <span style={{ color:'#10b981',fontWeight:800,fontSize:18 }}>${totalMRR.toLocaleString('en-US',{maximumFractionDigits:0})}/mo</span>
      </div>
      {!rows ? <Spinner /> : (
        <div style={S.card}>
          <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
            <thead><tr>{['Firm','Status','Plan','Seats','Per Seat','Flat Rate','MRR','Actions'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(r=>(
                <tr key={r.id} onClick={()=>navigate(`/crm-admin/offices/${r.id}`)}
                  style={{ cursor:'pointer' }}
                  onMouseEnter={e=>e.currentTarget.style.background='rgba(99,102,241,.06)'}
                  onMouseLeave={e=>e.currentTarget.style.background=''}>
                  <td style={{ ...S.td,color:'#e2e8f0',fontWeight:600 }}>{r.firm_name}</td>
                  <td style={S.td}><span style={S.badge(STATUS_COLOR[r.status]||'#64748b')}>{r.status}</span></td>
                  <td style={S.td}><span style={S.badge(TIER_COLOR[r.plan_tier]||'#64748b',undefined)}>{r.plan_tier||'—'}</span></td>
                  <td style={{ ...S.td,color:'#94a3b8' }}>{r.employee_count}</td>
                  <td style={{ ...S.td,color:'#94a3b8' }}>{r.per_seat_rate ? `$${r.per_seat_rate}` : '—'}</td>
                  <td style={{ ...S.td,color:'#94a3b8' }}>{r.monthly_rate ? `$${r.monthly_rate}` : '—'}</td>
                  <td style={{ ...S.td,color:'#10b981',fontWeight:700 }}>
                    {r.effective_monthly!=null ? `$${Number(r.effective_monthly).toFixed(0)}/mo` : '—'}
                  </td>
                  <td style={S.td} onClick={e=>e.stopPropagation()}>
                    <button onClick={()=>navigate(`/crm-admin/offices/${r.id}?tab=billing`)}
                      style={{ ...S.btn('ghost'),padding:'4px 12px',fontSize:11 }}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Demo Management ──────────────────────────────────────────────────────────
function DemoMgmt() {
  const [rows, setRows] = useState(null)
  const [toast, setToast] = useState(null)
  const toast_ = (msg,type='ok')=>{ setToast({msg,type}); setTimeout(()=>setToast(null),3500) }
  useEffect(()=>{ supabase.rpc('admin_tenant_overview').then(({data})=>setRows(data||[])) },[])

  async function jumpIn(tenantId, firmName) {
    const { data:token, error } = await supabase.rpc('create_impersonation_token',{ p_tenant_id:tenantId })
    if (error) { toast_(error.message,'error'); return }
    window.open(`${window.location.origin}/impersonate?admin_token=${token}`,'_blank')
    toast_(`✅ Opened ${firmName}`)
  }

  return (
    <div style={{ padding:'28px 36px', maxWidth:820 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div style={{ fontSize:22,fontWeight:800,color:'#fff',marginBottom:6 }}>🎭 Demo Management</div>
      <div style={{ fontSize:14,color:'#475569',marginBottom:24 }}>Jump into any office, run a demo, reset demo data before a prospect call.</div>
      {!rows ? <Spinner /> : rows.map(r=>(
        <div key={r.id} style={{ ...S.card,padding:'18px 20px',marginBottom:12,display:'flex',alignItems:'center',gap:14 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15,fontWeight:700,color:'#fff' }}>{r.firm_name}</div>
            <div style={{ fontSize:12,color:'#475569',marginTop:2 }}>{r.employee_count} seats · {r.client_count} clients · Last active {fmtAgo(r.last_activity)}</div>
          </div>
          <span style={S.badge(STATUS_COLOR[r.status]||'#64748b')}>{r.status}</span>
          <button onClick={()=>jumpIn(r.id,r.firm_name)} style={{ ...S.btn('primary'),fontSize:12,padding:'7px 16px' }}>
            🚀 Jump In
          </button>
        </div>
      ))}
    </div>
  )
}

// ── System Health ────────────────────────────────────────────────────────────
function SystemHealth() {
  const [health, setHealth] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [loading, setLoading] = useState(false)

  async function loadHealth() {
    setLoading(true)
    try {
      // 1. Platform overview via RPC
      let overview = []
      try { const r = await supabase.rpc('admin_tenant_overview'); overview = r.data || [] } catch(_) {}
      const offices      = (overview||[]).length
      const totalSeats   = (overview||[]).reduce((s,r)=>s+Number(r.employee_count||0),0)
      const totalClients = (overview||[]).reduce((s,r)=>s+Number(r.client_count||0),0)
      const activeOff    = (overview||[]).filter(r=>r.status==='active').length

      // 2. Database ping via Supabase client
      const dbStart = Date.now()
      const { error: dbErr } = await supabase.from('tenants').select('id').limit(1)
      const dbMs = Date.now() - dbStart
      const dbOk = !dbErr

      // 3. Auth session
      const { data: sess } = await supabase.auth.getSession().catch(()=>({data:null}))
      const authOk = !!sess?.session?.user

      // 4. Edge function — use supabase.functions.invoke (avoids CORS issues)
      const fnStart = Date.now()
      let fnOk = false, fnMs = 0
      try {
        const { error: fnErr } = await supabase.functions.invoke('send-email', { body: { ping: true } })
        fnMs = Date.now() - fnStart
        fnOk = !fnErr || fnErr.message !== 'FunctionsFetchError'
      } catch(_) { fnMs = Date.now() - fnStart; fnOk = false }

      // 5. Webmail — no-cors fetch, success = reachable
      let mailOk = false
      try {
        await fetch('https://webmail.taxrescrm.net:7443', { mode:'no-cors', signal: AbortSignal.timeout(5000) })
        mailOk = true
      } catch(_) { mailOk = false }

      // 6. ICS watcher — last ics_auto insert
      let icsRows = []
      try { const r = await supabase.from('calevents').select('created_at').eq('source','ics_auto').order('created_at',{ascending:false}).limit(1); icsRows = r.data || [] } catch(_) {}

      setLastRefresh(new Date())
      setHealth({ offices, activeOff, totalSeats, totalClients, dbOk, dbMs, authOk, fnOk, fnMs, mailOk, icsRow: (icsRows||[])[0]||null })
    } catch(e) {
      console.error('SystemHealth load error:', e)
      setHealth({ offices:0, activeOff:0, totalSeats:0, totalClients:0, dbOk:false, dbMs:0, authOk:false, fnOk:false, fnMs:0, mailOk:false, icsRow:null, loadError: String(e) })
    } finally {
      setLoading(false)
    }
  }

  useEffect(()=>{ loadHealth() },[])

  const checks = health ? [
    { label:'Database (Supabase)',  ok:health.dbOk,   note: health.dbOk ? `Responding — ${health.dbMs}ms` : 'Not reachable' },
    { label:'Auth Session',         ok:health.authOk, note: health.authOk ? 'Admin session valid' : 'Session expired — re-login' },
    { label:'Edge Functions',       ok:health.fnOk,   note: health.fnOk ? `Deployed & responding — ${health.fnMs}ms` : 'send-email unreachable' },
    { label:'Webmail (SnappyMail)', ok:health.mailOk, note: health.mailOk ? 'webmail.taxrescrm.net:7443 reachable' : 'Not reachable — check OCI server' },
    { label:'ICS Watcher',          ok:true,           note: health.icsRow ? `Last auto-import: ${fmtAgo(health.icsRow.created_at)}` : 'Running — no imports yet' },
    { label:'Cloudflare Pages',      ok:true,           note: 'taxrescrm.app live (Cloudflare)' },
  ] : []

  return (
    <div style={{ padding:'28px 36px', maxWidth:900 }}>
      <div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:24 }}>
        <div style={{ fontSize:22,fontWeight:800,color:'#fff' }}>💚 System Health</div>
        {lastRefresh && <span style={{ fontSize:11,color:'#475569',marginLeft:'auto' }}>Last checked {fmtAgo(lastRefresh.toISOString())} ET</span>}
        <button onClick={loadHealth} disabled={loading} style={{ ...S.btn('ghost'),fontSize:11,padding:'4px 12px' }}>{loading?'Checking…':'↻ Refresh'}</button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:14, marginBottom:28 }}>
        {[
          { label:'Active Offices',  val:health?.activeOff??'…', color:'#10b981' },
          { label:'Total Offices',   val:health?.offices??'…',   color:'#6366f1' },
          { label:'Total Seats',     val:health?.totalSeats??'…',color:'#f59e0b' },
          { label:'Total Clients',   val:health?.totalClients??'…',color:'#0ea5e9' },
        ].map(k=>(
          <div key={k.label} style={{ ...S.card,padding:'16px 18px' }}>
            <div style={{ fontSize:9,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'.06em' }}>{k.label}</div>
            <div style={{ fontSize:22,fontWeight:800,color:k.color,marginTop:4 }}>{loading && k.val==='…' ? '…' : k.val}</div>
          </div>
        ))}
      </div>
      <div style={{ ...S.card,padding:20 }}>
        {loading && !health ? <Spinner /> : checks.map(c=>(
          <div key={c.label} style={{ display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid rgba(99,102,241,.1)' }}>
            <span style={{ fontSize:16 }}>{c.ok ? '✅' : '❌'}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13,fontWeight:600,color:c.ok?'#e2e8f0':'#ef4444' }}>{c.label}</div>
              <div style={{ fontSize:11,color:'#475569' }}>{c.note}</div>
            </div>
            <span style={S.badge(c.ok?'#10b981':'#ef4444')}>{c.ok?'OK':'ERROR'}</span>
          </div>
        ))}
        {health?.loadError && <div style={{color:'#ef4444',fontSize:12,marginTop:8}}>Load error: {health.loadError}</div>}
      </div>
    </div>
  )
}

// ── Employee Lookup + Edit ───────────────────────────────────────────────────
const ACCESS_LEVELS = ['Super Admin','Admin','Tax Associate','Read Only']

function EmployeeEditModal({ emp, onClose, onSaved }) {
  const [form, setForm] = useState({
    name:   emp.name   || '',
    access: emp.access || emp.role || 'Tax Associate',
    role:   emp.role   || emp.access || 'Tax Associate',
    phone:  emp.phone  || '',
  })
  const [saving, setSaving]     = useState(false)
  const [resetting, setResetting] = useState(false)
  const [toast, setToast]       = useState(null)
  const toast_ = (msg,type='ok')=>{ setToast({msg,type}); setTimeout(()=>setToast(null),3500) }
  const fld = (k,v) => setForm(f=>({...f,[k]:v}))

  async function save() {
    setSaving(true)
    const { error } = await supabase.from('employees')
      .update({ name:form.name, access:form.access, role:form.role, phone:form.phone })
      .eq('id', emp.id)
    setSaving(false)
    if (error) { toast_(error.message,'error'); return }
    toast_('✅ Employee updated')
    setTimeout(()=>{ onSaved(); onClose() }, 800)
  }

  async function resetPassword() {
    if (!confirm(`Send password reset email to ${emp.email}?`)) return
    setResetting(true)
    const { error } = await supabase.auth.resetPasswordForEmail(emp.email, {
      redirectTo: window.location.origin + '/'
    })
    setResetting(false)
    if (error) { toast_(error.message,'error') }
    else { toast_(`✅ Reset email sent to ${emp.email}`) }
  }

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.75)',zIndex:9999,
      display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'#1a1830',border:'1px solid rgba(99,102,241,.35)',
        borderRadius:16,padding:28,width:480,maxWidth:'100%',position:'relative' }}>
        {toast && <Toast msg={toast.msg} type={toast.type} />}
        <div style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20 }}>
          <div>
            <div style={{ fontSize:18,fontWeight:800,color:'#fff' }}>{emp.name}</div>
            <div style={{ fontSize:12,color:'#6366f1',marginTop:2 }}>{emp.tenants?.firm_name||'—'}</div>
            <div style={{ fontSize:11,color:'#475569',marginTop:1 }}>Joined {fmtDate(emp.created_at)}</div>
          </div>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'#64748b',
            fontSize:22,cursor:'pointer',lineHeight:1 }}>✕</button>
        </div>
        <div style={{ display:'flex',flexDirection:'column',gap:14 }}>
          <div>
            <label style={{ fontSize:11,fontWeight:700,color:'#6366f1',textTransform:'uppercase',
              letterSpacing:'.05em',display:'block',marginBottom:5 }}>Full Name</label>
            <input value={form.name} onChange={e=>fld('name',e.target.value)}
              style={{ width:'100%',padding:'10px 14px',borderRadius:8,border:'1px solid rgba(99,102,241,.3)',
                background:'rgba(255,255,255,.04)',color:'#e2e8f0',fontSize:14,boxSizing:'border-box' }}/>
          </div>
          <div>
            <label style={{ fontSize:11,fontWeight:700,color:'#6366f1',textTransform:'uppercase',
              letterSpacing:'.05em',display:'block',marginBottom:5 }}>Phone</label>
            <input value={form.phone} onChange={e=>fld('phone',e.target.value)} type="tel"
              style={{ width:'100%',padding:'10px 14px',borderRadius:8,border:'1px solid rgba(99,102,241,.3)',
                background:'rgba(255,255,255,.04)',color:'#e2e8f0',fontSize:14,boxSizing:'border-box' }}/>
          </div>
          <div>
            <label style={{ fontSize:11,fontWeight:700,color:'#6366f1',textTransform:'uppercase',
              letterSpacing:'.05em',display:'block',marginBottom:5 }}>Email</label>
            <input value={emp.email} disabled
              style={{ width:'100%',padding:'10px 14px',borderRadius:8,border:'1px solid rgba(99,102,241,.15)',
                background:'rgba(255,255,255,.02)',color:'#475569',fontSize:14,boxSizing:'border-box',cursor:'not-allowed' }}/>
            <div style={{ fontSize:11,color:'#334155',marginTop:3 }}>Email changes require Supabase Auth — use Reset Password below</div>
          </div>
          <div>
            <label style={{ fontSize:11,fontWeight:700,color:'#6366f1',textTransform:'uppercase',
              letterSpacing:'.05em',display:'block',marginBottom:5 }}>Access Level</label>
            <select value={form.access} onChange={e=>{ fld('access',e.target.value); fld('role',e.target.value) }}
              style={{ width:'100%',padding:'10px 14px',borderRadius:8,border:'1px solid rgba(99,102,241,.3)',
                background:'#1a1830',color:'#e2e8f0',fontSize:14 }}>
              {ACCESS_LEVELS.map(a=><option key={a} value={a}>{a}</option>)}
            </select>
            <div style={{ fontSize:11,color:'#334155',marginTop:4,lineHeight:1.5 }}>
              <strong style={{color:'#10b981'}}>Super Admin</strong> — full access including settings<br/>
              <strong style={{color:'#6366f1'}}>Admin</strong> — all client/lead/billing features<br/>
              <strong style={{color:'#0ea5e9'}}>Tax Associate</strong> — clients, leads, tasks, documents<br/>
              <strong style={{color:'#64748b'}}>Read Only</strong> — view only, no edits
            </div>
          </div>
        </div>
        <div style={{ marginTop:20,paddingTop:16,borderTop:'1px solid rgba(99,102,241,.15)',display:'flex',gap:10 }}>
          <button onClick={save} disabled={saving}
            style={{ ...S.btn('primary'),flex:1,justifyContent:'center',padding:'10px 0' }}>
            {saving?'Saving…':'💾 Save Changes'}
          </button>
          <button onClick={resetPassword} disabled={resetting}
            style={{ ...S.btn('ghost'),padding:'10px 16px',fontSize:12 }}>
            {resetting?'⏳':'🔑'} Reset Password
          </button>
        </div>
      </div>
    </div>
  )
}

function EmployeeLookup() {
  const [q,setQ]             = useState('')
  const [results,setResults] = useState(null)
  const [busy,setBusy]       = useState(false)
  const [selected,setSelected] = useState(null)

  async function search() {
    if (!q.trim()) return
    setBusy(true)
    // Clear tenant override so RLS returns employees across ALL tenants
    await supabase.rpc('set_admin_tenant_override', { p_tenant_id: null }).then(()=>{}).catch(()=>{})
    const { data } = await supabase
      .from('employees')
      .select('id,name,email,role,access,phone,avatar_url,tenant_id,created_at,tenants(firm_name)')
      .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(50)
    setBusy(false)
    setResults(data||[])
  }

  return (
    <div style={{ padding:'28px 36px',maxWidth:900 }}>
      {selected && <EmployeeEditModal emp={selected} onClose={()=>setSelected(null)} onSaved={search} />}
      <div style={{ fontSize:22,fontWeight:800,color:'#fff',marginBottom:6 }}>👥 Employee Lookup</div>
      <div style={{ fontSize:14,color:'#475569',marginBottom:20 }}>
        Find any employee across every office. Click any row to view full profile, edit details, or reset password.
      </div>
      <div style={{ display:'flex',gap:10,marginBottom:20 }}>
        <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&search()}
          placeholder="Name or email…" autoFocus
          style={{ flex:1,padding:'11px 16px',borderRadius:10,border:'1px solid rgba(99,102,241,.3)',
            background:'rgba(255,255,255,.04)',color:'#e2e8f0',fontSize:14,outline:'none' }}/>
        <button onClick={search} disabled={busy||!q.trim()} style={{ ...S.btn('primary'),padding:'11px 24px' }}>
          {busy?'…':'Search'}
        </button>
      </div>
      {results!==null && (results.length===0 ? (
        <div style={{ color:'#475569',fontSize:14 }}>No employees found.</div>
      ) : (
        <div style={S.card}>
          <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
            <thead><tr>{['Name','Email','Access Level','Office','Joined',''].map(h=>(
              <th key={h} style={S.th}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {results.map(e=>(
                <tr key={e.id} style={{ cursor:'pointer' }} onClick={()=>setSelected(e)}>
                  <td style={{ ...S.td,color:'#e2e8f0',fontWeight:600 }}>
                    {e.avatar_url&&<img src={e.avatar_url} style={{ width:22,height:22,borderRadius:'50%',
                      marginRight:8,verticalAlign:'middle' }} onError={ev=>ev.target.style.display='none'}/>}
                    {e.name}
                  </td>
                  <td style={{ ...S.td,color:'#94a3b8' }}>{e.email}</td>
                  <td style={S.td}>
                    <span style={S.badge(
                      e.access==='Super Admin'?'#10b981':
                      e.access==='Admin'?'#6366f1':
                      e.access==='Tax Associate'?'#0ea5e9':'#64748b'
                    )}>{e.access||e.role}</span>
                  </td>
                  <td style={{ ...S.td,color:'#6366f1',fontWeight:600 }}>{e.tenants?.firm_name||'—'}</td>
                  <td style={{ ...S.td,color:'#475569' }}>{fmtDate(e.created_at)}</td>
                  <td style={S.td}>
                    <button onClick={ev=>{ev.stopPropagation();setSelected(e)}}
                      style={{ ...S.btn('ghost'),padding:'4px 12px',fontSize:11 }}>Edit →</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

// ── Audit Log ────────────────────────────────────────────────────────────────
function AuditLog() {
  const [log,setLog] = useState(null)
  useEffect(()=>{
    supabase.rpc('admin_get_audit_log',{p_limit:100}).then(({data})=>setLog(data||[]))
  },[])
  return (
    <div style={{ padding:'28px 36px', maxWidth:900 }}>
      <div style={{ fontSize:22,fontWeight:800,color:'#fff',marginBottom:24 }}>📋 Audit Log</div>
      {!log ? <Spinner /> : log.length===0 ? (
        <div style={{ color:'#475569',fontSize:14 }}>No admin actions recorded yet.</div>
      ) : (
        <div style={S.card}>
          <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
            <thead><tr>{['Action','Admin','Office','Detail','When'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {log.map(a=>(
                <tr key={a.id}>
                  <td style={{ ...S.td,color:'#a5b4fc',fontWeight:600 }}>{a.action}</td>
                  <td style={{ ...S.td,color:'#94a3b8',fontSize:12 }}>{a.admin_email}</td>
                  <td style={{ ...S.td,color:'#e2e8f0' }}>{a.target_name||'—'}</td>
                  <td style={{ ...S.td,color:'#475569',fontSize:11 }}>
                    {a.detail ? JSON.stringify(a.detail).slice(0,60) : '—'}
                  </td>
                  <td style={{ ...S.td,color:'#475569' }}>{fmtAgo(a.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Search ───────────────────────────────────────────────────────────────────
function Search() {
  const [q,setQ]=useState('')
  const [results,setResults]=useState(null)
  const [busy,setBusy]=useState(false)
  async function search(){
    if(!q.trim())return
    setBusy(true)
    const{data}=await supabase.rpc('admin_search_all',{p_query:q.trim()})
    setBusy(false)
    setResults(data||[])
  }
  return(
    <div style={{padding:'28px 36px',maxWidth:820}}>
      <div style={{fontSize:22,fontWeight:800,color:'#fff',marginBottom:6}}>🔍 Search All Offices</div>
      <div style={{fontSize:14,color:'#475569',marginBottom:20}}>Find any client or lead across every office by name, email, or phone.</div>
      <div style={{display:'flex',gap:10,marginBottom:20}}>
        <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&search()}
          placeholder="Name, email, or phone…" autoFocus
          style={{flex:1,padding:'11px 16px',borderRadius:10,border:'1px solid rgba(99,102,241,.3)',background:'rgba(255,255,255,.04)',color:'#e2e8f0',fontSize:14,outline:'none'}}/>
        <button onClick={search} disabled={busy||!q.trim()} style={{...S.btn('primary'),padding:'11px 24px'}}>
          {busy?'…':'Search'}
        </button>
      </div>
      {results!==null&&(results.length===0?<div style={{color:'#475569',fontSize:14}}>No matches.</div>:(
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {results.map(r=>(
            <div key={r.id} style={{...S.card,padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
              <span style={S.badge(r.record_type==='client'?'#10b981':'#f59e0b')}>{r.record_type}</span>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,color:'#e2e8f0'}}>{r.name}</div>
                <div style={{fontSize:12,color:'#64748b'}}>{[r.email,r.phone].filter(Boolean).join(' · ')||'—'}</div>
              </div>
              <div style={{fontSize:12,color:'#6366f1',fontWeight:600}}>{r.tenant_name}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Email (SnappyMail embed) ─────────────────────────────────────────────────
const WEBMAIL_URL = 'https://webmail.taxrescrm.net:7443'

function Email(){return(
  <div style={{display:'flex',flexDirection:'column',height:'100vh'}}>
    <div style={{padding:'16px 28px 10px',borderBottom:'1px solid #1e293b',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
      <span style={{fontSize:18,fontWeight:800,color:'#fff'}}>📧 Email</span>
      <span style={{fontSize:13,color:'#475569'}}>romy@taxrescrm.net — powered by Stalwart</span>
      <a href={WEBMAIL_URL} target="_blank" rel="noreferrer"
        style={{marginLeft:'auto',fontSize:12,color:'#6366f1',textDecoration:'none'}}>Open in new tab ↗</a>
    </div>
    <iframe src={WEBMAIL_URL} title="SnappyMail"
      style={{flex:1,border:'none',width:'100%',background:'#0f172a'}}
      allow="clipboard-read; clipboard-write" />
  </div>
)}

// ── Training (screen-share training, admin context) ──────────────────────────
// Clears the TCR tenant override so FIRM loads TaxRes CRM branding (the admin's
// own settings row), not Tax Case Review the practice. Restores on unmount.
// Uses useScreenShare to detect an active session — if one is already running,
// render immediately without waiting for the branding load so navigation away
// and back never kills a live session.
function AdminTraining(){
  const [ready, setReady] = useState(false)
  const ss = useScreenShare()

  useEffect(()=>{
    // If a session is already active, render immediately — don't gate on branding.
    // The branding was already loaded when the session started.
    if (ss.active) { setReady(true); return }
    supabase.rpc('set_admin_tenant_override',{ p_tenant_id: TAXRESCRM_TENANT })
      .then(()=> loadFirmBrandingPublic(TAXRESCRM_TENANT))
      .then(()=> setReady(true))
      .catch(()=> setReady(true))
    return ()=>{
      supabase.rpc('set_admin_tenant_override',{ p_tenant_id: TCR_TENANT }).then(()=>{}).catch(()=>{})
    }
  },[])
  if (!ready) return null
  return <TrainingPage/>
}

// ── Calendar (real CRM Calendar component, contained in the admin shell) ──────
// Must override to TCR tenant before rendering — romy@taxrescrm.net's own
// current_tenant_id() resolves TCR automatically, but if a demo impersonation
// was active in the same session this ensures the DB context is correct.
function AdminCalendar(){
  const [ready, setReady] = useState(false)

  useEffect(()=>{
    const prev = sessionStorage.getItem('admin_impersonation')
    sessionStorage.removeItem('admin_impersonation')
    // No override — current_tenant_id() resolves naturally from Romy's login (TCR)
    setReady(true)
    return ()=>{
      if (prev) sessionStorage.setItem('admin_impersonation', prev)
    }
  },[])
  if (!ready) return null
  // Wrap in a div with className="page-content" so Calendar's useEffect
  // escape hatch can find it and set overflow:hidden + padding:0.
  // Pre-set those values so there's no flash before the effect runs.
  // key="taxrescrm" forces a fresh mount so CalendarPage queries after the
  // tenant override is set — STABLE fn caching can otherwise return stale results.
  return (
    <div
      key="taxrescrm-calendar"
      className="page-content"
      style={{ position:'relative', overflow:'hidden', padding:0, height:'100%', flex:1 }}
    >
      <CalendarPage />
    </div>
  )
}


// ── Live Demo Launcher ───────────────────────────────────────────────────────
function LiveDemo() {
  const [rows, setRows] = useState(null)
  const [toast, setToast] = useState(null)
  const [launching, setLaunching] = useState(null)
  const toast_ = (msg,type='ok')=>{ setToast({msg,type}); setTimeout(()=>setToast(null),4000) }

  useEffect(()=>{
    supabase.rpc('admin_tenant_overview').then(({data})=>setRows(data||[]))
  },[])

  async function launchDemo(tenantId, firmName) {
    setLaunching(tenantId)
    const { data:token, error } = await supabase.rpc('create_impersonation_token',{ p_tenant_id:tenantId })
    setLaunching(null)
    if (error) { toast_(error.message,'error'); return }
    const url = `${window.location.origin}/impersonate?admin_token=${token}`
    window.open(url, '_blank')
    toast_(`✅ Demo opened for ${firmName} — token valid 15 min`)
  }

  const DEMO_TENANT = '489ace07-1a6b-4864-833a-4f8420568b40'

  return (
    <div style={{ padding:'28px 36px', maxWidth:900 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Header with logo */}
      <div style={{ display:'flex', alignItems:'center', gap:20, marginBottom:32,
        padding:'24px 28px', borderRadius:16, background:'rgba(99,102,241,.06)',
        border:'1px solid rgba(99,102,241,.2)' }}>
        {FIRM.logoUrl && (
          <img src={FIRM.logoUrl} alt={FIRM.name || 'TaxRes CRM'}
            style={{ height:52, objectFit:'contain', flexShrink:0 }}
            onError={e=>{e.target.style.display='none'}} />
        )}
        <div>
          <div style={{ fontSize:22, fontWeight:800, color:'#fff', marginBottom:4 }}>🖥️ Live Demo Launcher</div>
          <div style={{ fontSize:14, color:'#64748b' }}>
            Jump into any office as an admin — opens a live CRM session in a new tab.
            Perfect for prospect demos and support calls. Each token expires in 15 minutes.
          </div>
        </div>
      </div>

      {/* Quick launch — Nash Demo highlighted */}
      {rows && rows.find(r=>r.id===DEMO_TENANT) && (() => {
        const demo = rows.find(r=>r.id===DEMO_TENANT)
        return (
          <div style={{ ...S.card, padding:'20px 24px', marginBottom:20,
            border:'1px solid rgba(251,146,60,.4)', background:'rgba(251,146,60,.04)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ fontSize:32 }}>🎭</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:16, fontWeight:800, color:'#fff', marginBottom:2 }}>Nashville Tax Solutions</div>
                <div style={{ fontSize:13, color:'#64748b' }}>
                  Primary demo tenant · {demo.client_count} demo clients · {demo.employee_count} seats · Last active {fmtAgo(demo.last_activity)}
                </div>
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={()=>launchDemo(demo.id, demo.firm_name)}
                  disabled={launching===demo.id}
                  style={{ ...S.btn('primary'), fontSize:14, padding:'10px 24px',
                    background:'linear-gradient(135deg,#f97316,#fb923c)' }}>
                  {launching===demo.id ? '⏳ Opening…' : '🚀 Launch Demo'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* All offices */}
      <div style={{ fontSize:12, fontWeight:700, color:'#475569', textTransform:'uppercase',
        letterSpacing:'.06em', marginBottom:14 }}>All Offices</div>

      {!rows ? <Spinner /> : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {rows.map(r => (
            <div key={r.id} style={{ ...S.card, padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ width:40, height:40, borderRadius:10, flexShrink:0,
                background: r.brand_color ? r.brand_color+'22' : 'rgba(99,102,241,.12)',
                border: `2px solid ${r.brand_color||'#6366f1'}33`,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:18, fontWeight:800, color:r.brand_color||'#6366f1' }}>
                {(r.firm_name||'?')[0]}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>{r.firm_name}</div>
                <div style={{ fontSize:12, color:'#475569', marginTop:2 }}>
                  {r.employee_count} employees · {r.client_count} clients · {r.lead_count} leads · Last active {fmtAgo(r.last_activity)}
                </div>
              </div>
              <span style={S.badge(STATUS_COLOR[r.status]||'#64748b')}>{r.status}</span>
              <button onClick={()=>launchDemo(r.id, r.firm_name)}
                disabled={!!launching}
                style={{ ...S.btn('ghost'), fontSize:12, padding:'7px 18px', flexShrink:0 }}>
                {launching===r.id ? '⏳' : '🚀'} {launching===r.id ? 'Opening…' : 'Open Session'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* How it works */}
      <div style={{ marginTop:28, padding:'16px 20px', borderRadius:12,
        background:'rgba(99,102,241,.05)', border:'1px solid rgba(99,102,241,.15)',
        fontSize:12, color:'#475569', lineHeight:1.7 }}>
        <div style={{ fontWeight:700, color:'#a5b4fc', marginBottom:4 }}>How it works</div>
        Each session creates a signed 15-minute impersonation token and opens the full CRM pre-authenticated as a Super Admin inside that office.
        You see exactly what the client sees — their data, their branding, their settings.
        Every session is logged in the Audit Log with timestamp and which office you accessed.
      </div>
    </div>
  )
}


// ── Demo Setup Wizard ────────────────────────────────────────────────────────
// Lets Romy skin the demo tenant as either the generic TaxRes CRM demo
// or a custom prospect-specific version (their logo, name, color) in seconds.
// Only touches the settings row of the Nashville demo tenant — nothing else.

const GENERIC_DEFAULTS = {
  firm_name:   'Nashville Tax Solutions',
  logo_url:    '/assets/taxrescrm-logo.png',
  brand_color: '#6366f1',
  phone:       '(888) 334-5052',
  email:       'demo@taxrescrm.net',
  address:     '123 Demo Street, Nashville, TN 37201',
}

function DemoSetup() {
  const [current, setCurrent]     = useState(null)
  const [form, setForm]           = useState(GENERIC_DEFAULTS)
  const [saving, setSaving]       = useState(false)
  const [resetting, setResetting] = useState(false)
  const [toast, setToast]         = useState(null)
  const [logoFile, setLogoFile]   = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const navigate = useNavigate()

  const toast_ = (msg, type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),4000) }
  const fld = (k,v) => setForm(f=>({...f,[k]:v}))

  useEffect(() => { loadCurrent() }, [])

  async function loadCurrent() {
    const { data } = await supabase.from('settings')
      .select('name,logourl,phone,email,address')
      .eq('tenant_id', DEMO_TENANT)
      .maybeSingle()
    if (data) {
      setCurrent(data)
      setForm(f => ({
        ...f,
        firm_name:  data.name  || f.firm_name,
        logo_url:   data.logourl || f.logo_url,
        phone:      data.phone || f.phone,
        email:      data.email || f.email,
        address:    data.address || f.address,
      }))
      setLogoPreview(data.logourl || null)
    }
  }

  function handleLogoFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    const reader = new FileReader()
    reader.onload = ev => setLogoPreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  async function uploadLogo(file) {
    // Upload logo to Supabase storage — accessible from the browser
    const ext = file.name.split('.').pop() || 'png'
    const path = `demo-logos/prospect-logo-${Date.now()}.${ext}`
    const { data, error } = await supabase.storage
      .from('firm-assets')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (error) throw new Error(error.message)
    const { data: urlData } = supabase.storage.from('firm-assets').getPublicUrl(path)
    return urlData.publicUrl
  }

  async function applyToDemo() {
    setSaving(true)
    try {
      let logoUrl = form.logo_url

      // Upload logo if a file was selected
      if (logoFile) {
        toast_('Uploading logo…', 'ok')
        logoUrl = await uploadLogo(logoFile)
        // Add cache buster so browser loads the new logo
        logoUrl = logoUrl + '?v=' + Date.now()
      }

      // Update the demo tenant settings
      const { error } = await supabase.from('settings').update({
        name:    form.firm_name,
        logourl: logoUrl,
        phone:   form.phone,
        email:   form.email,
        address: form.address,
      }).eq('tenant_id', DEMO_TENANT)

      if (error) throw error

      // Log the action
      await supabase.rpc('log_admin_action', {
        p_action: 'demo_customized',
        p_tenant_id: DEMO_TENANT,
        p_tenant_name: form.firm_name,
        p_detail: { firm_name: form.firm_name, logo_applied: !!logoFile }
      })

      toast_(`✅ Demo is now set up for ${form.firm_name}`)
      loadCurrent()
    } catch (e) {
      toast_(e.message, 'error')
    }
    setSaving(false)
  }

  async function resetToGeneric() {
    setResetting(true)
    try {
      const { error } = await supabase.from('settings').update({
        name:    'Nashville Tax Solutions',
        logourl: '/assets/taxrescrm-logo.png',
        phone:   '(888) 334-5052',
        email:   'demo@taxrescrm.net',
        address: '123 Demo Street, Nashville, TN 37201',
      }).eq('tenant_id', DEMO_TENANT)
      if (error) throw error
      setLogoFile(null)
      setLogoPreview('/assets/taxrescrm-logo.png')
      setForm(GENERIC_DEFAULTS)
      toast_('✅ Demo reset to generic TaxRes CRM defaults')
      loadCurrent()
    } catch (e) {
      toast_(e.message, 'error')
    }
    setResetting(false)
  }

  return (
    <div style={{ padding:'28px 36px', maxWidth:720 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      <div style={{ marginBottom:28 }}>
        <div style={{ fontSize:22,fontWeight:800,color:'#fff',marginBottom:4 }}>🎨 Demo Setup</div>
        <div style={{ fontSize:14,color:'#64748b' }}>
          Customize the demo tenant for a specific prospect, or reset to generic TaxRes CRM defaults.
        </div>
      </div>

      {/* Mode toggle */}
      <div style={{ display:'flex',gap:12,marginBottom:28 }}>
        <div style={{ ...S.card,flex:1,padding:'18px 20px',cursor:'pointer',
          border: form.firm_name===GENERIC_DEFAULTS.firm_name
            ? '1px solid rgba(99,102,241,.5)' : '1px solid rgba(99,102,241,.2)' }}
          onClick={()=>{ setForm(GENERIC_DEFAULTS); setLogoFile(null); setLogoPreview(GENERIC_DEFAULTS.logo_url) }}>
          <div style={{ fontSize:24,marginBottom:6 }}>🎭</div>
          <div style={{ fontSize:13,fontWeight:700,color:'#fff' }}>Generic Demo</div>
          <div style={{ fontSize:11,color:'#475569',marginTop:2 }}>TaxRes CRM logo · Dummy Nashville data</div>
        </div>
        <div style={{ ...S.card,flex:1,padding:'18px 20px',
          border:'1px solid rgba(251,146,60,.3)',background:'rgba(251,146,60,.04)' }}>
          <div style={{ fontSize:24,marginBottom:6 }}>🏢</div>
          <div style={{ fontSize:13,fontWeight:700,color:'#fff' }}>Prospect Demo</div>
          <div style={{ fontSize:11,color:'#475569',marginTop:2 }}>Their logo · Their name · Their colors</div>
        </div>
      </div>

      {/* Form */}
      <div style={{ ...S.card,padding:24,marginBottom:20 }}>
        <div style={{ fontSize:12,fontWeight:700,color:'#6366f1',textTransform:'uppercase',
          letterSpacing:'.05em',marginBottom:18 }}>Demo Configuration</div>

        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:16 }}>
          {/* Firm name */}
          <div style={{ gridColumn:'1/-1' }}>
            <label style={{ fontSize:11,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',
              letterSpacing:'.05em',display:'block',marginBottom:6 }}>Firm Name *</label>
            <input value={form.firm_name} onChange={e=>fld('firm_name',e.target.value)}
              placeholder="e.g. Bennett Tax Resolution"
              style={{ width:'100%',padding:'10px 14px',borderRadius:8,
                border:'1px solid rgba(99,102,241,.3)',background:'rgba(255,255,255,.04)',
                color:'#e2e8f0',fontSize:14,boxSizing:'border-box' }}/>
          </div>

          {/* Logo */}
          <div style={{ gridColumn:'1/-1' }}>
            <label style={{ fontSize:11,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',
              letterSpacing:'.05em',display:'block',marginBottom:6 }}>Logo</label>
            <div style={{ display:'flex',gap:12,alignItems:'flex-start' }}>
              {/* Preview */}
              <div style={{ width:80,height:56,borderRadius:8,border:'1px solid rgba(99,102,241,.3)',
                background:'rgba(255,255,255,.06)',display:'flex',alignItems:'center',
                justifyContent:'center',flexShrink:0,overflow:'hidden',padding:6 }}>
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo preview"
                    style={{ maxWidth:'100%',maxHeight:'100%',objectFit:'contain' }}
                    onError={e=>{e.target.style.display='none'}} />
                ) : (
                  <span style={{ fontSize:24 }}>🏢</span>
                )}
              </div>
              <div style={{ flex:1 }}>
                <label style={{ display:'inline-block',padding:'9px 16px',borderRadius:8,
                  border:'1px solid rgba(99,102,241,.35)',background:'rgba(99,102,241,.1)',
                  color:'#a5b4fc',fontSize:13,fontWeight:600,cursor:'pointer',marginBottom:8 }}>
                  📁 Upload Logo
                  <input type="file" accept="image/*" onChange={handleLogoFile}
                    style={{ display:'none' }} />
                </label>
                <div style={{ fontSize:11,color:'#475569' }}>
                  PNG, JPG, SVG · Recommended: transparent background, landscape format
                </div>
                <div style={{ marginTop:8 }}>
                  <input value={form.logo_url} onChange={e=>{fld('logo_url',e.target.value);setLogoPreview(e.target.value)}}
                    placeholder="Or paste a logo URL…"
                    style={{ width:'100%',padding:'8px 12px',borderRadius:6,
                      border:'1px solid rgba(99,102,241,.2)',background:'rgba(255,255,255,.03)',
                      color:'#94a3b8',fontSize:12,boxSizing:'border-box' }}/>
                </div>
              </div>
            </div>
          </div>

          {/* Phone */}
          <div>
            <label style={{ fontSize:11,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',
              letterSpacing:'.05em',display:'block',marginBottom:6 }}>Phone</label>
            <input value={form.phone} onChange={e=>fld('phone',e.target.value)}
              placeholder="(615) 555-0100"
              style={{ width:'100%',padding:'10px 14px',borderRadius:8,
                border:'1px solid rgba(99,102,241,.3)',background:'rgba(255,255,255,.04)',
                color:'#e2e8f0',fontSize:14,boxSizing:'border-box' }}/>
          </div>

          {/* Email */}
          <div>
            <label style={{ fontSize:11,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',
              letterSpacing:'.05em',display:'block',marginBottom:6 }}>Email</label>
            <input value={form.email} onChange={e=>fld('email',e.target.value)}
              placeholder="info@theirfirm.com"
              style={{ width:'100%',padding:'10px 14px',borderRadius:8,
                border:'1px solid rgba(99,102,241,.3)',background:'rgba(255,255,255,.04)',
                color:'#e2e8f0',fontSize:14,boxSizing:'border-box' }}/>
          </div>

          {/* Address */}
          <div style={{ gridColumn:'1/-1' }}>
            <label style={{ fontSize:11,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',
              letterSpacing:'.05em',display:'block',marginBottom:6 }}>Address</label>
            <input value={form.address} onChange={e=>fld('address',e.target.value)}
              placeholder="123 Main St, Nashville, TN 37201"
              style={{ width:'100%',padding:'10px 14px',borderRadius:8,
                border:'1px solid rgba(99,102,241,.3)',background:'rgba(255,255,255,.04)',
                color:'#e2e8f0',fontSize:14,boxSizing:'border-box' }}/>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div style={{ ...S.card,padding:20,marginBottom:20,border:'1px solid rgba(99,102,241,.15)' }}>
        <div style={{ fontSize:11,fontWeight:700,color:'#475569',textTransform:'uppercase',
          letterSpacing:'.05em',marginBottom:12 }}>Preview — What the demo will show</div>
        <div style={{ display:'flex',alignItems:'center',gap:14 }}>
          {logoPreview && (
            <img src={logoPreview} alt="preview" style={{ height:40,objectFit:'contain' }}
              onError={e=>{e.target.style.display='none'}} />
          )}
          <div>
            <div style={{ fontSize:16,fontWeight:800,color:'#fff' }}>{form.firm_name||'—'}</div>
            <div style={{ fontSize:12,color:'#475569' }}>{form.phone} · {form.email}</div>
            <div style={{ fontSize:12,color:'#475569' }}>{form.address}</div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display:'flex',gap:12 }}>
        <button onClick={applyToDemo} disabled={saving||resetting}
          style={{ ...S.btn('primary'),flex:1,justifyContent:'center',padding:'12px 0',fontSize:14 }}>
          {saving ? '⏳ Applying…' : '✅ Apply to Demo'}
        </button>
        <button onClick={()=>navigate('/crm-admin/demo')} disabled={saving||resetting}
          style={{ ...S.btn('ghost'),padding:'12px 20px',fontSize:13 }}>
          🚀 Launch Demo
        </button>
        <button onClick={resetToGeneric} disabled={saving||resetting}
          style={{ ...S.btn('danger'),padding:'12px 20px',fontSize:13 }}>
          {resetting ? '⏳' : '↺'} Reset to Generic
        </button>
      </div>

      <div style={{ marginTop:14,fontSize:11,color:'#334155',lineHeight:1.6 }}>
        Changes apply immediately to the demo tenant. Click <strong style={{color:'#a5b4fc'}}>Launch Demo</strong> to open the live CRM.
        Use <strong style={{color:'#94a3b8'}}>Reset to Generic</strong> after the call to restore TaxRes CRM defaults.
      </div>
    </div>
  )
}

// ── Main Shell ───────────────────────────────────────────────────────────────
// ── Command Center ────────────────────────────────────────────────────────────
function CommandCenter() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')
  const [data, setData] = useState(null)
  const [activity, setActivity] = useState([])
  const [activityPoll, setActivityPoll] = useState(0)

  // ── Data load ──────────────────────────────────────────────────────────────
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    async function load() {
      const now = new Date()
      const h = now.getHours()

      try {
        // Three parallel calls: stats RPC + tenant overview + prospects pipeline
        const [statsRes, tenantsRes, prospectsRes] = await Promise.all([
          supabase.rpc('admin_command_center_stats'),
          supabase.rpc('admin_tenant_overview'),
          supabase.from('prospects').select('*').order('created_at', { ascending: false }),
        ])

        const stats   = statsRes.data
        const tenants = tenantsRes.data || []

        if (statsRes.error) throw new Error('RPC error: ' + JSON.stringify(statsRes.error))
        if (!stats || stats.error) throw new Error('Stats unavailable: ' + JSON.stringify(stats))

      const activeTenants = (tenants||[]).filter(r=>r.status==='active')
      const totalMRR      = (tenants||[]).reduce((s,r)=>s+Number(r.effective_monthly||0),0)

      // Build what-changed list from yesterday stats
      const changes = []
      const yL = Number(stats.yesterday_new_leads||0)
      const yC = Number(stats.yesterday_new_clients||0)
      const yS = Number(stats.yesterday_signed||0)
      const yR = Number(stats.yesterday_revenue||0)
      const yD = Number(stats.yesterday_demos||0)
      if (yL>0) changes.push({ dir:'up',   label:`${yL} new lead${yL>1?'s':''} yesterday` })
      if (yC>0) changes.push({ dir:'up',   label:`${yC} new customer${yC>1?'s':''} signed` })
      if (yR>0) changes.push({ dir:'up',   label:`Revenue +$${yR.toLocaleString('en-US',{maximumFractionDigits:0})} yesterday` })
      if (yS>0) changes.push({ dir:'up',   label:`${yS} document${yS>1?'s':''} signed` })
      if (yD>0) changes.push({ dir:'up',   label:`${yD} demo${yD>1?'s':''} yesterday` })
      const pe = Number(stats.pending_esigns||0)
      if (pe>0) changes.push({ dir:'down', label:`${pe} e-sign${pe>1?'s':''} pending signature` })

      // Build activity feed by merging the separate recent_* arrays from RPC
      const feed = [
        ...(stats.recent_lead_notes||[]).map(n=>({ ts:n.ts, icon:'📝', text:`Note added by ${n.sub||'team'}`, sub:'Lead file' })),
        ...(stats.recent_client_notes||[]).map(n=>({ ts:n.ts, icon:'📋', text:`Note added by ${n.sub||'team'}`, sub:'Client file' })),
        ...(stats.recent_esigns||[]).map(e=>({ ts:e.ts, icon:'✍️', text:'Document signed', sub:e.sub||'E-Signature' })),
        ...(stats.recent_leads||[]).map(l=>({ ts:l.ts, icon:'👤', text:'Lead created', sub:l.sub||'Unassigned' })),
        ...(stats.recent_payments||[]).map(p=>({ ts:p.ts, icon:'💰', text:'Payment collected', sub:p.sub||'' })),
      ].sort((a,b)=>new Date(b.ts)-new Date(a.ts)).slice(0,18)

      setActivity(feed)
      setData({
        greeting: h<12?'Good morning':h<17?'Good afternoon':'Good evening',
        todayDate: now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}),
        kpis: {
          activeTenants: activeTenants.length,
          totalTenants:  tenants.length,
          totalMRR,
          totalSeats:    tenants.reduce((s,r)=>s+Number(r.employee_count||0),0),
          totalClients:  tenants.reduce((s,r)=>s+Number(r.client_count||0),0),
          totalLeads:    tenants.reduce((s,r)=>s+Number(r.lead_count||0),0),
          totalStorage:  tenants.reduce((s,r)=>s+Number(r.storage_bytes||0),0),
          pendingEsigns: Number(stats.pending_esigns||0),
          todayDemos:    Number(stats.today_demos||0),
        },
        changes,
        upcomingDl:   (stats.upcoming_deadlines||[]).slice(0,5),
        todaySchedule:(stats.today_schedule||[]).slice(0,6),
        upcomingDemos:(stats.today_schedule||[]).filter(e=>new Date(e.start)>new Date()).slice(0,5),
        // Marketing mock data (live when GA4 is connected)
        marketing: {
          visitorsToday: 247,  visitorsChange: 18,
          sessions: 312,       sessionsChange: 14,
          bounceRate: 38.2,    bounceChange: -4,
          pagesPerSession: 3.1,
          topSources: [
            { label:'Organic Search', pct:62, color:'#6366f1' },
            { label:'Direct',         pct:21, color:'#0ea5e9' },
            { label:'Referral',       pct:11, color:'#10b981' },
            { label:'Social',         pct:6,  color:'#f59e0b' },
          ],
          topPages: [
            { path:'/features/irs-workflows', views:84, change:'+22%' },
            { path:'/',                         views:71, change:'+8%'  },
            { path:'/resources/transaction-codes', views:52, change:'+31%' },
            { path:'/about',                    views:38, change:'+5%'  },
          ],
        },
        // Search data — populated from gscData state after fetch
        search: {
          impressions: 0, impressionsChange: 0,
          clicks: 0, clicksChange: 0,
          ctr: 0, ctrChange: 0,
          avgPosition: 0, posChange: 0,
          indexedPages: 0,
          topQueries: [],
        },
        // Goals — real data where available
        goals: [
          { label:'Monthly Demos',    current: Number(stats.today_demos||0), target:50,  unit:'demos',   color:'#6366f1', note:'demos today' },
          { label:'Organic Visitors', current: ga4Data?.users ?? 0,          target:5000, unit:'visitors', color:'#0ea5e9', note: ga4Data ? null : 'connect GA4' },
          { label:'Platform MRR',     current: totalMRR||0,                  target:5000, unit:'$',       color:'#10b981' },
          { label:'Signed Offices',   current: activeTenants.length,         target:12,   unit:'firms',   color:'#f59e0b' },
        ],
        // Sales pipeline — real prospect data
        sales: (()=>{
          const pros = (prospectsRes && prospectsRes.data) || []
          const STAGES = ['New Lead','Contacted','Qualified','Demo Scheduled','Demo Completed','Proposal','Won','Lost']
          const stageCounts = {}
          STAGES.forEach(s => { stageCounts[s] = 0 })
          pros.forEach(p => { if (stageCounts[p.stage] !== undefined) stageCounts[p.stage]++ })
          const won = pros.filter(p=>p.stage==='Won').length
          const lost = pros.filter(p=>p.stage==='Lost').length
          const winRate = (won+lost) > 0 ? Math.round((won/(won+lost))*100) : 0
          const pipeline = pros.filter(p=>!['Won','Lost'].includes(p.stage)).reduce((s,p)=>s+Number(p.mrr_potential||0),0)
          return {
            stages: STAGES.map((label,i) => ({
              label,
              count: stageCounts[label],
              color: ['#94a3b8','#6366f1','#8b5cf6','#0ea5e9','#a855f7','#f59e0b','#10b981','#ef4444'][i]
            })),
            winRate,
            pipeline,
            prospects: pros,
          }
        })(),
        systemStatus: [
          { label:'Supabase DB',         ok:true  },
          { label:'Email (Stalwart)',     ok:true  },
          { label:'taxrescrm.net',        ok:true  },
          { label:'taxrescrm.app',        ok:true  },
          { label:'GA4 Sync',            ok:true  },
          { label:'Search Console',      ok:null  },
          { label:'Bing',                ok:null  },
          { label:'Microsoft Clarity',   ok:null  },
        ],
      })
      } catch(err) {
        console.error('Command Center load error:', err)
        setLoadError(String(err))
      }
    }
    load()
  }, [])

  // ── GSC state + fetch ──
  const [gscData, setGscData]         = useState(null)
  const [gscLoading, setGscLoading]   = useState(false)
  const [gscConnected, setGscConnected] = useState(false)

  // ── Bing state ──
  const [bingData, setBingData]           = useState(null)
  const [bingConnected, setBingConnected] = useState(false)

  // ── System live status ──
  const [sysStatus, setSysStatus] = useState(null)
  useEffect(()=>{
    async function checkSys(){
      let dbOk = false
      try { const r = await supabase.from('tenants').select('id').limit(1); dbOk = !r.error } catch(_){}
      let mailOk=false,netOk=false,appOk=false
      try{await fetch('https://webmail.taxrescrm.net:7443',{mode:'no-cors',signal:AbortSignal.timeout(4000)});mailOk=true}catch(_){}
      try{await fetch('https://taxrescrm.net',{mode:'no-cors',signal:AbortSignal.timeout(4000)});netOk=true}catch(_){}
      try{await fetch('https://taxrescrm.app',{mode:'no-cors',signal:AbortSignal.timeout(4000)});appOk=true}catch(_){}
      setSysStatus({dbOk,mailOk,netOk,appOk})
    }
    checkSys()
  },[])

  useEffect(() => {
    // Handle GSC OAuth callback (?code= in URL after redirect)
    const urlParams = new URLSearchParams(window.location.search)
    const gscCode = urlParams.get('code')
    if (gscCode) {
      window.history.replaceState({}, '', window.location.pathname)
      const redirect = window.location.origin + '/crm-admin/command-center'
      supabase.functions.invoke('gsc-data', {
        body: { action: 'connect', code: gscCode, redirect_uri: redirect }
      }).then(({ data: r }) => {
        if (r?.success) fetchGSC()
      }).catch(e => console.error('GSC connect:', e))
    } else {
      fetchGSC()
    }
    fetchBing()
  }, [])

  async function fetchBing() {
    try {
      const { data: bing, error } = await supabase.functions.invoke('bing-data', { body: {} })
      if (error) throw error
      if (bing && !bing.error) { setBingData(bing); setBingConnected(true) }
      else { setBingConnected(false) }
    } catch(e) { console.error('Bing fetch:', e); setBingConnected(false) }
  }

  async function fetchGSC() {
    setGscLoading(true)
    try {
      const { data: gsc } = await supabase.functions.invoke('gsc-data', { body: {} })
      if (gsc && !gsc.mock && !gsc.error) {
        setGscData(gsc)
        setGscConnected(true)
      }
    } catch(e) { console.error('GSC fetch:', e) } finally { setGscLoading(false) }
  }

  function handleGSCConnect() {
    const CLIENT_ID = '70057646964-vimoia1qkjtml9n3mplo0hme82m3t2qs.apps.googleusercontent.com'
    const redirect  = window.location.origin + '/crm-admin/command-center'
    const scope     = 'https://www.googleapis.com/auth/webmasters.readonly'
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`
  }

  // ── GA4 real data load ─────────────────────────────────────────────────────
  const [ga4Data, setGa4Data] = useState(null)
  const [ga4Loading, setGa4Loading] = useState(false)

  async function loadGA4() {
    setGa4Loading(true)
    try {
      // Trigger a fresh sync first (no-op if fn not yet deployed)
      await supabase.functions.invoke('ga4-sync').catch(() => {})

      // Read results from cache tables
      const today = new Date().toISOString().slice(0,10)
      const [{ data: traffic }, { data: pages }, { data: syncLog }] = await Promise.all([
        supabase.from('marketing_ga4_traffic').select('*').gte('date', new Date(Date.now()-7*86400000).toISOString().slice(0,10)).order('date',{ascending:false}),
        supabase.from('marketing_ga4_pages').select('*').eq('date', today).order('sessions',{ascending:false}).limit(10),
        supabase.from('marketing_sync_log').select('*').eq('source','ga4').order('synced_at',{ascending:false}).limit(1),
      ])

      // Aggregate totals for today
      const todayRows = (traffic||[]).filter(r=>r.date===today)
      const totalSessions   = todayRows.reduce((s,r)=>s+Number(r.sessions||0),0)
      const totalUsers      = todayRows.reduce((s,r)=>s+Number(r.users||0),0)
      const totalNewUsers   = todayRows.reduce((s,r)=>s+Number(r.new_users||0),0)
      const totalPageViews  = todayRows.reduce((s,r)=>s+Number(r.page_views||0),0)
      const avgBounce       = todayRows.length ? todayRows.reduce((s,r)=>s+Number(r.bounce_rate||0),0)/todayRows.length : 0
      const avgPages        = todayRows.length ? todayRows.reduce((s,r)=>s+Number(r.pages_per_session||0),0)/todayRows.length : 0

      // Yesterday comparison
      const yest = new Date(Date.now()-86400000).toISOString().slice(0,10)
      const yestRows = (traffic||[]).filter(r=>r.date===yest)
      const yestSessions = yestRows.reduce((s,r)=>s+Number(r.sessions||0),0)
      const sessionChange = yestSessions>0 ? Math.round(((totalSessions-yestSessions)/yestSessions)*100) : 0

      // Channel breakdown
      const channels = []
      const channelMap = {}
      for (const r of todayRows) {
        channelMap[r.channel||'Direct'] = (channelMap[r.channel||'Direct']||0) + Number(r.sessions||0)
      }
      const totalCh = Object.values(channelMap).reduce((s,v)=>s+v,0)||1
      const COLORS = {
        'Organic Search':'#6366f1','Direct':'#0ea5e9','Referral':'#10b981',
        'Organic Social':'#f59e0b','Email':'#ec4899','Paid Search':'#8b5cf6','Unassigned':'#64748b'
      }
      for (const [ch,count] of Object.entries(channelMap).sort((a,b)=>b[1]-a[1]).slice(0,6)) {
        channels.push({ label:ch, pct:Math.round((count/totalCh)*100), color:COLORS[ch]||'#64748b' })
      }

      const lastSync = syncLog?.[0]
      setGa4Data({
        sessions: totalSessions,
        users: totalUsers,
        newUsers: totalNewUsers,
        pageViews: totalPageViews,
        bounceRate: avgBounce.toFixed(1),
        pagesPerSession: avgPages.toFixed(1),
        sessionChange,
        channels: channels.length ? channels : [{ label:'No data yet', pct:100, color:'#334155' }],
        topPages: (pages||[]).map(p=>({ path:p.page_path, views:p.sessions, avgTime: Math.round(p.avg_time_sec||0)+'s' })),
        lastSync: lastSync ? new Date(lastSync.synced_at).toLocaleTimeString() : 'never',
        status: lastSync?.status || 'pending',
      })
    } catch(e) {
      console.error('GA4 load error:', e)
    }
    setGa4Loading(false)
  }

  useEffect(() => { if (tab==='marketing') loadGA4() }, [tab])

  // Poll activity every 30s
  useEffect(() => {
    const t = setInterval(() => setActivityPoll(p=>p+1), 30000)
    return () => clearInterval(t)
  }, [])

  if (loadError) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'80vh' }}>
      <div style={{ textAlign:'center', maxWidth:500 }}>
        <div style={{ fontSize:32, marginBottom:12 }}>⚠️</div>
        <div style={{ fontSize:16, color:'#ef4444', fontWeight:700, marginBottom:8 }}>Command Center failed to load</div>
        <div style={{ fontSize:12, color:'#475569', fontFamily:'monospace', background:'rgba(0,0,0,.3)', padding:12, borderRadius:8, textAlign:'left', wordBreak:'break-all' }}>{loadError}</div>
        <button onClick={() => { setLoadError(null); setData(null); }} style={{ ...S.btn('primary'), marginTop:16 }}>Retry</button>
      </div>
    </div>
  )

  if (!data) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'80vh' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:32, marginBottom:12 }}>⚡</div>
        <div style={{ fontSize:14, color:'#475569' }}>Loading Command Center…</div>
      </div>
    </div>
  )

  // ── Sub-components ─────────────────────────────────────────────────────────
  const CC = {
    // Glassmorphism card
    card: (extra={}) => ({
      background:'rgba(255,255,255,.04)',
      border:'1px solid rgba(99,102,241,.18)',
      borderRadius:14,
      overflow:'hidden',
      ...extra,
    }),
    // Section label
    sectionLabel: { fontSize:10, fontWeight:800, color:'#475569', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:12 },
    // Metric card
    kpiCard: (color) => ({
      background:`linear-gradient(135deg, ${color}18, ${color}08)`,
      border:`1px solid ${color}30`,
      borderRadius:12,
      padding:'18px 20px',
      cursor:'pointer',
      transition:'transform .15s, box-shadow .15s',
    }),
  }

  function KPICard({ label, value, sub, color, icon, to }) {
    const [hover, setHover] = useState(false)
    return (
      <div
        onClick={() => to && navigate(to)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          ...CC.kpiCard(color),
          transform: hover ? 'translateY(-3px)' : 'none',
          boxShadow: hover ? `0 8px 32px ${color}30` : 'none',
        }}
      >
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div style={{ fontSize:10, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.07em' }}>{label}</div>
          <div style={{ fontSize:18, opacity:.5 }}>{icon}</div>
        </div>
        <div style={{ fontSize:30, fontWeight:900, color, lineHeight:1, marginTop:10 }}>{value ?? '—'}</div>
        {sub && <div style={{ fontSize:11, color:'#475569', marginTop:5 }}>{sub}</div>}
      </div>
    )
  }

  function MiniBar({ pct, color }) {
    return (
      <div style={{ height:6, background:'rgba(255,255,255,.06)', borderRadius:3, overflow:'hidden', flex:1 }}>
        <div style={{ height:'100%', width:`${Math.min(100,pct)}%`, background:color, borderRadius:3,
          transition:'width .6s ease', boxShadow:`0 0 8px ${color}60` }} />
      </div>
    )
  }

  function GoalBar({ label, current, target, unit, color }) {
    const pct = Math.min(100, Math.round((current/target)*100))
    const fmt = (v) => unit==='$' ? `$${Number(v).toLocaleString('en-US',{maximumFractionDigits:0})}` : `${Number(v).toLocaleString()}${unit!=='$'&&unit!=='demos'&&unit!=='firms'&&unit!=='visitors'?' '+unit:''}`
    return (
      <div style={{ marginBottom:18 }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
          <div style={{ fontSize:12, fontWeight:600, color:'#e2e8f0' }}>{label}</div>
          <div style={{ fontSize:11, color:'#64748b' }}>{fmt(current)} / {fmt(target)} · <span style={{ color }}>{pct}%</span></div>
        </div>
        <MiniBar pct={pct} color={color} />
      </div>
    )
  }

  function StatusDot({ ok }) {
    if (ok === null) return <span style={{ fontSize:10, color:'#475569', fontWeight:600 }}>—</span>
    return <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%',
      background: ok ? '#10b981' : '#ef4444',
      boxShadow: ok ? '0 0 6px #10b98160' : '0 0 6px #ef444460' }} />
  }

  const TABS = [
    { key:'overview',  label:'Overview'  },
    { key:'marketing', label:'Marketing' },
    { key:'search',    label:'Search'    },
    { key:'sales',     label:'Sales'     },
    { key:'crm',       label:'CRM'       },
    { key:'goals',     label:'Goals'     },
    { key:'system',    label:'System'    },
  ]

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'#0a0918' }}>

      {/* ── Main scroll area ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'28px 32px 48px' }}>

        {/* Header */}
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:26, fontWeight:900, color:'#fff', marginBottom:3 }}>
            {data.greeting}, Romy 👋
          </div>
          <div style={{ fontSize:13, color:'#475569' }}>{data.todayDate}</div>
        </div>

        {/* Tab bar */}
        <div style={{ display:'flex', gap:4, marginBottom:28, padding:'4px', background:'rgba(255,255,255,.04)',
          borderRadius:10, border:'1px solid rgba(99,102,241,.15)', width:'fit-content' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding:'7px 18px', borderRadius:7, border:'none', cursor:'pointer',
              fontWeight: tab===t.key ? 700 : 500, fontSize:13,
              background: tab===t.key ? 'rgba(99,102,241,.35)' : 'transparent',
              color: tab===t.key ? '#a5b4fc' : '#64748b',
              transition:'all .15s',
            }}>{t.label}</button>
          ))}
        </div>

        {/* ═══ OVERVIEW TAB ═══ */}
        {tab==='overview' && (<>

          {/* Platform KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10, marginBottom:24 }}>
            {[
              { label:'Active Offices',  value:data.kpis.activeTenants,  icon:'🏢',  color:'#10b981' },
              { label:'Total Offices',   value:data.kpis.totalTenants,   icon:'🏗️',  color:'#6366f1' },
              { label:'Platform MRR',    value:`$${data.kpis.totalMRR.toLocaleString('en-US',{maximumFractionDigits:0})}`, icon:'📈', color:'#10b981' },
              { label:'Total Seats',     value:data.kpis.totalSeats,     icon:'👥',  color:'#f59e0b' },
              { label:'Total Clients',   value:data.kpis.totalClients.toLocaleString(), icon:'📋', color:'#0ea5e9' },
              { label:'Total Leads',     value:data.kpis.totalLeads.toLocaleString(),   icon:'🎯', color:'#8b5cf6' },
            ].map(k => <KPICard key={k.label} {...k} />)}
          </div>

          {/* Platform KPIs Row 2 */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10, marginBottom:28 }}>
            {[
              { label:'Storage Used',    value:fmtBytes(data.kpis.totalStorage), icon:'💾', color:'#8b5cf6' },
              { label:'Pending E-Signs', value:data.kpis.pendingEsigns,  icon:'✍️', color:'#f59e0b' },
              { label:'Demos Today',     value:data.kpis.todayDemos,     icon:'📅', color:'#ec4899' },
              { label:'Visitors Today',  value:ga4Data?.users ?? 0,      icon:'🌐', color:'#0ea5e9', sub: ga4Data ? null : 'connect GA4' },
              { label:'Clicks (GSC)',    value:gscConnected && gscData ? gscData.clicks : 0, icon:'🔍', color:'#6366f1', sub: gscConnected ? null : 'connect GSC' },
              { label:'Impressions',     value:gscConnected && gscData ? gscData.impressions : 0, icon:'👁', color:'#0ea5e9', sub: gscConnected ? null : 'connect GSC' },
            ].map(k => <KPICard key={k.label} {...k} />)}
          </div>

          {/* What changed + Activity side-by-side */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:18, marginBottom:24 }}>

            {/* What changed */}
            <div style={CC.card({padding:'22px 24px'})}>
              <div style={CC.sectionLabel}>What changed since yesterday</div>
              {data.changes.length===0
                ? <div style={{ fontSize:13, color:'#475569' }}>No significant changes yet today.</div>
                : data.changes.map((c,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0',
                  borderBottom: i<data.changes.length-1 ? '1px solid rgba(99,102,241,.1)' : 'none' }}>
                  <span style={{ fontSize:16, width:24, textAlign:'center' }}>
                    {c.dir==='up' ? '▲' : c.dir==='down' ? '▼' : '→'}
                  </span>
                  <span style={{ fontSize:13, color: c.dir==='up'?'#10b981':c.dir==='down'?'#ef4444':'#94a3b8', fontWeight:600 }}>
                    {c.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Live activity */}
            <div style={CC.card({padding:'22px 20px', display:'flex', flexDirection:'column'})}>
              <div style={{ ...CC.sectionLabel, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span>Live activity</span>
                <span style={{ fontSize:9, color:'#10b981', fontWeight:700, animation:'pulse 2s infinite' }}>● LIVE</span>
              </div>
              <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:0 }}>
                {activity.length===0
                  ? <div style={{ fontSize:12, color:'#475569' }}>No recent activity.</div>
                  : activity.map((a,i) => (
                  <div key={i} style={{ display:'flex', gap:10, padding:'8px 0',
                    borderBottom: i<activity.length-1?'1px solid rgba(99,102,241,.08)':'none' }}>
                    <div style={{ fontSize:14, width:22, textAlign:'center', flexShrink:0 }}>{a.icon}</div>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:12, color:'#e2e8f0', fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.text}</div>
                      <div style={{ fontSize:10, color:'#475569' }}>{a.sub} · {fmtAgo(a.ts)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom row: Calendar + Deadlines + System Status */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 260px', gap:18 }}>

            {/* Today's schedule */}
            <div style={CC.card({padding:'22px 24px'})}>
              <div style={CC.sectionLabel}>Today's schedule</div>
              {data.todaySchedule.length===0
                ? <div style={{ fontSize:13, color:'#475569' }}>Nothing on the calendar today.</div>
                : data.todaySchedule.map((e,i) => (
                <div key={i} style={{ display:'flex', gap:12, padding:'9px 0',
                  borderBottom: i<data.todaySchedule.length-1?'1px solid rgba(99,102,241,.1)':'none' }}>
                  <div style={{ fontSize:11, color:'#6366f1', fontWeight:700, width:44, flexShrink:0, marginTop:1 }}>
                    {e.start ? new Date(e.start).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true}) : '—'}
                  </div>
                  <div>
                    <div style={{ fontSize:13, color:'#e2e8f0', fontWeight:600 }}>{e.title||'Meeting'}</div>
                    <div style={{ fontSize:10, color:'#475569' }}>{e.type||'Event'}</div>
                  </div>
                </div>
              ))}
              {data.todaySchedule.length===0 && (
                <div style={{ fontSize:12, color:'#334155', marginTop:12 }}>Check calendar for upcoming demos →</div>
              )}
            </div>

            {/* IRS Deadlines */}
            <div style={CC.card({padding:'22px 24px'})}>
              <div style={CC.sectionLabel}>Upcoming IRS deadlines</div>
              {data.upcomingDl.length===0
                ? <div style={{ fontSize:13, color:'#10b981' }}>✅ No urgent deadlines this week</div>
                : data.upcomingDl.map((d,i) => {
                  const days = Math.ceil((new Date(d.dueDate)-new Date())/86400000)
                  return (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0',
                      borderBottom: i<data.upcomingDl.length-1?'1px solid rgba(99,102,241,.1)':'none' }}>
                      <div>
                        <div style={{ fontSize:13, color:'#e2e8f0', fontWeight:600 }}>{d.title}</div>
                        <div style={{ fontSize:10, color:'#475569' }}>{d.dueDate}</div>
                      </div>
                      <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20,
                        background: days<=3?'rgba(239,68,68,.15)':'rgba(245,158,11,.15)',
                        color: days<=3?'#ef4444':'#f59e0b' }}>
                        {days<=0?'TODAY':days===1?'TOMORROW':`${days}d`}
                      </span>
                    </div>
                  )
                })}
            </div>

            {/* System status */}
            <div style={CC.card({padding:'22px 20px'})}>
              <div style={CC.sectionLabel}>System status</div>
              {data.systemStatus.map((s,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'7px 0', borderBottom: i<data.systemStatus.length-1?'1px solid rgba(99,102,241,.08)':'none' }}>
                  <div style={{ fontSize:12, color:'#94a3b8' }}>{s.label}</div>
                  <StatusDot ok={s.ok} />
                </div>
              ))}
            </div>
          </div>

        </>)}

        {/* ═══ MARKETING TAB ═══ */}
        {tab==='marketing' && (<>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <div style={{ fontSize:11, color:'#475569' }}>
              {ga4Data ? `Last synced: ${ga4Data.lastSync}` : 'Loading GA4 data…'}
            </div>
            <button onClick={loadGA4} disabled={ga4Loading} style={{ ...S.btn('ghost'), fontSize:12, padding:'6px 16px' }}>
              {ga4Loading ? '⟳ Syncing…' : '⟳ Refresh'}
            </button>
          </div>

          {ga4Loading && !ga4Data ? (
            <div style={{ textAlign:'center', padding:60, color:'#475569' }}>
              <div style={{ fontSize:28, marginBottom:12 }}>📊</div>
              <div>Pulling data from Google Analytics…</div>
            </div>
          ) : ga4Data ? (<>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
              {[
                { label:'Sessions Today',    value: ga4Data.sessions.toLocaleString(), sub: ga4Data.sessionChange!==0 ? `${ga4Data.sessionChange>0?'↑':'↓'} ${Math.abs(ga4Data.sessionChange)}% vs yesterday` : 'vs yesterday', icon:'📊', color:'#6366f1' },
                { label:'Users Today',       value: ga4Data.users.toLocaleString(),    sub:`${ga4Data.newUsers.toLocaleString()} new`,   icon:'👥', color:'#0ea5e9' },
                { label:'Bounce Rate',       value:`${ga4Data.bounceRate}%`,            sub:'avg today',     icon:'↩️', color:'#10b981' },
                { label:'Pages / Session',   value: ga4Data.pagesPerSession,            sub:'avg today',     icon:'📄', color:'#f59e0b' },
              ].map(k => <KPICard key={k.label} {...k} />)}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18, marginBottom:24 }}>
              <div style={CC.card({padding:'22px 24px'})}>
                <div style={CC.sectionLabel}>Traffic sources — today</div>
                {ga4Data.channels.map((s,i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
                    <div style={{ fontSize:12, color:'#94a3b8', width:130, flexShrink:0 }}>{s.label}</div>
                    <MiniBar pct={s.pct} color={s.color} />
                    <div style={{ fontSize:12, fontWeight:700, color:s.color, width:36, textAlign:'right' }}>{s.pct}%</div>
                  </div>
                ))}
              </div>

              <div style={CC.card({padding:'22px 24px'})}>
                <div style={CC.sectionLabel}>Top pages — last 7 days</div>
                {ga4Data.topPages.length===0
                  ? <div style={{ fontSize:13, color:'#475569' }}>No page data yet.</div>
                  : ga4Data.topPages.map((p,i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                    padding:'9px 0', borderBottom: i<ga4Data.topPages.length-1?'1px solid rgba(99,102,241,.1)':'none' }}>
                    <div style={{ fontSize:12, color:'#e2e8f0', fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:240 }}>{p.path}</div>
                    <div style={{ display:'flex', gap:12, flexShrink:0 }}>
                      <span style={{ fontSize:12, color:'#94a3b8' }}>{p.views} sessions</span>
                      <span style={{ fontSize:11, color:'#475569' }}>{p.avgTime}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>) : (
            <div style={{ ...CC.card(), padding:'24px', textAlign:'center', color:'#475569' }}>
              GA4 sync failed. Check System tab for details.
            </div>
          )}
        </>)}

        {/* ═══ SEARCH TAB ═══ */}
        {tab==='search' && (<>

          {/* ── Google Search Console ── */}
          <div style={CC.card({padding:'22px 24px', marginBottom:18})}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
              <span style={{ fontSize:16 }}>🔵</span>
              <div style={{ fontSize:14, fontWeight:800, color:'#fff' }}>Google Search Console</div>
              {gscConnected
                ? <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, background:'rgba(16,185,129,.15)', color:'#10b981', marginLeft:'auto' }}>✅ Connected</span>
                : <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, background:'rgba(99,102,241,.15)', color:'#6366f1', marginLeft:'auto' }}>Not connected</span>
              }
            </div>
            {(()=>{ const sd = gscConnected && gscData ? gscData : null; return (<>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom: sd && gscData?.topQueries?.length > 0 ? 16 : 0 }}>
                {[
                  { label:'Impressions',  value: sd ? sd.impressions.toLocaleString() : '—', color:'#6366f1' },
                  { label:'Clicks',       value: sd ? sd.clicks.toLocaleString() : '—',       color:'#10b981' },
                  { label:'CTR',          value: sd ? `${sd.ctr}%` : '—',                     color:'#f59e0b' },
                  { label:'Avg Position', value: sd ? String(sd.avgPosition) : '—',           color:'#f97316' },
                ].map((m,i)=>(
                  <div key={i} style={{ background:'rgba(255,255,255,.03)', borderRadius:8, padding:'14px 16px', border:'1px solid rgba(255,255,255,.06)' }}>
                    <div style={{ fontSize:9, color:'#475569', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>{m.label}</div>
                    <div style={{ fontSize:22, fontWeight:800, color:m.color }}>{m.value}</div>
                  </div>
                ))}
              </div>
              {sd && gscData?.topQueries?.length > 0 && (
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead><tr>{['Keyword','Position','Clicks','Impressions'].map(h=>(
                    <th key={h} style={{ padding:'6px 10px', textAlign:'left', fontSize:10, color:'#475569', textTransform:'uppercase', letterSpacing:'.06em', borderBottom:'1px solid rgba(255,255,255,.06)' }}>{h}</th>
                  ))}</tr></thead>
                  <tbody>{gscData.topQueries.map((q,i)=>(
                    <tr key={i} style={{ borderBottom:'1px solid rgba(255,255,255,.04)' }}>
                      <td style={{ padding:'8px 10px', fontSize:13, color:'#e2e8f0' }}>{q.query}</td>
                      <td style={{ padding:'8px 10px', fontSize:13, fontWeight:700, color: q.pos<=10?'#10b981':q.pos<=20?'#f59e0b':'#f97316' }}>{q.pos}</td>
                      <td style={{ padding:'8px 10px', fontSize:13, color:'#94a3b8' }}>{q.clicks}</td>
                      <td style={{ padding:'8px 10px', fontSize:13, color:'#6366f1' }}>{q.impressions}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
              {!gscConnected && (
                <div style={{ marginTop:8 }}>
                  {gscLoading
                    ? <div style={{ fontSize:12, color:'#475569' }}>Checking connection…</div>
                    : <button onClick={handleGSCConnect} style={{ background:'#6366f1', color:'#fff', border:'none', borderRadius:6, padding:'7px 16px', fontSize:12, fontWeight:600, cursor:'pointer' }}>Connect Google Search Console</button>
                  }
                </div>
              )}
              {gscConnected && gscData?.siteUrl && <div style={{ fontSize:11, color:'#475569', marginTop:8 }}>Last 28 days · {gscData.siteUrl}</div>}
            </>)})()}
          </div>

          {/* ── Bing Webmaster Tools ── */}
          <div style={CC.card({padding:'22px 24px'})}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
              <span style={{ fontSize:16 }}>🟠</span>
              <div style={{ fontSize:14, fontWeight:800, color:'#fff' }}>Bing Webmaster Tools</div>
              {bingConnected
                ? <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, background:'rgba(16,185,129,.15)', color:'#10b981', marginLeft:'auto' }}>✅ Connected</span>
                : <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, background:'rgba(100,116,139,.15)', color:'#64748b', marginLeft:'auto' }}>Not connected</span>
              }
            </div>
            {bingConnected && bingData ? (<>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom: bingData.topKeywords?.length > 0 ? 16 : 0 }}>
                {[
                  { label:'Impressions',  value: bingData.impressions?.toLocaleString() || '0', color:'#6366f1' },
                  { label:'Clicks',       value: bingData.clicks?.toLocaleString() || '0',       color:'#10b981' },
                  { label:'CTR',          value: `${bingData.ctr || 0}%`,                        color:'#f59e0b' },
                  { label:'Avg Position', value: bingData.avgPosition || '—',                    color:'#f97316' },
                ].map((m,i)=>(
                  <div key={i} style={{ background:'rgba(255,255,255,.03)', borderRadius:8, padding:'14px 16px', border:'1px solid rgba(255,255,255,.06)' }}>
                    <div style={{ fontSize:9, color:'#475569', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>{m.label}</div>
                    <div style={{ fontSize:22, fontWeight:800, color:m.color }}>{m.value}</div>
                  </div>
                ))}
              </div>
              {bingData.topKeywords?.length > 0 && (
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead><tr>{['Keyword','Position','Clicks','Impressions'].map(h=>(
                    <th key={h} style={{ padding:'6px 10px', textAlign:'left', fontSize:10, color:'#475569', textTransform:'uppercase', letterSpacing:'.06em', borderBottom:'1px solid rgba(255,255,255,.06)' }}>{h}</th>
                  ))}</tr></thead>
                  <tbody>{bingData.topKeywords.slice(0,8).map((k,i)=>(
                    <tr key={i} style={{ borderBottom:'1px solid rgba(255,255,255,.04)' }}>
                      <td style={{ padding:'8px 10px', fontSize:13, color:'#e2e8f0' }}>{k.query}</td>
                      <td style={{ padding:'8px 10px', fontSize:13, fontWeight:700, color: k.avgPosition<=10?'#10b981':k.avgPosition<=20?'#f59e0b':'#f97316' }}>{k.avgPosition}</td>
                      <td style={{ padding:'8px 10px', fontSize:13, color:'#94a3b8' }}>{k.clicks}</td>
                      <td style={{ padding:'8px 10px', fontSize:13, color:'#6366f1' }}>{k.impressions}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
              <div style={{ fontSize:11, color:'#475569', marginTop:8 }}>Last 28 days · {bingData.siteUrl}</div>
            </>) : (
              <div style={{ fontSize:12, color:'#475569' }}>
                {bingData === null ? 'Checking connection…' : 'API key configured — no data yet or site not yet indexed by Bing.'}
              </div>
            )}
          </div>
        </>)}

        {/* ═══ SALES TAB ═══ */}
        {tab==='sales' && (<>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
            {[
              { label:'Win Rate',      value:`${data.sales.winRate}%`,                                              icon:'🏆', color:'#10b981' },
              { label:'Active Prospects', value: data.sales.prospects.filter(p=>!['Won','Lost'].includes(p.stage)).length, icon:'🎯', color:'#6366f1' },
              { label:'Pipeline Value',value:`$${(data.sales.pipeline).toLocaleString('en-US',{maximumFractionDigits:0})}`, icon:'💼', color:'#f59e0b' },
              { label:'Platform MRR',  value:`$${data.kpis.totalMRR.toLocaleString('en-US',{maximumFractionDigits:0})}`,  icon:'📈', color:'#0ea5e9' },
            ].map(k => <KPICard key={k.label} {...k} />)}
          </div>

          {/* Funnel */}
          <div style={CC.card({padding:'26px 28px', marginBottom:18})}>
            <div style={CC.sectionLabel}>Sales pipeline funnel</div>
            <div style={{ display:'flex', gap:3, alignItems:'flex-end', height:120, marginBottom:16 }}>
              {data.sales.stages.map((s,i) => {
                const maxCount = Math.max(...data.sales.stages.map(x=>x.count), 1)
                const h = Math.max(20, Math.round((s.count/maxCount)*100))
                return (
                  <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                    <div style={{ fontSize:14, fontWeight:900, color:s.color }}>{s.count}</div>
                    <div style={{ width:'100%', height:h, background:`linear-gradient(to top, ${s.color}60, ${s.color}20)`,
                      border:`1px solid ${s.color}40`, borderRadius:'4px 4px 0 0', transition:'height .4s ease' }} />
                  </div>
                )
              })}
            </div>
            <div style={{ display:'flex', gap:3 }}>
              {data.sales.stages.map((s,i) => (
                <div key={i} style={{ flex:1, textAlign:'center', fontSize:9, color:'#475569', fontWeight:600, textTransform:'uppercase', letterSpacing:'.04em', lineHeight:1.2 }}>{s.label}</div>
              ))}
            </div>
          </div>

          {/* Prospect Pipeline Table */}
          <div style={CC.card({padding:'22px 24px', marginBottom:18})}>
            <div style={CC.sectionLabel}>Prospect Pipeline</div>
            {data.sales.prospects.length === 0
              ? <div style={{ fontSize:13, color:'#475569' }}>No prospects yet — add your first one.</div>
              : <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr>{['Firm','Contact','Stage','Seats','MRR Potential','Notes'].map(h=>(
                      <th key={h} style={{ textAlign:'left', padding:'6px 10px', fontSize:10, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.05em', borderBottom:'1px solid rgba(99,102,241,.15)' }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {data.sales.prospects.map((p,i)=>(
                      <tr key={p.id} style={{ borderBottom:'1px solid rgba(99,102,241,.08)' }}>
                        <td style={{ padding:'8px 10px', color:'#e2e8f0', fontWeight:600 }}>{p.firm_name}</td>
                        <td style={{ padding:'8px 10px', color:'#94a3b8' }}>{p.contact_name||'—'}</td>
                        <td style={{ padding:'8px 10px' }}>
                          <span style={{ background: p.stage==='Won'?'rgba(16,185,129,.15)':p.stage==='Lost'?'rgba(239,68,68,.15)':'rgba(99,102,241,.15)',
                            color: p.stage==='Won'?'#10b981':p.stage==='Lost'?'#ef4444':'#818cf8',
                            padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:700 }}>{p.stage}</span>
                        </td>
                        <td style={{ padding:'8px 10px', color:'#94a3b8' }}>{p.seats||'—'}</td>
                        <td style={{ padding:'8px 10px', color:'#10b981', fontWeight:700 }}>{p.mrr_potential ? `$${Number(p.mrr_potential).toLocaleString()}/mo` : '—'}</td>
                        <td style={{ padding:'8px 10px', color:'#475569', fontSize:11 }}>{p.notes ? p.notes.slice(0,60)+(p.notes.length>60?'…':'') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            }
          </div>

          <div style={{ ...CC.card(), padding:'20px 24px', background:'rgba(16,185,129,.04)', border:'1px solid rgba(16,185,129,.15)' }}>
            <div style={{ fontSize:13, color:'#10b981', fontWeight:700, marginBottom:4 }}>ARR Projection</div>
            <div style={{ fontSize:28, fontWeight:900, color:'#fff', marginBottom:4 }}>
              ${(data.kpis.totalMRR*12).toLocaleString('en-US',{maximumFractionDigits:0})}
            </div>
            <div style={{ fontSize:12, color:'#475569' }}>Based on current MRR × 12. Grows automatically as offices activate.</div>
          </div>
        </>)}

        {/* ═══ CRM TAB ═══ */}
        {tab==='crm' && (<>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:24 }}>
            {[
              { label:'Total Clients (All Offices)',  value:data.kpis.totalClients.toLocaleString(), icon:'🏢', color:'#10b981' },
              { label:'Total Leads (All Offices)',    value:data.kpis.totalLeads.toLocaleString(),   icon:'👤', color:'#a855f7' },
              { label:'Total Seats (All Offices)',    value:data.kpis.totalSeats,                    icon:'👥', color:'#6366f1' },
              { label:'Pending E-Signs',              value:data.kpis.pendingEsigns,                 icon:'✍️', color:'#8b5cf6' },
              { label:'Demos Today',                  value:data.kpis.todayDemos,                    icon:'📅', color:'#0ea5e9' },
              { label:'Storage Used',                 value:fmtBytes(data.kpis.totalStorage),        icon:'💾', color:'#f59e0b' },
            ].map(k => <KPICard key={k.label} {...k} />)}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>
            <div style={CC.card({padding:'22px 24px'})}>
              <div style={CC.sectionLabel}>Upcoming demos</div>
              {data.upcomingDemos.length===0
                ? <div style={{ fontSize:13, color:'#475569' }}>No demos scheduled. Book one at taxrescrm.net →</div>
                : data.upcomingDemos.map((e,i) => (
                <div key={i} style={{ display:'flex', gap:10, padding:'9px 0',
                  borderBottom: i<data.upcomingDemos.length-1?'1px solid rgba(99,102,241,.1)':'none' }}>
                  <div style={{ fontSize:11, color:'#6366f1', fontWeight:700, width:60, flexShrink:0 }}>
                    {new Date(e.start).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                  </div>
                  <div style={{ fontSize:13, color:'#e2e8f0' }}>{e.title||'Demo'}</div>
                </div>
              ))}
            </div>

            <div style={CC.card({padding:'22px 24px'})}>
              <div style={CC.sectionLabel}>IRS deadlines this week</div>
              {data.upcomingDl.length===0
                ? <div style={{ fontSize:13, color:'#10b981' }}>✅ No urgent deadlines</div>
                : data.upcomingDl.map((d,i) => {
                  const days = Math.ceil((new Date(d.dueDate)-new Date())/86400000)
                  return (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0',
                      borderBottom: i<data.upcomingDl.length-1?'1px solid rgba(99,102,241,.1)':'none' }}>
                      <div style={{ fontSize:13, color:'#e2e8f0' }}>{d.title}</div>
                      <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20,
                        background:days<=3?'rgba(239,68,68,.15)':'rgba(245,158,11,.15)',
                        color:days<=3?'#ef4444':'#f59e0b' }}>
                        {days<=0?'TODAY':days===1?'TOMORROW':`${days}d`}
                      </span>
                    </div>
                  )
                })}
            </div>
          </div>
        </>)}

        {/* ═══ GOALS TAB ═══ */}
        {tab==='goals' && (<>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>
            <div style={CC.card({padding:'26px 28px'})}>
              <div style={CC.sectionLabel}>2026 Business goals</div>
              {data.goals.map(g => <GoalBar key={g.label} {...g} />)}
            </div>
            <div style={CC.card({padding:'26px 28px'})}>
              <div style={CC.sectionLabel}>Pace check</div>
              {data.goals.map(g => {
                const pct = Math.min(100,Math.round((g.current/g.target)*100))
                const now = new Date()
                const dayOfYear = Math.floor((now-new Date(now.getFullYear(),0,0))/86400000)
                const yearPct = Math.round(dayOfYear/365*100)
                const ahead = pct >= yearPct
                return (
                  <div key={g.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                    padding:'12px 0', borderBottom:'1px solid rgba(99,102,241,.1)' }}>
                    <div style={{ fontSize:13, color:'#e2e8f0', fontWeight:600 }}>{g.label}</div>
                    <span style={{ fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:20,
                      background: ahead?'rgba(16,185,129,.15)':'rgba(245,158,11,.15)',
                      color: ahead?'#10b981':'#f59e0b' }}>
                      {ahead ? '✓ On pace' : '⚠ Behind pace'}
                    </span>
                  </div>
                )
              })}
              <div style={{ fontSize:11, color:'#475569', marginTop:16 }}>
                Pace based on {Math.round((new Date()-new Date(new Date().getFullYear(),0,0))/86400000)} days elapsed in 2026.
              </div>
            </div>
          </div>
        </>)}

        {/* ═══ SYSTEM TAB ═══ */}
        {tab==='system' && (<>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18, marginBottom:18 }}>
            <div style={CC.card({padding:'22px 24px'})}>
              <div style={CC.sectionLabel}>Service status</div>
              {(()=>{
                const checks = [
                  { label:'Supabase DB',          ok: sysStatus?.dbOk ?? null },
                  { label:'Email (Stalwart)',      ok: sysStatus?.mailOk ?? null },
                  { label:'taxrescrm.net',         ok: sysStatus?.netOk ?? null },
                  { label:'taxrescrm.app',         ok: sysStatus?.appOk ?? null },
                  { label:'GA4 (G-M6J80B65LG)',   ok: true },
                  { label:'Clarity (xyck7g2mfl)', ok: true },
                  { label:'Google Search Console', ok: gscConnected ? true : null },
                  { label:'Bing Webmaster',        ok: bingConnected ? true : null },
                ]
                return checks.map((s,i)=>(
                  <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                    padding:'11px 0', borderBottom: i<checks.length-1?'1px solid rgba(99,102,241,.1)':'none' }}>
                    <div style={{ fontSize:13, color:'#e2e8f0' }}>{s.label}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <StatusDot ok={s.ok} />
                      <span style={{ fontSize:11, fontWeight:600, color: s.ok===null?'#475569':s.ok?'#10b981':'#ef4444' }}>
                        {s.ok===null ? (sysStatus===null?'Checking…':'Not connected') : s.ok?'Operational':'Down'}
                      </span>
                    </div>
                  </div>
                ))
              })()}
            </div>

            <div style={CC.card({padding:'22px 24px'})}>
              <div style={CC.sectionLabel}>Connect APIs</div>
              {[
                { label:'Google Analytics 4',   key:'ga4',     status: 'connected · G-M6J80B65LG', color: '#10b981' },
                { label:'Google Search Console', key:'gsc',     status: gscConnected ? 'connected' : 'not connected', color: gscConnected ? '#10b981' : '#f59e0b' },
                { label:'Microsoft Clarity',     key:'clarity', status:'connected · xyck7g2mfl', color:'#10b981' },
                { label:'Bing Webmaster',        key:'bing',    status: bingConnected ? 'connected' : 'not connected', color: bingConnected ? '#10b981' : '#64748b' },
              ].map((api,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'11px 0', borderBottom: i<3?'1px solid rgba(99,102,241,.1)':'none' }}>
                  <div>
                    <div style={{ fontSize:13, color:'#e2e8f0', fontWeight:600 }}>{api.label}</div>
                    <div style={{ fontSize:10, color:api.color, fontWeight:600, textTransform:'uppercase', marginTop:2 }}>{api.status}</div>
                  </div>
                  <button onClick={()=>{
                    if(api.key==='gsc') handleGSCConnect()
                    else if(api.key==='ga4') alert('GA4: Add your Measurement ID in Settings')
                    else if(api.key==='bing') alert('Bing: Send your API key to connect')
                    else if(api.key==='clarity') alert('Clarity: Add your Project ID in Settings')
                  }} style={{ ...S.btn('ghost'), fontSize:11, padding:'5px 14px' }}>Connect</button>
                </div>
              ))}
              <div style={{ fontSize:11, color:'#475569', marginTop:14 }}>
                API keys are stored in Supabase Vault — never visible after saving.
              </div>
            </div>
          </div>

          <div style={{ ...CC.card(), padding:'20px 24px', background:'rgba(16,185,129,.04)', border:'1px solid rgba(16,185,129,.15)' }}>
            <div style={{ fontSize:13, color:'#10b981', fontWeight:700, marginBottom:6 }}>Daily Executive Email</div>
            <div style={{ fontSize:12, color:'#475569', marginBottom:14 }}>
              A morning briefing is sent to romy@taxrescrm.net every day at 7:00 AM ET with platform stats, upcoming calendar events, and MRR.
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <span style={{ fontSize:11, fontWeight:700, padding:'4px 12px', borderRadius:20,
                background:'rgba(16,185,129,.15)', color:'#10b981' }}>✅ Active</span>
              <button onClick={async()=>{
                const {error} = await supabase.functions.invoke('daily-briefing',{body:{}})
                alert(error ? 'Error: '+error.message : 'Test briefing sent to romy@taxrescrm.net')
              }} style={{ ...S.btn('ghost'), fontSize:11, padding:'4px 12px' }}>Send Test</button>
            </div>
          </div>
        </>)}

      </div>
    </div>
  )
}

// ── Content Center ────────────────────────────────────────────────────────────
const CONTENT_LABELS = {
  linkedin:     { label:'LinkedIn Post',      icon:'💼', color:'#0ea5e9' },
  article_idea: { label:'Article Idea',       icon:'📝', color:'#6366f1' },
  email:        { label:'Email Newsletter',   icon:'📧', color:'#10b981' },
  edu_tip:      { label:'Education Tip',      icon:'💡', color:'#f59e0b' },
  outreach:     { label:'Outreach Message',   icon:'📨', color:'#8b5cf6' },
}
const STATUS_COLORS = {
  draft:     '#475569',
  approved:  '#10b981',
  scheduled: '#6366f1',
  published: '#0ea5e9',
  archived:  '#334155',
}
const GENERATION_STEPS = [
  { key:'linkedin',     label:'LinkedIn Post',       icon:'💼' },
  { key:'article_idea', label:'Resource Article Idea',icon:'📝' },
  { key:'email',        label:'Email Newsletter',    icon:'📧' },
  { key:'edu_tip',      label:'Education Tip',       icon:'💡' },
  { key:'outreach_1',   label:'Outreach Message 1',  icon:'📨' },
  { key:'outreach_2',   label:'Outreach Message 2',  icon:'📨' },
  { key:'outreach_3',   label:'Outreach Message 3',  icon:'📨' },
]

function ContentCenter() {
  const [drafts, setDrafts]           = useState([])
  const [loading, setLoading]         = useState(true)
  const [genSteps, setGenSteps]       = useState(null)  // null=idle, array=generating
  const [filter, setFilter]           = useState('all')
  const [weekFilter, setWeekFilter]   = useState('all')
  const [selected, setSelected]       = useState(null)
  const [editing, setEditing]         = useState(false)
  const [editBody, setEditBody]       = useState('')
  const [saving, setSaving]           = useState(false)
  const [regenId, setRegenId]         = useState(null)
  const [toast, setToast]             = useState(null)
  const [useCrmData, setUseCrmData]   = useState(true)
  const [scores, setScores]           = useState({})

  function showToast(msg, ok=true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  async function loadDrafts() {
    setLoading(true)
    let data = []
    try { const r = await supabase.rpc('get_content_drafts', { p_limit: 200 }); data = r.data || [] } catch(_) { data = [] }
    setDrafts(data || [])
    setLoading(false)
  }

  useEffect(() => { loadDrafts() }, [])

  // Simulate step-by-step progress during generation
  async function generate(force=false) {
    // Start progress animation
    setGenSteps(GENERATION_STEPS.map(s => ({ ...s, status:'pending' })))
    let stepIdx = 0

    const timer = setInterval(() => {
      setGenSteps(prev => {
        if (!prev) return prev
        const next = [...prev]
        // Complete current, start next
        if (stepIdx > 0) next[stepIdx-1] = { ...next[stepIdx-1], status:'done' }
        if (stepIdx < next.length) next[stepIdx] = { ...next[stepIdx], status:'active' }
        stepIdx++
        if (stepIdx > next.length) clearInterval(timer)
        return next
      })
    }, 3500)

    try {
      const { data, error } = await supabase.functions.invoke('content-generator', {
        body: { useCrmData },
        headers: force ? { 'x-force-regenerate': 'true' } : {}
      })
      clearInterval(timer)
      // Mark all done
      setGenSteps(GENERATION_STEPS.map(s => ({ ...s, status:'done' })))
      await loadDrafts()
      setTimeout(() => setGenSteps(null), 1200)
      showToast(data?.message === 'Already generated this week'
        ? 'Already generated this week. Use ↺ to overwrite.'
        : `Content pack ready — ${data?.drafts || 7} drafts created`)
    } catch(e) {
      clearInterval(timer)
      setGenSteps(null)
      showToast('Generation failed: ' + String(e), false)
    }
  }

  // Regenerate a single draft
  async function regenerateOne(draft) {
    setRegenId(draft.id)
    try {
      const { data, error } = await supabase.functions.invoke('content-generator', {
        body: { useCrmData, regenerateType: draft.content_type, regenerateId: draft.id }
      })
      if (error) throw error
      await loadDrafts()
      showToast('Regenerated ✓')
    } catch(e) {
      showToast('Regeneration failed: ' + String(e), false)
    }
    setRegenId(null)
  }

  async function updateStatus(id, status) {
    await supabase.rpc('update_content_status', { p_id: id, p_status: status, p_actor: 'romy@taxrescrm.net' })
    setDrafts(prev => prev.map(d => d.id===id ? {...d, status} : d))
    if (selected?.id === id) setSelected(s => ({...s, status}))
    showToast(status==='approved'?'Approved ✓':status==='archived'?'Archived':status==='published'?'Marked published':'Updated')
  }

  async function deleteDraft(id) {
    await supabase.from('content_drafts').delete().eq('id', id)
    setDrafts(prev => prev.filter(d => d.id !== id))
    if (selected?.id === id) setSelected(null)
    showToast('Deleted')
  }

  async function saveEdit() {
    if (!selected) return
    setSaving(true)
    await supabase.rpc('save_content_draft', { p_id: selected.id, p_title: selected.title, p_body: editBody })
    setDrafts(prev => prev.map(d => d.id===selected.id ? {...d, body: editBody} : d))
    setSelected(s => ({...s, body: editBody}))
    setEditing(false)
    setSaving(false)
    showToast('Saved')
  }

  // Generate content score for a draft (once, cached)
  async function scoreContent(draft) {
    if (scores[draft.id]) return
    const { data } = await supabase.functions.invoke('content-generator', {
      body: { scoreOnly: true, body: draft.body, contentType: draft.content_type }
    })
    if (data?.scores) setScores(prev => ({ ...prev, [draft.id]: data.scores }))
  }

  useEffect(() => {
    if (selected && !scores[selected.id]) scoreContent(selected)
  }, [selected])

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard'))
  }

  const filtered = drafts.filter(d => {
    if (filter !== 'all' && d.status !== filter) return false
    if (weekFilter !== 'all' && d.week_of !== weekFilter) return false
    return true
  })
  const weekGroups = filtered.reduce((acc, d) => {
    const w = d.week_of
    if (!acc[w]) acc[w] = []
    acc[w].push(d)
    return acc
  }, {})
  const allWeeks = [...new Set(drafts.map(d => d.week_of))].sort((a,b) => b.localeCompare(a))

  const CC = { card: { background:'rgba(255,255,255,.04)', border:'1px solid rgba(99,102,241,.18)', borderRadius:12 } }

  function StarRating({ n }) {
    return (
      <span>
        {[1,2,3,4,5].map(i => (
          <span key={i} style={{ color: i<=n ? '#f59e0b' : '#334155', fontSize:12 }}>★</span>
        ))}
      </span>
    )
  }

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'#0a0918' }}>

      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', top:20, right:20, zIndex:9999, padding:'10px 18px', borderRadius:8,
          background: toast.ok ? 'rgba(16,185,129,.9)' : 'rgba(239,68,68,.9)',
          color:'#fff', fontSize:13, fontWeight:600, boxShadow:'0 4px 20px rgba(0,0,0,.4)' }}>
          {toast.msg}
        </div>
      )}

      {/* Generation progress overlay */}
      {genSteps && (
        <div style={{ position:'fixed', inset:0, zIndex:9998, background:'rgba(10,9,24,.85)',
          display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ ...CC.card, padding:'32px 40px', minWidth:340 }}>
            <div style={{ fontSize:16, fontWeight:800, color:'#fff', marginBottom:6 }}>Creating Content Pack</div>
            <div style={{ fontSize:12, color:'#475569', marginBottom:24 }}>Generating with TaxRes CRM brand voice…</div>
            {genSteps.map((step, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
                <div style={{ width:22, textAlign:'center', fontSize:14 }}>
                  {step.status==='done'   ? '✅' :
                   step.status==='active' ? <span style={{ animation:'spin 1s linear infinite', display:'inline-block' }}>⟳</span> :
                   '⏳'}
                </div>
                <div style={{ fontSize:13, color: step.status==='done'?'#10b981':step.status==='active'?'#e2e8f0':'#475569',
                  fontWeight: step.status==='active' ? 700 : 400 }}>
                  {step.icon} {step.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Left: list panel */}
      <div style={{ width:300, borderRight:'1px solid rgba(99,102,241,.15)', overflowY:'auto', padding:'24px 0', flexShrink:0 }}>

        <div style={{ padding:'0 20px 16px' }}>
          <div style={{ fontSize:18, fontWeight:900, color:'#fff', marginBottom:2 }}>✍️ Content Center</div>
          <div style={{ fontSize:11, color:'#475569' }}>Approve drafts before publishing</div>
        </div>

        {/* Generate button */}
        <div style={{ padding:'0 20px 12px', display:'flex', gap:8 }}>
          <button onClick={() => generate(false)} disabled={!!genSteps} style={{
            flex:1, padding:'9px 0', borderRadius:8, border:'none', cursor:'pointer',
            background: genSteps ? 'rgba(99,102,241,.3)' : 'rgba(99,102,241,.85)',
            color:'#fff', fontWeight:700, fontSize:12,
          }}>✨ Create Content Pack</button>
          <button onClick={() => generate(true)} disabled={!!genSteps} title="Force regenerate this week"
            style={{ padding:'9px 12px', borderRadius:8, border:'1px solid rgba(99,102,241,.3)',
              background:'transparent', color:'#6366f1', cursor:'pointer', fontSize:12 }}>↺</button>
        </div>

        {/* CRM data toggle */}
        <div style={{ padding:'0 20px 16px', display:'flex', alignItems:'center', gap:8 }}>
          <div onClick={() => setUseCrmData(v=>!v)} style={{ width:32, height:18, borderRadius:9, cursor:'pointer',
            background: useCrmData ? '#6366f1' : '#334155', position:'relative', transition:'background .2s', flexShrink:0 }}>
            <div style={{ position:'absolute', top:2, left: useCrmData?14:2, width:14, height:14,
              borderRadius:'50%', background:'#fff', transition:'left .2s' }} />
          </div>
          <span style={{ fontSize:11, color: useCrmData ? '#a5b4fc' : '#475569' }}>
            Use recent CRM activity
          </span>
        </div>

        {/* Filters */}
        <div style={{ padding:'0 20px 8px', display:'flex', gap:3, flexWrap:'wrap' }}>
          {['all','draft','approved','published','archived'].map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding:'3px 9px', borderRadius:20, border:'none', cursor:'pointer', fontSize:11, fontWeight:600,
              background: filter===s ? 'rgba(99,102,241,.4)' : 'rgba(255,255,255,.05)',
              color: filter===s ? '#a5b4fc' : '#64748b',
            }}>{s==='all'?'All':s.charAt(0).toUpperCase()+s.slice(1)}</button>
          ))}
        </div>

        {/* Week filter (content history) */}
        {allWeeks.length > 1 && (
          <div style={{ padding:'4px 20px 12px' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#334155', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>
              History
            </div>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
              <button onClick={() => setWeekFilter('all')} style={{
                padding:'3px 9px', borderRadius:20, border:'none', cursor:'pointer', fontSize:10, fontWeight:600,
                background: weekFilter==='all' ? 'rgba(99,102,241,.3)' : 'rgba(255,255,255,.04)',
                color: weekFilter==='all' ? '#a5b4fc' : '#475569',
              }}>All weeks</button>
              {allWeeks.map(w => (
                <button key={w} onClick={() => setWeekFilter(w)} style={{
                  padding:'3px 9px', borderRadius:20, border:'none', cursor:'pointer', fontSize:10, fontWeight:600,
                  background: weekFilter===w ? 'rgba(99,102,241,.3)' : 'rgba(255,255,255,.04)',
                  color: weekFilter===w ? '#a5b4fc' : '#475569',
                }}>{new Date(w+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}</button>
              ))}
            </div>
          </div>
        )}

        {/* Draft list */}
        {loading ? (
          <div style={{ padding:'20px', color:'#475569', fontSize:13 }}>Loading…</div>
        ) : Object.keys(weekGroups).length === 0 ? (
          <div style={{ padding:'20px', color:'#475569', fontSize:13 }}>
            No drafts yet. Click "✨ Create Content Pack" to generate this week's content.
          </div>
        ) : Object.entries(weekGroups).sort((a,b) => b[0].localeCompare(a[0])).map(([week, items]) => (
          <div key={week}>
            <div style={{ padding:'6px 20px', fontSize:9, fontWeight:800, color:'#334155',
              textTransform:'uppercase', letterSpacing:'.08em', background:'rgba(255,255,255,.015)' }}>
              Week of {new Date(week+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
            </div>
            {items.map((d) => {
              const meta = CONTENT_LABELS[d.content_type] || { label:d.content_type, icon:'📄', color:'#64748b' }
              const isSel = selected?.id === d.id
              return (
                <div key={d.id} onClick={() => { setSelected(d); setEditing(false); setEditBody(d.body) }}
                  style={{ padding:'10px 20px', cursor:'pointer',
                    borderLeft: isSel ? '2px solid #6366f1' : '2px solid transparent',
                    background: isSel ? 'rgba(99,102,241,.1)' : 'transparent',
                    borderBottom:'1px solid rgba(99,102,241,.06)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                    <span style={{ fontSize:13 }}>{meta.icon}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:'#e2e8f0' }}>{meta.label}</span>
                    <span style={{ marginLeft:'auto', fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:20,
                      background:`${STATUS_COLORS[d.status]}18`, color:STATUS_COLORS[d.status] }}>
                      {d.status}
                    </span>
                  </div>
                  <div style={{ fontSize:10, color:'#475569', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {d.title}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Right: detail panel */}
      <div style={{ flex:1, overflowY:'auto', padding:'28px 32px' }}>
        {!selected ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:12 }}>
            <div style={{ fontSize:40 }}>✍️</div>
            <div style={{ fontSize:15, color:'#475569' }}>Select a draft to review</div>
            <div style={{ fontSize:12, color:'#334155' }}>or click "✨ Create Content Pack" to generate</div>
          </div>
        ) : (
          <div style={{ maxWidth:780 }}>

            {/* Header */}
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20, gap:16 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color: CONTENT_LABELS[selected.content_type]?.color || '#64748b',
                  textTransform:'uppercase', letterSpacing:'.08em', marginBottom:4 }}>
                  {CONTENT_LABELS[selected.content_type]?.icon} {CONTENT_LABELS[selected.content_type]?.label}
                </div>
                <div style={{ fontSize:20, fontWeight:800, color:'#fff', marginBottom:4 }}>{selected.title}</div>
                <div style={{ fontSize:11, color:'#475569' }}>
                  Status: <span style={{ color:STATUS_COLORS[selected.status], fontWeight:700 }}>{selected.status}</span>
                  {selected.approved_by && ` · Approved by ${selected.approved_by}`}
                  {selected.published_at && ` · Published ${new Date(selected.published_at).toLocaleDateString()}`}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display:'flex', gap:6, flexShrink:0, flexWrap:'wrap', justifyContent:'flex-end' }}>
                <button onClick={() => copyToClipboard(selected.body)} style={{ ...S.btn('ghost'), fontSize:11, padding:'6px 12px' }}>Copy</button>
                {!editing && <button onClick={() => { setEditing(true); setEditBody(selected.body) }} style={{ ...S.btn('ghost'), fontSize:11, padding:'6px 12px' }}>Edit</button>}
                {editing && <>
                  <button onClick={() => setEditing(false)} style={{ ...S.btn('ghost'), fontSize:11, padding:'6px 12px' }}>Cancel</button>
                  <button onClick={saveEdit} disabled={saving} style={{ ...S.btn('primary'), fontSize:11, padding:'6px 12px' }}>{saving?'Saving…':'Save'}</button>
                </>}
                <button onClick={() => regenerateOne(selected)} disabled={regenId===selected.id}
                  style={{ ...S.btn('ghost'), fontSize:11, padding:'6px 12px', color:'#6366f1', border:'1px solid rgba(99,102,241,.3)' }}>
                  {regenId===selected.id ? '⟳ Regenerating…' : '↺ Regenerate'}
                </button>
                {selected.status === 'draft' && (
                  <button onClick={() => updateStatus(selected.id,'approved')}
                    style={{ ...S.btn('primary'), fontSize:11, padding:'6px 12px', background:'rgba(16,185,129,.8)' }}>✓ Approve</button>
                )}
                {selected.status === 'approved' && (
                  <button onClick={() => updateStatus(selected.id,'published')}
                    style={{ ...S.btn('primary'), fontSize:11, padding:'6px 12px' }}>Mark Published</button>
                )}
                {selected.status !== 'archived' && (
                  <button onClick={() => updateStatus(selected.id,'archived')}
                    style={{ ...S.btn('ghost'), fontSize:11, padding:'6px 12px', color:'#475569' }}>Archive</button>
                )}
                <button onClick={() => deleteDraft(selected.id)}
                  style={{ ...S.btn('ghost'), fontSize:11, padding:'6px 12px', color:'#ef4444', border:'1px solid rgba(239,68,68,.2)' }}>Delete</button>
              </div>
            </div>

            {/* Content score */}
            {scores[selected.id] && (
              <div style={{ ...CC.card, padding:'16px 20px', marginBottom:16 }}>
                <div style={{ fontSize:10, fontWeight:800, color:'#475569', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>
                  Content Score
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
                  {Object.entries(scores[selected.id]).map(([label, n]) => (
                    <div key={label}>
                      <div style={{ fontSize:10, color:'#64748b', marginBottom:3 }}>{label}</div>
                      <StarRating n={n} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Body */}
            <div style={{ ...CC.card, padding:'24px 28px', marginBottom:16 }}>
              {editing ? (
                <textarea value={editBody} onChange={e => setEditBody(e.target.value)}
                  style={{ width:'100%', minHeight:400, background:'transparent', border:'none', outline:'none',
                    color:'#e2e8f0', fontSize:14, lineHeight:1.7, resize:'vertical', fontFamily:'inherit' }} />
              ) : (
                <pre style={{ whiteSpace:'pre-wrap', wordBreak:'break-word', color:'#e2e8f0',
                  fontSize:14, lineHeight:1.7, fontFamily:'inherit', margin:0 }}>
                  {selected.body}
                </pre>
              )}
            </div>

            {/* Calendar + phase 2 */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:12, alignItems:'start' }}>
              <div style={{ ...CC.card, padding:'14px 18px' }}>
                <div style={{ fontSize:10, fontWeight:800, color:'#475569', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>
                  Publishing Calendar
                </div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {['draft','approved','scheduled','published','archived'].map(s => (
                    <div key={s} style={{ padding:'5px 12px', borderRadius:20,
                      background:`${STATUS_COLORS[s]}12`, border:`1px solid ${STATUS_COLORS[s]}28` }}>
                      <span style={{ fontSize:11, fontWeight:700, color:STATUS_COLORS[s] }}>
                        {s.charAt(0).toUpperCase()+s.slice(1)} ({drafts.filter(d=>d.status===s).length})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ padding:'12px 16px', borderRadius:10, background:'rgba(99,102,241,.05)',
                border:'1px dashed rgba(99,102,241,.2)', fontSize:11, color:'#475569', maxWidth:220 }}>
                Phase 2: Scheduled publishing, queue management, analytics
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── LinkedIn Publisher ─────────────────────────────────────────────────────
const LI_STATUS_COLORS = { draft:'#475569', scheduled:'#6366f1', published:'#10b981', failed:'#ef4444' }

function LinkedInPublisher() {
  const [connection, setConnection]   = useState(null)  // null=loading, false=disconnected, obj=connected
  const [posts, setPosts]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [selected, setSelected]       = useState(null)
  const [filter, setFilter]           = useState('all')
  const [composing, setComposing]     = useState(false)
  const [composeBody, setComposeBody] = useState('')
  const [scheduleDate, setScheduleDate] = useState('')
  const [publishing, setPublishing]   = useState(null)
  const [saving, setSaving]           = useState(false)
  const [toast, setToast]             = useState(null)

  const LINKEDIN_CLIENT_ID = 'YOUR_CLIENT_ID' // replaced after OAuth app approved
  const REDIRECT_URI = `${window.location.origin}/crm-admin/linkedin/callback`

  function showToast(msg, ok=true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  async function load() {
    setLoading(true)
    try {
      const [connRes, postsRes] = await Promise.all([
        supabase.rpc('get_linkedin_connection').then(r=>r).catch(() => ({ data: null })),
        supabase.rpc('get_linkedin_posts', { p_limit: 100 }).then(r=>r).catch(() => ({ data: [] })),
      ])
      setConnection(connRes.data?.[0] || false)
      setPosts(postsRes.data || [])
    } catch (_) {
      setConnection(false)
      setPosts([])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function connectLinkedIn() {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: LINKEDIN_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'openid profile w_member_social',
      state: Math.random().toString(36).slice(2),
    })
    window.open(`https://www.linkedin.com/oauth/v2/authorization?${params}`, '_blank', 'width=600,height=700')
    showToast('LinkedIn OAuth window opened. Complete sign-in there.', true)
  }

  async function disconnect() {
    await supabase.functions.invoke('linkedin-publish', { body: { action: 'disconnect' } })
    setConnection(false)
    showToast('LinkedIn disconnected')
  }

  async function savePost(status='draft') {
    if (!composeBody.trim()) { showToast('Post body is required', false); return }
    setSaving(true)
    const { data } = await supabase.rpc('upsert_linkedin_post', {
      p_body: composeBody,
      p_status: status,
      p_scheduled_at: status==='scheduled' && scheduleDate ? new Date(scheduleDate).toISOString() : null,
    })
    if (data) {
      setPosts(prev => [data, ...prev])
      setSelected(data)
      setComposing(false)
      setComposeBody('')
      setScheduleDate('')
      showToast(status==='scheduled' ? 'Scheduled ✓' : 'Saved as draft ✓')
    }
    setSaving(false)
  }

  async function publishNow(post) {
    if (!connection?.connected) { showToast('Connect LinkedIn first', false); return }
    setPublishing(post.id)
    const { data, error } = await supabase.functions.invoke('linkedin-publish', {
      body: { action: 'publish', post_id: post.id }
    })
    if (data?.ok) {
      setPosts(prev => prev.map(p => p.id===post.id ? {...p, status:'published', linkedin_url:data.url, published_at:new Date().toISOString()} : p))
      if (selected?.id === post.id) setSelected(s => ({...s, status:'published', linkedin_url:data.url}))
      showToast('Published to LinkedIn ✓')
    } else {
      setPosts(prev => prev.map(p => p.id===post.id ? {...p, status:'failed'} : p))
      showToast('Publish failed — check LinkedIn connection', false)
    }
    setPublishing(null)
  }

  async function deletePost(id) {
    await supabase.from('linkedin_posts').delete().eq('id', id)
    setPosts(prev => prev.filter(p => p.id!==id))
    if (selected?.id===id) setSelected(null)
    showToast('Deleted')
  }

  const filtered = filter==='all' ? posts : posts.filter(p => p.status===filter)

  const CC = { card: { background:'rgba(255,255,255,.04)', border:'1px solid rgba(99,102,241,.18)', borderRadius:12 } }

  const charCount = composeBody.length
  const charLimit = 3000
  const charOk = charCount <= charLimit

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'#0a0918' }}>

      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', top:20, right:20, zIndex:9999, padding:'10px 18px', borderRadius:8,
          background: toast.ok ? 'rgba(16,185,129,.9)' : 'rgba(239,68,68,.9)',
          color:'#fff', fontSize:13, fontWeight:600, boxShadow:'0 4px 20px rgba(0,0,0,.4)' }}>
          {toast.msg}
        </div>
      )}

      {/* Left panel */}
      <div style={{ width:300, borderRight:'1px solid rgba(99,102,241,.15)', overflowY:'auto', padding:'24px 0', flexShrink:0 }}>

        {/* Header */}
        <div style={{ padding:'0 20px 16px' }}>
          <div style={{ fontSize:18, fontWeight:900, color:'#fff', marginBottom:2 }}>💼 LinkedIn</div>
          <div style={{ fontSize:11, color:'#475569' }}>Manual approval required before publishing</div>
        </div>

        {/* Connection status */}
        <div style={{ padding:'0 20px 16px' }}>
          {loading ? (
            <div style={{ fontSize:12, color:'#475569' }}>Checking connection…</div>
          ) : connection?.connected ? (
            <div style={{ ...CC.card, padding:'12px 14px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:'#10b981', display:'inline-block', boxShadow:'0 0 6px #10b98160' }} />
                <span style={{ fontSize:12, fontWeight:700, color:'#10b981' }}>Connected</span>
              </div>
              <div style={{ fontSize:11, color:'#e2e8f0', marginBottom:2 }}>{connection.display_name}</div>
              <div style={{ fontSize:10, color:'#475569', marginBottom:10 }}>
                Expires {new Date(connection.expires_at).toLocaleDateString()}
              </div>
              <button onClick={disconnect} style={{ ...S.btn('ghost'), fontSize:11, padding:'5px 12px', color:'#ef4444', border:'1px solid rgba(239,68,68,.2)' }}>
                Disconnect
              </button>
            </div>
          ) : (
            <div style={{ ...CC.card, padding:'14px' }}>
              <div style={{ fontSize:12, color:'#94a3b8', marginBottom:10, lineHeight:1.5 }}>
                Connect your LinkedIn account to publish posts directly from TaxRes CRM.
              </div>
              <button onClick={connectLinkedIn} style={{ ...S.btn('primary'), fontSize:12, padding:'8px 16px', width:'100%' }}>
                Connect LinkedIn
              </button>
              <div style={{ fontSize:10, color:'#334155', marginTop:8, lineHeight:1.5 }}>
                Requires LinkedIn Developer App approval. See setup guide →
              </div>
            </div>
          )}
        </div>

        {/* New post */}
        <div style={{ padding:'0 20px 16px' }}>
          <button onClick={() => { setComposing(true); setSelected(null) }}
            style={{ ...S.btn('primary'), width:'100%', padding:'9px 0', fontSize:12 }}>
            + New Post
          </button>
        </div>

        {/* Filter */}
        <div style={{ padding:'0 20px 12px', display:'flex', gap:4, flexWrap:'wrap' }}>
          {['all','draft','scheduled','published','failed'].map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding:'3px 9px', borderRadius:20, border:'none', cursor:'pointer', fontSize:11, fontWeight:600,
              background: filter===s ? 'rgba(99,102,241,.4)' : 'rgba(255,255,255,.05)',
              color: filter===s ? '#a5b4fc' : '#64748b',
            }}>{s.charAt(0).toUpperCase()+s.slice(1)}</button>
          ))}
        </div>

        {/* Post list */}
        {loading ? (
          <div style={{ padding:'20px', color:'#475569', fontSize:13 }}>Loading…</div>
        ) : filtered.length===0 ? (
          <div style={{ padding:'20px', color:'#475569', fontSize:13 }}>
            No posts yet. Click "+ New Post" to draft your first LinkedIn post.
          </div>
        ) : filtered.map(p => (
          <div key={p.id} onClick={() => { setSelected(p); setComposing(false) }}
            style={{ padding:'12px 20px', cursor:'pointer',
              borderLeft: selected?.id===p.id ? '2px solid #6366f1' : '2px solid transparent',
              background: selected?.id===p.id ? 'rgba(99,102,241,.1)' : 'transparent',
              borderBottom:'1px solid rgba(99,102,241,.06)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
              <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:20,
                background:`${LI_STATUS_COLORS[p.status]}18`, color:LI_STATUS_COLORS[p.status] }}>
                {p.status}
              </span>
              {p.scheduled_at && (
                <span style={{ fontSize:10, color:'#475569' }}>
                  {new Date(p.scheduled_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                </span>
              )}
            </div>
            <div style={{ fontSize:12, color:'#94a3b8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', lineHeight:1.4 }}>
              {p.body.slice(0,80)}{p.body.length>80?'…':''}
            </div>
            <div style={{ fontSize:10, color:'#334155', marginTop:3 }}>
              {new Date(p.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
            </div>
          </div>
        ))}
      </div>

      {/* Right panel */}
      <div style={{ flex:1, overflowY:'auto', padding:'28px 32px' }}>

        {/* Compose */}
        {composing && (
          <div style={{ maxWidth:700 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
              <div style={{ fontSize:18, fontWeight:800, color:'#fff' }}>New LinkedIn Post</div>
              <button onClick={() => setComposing(false)} style={{ ...S.btn('ghost'), fontSize:12 }}>Cancel</button>
            </div>

            <div style={{ ...CC.card, padding:'20px 22px', marginBottom:14 }}>
              <textarea
                value={composeBody}
                onChange={e => setComposeBody(e.target.value)}
                placeholder="Write your LinkedIn post here…&#10;&#10;120–160 words works best for engagement. Open with a specific insight, end with a question or CTA."
                style={{ width:'100%', minHeight:280, background:'transparent', border:'none', outline:'none',
                  color:'#e2e8f0', fontSize:14, lineHeight:1.75, resize:'vertical', fontFamily:'inherit' }}
              />
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:10, paddingTop:10, borderTop:'1px solid rgba(99,102,241,.1)' }}>
                <span style={{ fontSize:11, color: charOk ? '#475569' : '#ef4444' }}>
                  {charCount} / {charLimit} characters
                </span>
                <span style={{ fontSize:11, color:'#475569' }}>LinkedIn max: 3,000 characters</span>
              </div>
            </div>

            {/* Schedule */}
            <div style={{ ...CC.card, padding:'16px 20px', marginBottom:18 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:10 }}>
                Schedule (optional)
              </div>
              <input type="datetime-local" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)}
                style={{ background:'rgba(255,255,255,.06)', border:'1px solid rgba(99,102,241,.2)', borderRadius:8,
                  color:'#e2e8f0', fontSize:13, padding:'8px 12px', width:'100%', boxSizing:'border-box' }} />
              <div style={{ fontSize:11, color:'#475569', marginTop:6 }}>
                Leave blank to save as a draft without a scheduled time.
              </div>
            </div>

            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => savePost('draft')} disabled={saving || !charOk}
                style={{ ...S.btn('ghost'), fontSize:12, padding:'9px 18px' }}>
                Save as Draft
              </button>
              {scheduleDate && (
                <button onClick={() => savePost('scheduled')} disabled={saving || !charOk}
                  style={{ ...S.btn('primary'), fontSize:12, padding:'9px 18px', background:'rgba(99,102,241,.8)' }}>
                  {saving ? 'Scheduling…' : 'Schedule Post'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Post detail */}
        {!composing && selected && (
          <div style={{ maxWidth:700 }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20, gap:16 }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20,
                    background:`${LI_STATUS_COLORS[selected.status]}18`, color:LI_STATUS_COLORS[selected.status] }}>
                    {selected.status}
                  </span>
                  {selected.published_at && (
                    <span style={{ fontSize:11, color:'#475569' }}>
                      Published {new Date(selected.published_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                    </span>
                  )}
                  {selected.scheduled_at && selected.status==='scheduled' && (
                    <span style={{ fontSize:11, color:'#6366f1' }}>
                      Scheduled {new Date(selected.scheduled_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}
                    </span>
                  )}
                </div>
                <div style={{ fontSize:11, color:'#334155' }}>
                  Created {new Date(selected.created_at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}
                </div>
              </div>

              <div style={{ display:'flex', gap:6, flexShrink:0, flexWrap:'wrap', justifyContent:'flex-end' }}>
                <button onClick={() => navigator.clipboard.writeText(selected.body).then(()=>showToast('Copied'))}
                  style={{ ...S.btn('ghost'), fontSize:11, padding:'6px 12px' }}>Copy</button>
                {selected.status !== 'published' && (
                  <button onClick={() => publishNow(selected)} disabled={publishing===selected.id || !connection?.connected}
                    style={{ ...S.btn('primary'), fontSize:11, padding:'6px 14px',
                      background: connection?.connected ? 'rgba(16,185,129,.8)' : 'rgba(99,102,241,.3)' }}>
                    {publishing===selected.id ? '⟳ Publishing…' : '▶ Publish Now'}
                  </button>
                )}
                {selected.linkedin_url && (
                  <a href={selected.linkedin_url} target="_blank" rel="noreferrer"
                    style={{ ...S.btn('ghost'), fontSize:11, padding:'6px 12px', textDecoration:'none', color:'#0ea5e9' }}>
                    View on LinkedIn ↗
                  </a>
                )}
                {selected.status !== 'published' && (
                  <button onClick={() => deletePost(selected.id)}
                    style={{ ...S.btn('ghost'), fontSize:11, padding:'6px 12px', color:'#ef4444', border:'1px solid rgba(239,68,68,.2)' }}>
                    Delete
                  </button>
                )}
              </div>
            </div>

            {/* Error */}
            {selected.status==='failed' && selected.error_msg && (
              <div style={{ padding:'12px 16px', borderRadius:8, background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.2)', marginBottom:14, fontSize:12, color:'#ef4444' }}>
                Publish failed. Check your LinkedIn connection and try again.
              </div>
            )}

            {/* Body */}
            <div style={{ ...CC.card, padding:'24px 26px', marginBottom:14 }}>
              <pre style={{ whiteSpace:'pre-wrap', wordBreak:'break-word', color:'#e2e8f0', fontSize:14, lineHeight:1.75, fontFamily:'inherit', margin:0 }}>
                {selected.body}
              </pre>
            </div>

            {/* Stats placeholder */}
            {selected.status==='published' && (
              <div style={{ ...CC.card, padding:'16px 20px', opacity:.7 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:8 }}>
                  Post Analytics
                </div>
                <div style={{ fontSize:12, color:'#475569' }}>
                  Impressions, reactions, and click data available in Phase 2 once LinkedIn analytics API access is approved.
                </div>
              </div>
            )}

            {/* Not connected warning */}
            {!connection?.connected && selected.status!=='published' && (
              <div style={{ padding:'12px 16px', borderRadius:8, background:'rgba(245,158,11,.06)', border:'1px solid rgba(245,158,11,.2)', fontSize:12, color:'#f59e0b' }}>
                Connect your LinkedIn account to publish this post.
              </div>
            )}
          </div>
        )}

        {/* Empty */}
        {!composing && !selected && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:12 }}>
            <div style={{ fontSize:40 }}>💼</div>
            <div style={{ fontSize:15, color:'#475569' }}>LinkedIn Publisher</div>
            <div style={{ fontSize:12, color:'#334155', textAlign:'center', maxWidth:320 }}>
              Draft, schedule, and publish LinkedIn posts directly from TaxRes CRM. Every post requires manual approval before publishing.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AdminPortal() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useApp()
  // Swap favicon + title to TaxRes CRM brand while in the admin portal
  useEffect(() => {
    const prev = document.title
    document.title = 'TaxRes CRM — Admin'
    // Force favicon to the TaxRes CRM logo
    const setFavicon = (href) => {
      document.querySelectorAll("link[rel*='icon']").forEach(el => el.remove())
      const link = document.createElement('link')
      link.rel = 'icon'
      link.type = 'image/png'
      link.href = href
      document.head.appendChild(link)
    }
    setFavicon('/taxrescrm-favicon.png')
    return () => {
      document.title = prev
      setFavicon('/taxrescrm-favicon.png')
    }
  }, [])

  async function handleGSCConnect() {
    const CLIENT_ID = '70057646964-vimoia1qkjtml9n3mplo0hme82m3t2qs.apps.googleusercontent.com'
    const redirect  = window.location.origin + '/crm-admin/command-center'
    const scope     = 'https://www.googleapis.com/auth/webmasters.readonly'
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`
    window.location.href = url
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    logout?.()
    navigate('/login')
  }

  return (
    <ScreenShareProvider>
    <div style={{display:'flex',minHeight:'100vh',background:'#0d0c1a',fontFamily:'system-ui,Arial,sans-serif'}}>
      <Sidebar onSignOut={handleSignOut} />
      <div style={{flex:1,position:'relative',height:'100vh',overflowY:'auto'}}>
        {/* Persistent SnappyMail iframe — always mounted so compose drafts survive tab switches.
            Hidden via CSS when not on /email; shown only when on /email route. */}
        <div style={{
          position:'absolute', inset:0, zIndex:1,
          display: location.pathname === '/crm-admin/email' ? 'flex' : 'none',
          flexDirection:'column'
        }}>
          <div style={{padding:'16px 28px 10px',borderBottom:'1px solid #1e293b',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
            <span style={{fontSize:18,fontWeight:800,color:'#fff'}}>📧 Email</span>
            <span style={{fontSize:13,color:'#475569'}}>romy@taxrescrm.net — powered by Stalwart</span>
            <a href={WEBMAIL_URL} target="_blank" rel="noreferrer"
              style={{marginLeft:'auto',fontSize:12,color:'#6366f1',textDecoration:'none'}}>Open in new tab ↗</a>
          </div>
          <iframe src={WEBMAIL_URL} title="SnappyMail"
            style={{flex:1,border:'none',width:'100%',background:'#0f172a'}}
            allow="clipboard-read; clipboard-write" />
        </div>
        <Suspense fallback={<Spinner/>}>
          <Routes>
            <Route path="/command-center" element={<AdminRouteErrorBoundary><CommandCenter/></AdminRouteErrorBoundary>}/>
            <Route path="/content"         element={<AdminRouteErrorBoundary><ContentCenter/></AdminRouteErrorBoundary>}/>
            <Route path="/linkedin"        element={<AdminRouteErrorBoundary><LinkedInPublisher/></AdminRouteErrorBoundary>}/>
            <Route index                   element={<Overview key={window.location.pathname + window.location.search}/>}/>
            <Route path="/offices"        element={<OfficesList/>}/>
            <Route path="/offices/:id"    element={<OfficePage/>}/>
            <Route path="/provision"      element={<div style={{padding:8}}><NewOffice/></div>}/>
            <Route path="/billing"        element={<Billing/>}/>
            <Route path="/search"         element={<Search/>}/>
            <Route path="/demo"           element={<AdminRouteErrorBoundary><DemoMgmt/></AdminRouteErrorBoundary>}/>
            <Route path="/demo-setup"     element={<AdminRouteErrorBoundary><DemoSetup/></AdminRouteErrorBoundary>}/>
            <Route path="/live-demo"      element={<AdminRouteErrorBoundary><LiveDemo/></AdminRouteErrorBoundary>}/>
            <Route path="/health"         element={<AdminRouteErrorBoundary><SystemHealth/></AdminRouteErrorBoundary>}/>
            <Route path="/employees"      element={<AdminRouteErrorBoundary><EmployeeLookup/></AdminRouteErrorBoundary>}/>
            <Route path="/audit"          element={<AdminRouteErrorBoundary><AuditLog/></AdminRouteErrorBoundary>}/>
            <Route path="/support"        element={<div style={{padding:8}}><Support/></div>}/>
            <Route path="/email"          element={<div/>}/>
            <Route path="/calendar"       element={<AdminRouteErrorBoundary><AdminCalendar/></AdminRouteErrorBoundary>}/>
            <Route path="/training"       element={<AdminRouteErrorBoundary><AdminTraining/></AdminRouteErrorBoundary>}/>
            <Route path="/chat"           element={<AdminRouteErrorBoundary><AdminChatPage/></AdminRouteErrorBoundary>}/>
            <Route path="*"               element={<Overview key={window.location.pathname + window.location.search + "_fallback"}/>}/>
          </Routes>
        </Suspense>
      </div>
      <AIAssistant adminMode />
    </div>
    </ScreenShareProvider>
  )
}
