import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'

const TYPE_LABEL = { pto: 'PTO', sick: 'Sick', vacation: 'Vacation' }
const TYPE_COLOR = { pto: '#60a5fa', sick: '#f87171', vacation: '#4ade80' }
const STATUS_C   = { pending: 'ba', approved: 'bg', denied: 'br', cancelled: 'bn' }

function fmtDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function TimeOff() {
  const { user } = useApp()
  const [requests, setRequests] = useState([])
  const [employees, setEmployees] = useState([])
  const [filter, setFilter] = useState('pending')
  const [toast, setToast] = useState('')
  const [working, setWorking] = useState(null)

  useEffect(() => { load() }, [])

  useEffect(() => {
    const ch = supabase.channel('timeoff-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_off_requests' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function load() {
    const [{ data: reqs }, { data: emps }] = await Promise.all([
      supabase.from('time_off_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('employees').select('id,name,pto_balance,sick_balance,vacation_balance'),
    ])
    setRequests(reqs || [])
    setEmployees(emps || [])
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3500) }

  async function review(req, status) {
    setWorking(req.id)
    const actor = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Staff'
    const { error } = await supabase.from('time_off_requests')
      .update({ status, reviewed_by: actor, reviewed_at: new Date().toISOString() })
      .eq('id', req.id)
    if (error) { showToast('Error: ' + error.message); setWorking(null); return }

    if (status === 'approved') {
      const col = req.type === 'pto' ? 'pto_balance' : req.type === 'sick' ? 'sick_balance' : 'vacation_balance'
      const emp = employees.find(e => e.id === req.employee_id) || employees.find(e => e.name === req.employee_name)
      if (emp) {
        const updated = Math.max(0, (emp[col] || 0) - req.days)
        await supabase.from('employees').update({ [col]: updated }).eq('id', emp.id)
      }
    }
    showToast(status === 'approved' ? '✅ Approved' : '🚫 Denied')
    setWorking(null)
    load()
  }

  const filtered = filter === 'All' ? requests : requests.filter(r => r.status === filter)
  const pendingCount = requests.filter(r => r.status === 'pending').length

  return (
    <div>
      {toast && <div className="toast show">{toast}</div>}

      <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {['pending', 'approved', 'denied', 'cancelled', 'All'].map(s => (
          <span key={s} className={`chip${filter === s ? ' on' : ''}`} onClick={() => setFilter(s)} style={{ textTransform: 'capitalize' }}>
            {s}{s === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
          </span>
        ))}
      </div>

      <div className="card">
        <div className="ch">
          <span className="ct">Time Off Requests ({filtered.length})</span>
          <span style={{ fontSize: 11, color: 'var(--t3)' }}>Employees submit these from the /clockin kiosk</span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--t3)', padding: 30 }}>No {filter === 'All' ? '' : filter} requests.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
            {filtered.map(r => (
              <div key={r.id} className="card" style={{ margin: 0, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{r.employee_name}</span>
                      <span className="bdg" style={{ background: TYPE_COLOR[r.type] + '22', color: TYPE_COLOR[r.type] }}>{TYPE_LABEL[r.type] || r.type}</span>
                      <span className={`bdg ${STATUS_C[r.status] || 'bn'}`} style={{ textTransform: 'capitalize' }}>{r.status}</span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--t2)' }}>
                      {fmtDate(r.start_date)} – {fmtDate(r.end_date)} · {r.days} day{r.days !== 1 ? 's' : ''}
                    </div>
                    {r.reason && <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 4 }}>"{r.reason}"</div>}
                    {r.reviewed_by && (
                      <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
                        Reviewed by {r.reviewed_by}{r.reviewed_at ? ' · ' + new Date(r.reviewed_at).toLocaleString() : ''}
                      </div>
                    )}
                  </div>
                  {r.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button className="btn ok" disabled={working === r.id} onClick={() => review(r, 'approved')}>✓ Approve</button>
                      <button className="btn del" disabled={working === r.id} onClick={() => review(r, 'denied')}>✕ Deny</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
