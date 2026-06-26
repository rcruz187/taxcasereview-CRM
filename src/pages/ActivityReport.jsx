import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { ICONS } from '../lib/activityLog'
import { exportCSV, exportPDF, exportExcel } from '../lib/exportUtils'

const CATEGORY_COLORS = {
  lead:     '#a855f7', client:  '#3b82f6', call:   '#22c55e',
  email:    '#0ea5e9', sms:     '#6366f1', fax:    '#dc2626',
  payment:  '#10b981', esign:   '#7c3aed', document:'#f97316',
  session:  '#64748b', case:    '#f59e0b', task:   '#06b6d4',
  note:     '#94a3b8', invoice: '#ef4444',
}

function fmtTime(dt) {
  return new Date(dt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}
function fmtDuration(a, b) {
  const mins = Math.round((new Date(b) - new Date(a)) / 60000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m`
  return `${Math.floor(mins/60)}h ${mins%60}m`
}
function today() { return new Date().toISOString().slice(0,10) }

export default function ActivityReport() {
  const { role } = useApp()
  const [date,       setDate]       = useState(today())
  const [employees,  setEmployees]  = useState([])
  const [selEmp,     setSelEmp]     = useState('All')
  const [logs,       setLogs]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [view,       setView]       = useState('summary') // summary | timeline

  const canView = ['Super Admin','Admin','Manager'].includes(role)

  useEffect(() => {
    supabase.from('employees').select('id,name,role,status').eq('status','Active').order('name')
      .then(({ data }) => setEmployees(data || []))
  }, [])

  useEffect(() => { load() }, [date, selEmp])

  async function load() {
    setLoading(true)
    const start = date + 'T00:00:00.000Z'
    const end   = date + 'T23:59:59.999Z'
    let q = supabase.from('activity_log').select('*')
      .gte('created_at', start).lte('created_at', end)
      .order('created_at', { ascending: true })
    if (selEmp !== 'All') q = q.eq('employee_name', selEmp)
    const { data } = await q
    setLogs(data || [])
    setLoading(false)
  }

  if (!canView) return (
    <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
      <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--tx)' }}>Access Restricted</div>
      <div style={{ fontSize: 13, marginTop: 6 }}>Activity reports are visible to Admins and Managers only.</div>
    </div>
  )

  // ── Summary stats per employee ─────────────────────────────────────────────
  const byEmp = {}
  logs.forEach(l => {
    if (!byEmp[l.employee_name]) byEmp[l.employee_name] = { name: l.employee_name, logs: [], loginAt: null, lastAt: null }
    byEmp[l.employee_name].logs.push(l)
    if (l.action === 'session_login' && !byEmp[l.employee_name].loginAt) byEmp[l.employee_name].loginAt = l.created_at
    byEmp[l.employee_name].lastAt = l.created_at
  })

  const empSummaries = Object.values(byEmp).map(e => ({
    ...e,
    total:    e.logs.length,
    calls:    e.logs.filter(l => l.category === 'call').length,
    leads:    e.logs.filter(l => l.category === 'lead').length,
    clients:  e.logs.filter(l => l.category === 'client').length,
    payments: e.logs.filter(l => l.category === 'payment').length,
    esigns:   e.logs.filter(l => l.category === 'esign').length,
    online: e.loginAt && e.lastAt ? fmtDuration(e.loginAt, e.lastAt) : null,
  })).sort((a,b) => b.total - a.total)

  const filteredLogs = selEmp === 'All' ? logs : logs.filter(l => l.employee_name === selEmp)

  return (
    <div>
      {/* Header controls */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--br)', background: 'var(--s2)', color: 'var(--tx)', fontSize: 13 }} />
        <select value={selEmp} onChange={e => { setSelEmp(e.target.value); setView(e.target.value === 'All' ? 'summary' : 'timeline') }}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--br)', background: 'var(--s2)', color: 'var(--tx)', fontSize: 13 }}>
          <option value="All">All Employees</option>
          {employees.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
        </select>
        {selEmp !== 'All' && (
          <div style={{ display: 'flex', gap: 4 }}>
            {['summary','timeline'].map(v => (
              <span key={v} className={`chip${view === v ? ' on' : ''}`} onClick={() => setView(v)} style={{ textTransform: 'capitalize' }}>{v}</span>
            ))}
          </div>
        )}
        <button className="btn sec" style={{ fontSize: 12, padding: '6px 14px' }} onClick={load}>↻ Refresh</button>
        <button className="btn sec" style={{ fontSize: 12, padding: '6px 14px' }}
          onClick={() => exportCSV(
            [['Employee','Time','Action','Category','Description','Entity'],
             ...filteredLogs.map(l => [l.employee_name, new Date(l.created_at).toLocaleString(), l.action, l.category, l.description||'', l.entity_name||''])],
            `activity-report-${date}`
          )}>⬇ CSV</button>
        <button className="btn sec" style={{ fontSize: 12, padding: '6px 14px' }}
          onClick={() => exportExcel(
            [['Employee','Time','Action','Category','Description','Entity'],
             ...filteredLogs.map(l => [l.employee_name, new Date(l.created_at).toLocaleString(), l.action, l.category, l.description||'', l.entity_name||''])],
            `activity-report-${date}`
          )}>📊 Excel</button>
        <button className="btn sec" style={{ fontSize: 12, padding: '6px 14px' }}
          onClick={() => exportPDF(`Activity Report — ${date}`, [{
            heading: selEmp === 'All' ? 'All Staff Activity' : `${selEmp} — Activity`,
            headers: ['Employee','Time','Category','Description'],
            rows: filteredLogs.map(l => [l.employee_name, new Date(l.created_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true}), l.category, l.description||''])
          }])}>🖨️ PDF</button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 10, marginBottom: 14 }}>
        {[
          { label: 'Total Actions',  val: logs.length,                                           color: 'var(--tx)' },
          { label: 'Calls Logged',   val: logs.filter(l=>l.category==='call').length,            color: 'var(--green)' },
          { label: 'Leads Touched',  val: logs.filter(l=>l.category==='lead').length,            color: 'var(--blue)' },
          { label: 'Payments',       val: logs.filter(l=>l.category==='payment').length,         color: '#10b981' },
          { label: 'E-Signs Sent',   val: logs.filter(l=>l.category==='esign').length,           color: '#7c3aed' },
          { label: 'Active Staff',   val: Object.keys(byEmp).length,                             color: 'var(--warn)' },
        ].map(({ label, val, color }) => (
          <div key={label} className="card" style={{ padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 900, color, lineHeight: 1 }}>{val}</div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>Loading activity…</div>
      ) : logs.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📊</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--tx)', marginBottom: 4 }}>No activity recorded</div>
          <div style={{ fontSize: 13, color: 'var(--t3)' }}>Activity logging started from today. Actions taken before this won't appear.</div>
        </div>
      ) : view === 'summary' ? (
        // ── Summary view ────────────────────────────────────────────────────
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {empSummaries.map(emp => (
            <div key={emp.name} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Employee header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: '1px solid var(--br)', cursor: 'pointer' }}
                onClick={() => { setSelEmp(emp.name); setView('timeline') }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                  {emp.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx)' }}>{emp.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
                    {emp.loginAt ? `Login ${fmtTime(emp.loginAt)}` : 'No login recorded'}
                    {emp.online ? ` · Active ${emp.online}` : ''}
                    {emp.lastAt ? ` · Last action ${fmtTime(emp.lastAt)}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {[
                    { icon: '⚡', val: emp.total, label: 'actions' },
                    { icon: '📞', val: emp.calls, label: 'calls' },
                    { icon: '👥', val: emp.leads, label: 'leads' },
                    { icon: '💳', val: emp.payments, label: 'payments' },
                    { icon: '✍️', val: emp.esigns, label: 'esigns' },
                  ].filter(s => s.val > 0).map(s => (
                    <div key={s.label} style={{ textAlign: 'center', background: 'var(--s2)', borderRadius: 8, padding: '4px 10px', minWidth: 44 }}>
                      <div style={{ fontSize: 13 }}>{s.icon}</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx)', lineHeight: 1 }}>{s.val}</div>
                      <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                <span style={{ fontSize: 11, color: 'var(--blue)', marginLeft: 8, flexShrink: 0 }}>View timeline →</span>
              </div>

              {/* Last 3 actions preview */}
              <div style={{ padding: '8px 18px' }}>
                {emp.logs.slice(-3).reverse().map((l, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: i < 2 ? '1px solid var(--br)' : 'none', fontSize: 12 }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{ICONS[l.category] || '📌'}</span>
                    <span style={{ color: 'var(--t2)', flexShrink: 0, width: 72 }}>{fmtTime(l.created_at)}</span>
                    <span style={{ color: 'var(--tx)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // ── Timeline view ────────────────────────────────────────────────────
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--br)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{selEmp}</span>
              <span style={{ fontSize: 12, color: 'var(--t3)', marginLeft: 8 }}>{filteredLogs.length} actions on {date}</span>
            </div>
            <button className="btn sec" style={{ fontSize: 12 }} onClick={() => { setSelEmp('All'); setView('summary') }}>← All staff</button>
          </div>

          {filteredLogs.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>No activity for {selEmp} on this date.</div>
          ) : (
            <div style={{ padding: '8px 0' }}>
              {filteredLogs.map((l, i) => {
                const color = CATEGORY_COLORS[l.category] || 'var(--t3)'
                const prev = filteredLogs[i - 1]
                const gap = prev ? Math.round((new Date(l.created_at) - new Date(prev.created_at)) / 60000) : 0
                return (
                  <div key={l.id}>
                    {/* Show idle gap if > 10 minutes between actions */}
                    {gap > 10 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 18px 4px 58px' }}>
                        <div style={{ flex: 1, height: 1, background: 'var(--br)', borderStyle: 'dashed' }} />
                        <span style={{ fontSize: 10, color: 'var(--t3)', flexShrink: 0 }}>idle {gap < 60 ? `${gap}m` : `${Math.floor(gap/60)}h ${gap%60}m`}</span>
                        <div style={{ flex: 1, height: 1, background: 'var(--br)' }} />
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 18px' }}>
                      {/* Timeline dot */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, marginTop: 5 }} />
                        {i < filteredLogs.length - 1 && <div style={{ width: 1, flex: 1, minHeight: 16, background: 'var(--br)', marginTop: 3 }} />}
                      </div>
                      {/* Time */}
                      <div style={{ fontSize: 12, color: 'var(--t3)', width: 64, flexShrink: 0, marginTop: 3 }}>{fmtTime(l.created_at)}</div>
                      {/* Icon + content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                          <span style={{ fontSize: 15 }}>{ICONS[l.category] || '📌'}</span>
                          <span style={{ fontSize: 13, color: 'var(--tx)', fontWeight: 600 }}>{l.description}</span>
                          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: color + '22', color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', flexShrink: 0 }}>
                            {l.category}
                          </span>
                        </div>
                        {l.meta && Object.keys(l.meta).length > 0 && l.category !== 'session' && (
                          <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                            {Object.entries(l.meta).filter(([k,v]) => v).map(([k,v]) => `${k}: ${v}`).join(' · ')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
