import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { hoursFromEntry, currentPeriod, buildLineItems } from '../lib/payrollUtils'

const LOGO = '/taxcasereview-CRM/logo.png'

// Same time math the kiosk (ClockIn.jsx) and admin TimeClock.jsx use, kept in sync.
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
function fmt12(t) {
  if (!t) return '—'
  if (t.match(/AM|PM/i)) return t
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hr = h % 12 || 12
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`
}
function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function getWeekStart(offset = 0) {
  const now = new Date()
  const diff = now.getDate() - now.getDay() + offset * 7
  return new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0)
}
// Step `offset` half-month pay periods forward/back from today and return that period.
function periodAtOffset(offset) {
  let d = new Date()
  let steps = offset
  while (steps !== 0) {
    if (steps > 0) {
      d = d.getDate() <= 15 ? new Date(d.getFullYear(), d.getMonth(), 16) : new Date(d.getFullYear(), d.getMonth() + 1, 1)
      steps--
    } else {
      d = d.getDate() <= 15 ? new Date(d.getFullYear(), d.getMonth() - 1, 16) : new Date(d.getFullYear(), d.getMonth(), 1)
      steps++
    }
  }
  return currentPeriod(d)
}

const CARD = { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16, padding: '1.25rem' }
const PRIORITY_COLOR = { High: '#f87171', Normal: '#60a5fa', Low: '#64748b' }

export default function EmployeePortal() {
  const [screen, setScreen] = useState('login')
  const [empId, setEmpId] = useState('')
  const [emp, setEmp] = useState(null)
  const [loginErr, setLoginErr] = useState('')
  const [logging, setLogging] = useState(false)
  const [now, setNow] = useState(new Date())

  const [entries, setEntries] = useState([])       // timeentries, this week
  const [openEntry, setOpenEntry] = useState(null) // currently-open punch, if any
  const [clocking, setClocking] = useState(false)
  const [clockMsg, setClockMsg] = useState('')
  const [weekOffset, setWeekOffset] = useState(0)

  const [tasks, setTasks] = useState([])
  const [events, setEvents] = useState([])

  const [periodOffset, setPeriodOffset] = useState(0)
  const [periodEntries, setPeriodEntries] = useState([])

  const [timeOffReqs, setTimeOffReqs] = useState([])
  const [showRequestForm, setShowRequestForm] = useState(false)
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

  useEffect(() => { if (emp) loadWeek(emp, weekOffset) }, [weekOffset])
  useEffect(() => { if (emp) loadPeriod(emp, periodOffset) }, [periodOffset])

  // Realtime — clock/task/calendar/time-off changes reflect without a manual refresh
  useEffect(() => {
    if (!emp) return
    const ch = supabase.channel('emp-portal-tcr-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'timeentries' }, () => { loadWeek(emp, weekOffset); loadPeriod(emp, periodOffset) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => loadTasks(emp))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calevents' }, () => loadEvents(emp))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_off_requests' }, () => loadTimeOff(emp))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [emp?.id])

  async function handleLogin() {
    if (!empId.trim()) return
    setLogging(true); setLoginErr('')
    const { data } = await supabase.from('employees').select('*').ilike('employee_id', empId.trim()).maybeSingle()
    if (!data) { setLoginErr('Employee ID not found. Check with your manager.'); setLogging(false); return }
    setEmp(data)
    await Promise.all([loadWeek(data, 0), loadPeriod(data, 0), loadTasks(data), loadEvents(data), loadTimeOff(data)])
    setScreen('home')
    setLogging(false)
  }

  async function loadWeek(e, wOffset = weekOffset) {
    const start = getWeekStart(wOffset)
    const end = new Date(start.getTime() + 7 * 86400000)
    const { data } = await supabase.from('timeentries').select('*')
      .eq('employee', e.name).gte('date', localDateStr(start)).lt('date', localDateStr(end))
      .order('date', { ascending: false })
    setEntries(data || [])
    const { data: open } = await supabase.from('timeentries').select('*')
      .eq('employee', e.name).is('outTime', null).is('hours', null)
      .order('created_at', { ascending: false }).limit(1)
    setOpenEntry(open?.[0] || null)
  }

  async function loadPeriod(e, pOffset = periodOffset) {
    const { start, end } = periodAtOffset(pOffset)
    const { data } = await supabase.from('timeentries').select('*')
      .eq('employee', e.name).gte('date', start).lte('date', end)
    setPeriodEntries(data || [])
  }

  async function loadTasks(e) {
    const { data } = await supabase.from('tasks').select('*')
      .eq('assignedTo', e.name).eq('done', false).eq('deleted', false)
      .order('dueDate', { ascending: true }).limit(20)
    setTasks(data || [])
  }

  async function loadEvents(e) {
    const today = localDateStr(new Date())
    const { data } = await supabase.from('calevents').select('*')
      .eq('assignedTo', e.name).gte('date', today)
      .order('date', { ascending: true }).order('time', { ascending: true }).limit(30)
    setEvents(data || [])
  }

  async function loadTimeOff(e) {
    const { data } = await supabase.from('time_off_requests').select('*')
      .eq('employee_id', e.id).order('created_at', { ascending: false })
    setTimeOffReqs(data || [])
  }

  async function handleClockToggle() {
    if (!emp || clocking) return
    setClocking(true)
    if (openEntry) {
      const outTime = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      const hours = calcHours(openEntry.inTime, outTime) || '0'
      const { error } = await supabase.from('timeentries').update({ outTime, hours: parseFloat(hours) }).eq('id', openEntry.id)
      if (error) { setClockMsg('❌ ' + error.message); setClocking(false); return }
      setClockMsg(`✅ Clocked out at ${outTime} — ${hours}h logged`)
      setOpenEntry(null)
    } else {
      const inTime = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      const date = localDateStr(new Date())
      const { data, error } = await supabase.from('timeentries').insert([{
        employee: emp.name, date, inTime, outTime: null, hours: null, notes: null
      }]).select().single()
      if (error) { setClockMsg('❌ ' + error.message); setClocking(false); return }
      setClockMsg(`✅ Clocked in at ${inTime}`)
      setOpenEntry(data)
    }
    await loadWeek(emp, weekOffset)
    await loadPeriod(emp, periodOffset)
    setClocking(false)
    setTimeout(() => setClockMsg(''), 4000)
  }

  async function toggleTaskDone(t) {
    await supabase.from('tasks').update({ done: true }).eq('id', t.id)
    setTasks(prev => prev.filter(x => x.id !== t.id))
  }

  // Best-effort notification to Super Admin/Admin users — never blocks the
  // request from going through. If send-email isn't configured, this
  // silently no-ops; the request itself is still saved and visible in the
  // admin Time Off page either way.
  async function notifyTimeOffSubmitted(e, type, start, end, days) {
    try {
      const { data: admins } = await supabase.from('employees')
        .select('email').in('access', ['Super Admin', 'Admin']).not('email', 'is', null)
      const recipients = [...new Set((admins || []).map(a => a.email).filter(Boolean))]
      if (recipients.length === 0) return
      const subject = `Time off request — ${e.name}`
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">` +
        `<div style="font-size:18px;font-weight:800;color:#1d4ed8;margin-bottom:16px">Tax Case Review</div>` +
        `<p><strong>${e.name}</strong> (${e.employee_id}) requested ${type.toUpperCase()} time off.</p>` +
        `<p>${start} to ${end} (${days} day${days === 1 ? '' : 's'})</p>` +
        `<p style="font-size:12px;color:#64748b">Review and approve/deny in the CRM under Time Off.</p></div>`
      await Promise.all(recipients.map(to =>
        supabase.functions.invoke('send-email', { body: { to, subject, html } }).catch(() => {})
      ))
    } catch {
      // Never let a notification failure block the employee's request.
    }
  }

  async function handleSubmitRequest() {
    if (!emp || !reqStart || !reqEnd) { setReqMsg('Please pick start and end dates.'); return }
    const start = new Date(reqStart + 'T00:00:00'), end = new Date(reqEnd + 'T00:00:00')
    if (end < start) { setReqMsg('End date must be after start date.'); return }
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1
    setReqSaving(true); setReqMsg('')
    const { error } = await supabase.from('time_off_requests').insert({
      employee_id: emp.id, employee_name: emp.name, type: reqType,
      start_date: reqStart, end_date: reqEnd, days, reason: reqReason.trim() || null, status: 'pending',
    })
    if (error) {
      setReqMsg('❌ ' + error.message)
    } else {
      setReqMsg('✅ Request submitted — waiting on approval.')
      notifyTimeOffSubmitted(emp, reqType, reqStart, reqEnd, days)
      setReqStart(''); setReqEnd(''); setReqReason(''); setShowRequestForm(false)
      await loadTimeOff(emp)
    }
    setReqSaving(false)
    setTimeout(() => setReqMsg(''), 5000)
  }

  const weekStart = getWeekStart(weekOffset)
  const weekEnd = new Date(weekStart.getTime() + 6 * 86400000)
  const weekLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  const weekHours = entries.reduce((s, e) => s + hoursFromEntry(e), 0)

  const period = periodAtOffset(periodOffset)
  const periodLine = emp ? buildLineItems([emp], periodEntries, period.start, period.end)[0] : null

  // Quick "this week" pay estimate for the Home screen — same hourly/OT math as
  // the full Pay tab's buildLineItems, just windowed to the calendar week.
  const weekLine = emp ? buildLineItems([emp], entries, localDateStr(weekStart), localDateStr(weekEnd))[0] : null

  if (screen === 'login') return (
    <div style={{ minHeight: '100vh', background: '#060d18', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <img src={LOGO} alt="Tax Case Review" style={{ width: 80, height: 80, borderRadius: 16, objectFit: 'cover', marginBottom: 20 }} onError={e => { e.currentTarget.style.display = 'none' }} />
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', margin: '0 0 6px' }}>Tax Case Review</h1>
      <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 32px' }}>Employee Portal</p>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>EMPLOYEE ID</label>
        <input
          value={empId} onChange={e => setEmpId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
          placeholder="e.g. TCR-100"
          style={{ width: '100%', padding: '14px 16px', background: '#0f172a', border: '1px solid #334155', borderRadius: 12, color: '#f1f5f9', fontSize: 16, outline: 'none', boxSizing: 'border-box', marginBottom: 12, fontFamily: 'inherit' }}
          autoFocus
        />
        {loginErr && <p style={{ color: '#f87171', fontSize: 13, margin: '0 0 12px' }}>{loginErr}</p>}
        <button onClick={handleLogin} disabled={logging || !empId.trim()}
          style={{ width: '100%', padding: 14, background: empId.trim() ? '#16a34a' : '#1e293b', border: 'none', borderRadius: 12, color: '#fff', fontSize: 16, fontWeight: 700, cursor: empId.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
          {logging ? 'Signing in…' : 'Sign In'}
        </button>
        <p style={{ fontSize: 12, color: '#475569', textAlign: 'center', marginTop: 16 }}>Don't know your Employee ID? Ask your manager.</p>
      </div>
    </div>
  )

  if (!emp) return null

  const nav = (label, icon, s) => (
    <button onClick={() => setScreen(s)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 0', background: 'none', border: 'none', color: screen === s ? '#16a34a' : '#475569', cursor: 'pointer', fontFamily: 'inherit' }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <span style={{ fontSize: 10, fontWeight: 600 }}>{label}</span>
    </button>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#060d18', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', maxWidth: 480, margin: '0 auto', paddingBottom: 80 }}>

      {/* Header */}
      <div style={{ background: '#0a1628', borderBottom: '1px solid #1e293b', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: '#fff' }}>
            {(emp.name || '?')[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{emp.name}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{emp.employee_id}{emp.title ? ' · ' + emp.title : ''}</div>
          </div>
        </div>
        <button onClick={() => { setEmp(null); setScreen('login'); setEmpId('') }}
          style={{ background: 'none', border: '1px solid #334155', borderRadius: 8, color: '#64748b', padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
          Sign Out
        </button>
      </div>

      {/* ── HOME ── */}
      {screen === 'home' && (
        <div style={{ padding: 16 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>
              Good {now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : 'evening'}, {emp.name.split(' ')[0]}! 👋
            </div>
            <div style={{ fontSize: 13, color: '#64748b' }}>{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          </div>

          <div style={{ ...CARD, marginBottom: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#f1f5f9', fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>
              {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </div>
            {openEntry && <div style={{ fontSize: 13, color: '#4ade80', marginBottom: 12 }}>🟢 Clocked in since {fmt12(openEntry.inTime)}</div>}
            {clockMsg && <div style={{ fontSize: 13, color: '#4ade80', marginBottom: 8 }}>{clockMsg}</div>}
            <button onClick={handleClockToggle} disabled={clocking}
              style={{ width: '100%', padding: 16, background: openEntry ? '#dc2626' : '#16a34a', border: 'none', borderRadius: 12, color: '#fff', fontSize: 18, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', opacity: clocking ? 0.7 : 1 }}>
              {clocking ? '…' : openEntry ? '⏹ Clock Out' : '▶ Clock In'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div style={{ ...CARD, borderTop: '3px solid #4ade80' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>This Week</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9' }}>{weekHours.toFixed(1)}h</div>
            </div>
            <div style={{ ...CARD, borderTop: '3px solid #a78bfa' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Est. Pay</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9' }}>${weekLine ? parseFloat(weekLine.gross).toFixed(0) : '0'}</div>
            </div>
          </div>

          <button onClick={() => setScreen('timeoff')} style={{ ...CARD, width: '100%', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', border: '1px solid #1e293b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>🌴</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Time Off</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {emp.pto_balance ?? 0} PTO · {emp.sick_balance ?? 0} Sick · {emp.vacation_balance ?? 0} Vacation
                </div>
              </div>
            </div>
            <span style={{ color: '#475569', fontSize: 18 }}>›</span>
          </button>

          <div style={{ ...CARD }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 12 }}>📋 My Upcoming Tasks</div>
            {tasks.length === 0
              ? <div style={{ fontSize: 13, color: '#475569', textAlign: 'center', padding: '1rem 0' }}>No upcoming tasks assigned</div>
              : tasks.slice(0, 8).map(t => {
                const overdue = t.dueDate && t.dueDate < localDateStr(new Date())
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: '1px solid #1e293b' }}>
                    <button onClick={() => toggleTaskDone(t)} title="Mark done"
                      style={{ width: 18, height: 18, borderRadius: 5, border: '1.5px solid #334155', background: 'transparent', cursor: 'pointer', flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{t.title}</div>
                        {t.priority && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: (PRIORITY_COLOR[t.priority] || '#64748b') + '22', color: PRIORITY_COLOR[t.priority] || '#64748b', whiteSpace: 'nowrap' }}>{t.priority}</span>}
                      </div>
                      {t.clientName && <div style={{ fontSize: 12, color: '#64748b' }}>{t.clientName}</div>}
                      {t.dueDate && <div style={{ fontSize: 12, color: overdue ? '#f87171' : '#60a5fa' }}>📅 {new Date(t.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{overdue ? ' · overdue' : ''}</div>}
                    </div>
                  </div>
                )
              })
            }
          </div>
        </div>
      )}

      {/* ── SCHEDULE (from Calendar) ── */}
      {screen === 'schedule' && (
        <div style={{ padding: 16 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>My Schedule</h2>
          {events.length === 0
            ? <div style={{ ...CARD, textAlign: 'center', padding: '2rem' }}><div style={{ fontSize: 32, marginBottom: 8 }}>📅</div><div style={{ color: '#475569' }}>No upcoming appointments</div></div>
            : events.map(ev => (
              <div key={ev.id} style={{ ...CARD, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', flex: 1 }}>{ev.title || ev.eventType || 'Appointment'}</div>
                  {ev.status && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(74,222,128,0.12)', color: '#4ade80', marginLeft: 8, whiteSpace: 'nowrap', textTransform: 'capitalize' }}>{ev.status}</span>}
                </div>
                {ev.clientName && <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>👤 {ev.clientName}</div>}
                {ev.date && (
                  <div style={{ fontSize: 13, color: '#60a5fa', marginBottom: 4 }}>
                    🗓 {new Date(ev.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    {ev.time ? ' at ' + fmt12(ev.time) : ''}
                  </div>
                )}
                {ev.eventType && <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>{ev.eventType}</div>}
                {ev.notes && <div style={{ marginTop: 8, padding: '8px 10px', background: '#1e293b', borderRadius: 8, fontSize: 12, color: '#94a3b8' }}>📝 {ev.notes}</div>}
              </div>
            ))
          }
        </div>
      )}

      {/* ── TIME CLOCK ── */}
      {screen === 'timeclock' && (
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>Time Clock</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={() => setWeekOffset(w => w - 1)} style={{ padding: '5px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: 7, color: '#f1f5f9', cursor: 'pointer' }}>‹</button>
              <span style={{ fontSize: 11, color: '#64748b', minWidth: 100, textAlign: 'center' }}>{weekLabel}</span>
              <button onClick={() => setWeekOffset(w => Math.min(w + 1, 0))} disabled={weekOffset >= 0} style={{ padding: '5px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: 7, color: '#f1f5f9', cursor: 'pointer', opacity: weekOffset >= 0 ? 0.4 : 1 }}>›</button>
            </div>
          </div>

          <div style={{ ...CARD, marginBottom: 16, textAlign: 'center' }}>
            {openEntry
              ? <div style={{ marginBottom: 12, fontSize: 13, color: '#4ade80' }}>🟢 Currently clocked in since {fmt12(openEntry.inTime)}</div>
              : <div style={{ marginBottom: 12, fontSize: 13, color: '#475569' }}>Not clocked in</div>}
            {clockMsg && <div style={{ fontSize: 13, color: '#4ade80', marginBottom: 8 }}>{clockMsg}</div>}
            <button onClick={handleClockToggle} disabled={clocking}
              style={{ width: '100%', padding: 14, background: openEntry ? '#dc2626' : '#16a34a', border: 'none', borderRadius: 10, color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              {clocking ? '…' : openEntry ? '⏹ Clock Out' : '▶ Clock In'}
            </button>
          </div>

          <div style={{ ...CARD }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 12 }}>
              Punch History — <span style={{ color: '#64748b', fontWeight: 400 }}>{weekLabel}</span>
              <span style={{ marginLeft: 8, fontSize: 13, color: '#4ade80', fontWeight: 800 }}>{weekHours.toFixed(1)}h total</span>
            </div>
            {entries.length === 0
              ? <div style={{ fontSize: 13, color: '#475569', textAlign: 'center', padding: '1rem 0' }}>No punches this week</div>
              : entries.map(e => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #1e293b' }}>
                  <div>
                    <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>{new Date(e.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      <span style={{ color: '#4ade80' }}>{fmt12(e.inTime)}</span>
                      {' → '}
                      {e.outTime ? <span style={{ color: '#f87171' }}>{fmt12(e.outTime)}</span> : <span style={{ color: '#4ade80', fontWeight: 700 }}>Active</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: e.hours ? '#f1f5f9' : '#4ade80' }}>{e.hours ? `${e.hours}h` : '—'}</div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* ── PAY ── */}
      {screen === 'pay' && periodLine && (
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>My Pay</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={() => setPeriodOffset(o => o - 1)} style={{ padding: '5px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: 7, color: '#f1f5f9', cursor: 'pointer' }}>‹</button>
              <span style={{ fontSize: 11, color: '#64748b', minWidth: 100, textAlign: 'center' }}>{period.label}</span>
              <button onClick={() => setPeriodOffset(o => Math.min(o + 1, 0))} disabled={periodOffset >= 0} style={{ padding: '5px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: 7, color: '#f1f5f9', cursor: 'pointer', opacity: periodOffset >= 0 ? 0.4 : 1 }}>›</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Hours Worked', value: `${periodLine.hours}h`, color: '#4ade80' },
              { label: periodLine.payType === 'Salary' ? 'Pay Type' : 'Hourly Rate', value: periodLine.payType === 'Salary' ? 'Salary' : `$${periodLine.rate}/hr`, color: '#60a5fa' },
              { label: 'Gross Pay', value: `$${periodLine.gross}`, color: '#a78bfa' },
              { label: 'Est. Net Pay', value: `$${periodLine.net}`, color: '#4ade80' },
            ].map(s => (
              <div key={s.label} style={{ ...CARD, borderTop: `3px solid ${s.color}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>{s.value}</div>
              </div>
            ))}
          </div>
          <div style={{ ...CARD }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 12 }}>Pay Breakdown</div>
            {[
              { label: `Regular Pay (${periodLine.regularHours}h × $${periodLine.rate})`, amount: parseFloat(periodLine.regularHours) * periodLine.rate, color: '#f1f5f9' },
              ...(parseFloat(periodLine.otHours) > 0 ? [{ label: `Overtime (${periodLine.otHours}h × $${(periodLine.rate * 1.5).toFixed(2)})`, amount: parseFloat(periodLine.otHours) * periodLine.rate * 1.5, color: '#fbbf24' }] : []),
              { label: 'Gross Pay', amount: parseFloat(periodLine.gross), color: '#f1f5f9', bold: true },
              ...(periodLine.payType !== '1099 Contractor' ? [
                { label: 'Federal Tax (est.)', amount: -parseFloat(periodLine.fedTax), color: '#f87171' },
                { label: 'State Tax (est.)', amount: -parseFloat(periodLine.stateTax), color: '#f87171' },
                { label: 'Social Security (6.2%)', amount: -parseFloat(periodLine.ss), color: '#f87171' },
                { label: 'Medicare (1.45%)', amount: -parseFloat(periodLine.medicare), color: '#f87171' },
              ] : []),
            ].map((row, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #1e293b' }}>
                <span style={{ fontSize: 13, color: row.color, fontWeight: row.bold ? 700 : 400 }}>{row.label}</span>
                <span style={{ fontSize: 13, color: row.color, fontWeight: row.bold ? 700 : 600 }}>{row.amount < 0 ? '-' : ''}${Math.abs(row.amount).toFixed(2)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', marginTop: 4, borderTop: '2px solid #334155' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#4ade80' }}>Est. Net Pay</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#4ade80' }}>${periodLine.net}</span>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 11, color: '#475569' }}>* Estimate based on this pay period's punches. Actual pay handled by payroll admin.</p>
          </div>
        </div>
      )}

      {/* ── TIME OFF ── */}
      {screen === 'timeoff' && (
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>Time Off</h2>
            <button onClick={() => setShowRequestForm(v => !v)}
              style={{ padding: '8px 14px', background: '#16a34a', border: 'none', borderRadius: 9, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {showRequestForm ? 'Cancel' : '+ Request'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'PTO', value: emp.pto_balance ?? 0, color: '#60a5fa' },
              { label: 'Sick', value: emp.sick_balance ?? 0, color: '#f87171' },
              { label: 'Vacation', value: emp.vacation_balance ?? 0, color: '#4ade80' },
            ].map(b => (
              <div key={b.label} style={{ ...CARD, borderTop: `3px solid ${b.color}`, textAlign: 'center', padding: '12px 8px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: b.color, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{b.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>{b.value}</div>
              </div>
            ))}
          </div>

          {showRequestForm && (
            <div style={{ ...CARD, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 12 }}>New Request</div>
              {reqMsg && <div style={{ fontSize: 13, color: reqMsg.startsWith('❌') ? '#f87171' : '#4ade80', marginBottom: 10 }}>{reqMsg}</div>}

              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>TYPE</label>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {['pto', 'sick', 'vacation'].map(t => (
                  <button key={t} onClick={() => setReqType(t)}
                    style={{ flex: 1, padding: 8, borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, textTransform: 'capitalize', background: reqType === t ? 'rgba(74,222,128,0.15)' : '#1e293b', color: reqType === t ? '#4ade80' : '#64748b' }}>
                    {t}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>START DATE</label>
                  <input type="date" value={reqStart} onChange={e => setReqStart(e.target.value)}
                    style={{ width: '100%', padding: 10, background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>END DATE</label>
                  <input type="date" value={reqEnd} onChange={e => setReqEnd(e.target.value)}
                    style={{ width: '100%', padding: 10, background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
              </div>

              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>REASON (OPTIONAL)</label>
              <textarea value={reqReason} onChange={e => setReqReason(e.target.value)} rows={2} placeholder="e.g. family trip"
                style={{ width: '100%', padding: 10, background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 14, resize: 'vertical' }} />

              <button onClick={handleSubmitRequest} disabled={reqSaving}
                style={{ width: '100%', padding: 12, background: '#16a34a', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: reqSaving ? 0.6 : 1 }}>
                {reqSaving ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          )}

          <div style={{ ...CARD }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 12 }}>My Requests</div>
            {timeOffReqs.length === 0
              ? <div style={{ fontSize: 13, color: '#475569', textAlign: 'center', padding: '1rem 0' }}>No requests yet</div>
              : timeOffReqs.map(req => {
                const STATUS = {
                  pending: { bg: 'rgba(251,191,36,0.1)', color: '#fbbf24' },
                  approved: { bg: 'rgba(74,222,128,0.1)', color: '#4ade80' },
                  denied: { bg: 'rgba(248,113,113,0.1)', color: '#f87171' },
                  cancelled: { bg: 'rgba(100,116,139,0.1)', color: '#64748b' },
                }
                const st = STATUS[req.status] || STATUS.cancelled
                return (
                  <div key={req.id} style={{ padding: '10px 0', borderBottom: '1px solid #1e293b' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', textTransform: 'capitalize' }}>{req.type}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: st.bg, color: st.color, textTransform: 'capitalize' }}>{req.status}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      {new Date(req.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {' – '}
                      {new Date(req.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {' · '}{req.days} day{req.days !== 1 ? 's' : ''}
                    </div>
                    {req.reason && <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>"{req.reason}"</div>}
                  </div>
                )
              })
            }
          </div>
        </div>
      )}

      {/* ── QR CODE ── */}
      {screen === 'qr' && (
        <div style={{ padding: 16 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>My Clock-In QR</h2>
          <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b' }}>Your personal badge — scannable once kiosk QR check-in is enabled</p>

          <div style={{ ...CARD, textAlign: 'center', padding: '2rem 1rem', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 12 }}>{emp.name} · {emp.employee_id}</div>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(emp.employee_id)}&color=f1f5f9&bgcolor=0f172a&margin=2`}
              alt="QR Code"
              style={{ width: 220, height: 220, borderRadius: 12, border: '2px solid #1e293b' }}
            />
            <div style={{ marginTop: 16, fontSize: 12, color: '#475569', fontFamily: 'monospace', letterSpacing: '0.1em' }}>{emp.employee_id}</div>
          </div>

          <div style={{ ...CARD, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 12 }}>My Info</div>
            {[
              { label: 'Full Name', value: emp.name },
              { label: 'Employee ID', value: emp.employee_id },
              { label: 'Title', value: emp.title || '—' },
              { label: 'Role', value: emp.access || '—' },
              { label: 'Phone', value: emp.phone || '—' },
              { label: 'Email', value: emp.email || '—' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1e293b' }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{row.label}</span>
                <span style={{ fontSize: 13, color: '#f1f5f9' }}>{row.value}</span>
              </div>
            ))}
          </div>

          <button onClick={() => {
            const w = window.open('', '_blank')
            if (!w) return
            w.document.write(`<!DOCTYPE html><html><head><title>Clock-In Badge — ${emp.name}</title>
            <style>body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f4f6f9;}
            .badge{background:#fff;border:2px solid #1e293b;border-radius:16px;padding:32px;text-align:center;max-width:300px;width:100%;}
            .name{font-size:22px;font-weight:800;color:#0a2540;margin:16px 0 4px;}
            .id{font-size:13px;color:#64748b;font-family:monospace;letter-spacing:.1em;}
            .div{font-size:13px;color:#16a34a;font-weight:600;margin-top:6px;}
            @media print{button{display:none!important}}</style></head><body>
            <div class="badge">
              <img src="https://taxresolutioncrm.github.io/taxcasereview-CRM/logo.png" style="width:60px;height:60px;border-radius:10px;object-fit:cover;margin-bottom:8px;" />
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(emp.employee_id)}&color=0a2540&bgcolor=ffffff&margin=2" style="width:200px;height:200px;border-radius:8px;" />
              <div class="name">${emp.name}</div>
              <div class="id">${emp.employee_id}</div>
              ${emp.title ? `<div class="div">${emp.title}</div>` : ''}
              <p style="font-size:11px;color:#94a3b8;margin-top:12px">Tax Case Review — Employee Badge</p>
              <button onclick="window.print()" style="margin-top:12px;padding:8px 20px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;">🖨️ Print Badge</button>
            </div></body></html>`)
            w.document.close()
          }} style={{ width: '100%', padding: 14, background: '#1e293b', border: '1px solid #334155', borderRadius: 12, color: '#f1f5f9', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            🖨️ Print / Save My Badge
          </button>
        </div>
      )}

      {/* Bottom nav */}
      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, background: '#0a1628', borderTop: '1px solid #1e293b', display: 'flex' }}>
        {nav('Home', '🏠', 'home')}
        {nav('Schedule', '📋', 'schedule')}
        {nav('Clock', '⏱', 'timeclock')}
        {nav('Pay', '💰', 'pay')}
        {nav('My QR', '⊞', 'qr')}
      </div>
    </div>
  )
}
