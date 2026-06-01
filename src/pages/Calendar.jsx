import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS_OF_WEEK = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const EVENT_TYPES = ['Consultation Call','Client Meeting','IRS Call','IRS Appointment','Court Date','Hearing','Deadline','Follow-up Call','Document Due','Payment Due','Team Meeting','Other']
const COLORS = { bb:'#1A7FD4', br:'#C0202F', bg:'#25A25A', ba:'#D4930A', bw:'#6B7280', bv:'#7C3AED' }
const BLANK = { title:'', eventType:'Consultation Call', date:'', time:'', endTime:'', clientName:'', assignedTo:'', notes:'', color:'bb', recurring:'none' }

export default function Calendar() {
  const today = new Date()
  const [year,   setYear]   = useState(today.getFullYear())
  const [month,  setMonth]  = useState(today.getMonth())
  const [events, setEvents] = useState([])
  const [clients,setClients]= useState([])
  const [employees,setEmployees]=useState([])
  const [deadlines,setDeadlines]=useState([])
  const [modal,  setModal]  = useState(false)
  const [editId, setEditId] = useState(null)
  const [form,   setForm]   = useState(BLANK)
  const [selectedDay, setSelectedDay] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast,  setToast]  = useState('')
  const [view,   setView]   = useState('month') // month | list
  const [suggestions, setSug] = useState([])
  const [showSug, setShowSug] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data:ev },{ data:cl },{ data:e },{ data:dl }] = await Promise.all([
      supabase.from('calevents').select('*').order('date',{ascending:true}),
      supabase.from('clients').select('id,name'),
      supabase.from('employees').select('name'),
      supabase.from('deadlines').select('id,title,dueDate,clientName,status').neq('status','Completed'),
    ])
    if (ev) setEvents(ev)
    if (cl) setClients(cl)
    if (e)  setEmployees(e)
    if (dl) setDeadlines(dl)
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3000) }
  function fld(k,v) { setForm(f=>({...f,[k]:v})) }

  function searchClient(val) {
    fld('clientName',val)
    if (val.length<2) { setSug([]); setShowSug(false); return }
    const m = clients.filter(c=>c.name.toLowerCase().includes(val.toLowerCase())).slice(0,5)
    setSug(m); setShowSug(m.length>0)
  }

  function openNew(date='') {
    setForm({...BLANK, date, time:'09:00'})
    setEditId(null); setModal(true)
  }

  function openEdit(ev) {
    setForm({...BLANK,...ev}); setEditId(ev.id); setModal(true)
  }

  async function save() {
    if (!form.title || !form.date) { showToast('Title and date required'); return }
    setSaving(true)
    let error
    if (editId) {
      ;({error} = await supabase.from('calevents').update({...form, updated_at:new Date().toISOString()}).eq('id',editId))
    } else {
      ;({error} = await supabase.from('calevents').insert([{...form, created_at:new Date().toISOString()}]))
    }
    setSaving(false)
    if (error) { showToast('Error: '+error.message); return }
    showToast('✅ Event saved!')
    setModal(false); setForm(BLANK); setEditId(null); load()
  }

  async function del(id) {
    if (!confirm('Delete this event?')) return
    await supabase.from('calevents').delete().eq('id',id)
    showToast('Deleted'); load()
  }

  function prevMonth() { if (month===0) { setMonth(11); setYear(y=>y-1) } else setMonth(m=>m-1) }
  function nextMonth() { if (month===11) { setMonth(0); setYear(y=>y+1) } else setMonth(m=>m+1) }

  const firstDay = new Date(year,month,1).getDay()
  const daysInMonth = new Date(year,month+1,0).getDate()
  const cells = []
  for (let i=0;i<firstDay;i++) cells.push(null)
  for (let d=1;d<=daysInMonth;d++) cells.push(d)

  function dateStr(d) { return `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}` }

  function eventsOn(d) {
    const ds = dateStr(d)
    const calEvs = events.filter(e=>e.date===ds)
    const dls = deadlines.filter(dl=>dl.dueDate===ds).map(dl=>({...dl, _isDl:true, title:dl.title, color:'br'}))
    return [...calEvs,...dls].sort((a,b)=>(a.time||'').localeCompare(b.time||''))
  }

  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
  const reps = employees.length>0 ? employees.map(e=>e.name) : ['Romy Cruz','Dana Richard','Yesenia Gonzalez']

  // Upcoming events (next 30 days)
  const upcoming = [...events.map(e=>({...e,_type:'event'})),...deadlines.map(d=>({...d,date:d.dueDate,color:'br',_type:'deadline'}))]
    .filter(e=>e.date>=todayStr)
    .sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||''))
    .slice(0,15)

  const selectedEvs = selectedDay ? eventsOn(selectedDay) : []

  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 260px',gap:12,alignItems:'start'}}>
      {toast&&<div className="toast show">{toast}</div>}

      {/* Left — Calendar */}
      <div>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <button className="btn sec" style={{padding:'5px 10px',fontSize:13}} onClick={prevMonth}>‹</button>
            <h2 style={{fontSize:15,fontWeight:700,margin:0,minWidth:160,textAlign:'center'}}>{MONTHS[month]} {year}</h2>
            <button className="btn sec" style={{padding:'5px 10px',fontSize:13}} onClick={nextMonth}>›</button>
            <button className="btn sec" style={{fontSize:11,padding:'5px 10px'}} onClick={()=>{setMonth(today.getMonth());setYear(today.getFullYear())}}>Today</button>
          </div>
          <div style={{display:'flex',gap:6}}>
            {['month','list'].map(v=>(
              <button key={v} className={`btn ${view===v?'pri':'sec'}`} style={{fontSize:11,padding:'5px 10px',textTransform:'capitalize'}} onClick={()=>setView(v)}>{v}</button>
            ))}
            <button className="btn pri" style={{fontSize:11,padding:'5px 12px'}} onClick={()=>openNew()}>+ Event</button>
          </div>
        </div>

        {view==='month' ? (
          /* Month grid */
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            {/* Day headers */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',borderBottom:'1px solid var(--br)'}}>
              {DAYS_OF_WEEK.map(d=>(
                <div key={d} style={{padding:'8px 4px',textAlign:'center',fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em'}}>{d}</div>
              ))}
            </div>
            {/* Cells */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)'}}>
              {cells.map((day,i)=>{
                if (!day) return <div key={'empty'+i} style={{minHeight:80,borderRight:'1px solid var(--br)',borderBottom:'1px solid var(--br)',background:'var(--s3)',opacity:.4}}/>
                const ds = dateStr(day)
                const evs = eventsOn(day)
                const isToday = ds===todayStr
                const isSelected = selectedDay===day
                const isWeekend = new Date(year,month,day).getDay()===0||new Date(year,month,day).getDay()===6
                return (
                  <div key={day}
                    onClick={()=>setSelectedDay(isSelected?null:day)}
                    style={{minHeight:80,borderRight:'1px solid var(--br)',borderBottom:'1px solid var(--br)',padding:'4px 4px 4px 6px',cursor:'pointer',
                      background:isSelected?'var(--b2c)11':isWeekend?'var(--s3)':isToday?'var(--b2c)08':'',
                      transition:'background .15s'}}>
                    <div style={{fontWeight:isToday?800:400,fontSize:12,color:isToday?'var(--b2c)':isWeekend?'var(--t3)':'var(--t2)',marginBottom:2,
                      width:22,height:22,display:'flex',alignItems:'center',justifyContent:'center',
                      borderRadius:'50%',background:isToday?'var(--b2c)':'',color:isToday?'#fff':isWeekend?'var(--t3)':'var(--t2)'}}>
                      {day}
                    </div>
                    {evs.slice(0,3).map((ev,idx)=>(
                      <div key={ev.id||idx}
                        onClick={e=>{e.stopPropagation();if(!ev._isDl)openEdit(ev)}}
                        style={{fontSize:9,fontWeight:600,padding:'1px 4px',borderRadius:3,marginBottom:1,
                          background:COLORS[ev.color||'bb']+'22',color:COLORS[ev.color||'bb'],
                          overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',cursor:ev._isDl?'default':'pointer'}}>
                        {ev.time&&<span style={{opacity:.7}}>{ev.time} </span>}{ev._isDl?'⏰ ':''}{ev.title}
                      </div>
                    ))}
                    {evs.length>3&&<div style={{fontSize:9,color:'var(--t3)',fontWeight:600}}>+{evs.length-3} more</div>}
                    {evs.length===0&&<div style={{cursor:'pointer'}} onClick={e=>{e.stopPropagation();openNew(ds)}}/>}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          /* List view */
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            {upcoming.length===0 ? (
              <div style={{padding:24,textAlign:'center',color:'var(--t3)',fontSize:13}}>No upcoming events.</div>
            ) : (
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{borderBottom:'1px solid var(--br)',background:'var(--s2)'}}>
                    {['Date','Time','Event','Client','Type','Rep',''].map(h=>(
                      <th key={h} style={{padding:'9px 12px',textAlign:'left',fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.05em'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((ev,i)=>(
                    <tr key={ev.id||i} style={{borderBottom:'1px solid var(--br)'}}
                      onMouseEnter={e=>e.currentTarget.style.background='var(--s2)'}
                      onMouseLeave={e=>e.currentTarget.style.background=''}>
                      <td style={{padding:'9px 12px',fontWeight:600,color:ev.date===todayStr?'var(--b2c)':'var(--tx)'}}>
                        {ev.date===todayStr?'Today':new Date(ev.date+'T12:00').toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})}
                      </td>
                      <td style={{padding:'9px 12px',color:'var(--t2)',fontSize:11}}>{ev.time||'—'}</td>
                      <td style={{padding:'9px 12px'}}>
                        <span style={{width:8,height:8,borderRadius:'50%',background:COLORS[ev.color||'bb'],display:'inline-block',marginRight:6}}/>
                        <span style={{fontWeight:600}}>{ev.title}</span>
                        {ev._type==='deadline'&&<span className="bdg br" style={{fontSize:9,marginLeft:6}}>Deadline</span>}
                      </td>
                      <td style={{padding:'9px 12px',color:'var(--t2)'}}>{ev.clientName||'—'}</td>
                      <td style={{padding:'9px 12px',color:'var(--t3)',fontSize:11}}>{ev.eventType||ev._type||'—'}</td>
                      <td style={{padding:'9px 12px',color:'var(--t3)',fontSize:11}}>{ev.assignedTo||'—'}</td>
                      <td style={{padding:'9px 12px'}}>
                        {!ev._isDl&&!ev._type?.includes('deadline')&&(
                          <div style={{display:'flex',gap:5}}>
                            <button className="btn sec" style={{fontSize:10,padding:'3px 8px'}} onClick={()=>openEdit(ev)}>Edit</button>
                            <button className="btn del" style={{fontSize:10,padding:'3px 8px'}} onClick={()=>del(ev.id)}>Del</button>
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

        {/* Selected day events */}
        {selectedDay&&selectedEvs.length>0&&(
          <div className="card" style={{marginTop:12}}>
            <div style={{fontWeight:700,fontSize:12,color:'var(--t2)',marginBottom:10}}>
              {MONTHS[month]} {selectedDay}, {year} — {selectedEvs.length} event{selectedEvs.length!==1?'s':''}
              <button className="btn sec" style={{fontSize:10,padding:'2px 8px',marginLeft:8}} onClick={()=>openNew(dateStr(selectedDay))}>+ Add</button>
            </div>
            {selectedEvs.map((ev,i)=>(
              <div key={ev.id||i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid var(--br)'}}>
                <div style={{width:10,height:10,borderRadius:'50%',background:COLORS[ev.color||'bb'],flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:13}}>{ev.title}</div>
                  <div style={{fontSize:11,color:'var(--t3)',marginTop:1,display:'flex',gap:10}}>
                    {ev.time&&<span>🕐 {ev.time}{ev.endTime?'–'+ev.endTime:''}</span>}
                    {ev.clientName&&<span>👤 {ev.clientName}</span>}
                    {ev.assignedTo&&<span>→ {ev.assignedTo}</span>}
                    {ev._isDl&&<span className="bdg br" style={{fontSize:9}}>Deadline</span>}
                  </div>
                  {ev.notes&&<div style={{fontSize:11,color:'var(--t2)',marginTop:2}}>{ev.notes}</div>}
                </div>
                {!ev._isDl&&(
                  <div style={{display:'flex',gap:5}}>
                    <button className="btn sec" style={{fontSize:10,padding:'3px 8px'}} onClick={()=>openEdit(ev)}>Edit</button>
                    <button className="btn del" style={{fontSize:10,padding:'3px 8px'}} onClick={()=>del(ev.id)}>Del</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right — Upcoming sidebar */}
      <div>
        {/* Legend */}
        <div className="card" style={{padding:'10px 14px',marginBottom:10}}>
          <div style={{fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',marginBottom:8}}>Legend</div>
          {[['bb','Consultation / Call'],['bg','Completed / Good'],['ba','Deadline / Warning'],['br','IRS / Urgent'],['bv','Court / Hearing']].map(([c,l])=>(
            <div key={c} style={{display:'flex',alignItems:'center',gap:7,marginBottom:5,fontSize:11}}>
              <div style={{width:10,height:10,borderRadius:'50%',background:COLORS[c],flexShrink:0}}/>
              <span style={{color:'var(--t2)'}}>{l}</span>
            </div>
          ))}
        </div>

        {/* Upcoming */}
        <div className="card" style={{padding:'10px 14px'}}>
          <div style={{fontWeight:700,fontSize:11,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--t3)',marginBottom:10}}>Upcoming Events</div>
          {upcoming.length===0 ? (
            <div style={{fontSize:12,color:'var(--t3)'}}>No upcoming events.</div>
          ) : upcoming.slice(0,12).map((ev,i)=>{
            const isToday2 = ev.date===todayStr
            const isTomorrow = ev.date===new Date(today.getTime()+86400000).toISOString().slice(0,10)
            const dateLabel = isToday2?'Today':isTomorrow?'Tomorrow':new Date(ev.date+'T12:00').toLocaleDateString([],{month:'short',day:'numeric'})
            return (
              <div key={ev.id||i} style={{display:'flex',gap:8,padding:'7px 0',borderBottom:'1px solid var(--br)',alignItems:'flex-start'}}>
                <div style={{width:3,borderRadius:3,alignSelf:'stretch',background:COLORS[ev.color||'bb'],flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,fontWeight:600,color:'var(--tx)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ev.title}</div>
                  <div style={{fontSize:10,color:'var(--t3)',display:'flex',gap:6,marginTop:1}}>
                    <span style={{fontWeight:isToday2?700:400,color:isToday2?'var(--b2c)':''}}>{dateLabel}</span>
                    {ev.time&&<span>{ev.time}</span>}
                    {ev.clientName&&<span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>· {ev.clientName}</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Modal */}
      {modal&&(
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&(setModal(false),setEditId(null))}>
          <div className="modal" style={{width:540}}>
            <div className="mh">
              <span className="mt">{editId?'Edit Event':'Add Event'}</span>
              <button className="xbtn" onClick={()=>{setModal(false);setEditId(null)}}>&times;</button>
            </div>

            <div className="field"><label>Event Title *</label>
              <input value={form.title} onChange={e=>fld('title',e.target.value)} placeholder="e.g. IRS Call — John Smith"/>
            </div>

            <div className="fg2">
              <div className="field"><label>Event Type</label>
                <select value={form.eventType} onChange={e=>fld('eventType',e.target.value)}>
                  {EVENT_TYPES.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="field"><label>Color</label>
                <select value={form.color||'bb'} onChange={e=>fld('color',e.target.value)}>
                  <option value="bb">🔵 Blue — Call/Meeting</option>
                  <option value="bg">🟢 Green — Completed</option>
                  <option value="ba">🟡 Yellow — Deadline</option>
                  <option value="br">🔴 Red — IRS/Urgent</option>
                  <option value="bv">🟣 Purple — Court/Hearing</option>
                </select>
              </div>
            </div>

            <div className="fg2">
              <div className="field"><label>Date *</label><input type="date" value={form.date} onChange={e=>fld('date',e.target.value)}/></div>
              <div className="field"><label>Start Time</label><input type="time" value={form.time||''} onChange={e=>fld('time',e.target.value)}/></div>
            </div>

            <div className="field"><label>End Time (optional)</label>
              <input type="time" value={form.endTime||''} onChange={e=>fld('endTime',e.target.value)}/>
            </div>

            <div className="field" style={{position:'relative'}}>
              <label>Client (optional)</label>
              <input value={form.clientName||''} onChange={e=>searchClient(e.target.value)}
                placeholder="Search client…" autoComplete="off"
                onBlur={()=>setTimeout(()=>setShowSug(false),150)}/>
              {showSug&&suggestions.length>0&&(
                <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--s3)',border:'1px solid var(--b2c)',borderRadius:7,zIndex:500}}>
                  {suggestions.map(c=>(
                    <div key={c.id} onClick={()=>{fld('clientName',c.name);setSug([]);setShowSug(false)}}
                      style={{padding:'8px 12px',cursor:'pointer',fontSize:13}}>{c.name}</div>
                  ))}
                </div>
              )}
            </div>

            <div className="fg2">
              <div className="field"><label>Assigned To</label>
                <select value={form.assignedTo||''} onChange={e=>fld('assignedTo',e.target.value)}>
                  <option value="">— Anyone —</option>
                  {reps.map(r=><option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="field"><label>Recurring</label>
                <select value={form.recurring||'none'} onChange={e=>fld('recurring',e.target.value)}>
                  {['none','daily','weekly','biweekly','monthly'].map(r=><option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
                </select>
              </div>
            </div>

            <div className="field"><label>Notes</label>
              <textarea value={form.notes||''} onChange={e=>fld('notes',e.target.value)} rows={2}/>
            </div>

            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={save} disabled={saving}>
              {saving?'Saving…':editId?'Update Event':'Add Event'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
