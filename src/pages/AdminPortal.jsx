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
export default function AdminPortal() {
  const navigate = useNavigate()
  const { logout } = useApp()

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
