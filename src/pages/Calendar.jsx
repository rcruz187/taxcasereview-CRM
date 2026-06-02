import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const EVENT_TYPES = ['Consultation Call','Client Meeting','IRS Call','IRS Appointment','Court Date','Hearing','Deadline','Follow-up Call','Document Due','Payment Due','Team Meeting','Other']
const COLORS = { bb:'#1A7FD4', br:'#C0202F', bg:'#25A25A', ba:'#D4930A', bw:'#6B7280', bv:'#7C3AED' }
const COLOR_OPTS = [
  { val:'bb', label:'🔵 Blue — Call/Meeting' },
  { val:'bg', label:'🟢 Green — Completed' },
  { val:'ba', label:'🟡 Yellow — Deadline' },
  { val:'br', label:'🔴 Red — IRS/Urgent' },
  { val:'bv', label:'🟣 Purple — Court/Hearing' },
]
const BLANK = { title:'', eventType:'Consultation Call', date:'', time:'', endTime:'', clientName:'', assignedTo:'', notes:'', color:'bb', recurring:'none' }

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hr = parseInt(h)
  return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`
}

export default function Calendar() {
  const today = new Date()
  const [year, setYear]     = useState(today.getFullYear())
  const [month, setMonth]   = useState(today.getMonth())
  const [view, setView]     = useState('month') // month | week | list
  const [events, setEvents] = useState([])
  const [clients, setClients] = useState([])
  const [employees, setEmployees] = useState([])
  const [deadlines, setDeadlines] = useState([])
  const [modal, setModal]   = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm]     = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [toast, setToast]   = useState('')
  const [selectedDay, setSelectedDay] = useState(null)
  const [sug, setSug]       = useState([])
  const [showSug, setShowSug] = useState(false)
  const [detailEv, setDetailEv] = useState(null)
  const containerRef = useRef(null)

  // Escape .page-content padding so calendar goes full-width
  useEffect(() => {
    const el = document.querySelector('.page-content')
    if (!el) return
    const orig = { padding: el.style.padding, overflow: el.style.overflow }
    el.style.padding = '0'
    el.style.overflow = 'hidden'
    return () => {
      el.style.padding = orig.padding
      el.style.overflow = orig.overflow
    }
  }, [])

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: ev }, { data: cl }, { data: em }, { data: dl }] = await Promise.all([
      supabase.from('calevents').select('*').order('date', { ascending: true }),
      supabase.from('clients').select('id,name'),
      supabase.from('employees').select('name'),
      supabase.from('deadlines').select('id,title,dueDate,clientName,status').neq('status', 'Completed'),
    ])
    if (ev) setEvents(ev)
    if (cl) setClients(cl)
    if (em) setEmployees(em)
    if (dl) setDeadlines(dl)
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }
  function fld(k, v) { setForm(f => ({ ...f, [k]: v })) }
  function prevMonth() { month === 0 ? (setMonth(11), setYear(y => y - 1)) : setMonth(m => m - 1) }
  function nextMonth() { month === 11 ? (setMonth(0), setYear(y => y + 1)) : setMonth(m => m + 1) }

  function dateStr(d) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  function eventsOn(ds) {
    const cal = events.filter(e => e.date === ds)
    const dls = deadlines.filter(d => d.dueDate === ds).map(d => ({ ...d, _isDl: true, color: 'br' }))
    return [...cal, ...dls].sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  }

  function openNew(date = '') {
    setForm({ ...BLANK, date, time: '09:00' })
    setEditId(null); setModal(true); setDetailEv(null)
  }

  function openEdit(ev) {
    setForm({ ...BLANK, ...ev }); setEditId(ev.id); setModal(true); setDetailEv(null)
  }

  async function save() {
    if (!form.title || !form.date) { showToast('Title and date required'); return }
    setSaving(true)
    let error
    if (editId) {
      ;({ error } = await supabase.from('calevents').update({ ...form, updated_at: new Date().toISOString() }).eq('id', editId))
    } else {
      ;({ error } = await supabase.from('calevents').insert([{ ...form, created_at: new Date().toISOString() }]))
    }
    setSaving(false)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('✅ Saved!'); setModal(false); setEditId(null); setForm(BLANK); load()
  }

  async function del(id) {
    if (!confirm('Delete this event?')) return
    await supabase.from('calevents').delete().eq('id', id)
    showToast('Deleted'); setDetailEv(null); load()
  }

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const reps = employees.length > 0 ? employees.map(e => e.name) : ['Romy Cruz', 'Dana Richard', 'Yesenia Gonzalez']

  // Month grid
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  // Week view — current week
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - today.getDay())
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek); d.setDate(startOfWeek.getDate() + i); return d
  })

  // Upcoming
  const allItems = [
    ...events.map(e => ({ ...e, _type: 'event' })),
    ...deadlines.map(d => ({ ...d, date: d.dueDate, color: 'br', _type: 'deadline' }))
  ].filter(e => e.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 20)

  const S = { // styles shorthand
    cell: (ds, isWeekend) => ({
      flex: 1, minHeight: 110, borderRight: '1px solid var(--br)', borderBottom: '1px solid var(--br)',
      padding: '6px 5px 4px', cursor: 'pointer', position: 'relative',
      background: ds === todayStr ? 'rgba(26,127,212,.1)' : isWeekend ? 'rgba(255,255,255,.01)' : 'var(--bg)',
      transition: 'background .1s',
    })
  }

  return (
    <div ref={containerRef} style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 52px)',
      background: 'var(--bg)', overflow: 'hidden',
    }}>
      {toast && <div className="toast show">{toast}</div>}

      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 20px', borderBottom: '1px solid var(--br)',
        background: 'var(--sf)', flexShrink: 0, flexWrap: 'wrap'
      }}>
        <button className="btn sec" style={{ padding: '5px 12px', fontSize: 16, lineHeight: 1 }} onClick={prevMonth}>‹</button>
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, minWidth: 170, textAlign: 'center', color: 'var(--tx)' }}>
          {MONTHS[month]} {year}
        </h2>
        <button className="btn sec" style={{ padding: '5px 12px', fontSize: 16, lineHeight: 1 }} onClick={nextMonth}>›</button>
        <button className="btn sec" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => { setMonth(today.getMonth()); setYear(today.getFullYear()) }}>Today</button>

        <div style={{ flex: 1 }} />

        {/* View switcher */}
        <div style={{ display: 'flex', background: 'var(--s2)', borderRadius: 8, padding: 2, gap: 2 }}>
          {['month', 'week', 'list'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: view === v ? 'var(--blue)' : 'transparent',
              color: view === v ? '#fff' : 'var(--t2)',
              fontWeight: view === v ? 700 : 400, fontSize: 12, textTransform: 'capitalize',
              transition: 'all .15s'
            }}>{v}</button>
          ))}
        </div>

        <button className="btn pri" style={{ fontSize: 13, padding: '6px 16px' }} onClick={() => openNew()}>
          + New Event
        </button>
      </div>

      {/* ── Body: grid + sidebar ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Main calendar area */}
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>

          {/* MONTH VIEW */}
          {view === 'month' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              {/* Day-of-week headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid var(--br)', background: 'var(--sf)', flexShrink: 0 }}>
                {DAYS_SHORT.map((d, i) => (
                  <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: 11, fontWeight: 700, color: i === 0 || i === 6 ? 'var(--bad)' : 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{d}</div>
                ))}
              </div>
              {/* Cells */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', flex: 1, alignContent: 'start' }}>
                {cells.map((day, i) => {
                  if (!day) return <div key={'e' + i} style={{ minHeight: 110, borderRight: '1px solid var(--br)', borderBottom: '1px solid var(--br)', background: 'rgba(0,0,0,.15)' }} />
                  const ds = dateStr(day)
                  const evs = eventsOn(ds)
                  const isToday = ds === todayStr
                  const isWeekend = new Date(year, month, day).getDay() % 6 === 0
                  const isSelected = selectedDay === day
                  return (
                    <div key={day}
                      onClick={() => setSelectedDay(isSelected ? null : day)}
                      onDoubleClick={() => openNew(ds)}
                      style={{
                        ...S.cell(ds, isWeekend),
                        outline: isSelected ? '2px solid var(--blue)' : 'none',
                        outlineOffset: -1,
                      }}
                    >
                      {/* Day number */}
                      <div style={{
                        width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: isToday ? 800 : 400, marginBottom: 3,
                        background: isToday ? 'var(--blue)' : 'transparent',
                        color: isToday ? '#fff' : isWeekend ? 'var(--t3)' : 'var(--t2)',
                      }}>{day}</div>

                      {/* Events */}
                      {evs.slice(0, 3).map((ev, idx) => (
                        <div key={ev.id || idx}
                          onClick={e => { e.stopPropagation(); setDetailEv(ev); setSelectedDay(day) }}
                          style={{
                            fontSize: 10, fontWeight: 600, padding: '2px 5px', borderRadius: 4, marginBottom: 2,
                            background: COLORS[ev.color || 'bb'] + '28', color: COLORS[ev.color || 'bb'],
                            borderLeft: `2px solid ${COLORS[ev.color || 'bb']}`,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            cursor: 'pointer',
                          }}>
                          {ev.time ? fmtTime(ev.time) + ' ' : ''}{ev._isDl ? '⏰ ' : ''}{ev.title}
                        </div>
                      ))}
                      {evs.length > 3 && <div style={{ fontSize: 9, color: 'var(--t3)', fontWeight: 600, paddingLeft: 4 }}>+{evs.length - 3} more</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* WEEK VIEW */}
          {view === 'week' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid var(--br)', background: 'var(--sf)', flexShrink: 0 }}>
                {weekDays.map((d, i) => {
                  const ds = d.toISOString().slice(0, 10)
                  const isToday = ds === todayStr
                  return (
                    <div key={i} onClick={() => openNew(ds)} style={{ padding: '10px 0', textAlign: 'center', cursor: 'pointer', borderRight: '1px solid var(--br)' }}>
                      <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{DAYS_SHORT[i]}</div>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '4px auto 0', fontSize: 15, fontWeight: isToday ? 800 : 500,
                        background: isToday ? 'var(--blue)' : 'transparent',
                        color: isToday ? '#fff' : 'var(--tx)'
                      }}>{d.getDate()}</div>
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', flex: 1, overflow: 'auto' }}>
                {weekDays.map((d, i) => {
                  const ds = d.toISOString().slice(0, 10)
                  const evs = eventsOn(ds)
                  return (
                    <div key={i} onDoubleClick={() => openNew(ds)} style={{
                      borderRight: '1px solid var(--br)', padding: '8px 5px', minHeight: 200,
                      background: ds === todayStr ? 'rgba(26,127,212,.07)' : 'var(--bg)',
                    }}>
                      {evs.map((ev, idx) => (
                        <div key={ev.id || idx} onClick={() => setDetailEv(ev)} style={{
                          fontSize: 11, fontWeight: 600, padding: '4px 7px', borderRadius: 5, marginBottom: 4,
                          background: COLORS[ev.color || 'bb'] + '28', color: COLORS[ev.color || 'bb'],
                          borderLeft: `3px solid ${COLORS[ev.color || 'bb']}`, cursor: 'pointer',
                        }}>
                          {ev.time ? <span style={{ opacity: .7, fontSize: 10 }}>{fmtTime(ev.time)}<br /></span> : null}
                          {ev.title}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* LIST VIEW */}
          {view === 'list' && (
            <div style={{ flex: 1, overflow: 'auto' }}>
              {allItems.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)', fontSize: 14 }}>No upcoming events or deadlines.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--sf)', zIndex: 1 }}>
                    <tr>
                      {['Date', 'Time', 'Event', 'Client', 'Type', 'Rep', ''].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '1px solid var(--br)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allItems.map((ev, i) => (
                      <tr key={ev.id || i}
                        onClick={() => setDetailEv(ev)}
                        style={{ borderBottom: '1px solid var(--br)', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}
                      >
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: ev.date === todayStr ? 'var(--blue)' : 'var(--tx)' }}>
                          {ev.date === todayStr ? 'Today' : new Date(ev.date + 'T12:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--t2)', fontSize: 12 }}>{ev.time ? fmtTime(ev.time) : '—'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[ev.color || 'bb'], flexShrink: 0 }} />
                            <span style={{ fontWeight: 600 }}>{ev.title}</span>
                            {ev._type === 'deadline' && <span className="bdg br" style={{ fontSize: 9 }}>Deadline</span>}
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--t2)' }}>{ev.clientName || '—'}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--t3)', fontSize: 11 }}>{ev.eventType || ev._type || '—'}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--t3)', fontSize: 11 }}>{ev.assignedTo || '—'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          {!ev._isDl && ev._type !== 'deadline' && (
                            <div style={{ display: 'flex', gap: 5 }}>
                              <button className="btn sec" style={{ fontSize: 10, padding: '3px 8px' }} onClick={e => { e.stopPropagation(); openEdit(ev) }}>Edit</button>
                              <button className="btn del" style={{ fontSize: 10, padding: '3px 8px' }} onClick={e => { e.stopPropagation(); del(ev.id) }}>Del</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* ── Right sidebar ── */}
        <div style={{ width: 260, flexShrink: 0, borderLeft: '1px solid var(--br)', background: 'var(--sf)', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>

          {/* Event detail panel */}
          {detailEv ? (
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--tx)' }}>Event Details</div>
                <button onClick={() => setDetailEv(null)} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[detailEv.color || 'bb'], flexShrink: 0 }} />
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--tx)' }}>{detailEv.title}</div>
              </div>
              {[
                ['Date', detailEv.date ? new Date(detailEv.date + 'T12:00').toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) : null],
                ['Time', detailEv.time ? fmtTime(detailEv.time) + (detailEv.endTime ? ' – ' + fmtTime(detailEv.endTime) : '') : null],
                ['Type', detailEv.eventType],
                ['Client', detailEv.clientName],
                ['Assigned', detailEv.assignedTo],
                ['Notes', detailEv.notes],
              ].filter(([, v]) => v).map(([label, val]) => (
                <div key={label} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 13, color: 'var(--tx)', lineHeight: 1.5 }}>{val}</div>
                </div>
              ))}
              {!detailEv._isDl && (
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button className="btn pri" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }} onClick={() => openEdit(detailEv)}>✏️ Edit</button>
                  <button className="btn del" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }} onClick={() => del(detailEv.id)}>🗑 Delete</button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Legend */}
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--br)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>Legend</div>
                {[['bb', 'Call / Meeting'], ['bg', 'Completed'], ['ba', 'Warning / Deadline'], ['br', 'IRS / Urgent'], ['bv', 'Court / Hearing']].map(([c, l]) => (
                  <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[c], flexShrink: 0 }} />
                    <span style={{ color: 'var(--t2)' }}>{l}</span>
                  </div>
                ))}
              </div>

              {/* Upcoming */}
              <div style={{ padding: '14px 16px', flex: 1, overflow: 'auto' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 12 }}>Upcoming</div>
                {allItems.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--t3)' }}>No upcoming events.</div>
                ) : allItems.slice(0, 15).map((ev, i) => {
                  const isToday = ev.date === todayStr
                  const isTomorrow = ev.date === new Date(today.getTime() + 86400000).toISOString().slice(0, 10)
                  const label = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : new Date(ev.date + 'T12:00').toLocaleDateString([], { month: 'short', day: 'numeric' })
                  return (
                    <div key={ev.id || i} onClick={() => setDetailEv(ev)} style={{ display: 'flex', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--br)', cursor: 'pointer', alignItems: 'flex-start' }}>
                      <div style={{ width: 3, borderRadius: 3, alignSelf: 'stretch', minHeight: 32, background: COLORS[ev.color || 'bb'], flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--t3)', display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: isToday ? 700 : 400, color: isToday ? 'var(--blue)' : 'var(--t3)' }}>{label}</span>
                          {ev.time && <span>{fmtTime(ev.time)}</span>}
                          {ev.clientName && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {ev.clientName}</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Selected day detail strip (month view) ── */}
      {view === 'month' && selectedDay && eventsOn(dateStr(selectedDay)).length > 0 && !detailEv && (
        <div style={{ borderTop: '1px solid var(--br)', background: 'var(--sf)', padding: '10px 20px', flexShrink: 0, maxHeight: 160, overflow: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--tx)' }}>
              {MONTHS[month]} {selectedDay} — {eventsOn(dateStr(selectedDay)).length} event(s)
            </span>
            <button className="btn pri" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => openNew(dateStr(selectedDay))}>+ Add</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {eventsOn(dateStr(selectedDay)).map((ev, i) => (
              <div key={ev.id || i} onClick={() => setDetailEv(ev)} style={{
                padding: '5px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: COLORS[ev.color || 'bb'] + '22', color: COLORS[ev.color || 'bb'],
                border: `1px solid ${COLORS[ev.color || 'bb']}44`, display: 'flex', alignItems: 'center', gap: 6
              }}>
                {ev.time ? fmtTime(ev.time) + ' · ' : ''}{ev.title}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Event Modal ── */}
      {modal && (
        <div className="modal-bg open" onClick={e => e.target === e.currentTarget && (setModal(false), setEditId(null))}>
          <div className="modal" style={{ width: 540 }}>
            <div className="mh">
              <span className="mt">{editId ? '✏️ Edit Event' : '+ New Event'}</span>
              <button className="xbtn" onClick={() => { setModal(false); setEditId(null) }}>&times;</button>
            </div>
            <div className="field"><label>Event Title *</label>
              <input value={form.title} onChange={e => fld('title', e.target.value)} placeholder="e.g. IRS Call — John Smith" autoFocus />
            </div>
            <div className="fg2">
              <div className="field"><label>Event Type</label>
                <select value={form.eventType} onChange={e => fld('eventType', e.target.value)}>
                  {EVENT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="field"><label>Color</label>
                <select value={form.color || 'bb'} onChange={e => fld('color', e.target.value)}>
                  {COLOR_OPTS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className="fg2">
              <div className="field"><label>Date *</label><input type="date" value={form.date} onChange={e => fld('date', e.target.value)} /></div>
              <div className="field"><label>Start Time</label><input type="time" value={form.time || ''} onChange={e => fld('time', e.target.value)} /></div>
            </div>
            <div className="field"><label>End Time (optional)</label>
              <input type="time" value={form.endTime || ''} onChange={e => fld('endTime', e.target.value)} />
            </div>
            <div className="field" style={{ position: 'relative' }}>
              <label>Client (optional)</label>
              <input value={form.clientName || ''} onChange={e => {
                fld('clientName', e.target.value)
                const m = clients.filter(c => c.name.toLowerCase().includes(e.target.value.toLowerCase())).slice(0, 5)
                setSug(m); setShowSug(m.length > 0 && e.target.value.length > 1)
              }} placeholder="Search client…" autoComplete="off" onBlur={() => setTimeout(() => setShowSug(false), 150)} />
              {showSug && <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--s3)', border: '1px solid var(--br)', borderRadius: 7, zIndex: 500 }}>
                {sug.map(c => <div key={c.id} onClick={() => { fld('clientName', c.name); setShowSug(false) }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13 }}>{c.name}</div>)}
              </div>}
            </div>
            <div className="fg2">
              <div className="field"><label>Assigned To</label>
                <select value={form.assignedTo || ''} onChange={e => fld('assignedTo', e.target.value)}>
                  <option value="">— Anyone —</option>
                  {reps.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="field"><label>Recurring</label>
                <select value={form.recurring || 'none'} onChange={e => fld('recurring', e.target.value)}>
                  {['none', 'daily', 'weekly', 'biweekly', 'monthly'].map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div className="field"><label>Notes</label>
              <textarea value={form.notes || ''} onChange={e => fld('notes', e.target.value)} rows={2} />
            </div>
            <button className="btn pri" style={{ width: '100%', justifyContent: 'center', padding: 10 }} onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editId ? '✅ Update Event' : '✅ Add Event'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
