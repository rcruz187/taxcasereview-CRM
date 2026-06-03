import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useApp()
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
      supabase.from('payments').select('id,amount,status,created_at'),
      supabase.from('deadlines').select('*').order('dueDate', { ascending: true }),
    ])

    const now = new Date()
    const thisMonth = now.toISOString().slice(0, 7)
    const revMtd = (payments || [])
      .filter(p => p.created_at?.startsWith(thisMonth))
      .reduce((s, p) => s + parseFloat(p.amount || 0), 0)
    const revTotal = (payments || []).reduce((s, p) => s + parseFloat(p.amount || 0), 0)

    setMetrics({
      activeCases: (cases || []).filter(c => ['Open', 'Pending IRS', 'Active Plan', 'Under Review'].includes(c.status)).length,
      openLeads: (leads || []).filter(l => !['Converted to Client', 'Dead', 'Do Not Contact'].includes(l.status)).length,
      totalClients: (clients || []).length,
      revMtd, revTotal,
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
    const name = user?.user_metadata?.name?.split(' ')[0] || user?.email?.split('@')[0]?.split('.')[0] || 'there'
    return `${h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}, ${name} 👋`
  }

  const fmtTime = t => t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
  const fmtDate = t => t.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const daysLeft = d => Math.ceil((new Date(d.dueDate) - new Date()) / 86400000)

  const CARD_COLORS = {
    'Active Cases':     '#f59e0b',
    'Open Leads':       '#a855f7',
    'Clients':          '#3b82f6',
    'Revenue MTD':      '#22c55e',
    'Unpaid Invoices':  '#ef4444',
    'Open Tasks':       '#22c55e',
    'Upcoming DL':      '#f59e0b',
    'Overdue DL':       '#ef4444',
  }

  const StatCard = ({ label, val, sub, color, to, icon }) => {
    const borderColor = CARD_COLORS[label] || 'var(--blue)'
    return (
    <div onClick={() => to && navigate(to)} style={{
      background: 'var(--sf)', border: '1px solid var(--br)', borderRadius: 12,
      padding: '16px 18px', cursor: to ? 'pointer' : 'default',
      transition: 'transform .15s, box-shadow .15s', position: 'relative', overflow: 'hidden',
      borderTop: `3px solid ${borderColor}`,
    }}
      onMouseEnter={e => { if (to) { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 8px 28px ${borderColor}30` }}}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: color || 'var(--tx)', lineHeight: 1 }}>{val}</div>
          {sub && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 6 }}>{sub}</div>}
        </div>
        {icon && <div style={{ fontSize: 26, opacity: .25 }}>{icon}</div>}
      </div>
    </div>
  )}
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Greeting + clock */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--tx)' }}>{greeting()}</div>
          <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 2 }}>{fmtDate(time)}</div>
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: 'var(--blue)', background: 'var(--sf)', border: '1px solid var(--br)', borderRadius: 10, padding: '8px 16px' }}>
          {fmtTime(time)}
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        <StatCard label="Active Cases"    val={metrics.activeCases}   color="var(--blue)"  to="/cases"     icon="📁" />
        <StatCard label="Open Leads"      val={metrics.openLeads}     color="var(--warn)"  to="/leads"     icon="👤" />
        <StatCard label="Clients"         val={metrics.totalClients}  color="var(--ok)"    to="/clients"   icon="🏢" />
        <StatCard label="Revenue MTD"     val={'$' + Math.round(metrics.revMtd).toLocaleString()} color="var(--ok)" icon="💰" sub={'Total: $' + Math.round(metrics.revTotal).toLocaleString()} />
        <StatCard label="Unpaid Invoices" val={metrics.unpaidInvoices} color={metrics.unpaidInvoices > 0 ? 'var(--bad)' : 'var(--ok)'} to="/invoices" icon="🧾" sub={metrics.unpaidAmt > 0 ? '$' + Math.round(metrics.unpaidAmt).toLocaleString() + ' outstanding' : 'All paid'} />
        <StatCard label="Open Tasks"      val={metrics.openTasks}     color="var(--blue)"  to="/tasks"     icon="✅" sub={metrics.overdueTasks > 0 ? `${metrics.overdueTasks} overdue` : 'On track'} />
        <StatCard label="Upcoming DL"     val={metrics.upcomingDl}    color="var(--warn)"  to="/deadlines" icon="⏰" />
        <StatCard label="Overdue DL"      val={metrics.overdueDl}     color={metrics.overdueDl > 0 ? 'var(--bad)' : 'var(--ok)'} to="/deadlines" icon="🚨" />
      </div>

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

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

        {/* Recent Leads */}
        <div className="card">
          <div className="ch">
            <span className="ct">👤 Recent Leads</span>
            <button className="btn sm" onClick={() => navigate('/leads')}>All Leads →</button>
          </div>
          {recentLeads.length === 0
            ? <div style={{ color: 'var(--t3)', fontSize: 13, padding: '8px 0' }}>No leads yet</div>
            : recentLeads.map(l => (
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
      </div>

      {/* Quick Actions */}
      <div className="card">
        <div className="ch"><span className="ct">⚡ Quick Actions</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
          {[
            ['👤 New Lead', '/leads'], ['🏢 New Client', '/clients'],
            ['📁 New Case', '/cases'], ['✅ New Task', '/tasks'],
            ['🧾 New Invoice', '/invoices'], ['⏰ Add Deadline', '/deadlines'],
            ['📅 Schedule', '/calendar'], ['💬 Team Chat', '/chat'],
          ].map(([label, to]) => (
            <button key={label} className="btn" style={{ justifyContent: 'flex-start', fontSize: 13, padding: '9px 12px' }} onClick={() => navigate(to)}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
