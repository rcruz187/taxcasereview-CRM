import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Same time math used by the admin TimeClock page, kept in sync
function parseTimeToMins(t) {
  if (!t) return null
  t = t.trim()
  const ampm = t.match(/(\d+):(\d+)\s*(AM|PM)/i)
  if (ampm) {
    let h = parseInt(ampm[1]), m = parseInt(ampm[2])
    const period = ampm[3].toUpperCase()
    if (period === 'PM' && h !== 12) h += 12
    if (period === 'AM' && h === 12) h = 0
    return h * 60 + m
  }
  const plain = t.match(/^(\d+):(\d+)$/)
  if (plain) return parseInt(plain[1]) * 60 + parseInt(plain[2])
  return null
}

function calcHours(inT, outT) {
  const inM = parseTimeToMins(inT), outM = parseTimeToMins(outT)
  if (inM === null || outM === null) return ''
  let diffMins = outM - inM
  if (diffMins <= 0) diffMins += 24 * 60
  const diff = diffMins / 60
  return diff > 0 ? diff.toFixed(2) : ''
}

export default function ClockIn() {
  const [employees, setEmployees] = useState([])
  const [openByEmp, setOpenByEmp] = useState({}) // { empName: [{id, inTime}] }
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null) // employee name currently being saved
  const [done, setDone] = useState(null) // { name, action: 'in'|'out', time, hours }
  const [search, setSearch] = useState('')
  const [now, setNow] = useState(new Date())
  const [reqEmp, setReqEmp] = useState(null) // employee currently filling out a time-off request
  const [reqType, setReqType] = useState('pto')
  const [reqStart, setReqStart] = useState('')
  const [reqEnd, setReqEnd] = useState('')
  const [reqReason, setReqReason] = useState('')
  const [reqSaving, setReqSaving] = useState(false)
  const [reqMsg, setReqMsg] = useState('')

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: emp }, { data: entries }] = await Promise.all([
      supabase.from('employees').select('id,name,title').order('name'),
      supabase.from('timeentries').select('id,employee,inTime,date').is('outTime', null).is('hours', null),
    ])
    setEmployees(emp || [])
    const open = {}
    ;(entries || []).forEach(e => {
      if (!open[e.employee]) open[e.employee] = []
      open[e.employee].push({ id: e.id, inTime: e.inTime })
    })
    setOpenByEmp(open)
    setLoading(false)
  }

  async function handleTap(empName) {
    if (saving) return
    setSaving(empName)
    const isClockedIn = !!(openByEmp[empName] && openByEmp[empName].length > 0)

    if (isClockedIn) {
      // Clock out — close the most recent open entry
      const entries = openByEmp[empName]
      const entry = entries[entries.length - 1]
      const outTime = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      const hours = calcHours(entry.inTime, outTime) || '0'
      const { error } = await supabase.from('timeentries').update({
        outTime, hours: parseFloat(hours)
      }).eq('id', entry.id)
      setSaving(null)
      if (error) { setDone({ name: empName, action: 'error', error: error.message }); return }
      setDone({ name: empName, action: 'out', time: outTime, hours })
      load()
    } else {
      // Clock in
      const inTime = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      const date = new Date().toISOString().slice(0, 10)
      const { error } = await supabase.from('timeentries').insert([{
        employee: empName, date, inTime, outTime: null, hours: null, notes: null
      }])
      setSaving(null)
      if (error) { setDone({ name: empName, action: 'error', error: error.message }); return }
      setDone({ name: empName, action: 'in', time: inTime })
      load()
    }
  }

  function openTimeOffRequest(emp) {
    setReqEmp(emp); setReqType('pto'); setReqStart(''); setReqEnd(''); setReqReason(''); setReqMsg('')
  }

  // Best-effort — never blocks the request from saving even if email isn't configured.
  async function notifyTimeOffSubmitted(e, type, start, end, days) {
    try {
      const { data: admins } = await supabase.from('employees')
        .select('email').in('access', ['Super Admin', 'Admin']).not('email', 'is', null)
      const recipients = [...new Set((admins || []).map(a => a.email).filter(Boolean))]
      if (recipients.length === 0) return
      const subject = `Time off request — ${e.name}`
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">` +
        `<div style="font-size:18px;font-weight:800;color:#1d4ed8;margin-bottom:16px">Tax Case Review</div>` +
        `<p><strong>${e.name}</strong> requested ${type.toUpperCase()} time off.</p>` +
        `<p>${start} to ${end} (${days} day${days === 1 ? '' : 's'})</p>` +
        `<p style="font-size:12px;color:#64748b">Submitted from the clock-in kiosk. Review and approve/deny in the CRM under Time Off.</p></div>`
      await Promise.all(recipients.map(to =>
        supabase.functions.invoke('send-email', { body: { to, subject, html } }).catch(() => {})
      ))
    } catch {}
  }

  async function submitTimeOffRequest() {
    if (!reqEmp || !reqStart || !reqEnd) { setReqMsg('Please pick start and end dates.'); return }
    const start = new Date(reqStart + 'T00:00:00')
    const end = new Date(reqEnd + 'T00:00:00')
    if (end < start) { setReqMsg('End date must be after start date.'); return }
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1

    setReqSaving(true); setReqMsg('')
    const { error } = await supabase.from('time_off_requests').insert({
      employee_id: reqEmp.id,
      employee_name: reqEmp.name,
      type: reqType,
      start_date: reqStart,
      end_date: reqEnd,
      days,
      reason: reqReason.trim() || null,
      status: 'pending',
    })
    setReqSaving(false)
    if (error) { setReqMsg('❌ ' + error.message); return }
    notifyTimeOffSubmitted(reqEmp, reqType, reqStart, reqEnd, days)
    setDone({ name: reqEmp.name, action: 'timeoff' })
    setReqEmp(null)
  }

  const filtered = employees.filter(e => e.name?.toLowerCase().includes(search.toLowerCase()))
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  // ── Confirmation screen ──
  if (done) {
    const isOut = done.action === 'out'
    const isErr = done.action === 'error'
    const isReq = done.action === 'timeoff'
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ textAlign: 'center', padding: '24px 8px' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>{isErr ? '⚠️' : isReq ? '🌴' : isOut ? '👋' : '✅'}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: isErr ? '#f87171' : '#4ade80', marginBottom: 8 }}>
              {isErr ? 'Something went wrong' : isReq ? 'Request Submitted' : isOut ? 'Clocked Out' : 'Clocked In'}
            </div>
            <div style={{ fontSize: 16, color: '#f1f5f9', marginBottom: 6 }}>{done.name}</div>
            {isErr ? (
              <div style={{ fontSize: 13, color: '#94a3b8' }}>{done.error}</div>
            ) : isReq ? (
              <div style={{ fontSize: 13, color: '#94a3b8' }}>Your time off request is waiting on approval.</div>
            ) : (
              <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.7 }}>
                {isOut ? `Out at ${done.time}` : `In at ${done.time}`}
                {isOut && done.hours && <div>Logged <strong style={{ color: '#f1f5f9' }}>{done.hours}h</strong> for this shift</div>}
              </div>
            )}
            <button onClick={() => setDone(null)} style={styles.bigBtn}>
              Done — Back to List
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#60a5fa', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 4 }}>
          Tax Case Review
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{timeStr}</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', marginTop: 4 }}>{dateStr}</div>
      </div>

      <div style={styles.card}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginBottom: 4, textAlign: 'center' }}>
          Tap your name to clock in or out
        </div>
        <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', marginBottom: 16 }}>
          The system automatically knows whether to clock you in or out
        </div>

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search your name..."
          style={styles.search}
        />

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b', fontSize: 13 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b', fontSize: 13 }}>No employees found.</div>
        ) : (
          <div style={styles.grid}>
            {filtered.map(emp => {
              const isIn = !!(openByEmp[emp.name] && openByEmp[emp.name].length > 0)
              const isSaving = saving === emp.name
              return (
                <button
                  key={emp.id}
                  onClick={() => handleTap(emp.name)}
                  disabled={!!saving}
                  style={{
                    ...styles.nameBtn,
                    borderColor: isIn ? '#16a34a' : '#1e3a5f',
                    background: isIn ? 'rgba(22,163,74,.12)' : '#0a1628',
                    opacity: isSaving ? 0.6 : 1,
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{emp.name}</div>
                  {emp.title && <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{emp.title}</div>}
                  <div style={{
                    fontSize: 10, fontWeight: 700, marginTop: 8, padding: '3px 10px', borderRadius: 99,
                    display: 'inline-block',
                    background: isIn ? 'rgba(22,163,74,.2)' : 'rgba(100,116,139,.15)',
                    color: isIn ? '#4ade80' : '#94a3b8',
                  }}>
                    {isSaving ? 'Saving…' : isIn ? '🟢 Clocked In — Tap to Out' : '⚪ Tap to Clock In'}
                  </div>
                  <div onClick={e => { e.stopPropagation(); openTimeOffRequest(emp) }}
                    style={{ fontSize: 10, fontWeight: 700, marginTop: 6, color: '#60a5fa', cursor: 'pointer' }}>
                    🌴 Request Time Off
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', textAlign: 'center', marginTop: 18 }}>
        No app or login needed — works on any phone, tablet, or computer
      </div>

      {reqEmp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
          onClick={e => e.target === e.currentTarget && setReqEmp(null)}>
          <div style={{ ...styles.card, maxWidth: 420, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>Request Time Off — {reqEmp.name}</div>
              <button onClick={() => setReqEmp(null)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>

            {reqMsg && <div style={{ fontSize: 13, color: reqMsg.startsWith('❌') ? '#f87171' : '#4ade80', marginBottom: 10 }}>{reqMsg}</div>}

            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>TYPE</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {(['pto', 'sick', 'vacation']).map(t => (
                <button key={t} onClick={() => setReqType(t)}
                  style={{ flex: 1, padding: 8, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, textTransform: 'capitalize',
                    background: reqType === t ? 'rgba(74,222,128,0.15)' : '#1e293b', color: reqType === t ? '#4ade80' : '#64748b' }}>
                  {t}
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>START DATE</label>
                <input type="date" value={reqStart} onChange={e => setReqStart(e.target.value)}
                  style={{ width: '100%', padding: 10, background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>END DATE</label>
                <input type="date" value={reqEnd} onChange={e => setReqEnd(e.target.value)}
                  style={{ width: '100%', padding: 10, background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            </div>

            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>REASON (OPTIONAL)</label>
            <textarea value={reqReason} onChange={e => setReqReason(e.target.value)} rows={2} placeholder="e.g. family trip"
              style={{ width: '100%', padding: 10, background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 13, boxSizing: 'border-box', marginBottom: 14, resize: 'vertical' }} />

            <button onClick={submitTimeOffRequest} disabled={reqSaving}
              style={{ width: '100%', padding: 12, background: '#16a34a', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: reqSaving ? 0.6 : 1 }}>
              {reqSaving ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(160deg,#071c30 0%,#0a2f4e 55%,#0a3f60 100%)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '32px 16px 48px',
    fontFamily: '"DM Sans", system-ui, sans-serif',
  },
  card: {
    background: 'rgba(255,255,255,.07)',
    border: '1px solid rgba(255,255,255,.12)',
    borderRadius: 20,
    padding: '28px 24px',
    width: '100%',
    maxWidth: 560,
  },
  search: {
    width: '100%', padding: '12px 16px', marginBottom: 16,
    background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: 10,
    color: '#f1f5f9', fontSize: 14, outline: 'none', boxSizing: 'border-box',
  },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10,
    maxHeight: '55vh', overflowY: 'auto', paddingRight: 2,
  },
  nameBtn: {
    border: '1.5px solid', borderRadius: 12, padding: '14px 12px',
    cursor: 'pointer', textAlign: 'center', transition: 'all .15s',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  bigBtn: {
    marginTop: 24, width: '100%', padding: 14,
    background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.25)',
    borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
}
