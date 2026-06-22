import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, role, employeeName, can } = useApp()
  const [metrics, setMetrics] = useState({})
  const [recentCases, setRecentCases] = useState([])
  const [tasks, setTasks] = useState([])
  const [deadlines, setDeadlines] = useState([])
  const [recentClients, setRecentClients] = useState([])
  const [recentLeads, setRecentLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [time, setTime] = useState(new Date())

  useEffect(() => { load() }, [])
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  async function load() {
    const [
      { data: leads }, { data: clients }, { data: cases },
      { data: tasks }, { data: invoices }, { data: payments },
      { data: deadlines },
    ] = await Promise.all([
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('cases').select('*').order('created_at', { ascending: false }),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('invoices').select('id,total,status,clientName'),
      supabase.from('payments').select('id,amount,status,created_at,source,enrolled_by'),
      supabase.from('deadlines').select('*').order('dueDate', { ascending: true }),
    ])

    const now = new Date()
    const thisMonth = now.toISOString().slice(0, 7)

    // 1st trade = the Tax Investigation Fee. This is collected externally via
    // LeadFlow before a lead ever reaches the CRM, so it's never written to
    // the payments table — leads.taxFee (set when the lead is qualified) is
    // the only record of it we have. MTD = leads created this month.
    // 2nd trade = the Resolution Fee, charged in-app once IRS results are
    // back and the addendum is signed — these DO hit payments, tagged
    // source:'resolution_fee' by stripe-resolution-fee-confirm.
    const mtd1stTrades   = (leads || [])
      .filter(l => l.created_at?.startsWith(thisMonth))
      .reduce((s, l) => s + parseFloat(l.taxFee || 0), 0)
    const total1stTrades = (leads || []).reduce((s, l) => s + parseFloat(l.taxFee || 0), 0)
    const mtd2ndTrades   = (payments || [])
      .filter(p => p.source === 'resolution_fee' && p.created_at?.startsWith(thisMonth))
      .reduce((s, p) => s + parseFloat(p.amount || 0), 0)
    const total2ndTrades = (payments || [])
      .filter(p => p.source === 'resolution_fee')
      .reduce((s, p) => s + parseFloat(p.amount || 0), 0)

    // Role-scoped numbers — Tax Advisor (sales rep) only sees their own
    // leads/1st-trade, Tax Associate/Manager only sees their own 2nd-trade
    // (commission credit, via enrolled_by — see ChargeResolutionFeeModal /
    // stripe-resolution-fee-confirm). "Closed" = no longer open, matching
    // Open Leads' own status list, just inverted.
    const CLOSED_STATUSES = ['Converted to Client', 'Dead', 'Do Not Contact']
    const myLeads = (leads || []).filter(l => l.assignedTo === employeeName)
    const myOpenLeads   = myLeads.filter(l => !CLOSED_STATUSES.includes(l.status)).length
    const myClosedLeads = myLeads.filter(l => CLOSED_STATUSES.includes(l.status)).length
    const closedLeads   = (leads || []).filter(l => CLOSED_STATUSES.includes(l.status)).length
    const my1stTradeMtd = myLeads
      .filter(l => l.created_at?.startsWith(thisMonth))
      .reduce((s, l) => s + parseFloat(l.taxFee || 0), 0)
    const my2ndTradeMtd = (payments || [])
      .filter(p => p.source === 'resolution_fee' && p.enrolled_by === employeeName && p.created_at?.startsWith(thisMonth))
      .reduce((s, p) => s + parseFloat(p.amount || 0), 0)

    setMetrics({
      activeCases: (cases || []).filter(c => ['Open', 'Pending IRS', 'Active Plan', 'Under Review'].includes(c.status)).length,
      openLeads: (leads || []).filter(l => !['Converted to Client', 'Dead', 'Do Not Contact'].includes(l.status)).length,
      totalClients: (clients || []).length,
      mtd1stTrades, total1stTrades, mtd2ndTrades, total2ndTrades,
      closedLeads, myOpenLeads, myClosedLeads, my1stTradeMtd, my2ndTradeMtd,
      unpaidInvoices: (invoices || []).filter(i => i.status === 'Unpaid' || i.status === 'Overdue').length,
      unpaidAmt: (invoices || []).filter(i => i.status === 'Unpaid' || i.status === 'Overdue').reduce((s, i) => s + parseFloat(i.total || 0), 0),
      openTasks: (tasks || []).filter(t => !t.done).length,
      overdueTasks: (tasks || []).filter(t => !t.done && t.dueDate && new Date(t.dueDate) < now).length,
      upcomingDl: (deadlines || []).filter(d => new Date(d.dueDate) >= now && d.status !== 'Completed').length,
      overdueDl: (deadlines || []).filter(d => new Date(d.dueDate) < now && d.status !== 'Completed').length,
    })

    setRecentCases((cases || []).slice(0, 6))
    setTasks((tasks || []).filter(t => !t.done).slice(0, 8))
    setDeadlines((deadlines || []).filter(d => d.status !== 'Completed').slice(0, 8))
    setRecentClients((clients || []).slice(0, 5))
    setRecentLeads((leads || []).filter(l => !['Converted to Client', 'Dead'].includes(l.status)).slice(0, 5))
    setLoading(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--t3)', fontSize: 14 }}>
      Loading dashboard…
    </div>
  )

  const greeting = () => {
    const h = time.getHours()
    const rawName = user?.user_metadata?.name?.split(' ')[0] || user?.email?.split('@')[0]?.split('.')[0] || 'there'
    const name = rawName.charAt(0).toUpperCase() + rawName.slice(1)
    return `${h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}, ${name} 👋`
  }

  const fmtTime = t => t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
  const fmtDate = t => t.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const daysLeft = d => Math.ceil((new Date(d.dueDate) - new Date()) / 86400000)

  // US time zones shown on the dashboard clock -- continental US plus
  // Alaska and Hawaii. Each computed independently via Intl with an
  // explicit IANA zone (not a manual UTC offset), so DST is handled
  // automatically for the zones that observe it, same approach as the
  // business-hours check in receive-call.
  const US_TIMEZONES = [
    { label: 'Eastern',  zone: 'America/New_York' },
    { label: 'Central',  zone: 'America/Chicago' },
    { label: 'Mountain', zone: 'America/Denver' },
    { label: 'Pacific',  zone: 'America/Los_Angeles' },
    { label: 'Alaska',   zone: 'America/Anchorage' },
    { label: 'Hawaii',   zone: 'Pacific/Honolulu' },
  ]
  const fmtZoneTime = (t, zone) => t.toLocaleTimeString('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true })

  const isTaxAdvisor  = role === 'Tax Advisor'
  const isTaxAssociate = role === 'Tax Associate'
  const isManager     = role === 'Manager'
  // Tax Associate/Manager work client files day-to-day, so "recent" should
  // surface clients, not leads. Tax Advisor never sees Clients at all.
  const showRecentClients = isTaxAssociate || isManager

  const CARD_COLORS = {
    'Active Cases':     '#f59e0b',
    'Open Leads':       '#a855f7',
    'Clients':          '#3b82f6',
    'MTD 1st Trades':   '#22c55e',
    'MTD 2nd Trades':   '#22c55e',
    'Unpaid Invoices':  '#a855f7',
    'Open Tasks':       'var(--blue)',
    'Upcoming DL':      '#f59e0b',
    'Overdue DL':       '#ef4444',
    'Closed Leads':     '#a855f7',
    'Team MTD 1st Trades': '#3b82f6',
  }

  const StatCard = ({ label, val, sub, color, to, icon }) => {
    const borderColor = CARD_COLORS[label] || 'var(--blue)'
    return (
    <div onClick={() => to && navigate(to)} style={{
      background: 'var(--sf)',
      border: '1px solid var(--br)',
      borderTop: 'none',
      borderRadius: '0 0 10px 10px',
      padding: '14px 16px',
      cursor: to ? 'pointer' : 'default',
      transition: 'transform .15s, box-shadow .15s',
      position: 'relative',
      overflow: 'hidden',
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 6px 24px ${borderColor}40` }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
    >
      {/* Thick colored top bar — Jobber style */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: borderColor, borderRadius: '0' }}/>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', paddingTop: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>{label}</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: color || 'var(--tx)', lineHeight: 1 }}>{val ?? '—'}</div>
          {sub && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 5 }}>{sub}</div>}
        </div>
        {icon && <div style={{ fontSize: 24, opacity: .2 }}>{icon}</div>}
      </div>
    </div>
  )}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Greeting + clock */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--tx)' }}>{greeting()}</div>
          <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 2 }}>{fmtDate(time)}</div>
        </div>
        <div style={{ background: 'var(--sf)', border: '1px solid var(--br)', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {US_TIMEZONES.map(z => (
              <div key={z.zone} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{z.label}</div>
                <div style={{ fontFamily: 'monospace', fontSize: 12.5, fontWeight: 600, color: 'var(--t2)', marginTop: 2 }}>{fmtZoneTime(time, z.zone)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {isTaxAdvisor ? (
          <>
            <StatCard label="Open Leads"      val={metrics.myOpenLeads}   color="var(--warn)"  to="/leads"     icon="👤" sub="Assigned to you" />
            <StatCard label="Closed Leads"     val={metrics.myClosedLeads} color="var(--ok)"    to="/leads"     icon="🏁" sub="Assigned to you" />
            <StatCard label="MTD 1st Trades"  val={'$' + Math.round(metrics.my1stTradeMtd).toLocaleString()} color="var(--ok)" icon="💰" sub="Your enrollments" />
            <StatCard label="Team MTD 1st Trades" val={'$' + Math.round(metrics.mtd1stTrades).toLocaleString()} color="var(--blue)" icon="👥" sub="Whole sales team" />
          </>
        ) : isTaxAssociate ? (
          <>
            <StatCard label="Active Cases"    val={metrics.activeCases}   color="var(--blue)"  to="/cases"     icon="📁" />
            <StatCard label="Open Leads"      val={metrics.openLeads}     color="var(--warn)"  to="/leads"     icon="👤" />
            <StatCard label="Clients"         val={metrics.totalClients}  color="var(--ok)"    to="/clients"   icon="🏢" />
            <StatCard label="MTD 2nd Trades"  val={'$' + Math.round(metrics.my2ndTradeMtd).toLocaleString()} color="var(--ok)" icon="💵" sub="Your enrollments" />
            <StatCard label="Unpaid Invoices" val={metrics.unpaidInvoices} color="#a855f7" to="/invoices" icon="🧾" sub={metrics.unpaidAmt > 0 ? '$' + Math.round(metrics.unpaidAmt).toLocaleString() + ' outstanding' : 'All paid'} />
            <StatCard label="Open Tasks"      val={metrics.openTasks}     color="var(--blue)"  to="/tasks"     icon="✅" sub={metrics.overdueTasks > 0 ? `${metrics.overdueTasks} overdue` : 'On track'} />
            <StatCard label="Upcoming DL"     val={metrics.upcomingDl}    color="var(--warn)"  to="/deadlines" icon="⏰" />
            <StatCard label="Overdue DL"      val={metrics.overdueDl}     color={metrics.overdueDl > 0 ? 'var(--bad)' : 'var(--ok)'} to="/deadlines" icon="🚨" />
          </>
        ) : isManager ? (
          <>
            <StatCard label="Active Cases"    val={metrics.activeCases}   color="var(--blue)"  to="/cases"     icon="📁" />
            <StatCard label="Open Leads"      val={metrics.openLeads}     color="var(--warn)"  to="/leads"     icon="👤" />
            <StatCard label="Closed Leads"     val={metrics.closedLeads}   color="var(--ok)"    to="/leads"     icon="🏁" />
            <StatCard label="Clients"         val={metrics.totalClients}  color="var(--ok)"    to="/clients"   icon="🏢" />
            <StatCard label="MTD 1st Trades"  val={'$' + Math.round(metrics.my1stTradeMtd).toLocaleString()} color="var(--ok)" icon="💰" sub={'Team: $' + Math.round(metrics.mtd1stTrades).toLocaleString()} />
            <StatCard label="MTD 2nd Trades"  val={'$' + Math.round(metrics.my2ndTradeMtd).toLocaleString()} color="var(--ok)" icon="💵" sub={'Team: $' + Math.round(metrics.mtd2ndTrades).toLocaleString()} />
            <StatCard label="Unpaid Invoices" val={metrics.unpaidInvoices} color="#a855f7" to="/invoices" icon="🧾" sub={metrics.unpaidAmt > 0 ? '$' + Math.round(metrics.unpaidAmt).toLocaleString() + ' outstanding' : 'All paid'} />
            <StatCard label="Open Tasks"      val={metrics.openTasks}     color="var(--blue)"  to="/tasks"     icon="✅" sub={metrics.overdueTasks > 0 ? `${metrics.overdueTasks} overdue` : 'On track'} />
            <StatCard label="Upcoming DL"     val={metrics.upcomingDl}    color="var(--warn)"  to="/deadlines" icon="⏰" />
            <StatCard label="Overdue DL"      val={metrics.overdueDl}     color={metrics.overdueDl > 0 ? 'var(--bad)' : 'var(--ok)'} to="/deadlines" icon="🚨" />
          </>
        ) : (
          <>
            <StatCard label="Active Cases"    val={metrics.activeCases}   color="var(--blue)"  to="/cases"     icon="📁" />
            <StatCard label="Open Leads"      val={metrics.openLeads}     color="var(--warn)"  to="/leads"     icon="👤" />
            <StatCard label="Clients"         val={metrics.totalClients}  color="var(--ok)"    to="/clients"   icon="🏢" />
            <StatCard label="MTD 1st Trades"  val={'$' + Math.round(metrics.mtd1stTrades).toLocaleString()} color="var(--ok)" icon="💰" sub={'Total: $' + Math.round(metrics.total1stTrades).toLocaleString()} />
            <StatCard label="MTD 2nd Trades"  val={'$' + Math.round(metrics.mtd2ndTrades).toLocaleString()} color="var(--ok)" icon="💵" sub={'Total: $' + Math.round(metrics.total2ndTrades).toLocaleString()} />
            <StatCard label="Unpaid Invoices" val={metrics.unpaidInvoices} color="#a855f7" to="/invoices" icon="🧾" sub={metrics.unpaidAmt > 0 ? '$' + Math.round(metrics.unpaidAmt).toLocaleString() + ' outstanding' : 'All paid'} />
            <StatCard label="Open Tasks"      val={metrics.openTasks}     color="var(--blue)"  to="/tasks"     icon="✅" sub={metrics.overdueTasks > 0 ? `${metrics.overdueTasks} overdue` : 'On track'} />
            <StatCard label="Upcoming DL"     val={metrics.upcomingDl}    color="var(--warn)"  to="/deadlines" icon="⏰" />
            <StatCard label="Overdue DL"      val={metrics.overdueDl}     color={metrics.overdueDl > 0 ? 'var(--bad)' : 'var(--ok)'} to="/deadlines" icon="🚨" />
          </>
        )}
      </div>

      {/* Main grid */}
      <div className="detail-2col" style={{ display: 'grid', gridTemplateColumns: isTaxAdvisor ? '1fr' : '1fr 1fr', gap: 14 }}>

        {!isTaxAdvisor && (
        <>
        {/* Active Cases */}
        <div className="card">
          <div className="ch">
            <span className="ct">🗂 Active Cases</span>
            <button className="btn sm" onClick={() => navigate('/cases')}>View All →</button>
          </div>
          {recentCases.length === 0
            ? <div style={{ color: 'var(--t3)', fontSize: 13, padding: '8px 0' }}>No cases yet</div>
            : recentCases.map(c => (
              <div key={c.id} onClick={() => navigate('/cases')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--br)', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.clientName}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>{c.caseType} {c.irsBalance ? '· $' + Number(c.irsBalance).toLocaleString() : ''}</div>
                </div>
                <span className={`bdg ${c.status === 'Open' ? 'bb' : c.status === 'Resolved' ? 'bg' : 'ba'}`} style={{ fontSize: 10, flexShrink: 0 }}>{c.status}</span>
              </div>
            ))
          }
        </div>

        {/* Open Tasks */}
        <div className="card">
          <div className="ch">
            <span className="ct">✅ Open Tasks</span>
            <button className="btn sm" onClick={() => navigate('/tasks')}>All Tasks →</button>
          </div>
          {tasks.length === 0
            ? <div style={{ color: 'var(--t3)', fontSize: 13, padding: '8px 0' }}>No open tasks</div>
            : tasks.map(t => {
              const overdue = t.dueDate && new Date(t.dueDate) < new Date()
              return (
                <div key={t.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--br)' }}>
                  <div style={{ width: 14, height: 14, borderRadius: 3, border: '1.5px solid var(--blue)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: overdue ? 'var(--bad)' : 'var(--t3)' }}>
                      {t.clientName && `${t.clientName} · `}{t.dueDate ? (overdue ? '⚠ ' : '') + t.dueDate : ''}
                    </div>
                  </div>
                  <span className={`bdg ${t.priority === 'High' ? 'br' : t.priority === 'Low' ? 'bn' : 'ba'}`} style={{ fontSize: 10, flexShrink: 0 }}>{t.priority || 'Normal'}</span>
                </div>
              )
            })
          }
        </div>

        {/* IRS Deadlines */}
        <div className="card">
          <div className="ch">
            <span className="ct">⏰ IRS Deadlines</span>
            <button className="btn sm" onClick={() => navigate('/deadlines')}>All →</button>
          </div>
          {deadlines.length === 0
            ? <div style={{ color: 'var(--t3)', fontSize: 13, padding: '8px 0' }}>No upcoming deadlines</div>
            : deadlines.map(d => {
              const dl = daysLeft(d)
              const overdue = dl < 0, urgent = dl >= 0 && dl <= 7
              return (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--br)' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name || d.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)' }}>{d.clientName || d.client || ''} · {d.dueDate}</div>
                  </div>
                  <span className={`bdg ${overdue ? 'br' : urgent ? 'ba' : 'bg'}`} style={{ fontSize: 10, flexShrink: 0, marginLeft: 8 }}>
                    {overdue ? 'OVERDUE' : dl === 0 ? 'TODAY' : dl + 'd'}
                  </span>
                </div>
              )
            })
          }
        </div>
        </>
        )}

        {showRecentClients ? (
          /* Recent Clients — Tax Associate / Manager work client files day-to-day */
          <div className="card">
            <div className="ch">
              <span className="ct">🏢 Recent Clients</span>
              <button className="btn sm" onClick={() => navigate('/clients')}>All Clients →</button>
            </div>
            {recentClients.length === 0
              ? <div style={{ color: 'var(--t3)', fontSize: 13, padding: '8px 0' }}>No clients yet</div>
              : recentClients.map(c => (
                <div key={c.id} onClick={() => navigate('/clients')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--br)', cursor: 'pointer' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--ok)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                    {(c.name || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)' }}>{c.issueType || ''} {c.irsBalance ? '· $' + Number(c.irsBalance).toLocaleString() : ''}</div>
                  </div>
                </div>
              ))
            }
          </div>
        ) : (
          /* Recent Leads — Tax Advisor sees only their own assigned leads */
          <div className="card">
            <div className="ch">
              <span className="ct">👤 Recent Leads{isTaxAdvisor ? ' — Yours' : ''}</span>
              <button className="btn sm" onClick={() => navigate('/leads')}>All Leads →</button>
            </div>
            {(isTaxAdvisor ? recentLeads.filter(l => l.assignedTo === employeeName) : recentLeads).length === 0
              ? <div style={{ color: 'var(--t3)', fontSize: 13, padding: '8px 0' }}>No leads yet</div>
              : (isTaxAdvisor ? recentLeads.filter(l => l.assignedTo === employeeName) : recentLeads).map(l => (
                <div key={l.id} onClick={() => navigate('/leads')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--br)', cursor: 'pointer' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                    {(l.name || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)' }}>{l.issueType || l.source || ''} {l.irsBalance ? '· ~' + l.irsBalance : ''}</div>
                  </div>
                  <span className="bdg bb" style={{ fontSize: 10, flexShrink: 0 }}>{l.status}</span>
                </div>
              ))
            }
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="card">
        <div className="ch"><span className="ct">⚡ Quick Actions</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
          {[
            ['👤 New Lead', '/leads', 'leads'], ['🏢 New Client', '/clients', 'clients'],
            ['📁 New Case', '/cases', 'cases'], ['✅ New Task', '/tasks', 'tasks'],
            ['🧾 New Invoice', '/invoices', 'invoices'], ['⏰ Add Deadline', '/deadlines', 'deadlines'],
            ['📅 Schedule', '/calendar', 'calendar'], ['💬 Team Chat', '/chat', 'chat'],
          ].filter(([, , section]) => can('edit', section)).map(([label, to]) => (
            <button key={label} className="btn" style={{ justifyContent: 'flex-start', fontSize: 13, padding: '9px 12px' }} onClick={() => navigate(to)}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
