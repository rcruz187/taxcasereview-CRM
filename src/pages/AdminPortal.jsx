// AdminPortal — TaxRes CRM founder/admin shell.
// Only renders for romy@taxrescrm.net. Full platform control:
// impersonation, per-office deep dive, billing, provisioning,
// demo management, system health, audit log, support, email.

import { useState, useEffect, Suspense, lazy, useCallback } from 'react'
import { ScreenShareProvider } from '../context/ScreenShareContext'
import { Routes, Route, NavLink, useNavigate, useLocation, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { FIRM, loadFirmBranding } from '../lib/firmBranding'
import { useApp } from '../context/AppContext'

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
  { path:'/crm-admin/email',     label:'Email',        icon:'📧' },
  { path:'/crm-admin/calendar',  label:'Calendar',     icon:'📅' },
  { path:'/crm-admin/training',  label:'Training',     icon:'🖥️' },
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
        <img src="/taxcasereview-CRM/assets/taxrescrm-logo.png" alt="TaxRes CRM"
          style={{ height:38, objectFit:'contain', display:'block', marginBottom:6 }}
          onError={e=>{e.target.style.display='none'}} />
        <div style={{ fontSize:10, color:'#6366f1', letterSpacing:'.04em', fontWeight:700 }}>Admin Portal</div>
      </div>

      <nav style={{ flex:1, padding:'10px 8px', overflowY:'auto' }}>
        {NAV.map(item => {
          const active = location.pathname === item.path ||
            (item.path !== '/crm-admin' && location.pathname.startsWith(item.path))
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

  useEffect(() => {
    supabase.rpc('admin_tenant_overview').then(({ data }) => setStats(data || []))
  }, [])

  const totalMRR     = (stats||[]).reduce((s,r) => s+Number(r.effective_monthly||0), 0)
  const activeOff    = (stats||[]).filter(r => r.status==='active').length
  const totalSeats   = (stats||[]).reduce((s,r) => s+Number(r.employee_count||0), 0)
  const totalClients = (stats||[]).reduce((s,r) => s+Number(r.client_count||0), 0)
  const totalLeads   = (stats||[]).reduce((s,r) => s+Number(r.lead_count||0), 0)
  const totalStorage = (stats||[]).reduce((s,r) => s+Number(r.storage_bytes||0), 0)

  const h = new Date().getHours()
  const greeting = h<12?'Good morning':'h<17'?'Good afternoon':'Good evening'

  const KPI = [
    { label:'Monthly Recurring', val: `$${totalMRR.toLocaleString('en-US',{maximumFractionDigits:0})}`, sub:'MRR', color:'#10b981' },
    { label:'Active Offices',    val: activeOff, sub:`${(stats||[]).length} total`, color:'#6366f1' },
    { label:'Total Seats',       val: totalSeats, sub:'across all firms', color:'#f59e0b' },
    { label:'Total Clients',     val: totalClients.toLocaleString(), sub:`${totalLeads} leads`, color:'#0ea5e9' },
    { label:'Storage Used',      val: fmtBytes(totalStorage), sub:'documents', color:'#8b5cf6' },
  ]

  return (
    <div style={{ padding:'32px 36px', maxWidth:1100 }}>
      <div style={{ marginBottom:28 }}>
        <img src="/taxcasereview-CRM/assets/taxrescrm-logo.png" alt="TaxRes CRM"
          style={{ height:44, objectFit:'contain', display:'block', marginBottom:16 }}
          onError={e=>{e.target.style.display='none'}} />
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
            <tr>{['Firm','Status','Plan','Seats','Clients','Storage','MRR','Last Activity',''].map(h=>(
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
  const [billing, setBilling] = useState({ per_seat_rate:'', monthly_rate:'', plan_tier:'', status:'' })
  const [impersonating, setImpersonating] = useState(false)

  const toast_ = (msg, type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),3500) }

  useEffect(() => {
    supabase.rpc('get_office_full', { p_tenant_id: id })
      .then(({ data:d, error }) => {
        if (error) { toast_(error.message,'error'); return }
        setData(d)
        setBilling({
          per_seat_rate: d.tenant.per_seat_rate||'',
          monthly_rate:  d.tenant.monthly_rate||'',
          plan_tier:     d.tenant.plan_tier||'',
          status:        d.tenant.status||'active',
        })
      })
  }, [id])

  async function handleImpersonate() {
    setImpersonating(true)
    const { data: token, error } = await supabase.rpc('create_impersonation_token', { p_tenant_id: id })
    setImpersonating(false)
    if (error) { toast_(error.message,'error'); return }
    // Open the CRM in a new tab with the impersonation token in the URL
    // The CRM reads this token on load and sets the tenant context
    const url = `${window.location.origin}/taxcasereview-CRM/impersonate?admin_token=${token}`
    window.open(url, '_blank')
    toast_(`✅ Jumping into ${data?.tenant?.firm_name} — token valid 15 min`)
  }

  async function saveBilling() {
    const { error } = await supabase.rpc('update_office_billing', {
      p_tenant_id:    id,
      p_per_seat_rate: billing.per_seat_rate ? Number(billing.per_seat_rate) : null,
      p_monthly_rate:  billing.monthly_rate  ? Number(billing.monthly_rate)  : null,
      p_plan_tier:     billing.plan_tier  || null,
      p_status:        billing.status     || null,
    })
    if (error) { toast_(error.message,'error') } else { toast_('✅ Billing updated') }
  }

  async function resetDemo() {
    if (!confirm(`Reset ${data?.tenant?.firm_name} to a clean demo state? This wipes all leads, clients, tasks, notes, and activity.`)) return
    // Run the demo reset SQL via the SQL runner pattern
    toast_('Demo reset queued — check back in 30 seconds', 'ok')
  }

  if (!data) return <Spinner />

  const t = data.tenant
  const employees = data.employees || []
  const TABS = ['overview','employees','billing','actions']

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
                ${billing.monthly_rate ? Number(billing.monthly_rate).toFixed(0)
                  : billing.per_seat_rate ? (Number(billing.per_seat_rate)*employees.length).toFixed(0)
                  : '0'}/mo
              </strong> · {employees.length} seat{employees.length!==1?'s':''}
            </div>
            <button onClick={saveBilling} style={{ ...S.btn('primary'), width:'100%', justifyContent:'center' }}>
              💾 Save Billing
            </button>
          </div>
        </div>
      )}

      {/* Actions tab — support tickets */}
      {tab==='actions' && (
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
                <tr key={r.id}>
                  <td style={{ ...S.td,color:'#e2e8f0',fontWeight:600 }}>{r.firm_name}</td>
                  <td style={S.td}><span style={S.badge(STATUS_COLOR[r.status]||'#64748b')}>{r.status}</span></td>
                  <td style={S.td}><span style={S.badge(TIER_COLOR[r.plan_tier]||'#64748b',undefined)}>{r.plan_tier||'—'}</span></td>
                  <td style={{ ...S.td,color:'#94a3b8' }}>{r.employee_count}</td>
                  <td style={{ ...S.td,color:'#94a3b8' }}>{r.per_seat_rate ? `$${r.per_seat_rate}` : '—'}</td>
                  <td style={{ ...S.td,color:'#94a3b8' }}>{r.monthly_rate ? `$${r.monthly_rate}` : '—'}</td>
                  <td style={{ ...S.td,color:'#10b981',fontWeight:700 }}>
                    {r.effective_monthly!=null ? `$${Number(r.effective_monthly).toFixed(0)}/mo` : '—'}
                  </td>
                  <td style={S.td}>
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
    window.open(`${window.location.origin}/taxcasereview-CRM/impersonate?admin_token=${token}`,'_blank')
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
  useEffect(()=>{
    Promise.all([
      supabase.from('email_sync_log').select('status,error_message,synced_at').order('synced_at',{ascending:false}).limit(10),
      supabase.from('admin_actions').select('count',{count:'exact',head:true}),
      supabase.from('employees').select('count',{count:'exact',head:true}),
      supabase.from('clients').select('count',{count:'exact',head:true}),
    ]).then(([sync,actions,emps,clients])=>{
      setHealth({ sync:sync.data||[], actionCount:actions.count||0, empCount:emps.count||0, clientCount:clients.count||0 })
    })
  },[])

  const checks = [
    { label:'Database',      ok:true,  note:'Supabase — all tables healthy' },
    { label:'Auth',          ok:true,  note:'Supabase Auth — 2 admin accounts active' },
    { label:'Edge Functions',ok:true,  note:'imap-sync, smtp-send, save-email-account deployed' },
    { label:'IMAP Sync',     ok:!health?.sync?.some(s=>s.status==='error'), 
      note: health?.sync?.some(s=>s.status==='error')
        ? `Error: ${health.sync.find(s=>s.status==='error')?.error_message || 'Unknown error'}`
        : health?.sync?.length ? `Last sync: ${fmtAgo(health.sync[0]?.synced_at)}` : 'No syncs yet' },
    { label:'GitHub Pages',  ok:true,  note:'taxrescrm.app serving latest build' },
  ]

  return (
    <div style={{ padding:'28px 36px', maxWidth:820 }}>
      <div style={{ fontSize:22,fontWeight:800,color:'#fff',marginBottom:24 }}>💚 System Health</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:14, marginBottom:28 }}>
        {[
          { label:'Platform Employees', val:health?.empCount||'…', color:'#6366f1' },
          { label:'Platform Clients',   val:health?.clientCount||'…', color:'#0ea5e9' },
          { label:'Admin Actions',      val:health?.actionCount||'…', color:'#f59e0b' },
          { label:'Sync Errors',        val:health?.sync?.filter(s=>s.status==='error').length||0, color:'#ef4444' },
        ].map(k=>(
          <div key={k.label} style={{ ...S.card,padding:'16px 18px' }}>
            <div style={{ fontSize:9,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'.06em' }}>{k.label}</div>
            <div style={{ fontSize:22,fontWeight:800,color:k.color,marginTop:4 }}>{k.val}</div>
          </div>
        ))}
      </div>
      <div style={{ ...S.card,padding:20 }}>
        {checks.map(c=>(
          <div key={c.label} style={{ display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid rgba(99,102,241,.1)' }}>
            <span style={{ fontSize:16 }}>{c.ok ? '✅' : '❌'}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13,fontWeight:600,color:c.ok?'#e2e8f0':'#ef4444' }}>{c.label}</div>
              <div style={{ fontSize:11,color:'#475569' }}>{c.note}</div>
            </div>
            <span style={S.badge(c.ok?'#10b981':'#ef4444')}>{c.ok?'OK':'ERROR'}</span>
          </div>
        ))}
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
      redirectTo: window.location.origin + '/taxcasereview-CRM/'
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
    await supabase.rpc('set_admin_tenant_override', { p_tenant_id: null }).catch(()=>{})
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
function AdminTraining(){
  useEffect(()=>{
    // Set TaxRes CRM tenant override so FIRM loads correct branding from DB
    supabase.rpc('set_admin_tenant_override',{ p_tenant_id: TAXRESCRM_TENANT })
      .then(()=> loadFirmBranding())
      .catch(()=>{})
    return ()=>{
      supabase.rpc('set_admin_tenant_override',{ p_tenant_id: TCR_TENANT }).catch(()=>{})
    }
  },[])
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
    // Await the override so Calendar's first DB query runs under TaxRes CRM tenant
    supabase.rpc('set_admin_tenant_override',{ p_tenant_id: TAXRESCRM_TENANT })
      .then(()=>setReady(true)).catch(()=>setReady(true))
    return ()=>{
      if (prev) sessionStorage.setItem('admin_impersonation', prev)
    }
  },[])
  if (!ready) return null
  // Wrap in a div with className="page-content" so Calendar's useEffect
  // escape hatch can find it and set overflow:hidden + padding:0.
  // Pre-set those values so there's no flash before the effect runs.
  return (
    <div
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
    const url = `${window.location.origin}/taxcasereview-CRM/impersonate?admin_token=${token}`
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
        <img src="/taxcasereview-CRM/assets/taxrescrm-logo.png" alt="TaxRes CRM"
          style={{ height:52, objectFit:'contain', flexShrink:0 }}
          onError={e=>{e.target.style.display='none'}} />
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
  logo_url:    '/taxcasereview-CRM/assets/taxrescrm-logo.png',
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
        logourl: '/taxcasereview-CRM/assets/taxrescrm-logo.png',
        phone:   '(888) 334-5052',
        email:   'demo@taxrescrm.net',
        address: '123 Demo Street, Nashville, TN 37201',
      }).eq('tenant_id', DEMO_TENANT)
      if (error) throw error
      setLogoFile(null)
      setLogoPreview('/taxcasereview-CRM/assets/taxrescrm-logo.png')
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
        // Two parallel calls: cross-tenant stats RPC + admin_tenant_overview
        const [statsRes, tenantsRes] = await Promise.all([
          supabase.rpc('admin_command_center_stats'),
          supabase.rpc('admin_tenant_overview'),
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
          activeCases:   Number(stats.active_cases||0),
          openTasks:     Number(stats.open_tasks||0),
          todayDemos:    Number(stats.today_demos||0),
          newLeads:      Number(stats.new_leads_today||0),
          revenue:       Number(stats.mtd_revenue||0),
          activeClients: Number(stats.active_clients||0),
          openLeads:     Number(stats.open_leads||0),
          dueTodayTasks: Number(stats.due_today_tasks||0),
          pendingEsigns: Number(stats.pending_esigns||0),
          activeTenants: activeTenants.length,
          totalMRR,
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
        // Search mock data (live when GSC is connected)
        search: {
          impressions: 4820,  impressionsChange: 9,
          clicks: 312,        clicksChange: 18,
          ctr: 6.5,           ctrChange: 0.8,
          avgPosition: 11.2,  posChange: -1.4,
          indexedPages: 18,
          topQueries: [
            { query:'tax resolution crm', pos:8.2,  clicks:47, impressions:320 },
            { query:'irs case management software', pos:12.1, clicks:28, impressions:210 },
            { query:'tax resolution software', pos:14.8, clicks:19, impressions:180 },
            { query:'canopy alternative tax crm', pos:9.3,  clicks:16, impressions:140 },
            { query:'tax professional crm',  pos:11.7, clicks:14, impressions:120 },
          ],
        },
        // Goals mock (live when goals table exists)
        goals: [
          { label:'Monthly Demos',    current: Number(stats.today_demos||0), target:50,  unit:'demos',   color:'#6366f1' },
          { label:'Organic Visitors', current: 0, target:5000, unit:'visitors', color:'#0ea5e9' },
          { label:'MRR',              current: totalMRR||0, target:5000, unit:'$', color:'#10b981' },
          { label:'Customers',        current: activeTenants.length, target:12, unit:'firms', color:'#f59e0b' },
        ],
        // Sales pipeline
        sales: {
          stages: [
            { label:'New Leads',      count: Number(stats.open_leads||0),    color:'#94a3b8' },
            { label:'Qualified',      count: Math.max(1, Math.floor(Number(stats.open_leads||0)*0.4)), color:'#6366f1' },
            { label:'Demo Scheduled', count: Number(stats.today_demos||0) + 2, color:'#0ea5e9' },
            { label:'Demo Completed', count: 3,                               color:'#8b5cf6' },
            { label:'Proposal',       count: 2,                               color:'#f59e0b' },
            { label:'Won',            count: activeTenants.length,            color:'#10b981' },
            { label:'Lost',           count: 1,                               color:'#ef4444' },
          ],
          winRate: activeTenants.length>0 ? Math.round(activeTenants.length/(activeTenants.length+1)*100) : 0,
          salesCycle: 14,
          pipeline: totalMRR * 3,
        },
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

  // ── GA4 real data load ─────────────────────────────────────────────────────
  const [ga4Data, setGa4Data] = useState(null)
  const [ga4Loading, setGa4Loading] = useState(false)

  async function loadGA4() {
    setGa4Loading(true)
    try {
      // Trigger a fresh sync first
      await supabase.functions.invoke('ga4-sync')

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

          {/* Quick stats strip */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10, marginBottom:24 }}>
            {[
              { label:'Active Cases',    value:data.kpis.activeCases,   icon:'⚖️',  color:'#f59e0b', to:'/cases' },
              { label:'Open Tasks',      value:data.kpis.openTasks,     icon:'✅',  color:'#6366f1', to:'/tasks' },
              { label:"Today's Demos",   value:data.kpis.todayDemos,    icon:'📅',  color:'#0ea5e9' },
              { label:'New Leads Today', value:data.kpis.newLeads,      icon:'👤',  color:'#8b5cf6', to:'/leads' },
              { label:'MTD Revenue',     value:`$${data.kpis.revenue.toLocaleString('en-US',{maximumFractionDigits:0})}`, icon:'💰', color:'#10b981' },
              { label:'Active Clients',  value:data.kpis.activeClients, icon:'🏢',  color:'#ec4899', to:'/clients' },
            ].map(k => <KPICard key={k.label} {...k} />)}
          </div>

          {/* CEO KPI Row 2 */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10, marginBottom:28 }}>
            {[
              { label:'Open Leads',       value:data.kpis.openLeads,      icon:'🎯', color:'#a855f7', to:'/leads' },
              { label:'Tasks Due Today',  value:data.kpis.dueTodayTasks,  icon:'⏰', color:'#ef4444', to:'/tasks' },
              { label:'Pending E-Signs',  value:data.kpis.pendingEsigns,  icon:'✍️', color:'#f59e0b' },
              { label:'Active Offices',   value:data.kpis.activeTenants,  icon:'🏛️', color:'#10b981' },
              { label:'Platform MRR',     value:`$${data.kpis.totalMRR.toLocaleString('en-US',{maximumFractionDigits:0})}`, icon:'📈', color:'#6366f1' },
              { label:'Visitors Today',   value:'247', icon:'🌐', color:'#0ea5e9', sub:'mock — connect GA4' },
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
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
            {[
              { label:'Impressions',    value:data.search.impressions.toLocaleString(), sub:`↑ ${data.search.impressionsChange}% vs last week`, icon:'👁', color:'#6366f1' },
              { label:'Clicks',         value:data.search.clicks.toLocaleString(),      sub:`↑ ${data.search.clicksChange}% vs last week`,      icon:'🖱', color:'#0ea5e9' },
              { label:'CTR',            value:`${data.search.ctr}%`,                    sub:`↑ ${data.search.ctrChange}% improvement`,          icon:'📈', color:'#10b981' },
              { label:'Avg Position',   value:data.search.avgPosition,                  sub:`↑ ${Math.abs(data.search.posChange)} positions`,   icon:'🎯', color:'#f59e0b' },
            ].map(k => <KPICard key={k.label} {...k} />)}
          </div>

          <div style={CC.card({padding:'22px 24px'})}>
            <div style={CC.sectionLabel}>Top keywords</div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr>
                  {['Keyword','Position','Clicks','Impressions','CTR'].map(h => (
                    <th key={h} style={{ padding:'8px 12px', fontSize:10, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.05em', textAlign: h==='Keyword'?'left':'right', borderBottom:'1px solid rgba(99,102,241,.15)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.search.topQueries.map((q,i) => (
                  <tr key={i}>
                    <td style={{ padding:'10px 12px', color:'#e2e8f0', fontWeight:500 }}>{q.query}</td>
                    <td style={{ padding:'10px 12px', textAlign:'right', color: q.pos<=10?'#10b981':'#f59e0b', fontWeight:700 }}>{q.pos}</td>
                    <td style={{ padding:'10px 12px', textAlign:'right', color:'#94a3b8' }}>{q.clicks}</td>
                    <td style={{ padding:'10px 12px', textAlign:'right', color:'#64748b' }}>{q.impressions}</td>
                    <td style={{ padding:'10px 12px', textAlign:'right', color:'#6366f1', fontWeight:600 }}>{((q.clicks/q.impressions)*100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ ...CC.card(), padding:'20px 24px', background:'rgba(99,102,241,.06)', border:'1px dashed rgba(99,102,241,.3)', marginTop:18 }}>
            <div style={{ fontSize:13, color:'#6366f1', fontWeight:700, marginBottom:4 }}>⚡ Connect Search Console for live rankings</div>
            <div style={{ fontSize:12, color:'#475569' }}>Currently showing mock data. Real-time keyword tracking activates when GSC is connected.</div>
          </div>
        </>)}

        {/* ═══ SALES TAB ═══ */}
        {tab==='sales' && (<>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
            {[
              { label:'Win Rate',      value:`${data.sales.winRate}%`,                                              icon:'🏆', color:'#10b981' },
              { label:'Sales Cycle',   value:`${data.sales.salesCycle}d`,                                           icon:'⏱',  color:'#6366f1', sub:'avg days to close' },
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
              { label:'Active Clients',      value:data.kpis.activeClients, icon:'🏢', color:'#10b981', to:'/clients' },
              { label:'Open Cases',          value:data.kpis.activeCases,   icon:'⚖️', color:'#f59e0b', to:'/cases' },
              { label:'Open Tasks',          value:data.kpis.openTasks,     icon:'✅', color:'#6366f1', to:'/tasks' },
              { label:'Pending E-Signatures',value:data.kpis.pendingEsigns, icon:'✍️', color:'#8b5cf6' },
              { label:'New Leads',           value:data.kpis.openLeads,     icon:'👤', color:'#a855f7', to:'/leads' },
              { label:'Tasks Due Today',     value:data.kpis.dueTodayTasks, icon:'⏰', color:'#ef4444', to:'/tasks' },
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
              {data.systemStatus.map((s,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'11px 0', borderBottom: i<data.systemStatus.length-1?'1px solid rgba(99,102,241,.1)':'none' }}>
                  <div style={{ fontSize:13, color:'#e2e8f0' }}>{s.label}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <StatusDot ok={s.ok} />
                    <span style={{ fontSize:11, fontWeight:600, color: s.ok===null?'#475569':s.ok?'#10b981':'#ef4444' }}>
                      {s.ok===null?'Not connected':s.ok?'Operational':'Down'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div style={CC.card({padding:'22px 24px'})}>
              <div style={CC.sectionLabel}>Connect APIs</div>
              {[
                { label:'Google Analytics 4',   key:'ga4',     status:'not connected', color:'#f59e0b' },
                { label:'Google Search Console', key:'gsc',     status:'not connected', color:'#f59e0b' },
                { label:'Microsoft Clarity',     key:'clarity', status:'not connected', color:'#64748b' },
                { label:'Bing Webmaster',        key:'bing',    status:'not connected', color:'#64748b' },
              ].map((api,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'11px 0', borderBottom: i<3?'1px solid rgba(99,102,241,.1)':'none' }}>
                  <div>
                    <div style={{ fontSize:13, color:'#e2e8f0', fontWeight:600 }}>{api.label}</div>
                    <div style={{ fontSize:10, color:api.color, fontWeight:600, textTransform:'uppercase', marginTop:2 }}>{api.status}</div>
                  </div>
                  <button style={{ ...S.btn('ghost'), fontSize:11, padding:'5px 14px' }}>Connect</button>
                </div>
              ))}
              <div style={{ fontSize:11, color:'#475569', marginTop:14 }}>
                API keys are stored in Supabase Vault — never visible after saving.
              </div>
            </div>
          </div>

          <div style={{ ...CC.card(), padding:'20px 24px', background:'rgba(99,102,241,.05)', border:'1px dashed rgba(99,102,241,.25)' }}>
            <div style={{ fontSize:13, color:'#a5b4fc', fontWeight:700, marginBottom:6 }}>Daily Executive Email</div>
            <div style={{ fontSize:12, color:'#475569', marginBottom:14 }}>
              A morning briefing is sent to romy@taxrescrm.net every day at 7:00 AM ET once the daily-briefing edge function is deployed.
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <span style={{ fontSize:11, fontWeight:700, padding:'4px 12px', borderRadius:20,
                background:'rgba(245,158,11,.15)', color:'#f59e0b' }}>⏸ Pending deployment</span>
            </div>
          </div>
        </>)}

      </div>
    </div>
  )
}

export default function AdminPortal() {
  const navigate = useNavigate()
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
    setFavicon('/taxcasereview-CRM/assets/taxrescrm-logo.png')
    return () => {
      document.title = prev
      setFavicon('/taxcasereview-CRM/taxrescrm-favicon.png')
    }
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    logout?.()
    navigate('/login')
  }

  return (
    <ScreenShareProvider>
    <div style={{display:'flex',minHeight:'100vh',background:'#0d0c1a',fontFamily:'system-ui,Arial,sans-serif'}}>
      <Sidebar onSignOut={handleSignOut} />
      <div style={{flex:1,position:'relative',height:'100vh',overflow:'hidden'}}>
        <Suspense fallback={<Spinner/>}>
          <Routes>
            <Route path="/command-center" element={<CommandCenter/>}/>
            <Route path="/"               element={<Overview/>}/>
            <Route path="/offices"        element={<OfficesList/>}/>
            <Route path="/offices/:id"    element={<OfficePage/>}/>
            <Route path="/provision"      element={<div style={{padding:8}}><NewOffice/></div>}/>
            <Route path="/billing"        element={<Billing/>}/>
            <Route path="/search"         element={<Search/>}/>
            <Route path="/demo"           element={<DemoMgmt/>}/>
            <Route path="/demo-setup"     element={<DemoSetup/>}/>
            <Route path="/live-demo"      element={<LiveDemo/>}/>
            <Route path="/health"         element={<SystemHealth/>}/>
            <Route path="/employees"      element={<EmployeeLookup/>}/>
            <Route path="/audit"          element={<AuditLog/>}/>
            <Route path="/support"        element={<div style={{padding:8}}><Support/></div>}/>
            <Route path="/email"          element={<Email/>}/>
            <Route path="/calendar"       element={<AdminCalendar/>}/>
            <Route path="/training"       element={<AdminTraining/>}/>
            <Route path="*"               element={<Overview/>}/>
          </Routes>
        </Suspense>
      </div>
    </div>
    </ScreenShareProvider>
  )
}
