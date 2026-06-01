import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS_OF_WEEK = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const BLANK = { title:'', eventType:'Consultation Call', date:'', time:'', clientName:'', notes:'', color:'bb' }

const COLOR_MAP = { bb:'#1A7FD4', br:'#C0202F', bg:'#25A25A', ba:'#D4930A' }

export default function Calendar() {
  const today = new Date()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [events, setEvents] = useState([])
  const [clients, setClients] = useState([])
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState(BLANK)
  const [suggestions, setSug] = useState([])
  const [saving, setSaving] = useState(false)
  const [toast, setToast]   = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: ev }, { data: cl }] = await Promise.all([
      supabase.from('calevents').select('*').order('date', { ascending: true }),
      supabase.from('clients').select('id,name')
    ])
    if (ev) setEvents(ev)
    if (cl) setClients(cl)
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3000) }
  function fld(k,v) { setForm(f=>({...f,[k]:v})) }

  function searchClient(val) {
    fld('clientName', val)
    if (val.length < 2) { setSug([]); return }
    setSug(clients.filter(c=>c.name.toLowerCase().includes(val.toLowerCase())).slice(0,5))
  }

  async function save() {
    if (!form.title || !form.date) { showToast('Title and date required'); return }
    setSaving(true)
    const { error } = await supabase.from('calevents').insert([{ ...form, created_at: new Date().toISOString() }])
    setSaving(false)
    if (error) { showToast('Error: '+error.message); return }
    showToast('Event added!')
    setModal(false); setForm(BLANK); load()
  }

  async function del(id) {
    await supabase.from('calevents').delete().eq('id', id)
    showToast('Deleted'); load()
  }

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month+1, 0).getDate()
  const cells = []
  for (let i=0; i<firstDay; i++) cells.push(null)
  for (let d=1; d<=daysInMonth; d++) cells.push(d)

  function dateStr(d) {
    return `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  }

  function eventsOn(d) {
    const ds = dateStr(d)
    return events.filter(e => e.date === ds)
  }

  const upcomingEvents = events.filter(e => new Date(e.date) >= new Date()).slice(0,10)

  return (
    <div>
      {toast && <div className="toast show">{toast}</div>}
      <div className="g2" style={{gridTemplateColumns:'1fr 280px'}}>
        {/* Calendar */}
        <div className="card">
          <div className="ch">
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <button className="btn sm" onClick={()=>{ if(month===0){setMonth(11);setYear(y=>y-1)}else setMonth(m=>m-1) }}>‹</button>
              <span className="ct">{MONTHS[month]} {year}</span>
              <button className="btn sm" onClick={()=>{ if(month===11){setMonth(0);setYear(y=>y+1)}else setMonth(m=>m+1) }}>›</button>
            </div>
            <button className="btn pri" onClick={()=>setModal(true)}>+ Add Event</button>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:4}}>
            {DAYS_OF_WEEK.map(d=><div key={d} style={{textAlign:'center',fontSize:11,fontWeight:700,color:'var(--t3)',padding:'4px 0'}}>{d}</div>)}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2}}>
            {cells.map((d,i) => {
              if (!d) return <div key={i}/>
              const evs = eventsOn(d)
              const isToday = d===today.getDate() && month===today.getMonth() && year===today.getFullYear()
              return (
                <div key={i} onClick={()=>{ setForm(f=>({...f, date:dateStr(d)})); setModal(true) }}
                  style={{minHeight:68,background:isToday?'rgba(26,127,212,.15)':'var(--s2)',borderRadius:6,padding:'4px 6px',cursor:'pointer',border:isToday?'1px solid var(--b2)':'1px solid transparent',transition:'background .15s'}}
                  onMouseOver={e=>e.currentTarget.style.background='var(--s3)'}
                  onMouseOut={e=>e.currentTarget.style.background=isToday?'rgba(26,127,212,.15)':'var(--s2)'}
                >
                  <div style={{fontSize:12,fontWeight:isToday?800:500,color:isToday?'var(--b2)':'var(--tx)',marginBottom:2}}>{d}</div>
                  {evs.slice(0,3).map(ev=>(
                    <div key={ev.id} style={{fontSize:9,background:COLOR_MAP[ev.color]||'var(--b2)',color:'#fff',borderRadius:3,padding:'1px 4px',marginBottom:1,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>
                      {ev.time ? ev.time.slice(0,5)+' ' : ''}{ev.title}
                    </div>
                  ))}
                  {evs.length > 3 && <div style={{fontSize:9,color:'var(--t3)'}}>+{evs.length-3} more</div>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Upcoming */}
        <div className="card">
          <div className="ch"><span className="ct">Upcoming Events</span></div>
          {upcomingEvents.length === 0
            ? <div style={{color:'var(--t3)',fontSize:12}}>No upcoming events</div>
            : upcomingEvents.map(ev => (
              <div key={ev.id} style={{display:'flex',gap:8,padding:'8px 0',borderBottom:'1px solid var(--br)'}}>
                <div style={{width:4,borderRadius:4,background:COLOR_MAP[ev.color]||'var(--b2)',flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:13,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{ev.title}</div>
                  <div style={{fontSize:11,color:'var(--t3)'}}>{ev.date}{ev.time?' · '+ev.time:''}</div>
                  {ev.clientName && <div style={{fontSize:11,color:'var(--t2)'}}>{ev.clientName}</div>}
                </div>
                <button className="btn del sm" onClick={()=>del(ev.id)}>✕</button>
              </div>
            ))}
        </div>
      </div>

      {modal && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal" style={{width:560}}>
            <div className="mh"><span className="mt">Add Event</span><button className="xbtn" onClick={()=>setModal(false)}>&times;</button></div>
            <div className="fg2">
              <div className="field"><label>Event Title *</label><input value={form.title} onChange={e=>fld('title',e.target.value)} placeholder="e.g. Consultation Call"/></div>
              <div className="field"><label>Event Type</label>
                <select value={form.eventType} onChange={e=>fld('eventType',e.target.value)}>
                  {['Consultation Call','Appointment','IRS Deadline','Client Call','Document Due','Court Date','Follow-Up','Reminder','Other'].map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div className="fg2">
              <div className="field"><label>Date *</label><input type="date" value={form.date} onChange={e=>fld('date',e.target.value)}/></div>
              <div className="field"><label>Time</label>
                <select value={form.time} onChange={e=>fld('time',e.target.value)}>
                  <option value="">Select time...</option>
                  {['08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00'].map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="field" style={{position:'relative'}}>
              <label>Client / Lead</label>
              <input value={form.clientName} onChange={e=>searchClient(e.target.value)} placeholder="Start typing..." autoComplete="off"/>
              {suggestions.length > 0 && (
                <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--s3)',border:'1px solid var(--b2c)',borderRadius:7,zIndex:500}}>
                  {suggestions.map(c=><div key={c.id} onClick={()=>{fld('clientName',c.name);setSug([])}} style={{padding:'7px 12px',cursor:'pointer',fontSize:13}}>{c.name}</div>)}
                </div>
              )}
            </div>
            <div className="fg2">
              <div className="field"><label>Color</label>
                <select value={form.color} onChange={e=>fld('color',e.target.value)}>
                  <option value="bb">Blue — Appointment</option>
                  <option value="br">Red — Urgent</option>
                  <option value="bg">Green — Completed</option>
                  <option value="ba">Amber — Reminder</option>
                </select>
              </div>
            </div>
            <div className="field"><label>Notes</label><textarea value={form.notes} onChange={e=>fld('notes',e.target.value)}/></div>
            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={save} disabled={saving}>
              {saving?'Saving...':'Add to Calendar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
