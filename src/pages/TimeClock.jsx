import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const BLANK = { employee:'', date:'', inTime:'', outTime:'', hours:'', notes:'' }

function fmt12(t) {
  if (!t) return '—'
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hr = h % 12 || 12
  return `${hr}:${String(m).padStart(2,'0')} ${ampm}`
}

export default function TimeClock() {
  const [items,     setItems]     = useState([])
  const [employees, setEmployees] = useState([])
  const [modal,     setModal]     = useState(false)
  const [editId,    setEditId]    = useState(null)
  const [form,      setForm]      = useState(BLANK)
  const [saving,    setSaving]    = useState(false)
  const [toast,     setToast]     = useState('')
  const [search,    setSearch]    = useState('')
  const [filterEmp, setFilterEmp] = useState('All')
  const [filterWeek,setFilterWeek]= useState('all')
  const [clocking,  setClocking]  = useState({}) // { empName: { id, inTime, date } }
  const [now,       setNow]       = useState(new Date())
  const timerRef = useRef(null)

  useEffect(() => {
    load()
    timerRef.current = setInterval(()=>setNow(new Date()),1000)
    return ()=>clearInterval(timerRef.current)
  }, [])

  async function load() {
    const [{ data:t },{ data:e }] = await Promise.all([
      supabase.from('timeentries').select('*').order('created_at',{ascending:false}),
      supabase.from('employees').select('name,payType,hourlyRate'),
    ])
    if (t) {
      setItems(t)
      // Detect any open entries (no outTime for today)
      const today = new Date().toISOString().slice(0,10)
      const open = {}
      t.filter(e=>e.date===today&&!e.outTime).forEach(e=>{
        open[e.employee] = { id:e.id, inTime:e.inTime, date:e.date }
      })
      setClocking(open)
    }
    if (e) setEmployees(e)
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3000) }
  function fld(k,v) { setForm(f=>({...f,[k]:v})) }

  function calcHours(inT, outT) {
    if (!inT || !outT) return ''
    const [ih,im] = inT.split(':').map(Number)
    const [oh,om] = outT.split(':').map(Number)
    const hrs = ((oh*60+om) - (ih*60+im)) / 60
    return hrs > 0 ? hrs.toFixed(2) : ''
  }

  function elapsedStr(inTime) {
    if (!inTime) return ''
    const [h,m] = inTime.split(':').map(Number)
    const start = new Date(); start.setHours(h,m,0,0)
    const diff = Math.max(0, Math.floor((now - start)/1000))
    const hrs = Math.floor(diff/3600), mins = Math.floor((diff%3600)/60), secs = diff%60
    return `${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`
  }

  async function clockIn(empName) {
    const now2 = new Date()
    const inTime = now2.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    const date = now2.toISOString().slice(0,10)
    const {data,error} = await supabase.from('timeentries').insert([{
      employee:empName, date, inTime, outTime:null, hours:null, notes:null,
      created_at: now2.toISOString()
    }]).select().single()
    if (error) { showToast('Error: '+error.message); return }
    setClocking(c=>({...c,[empName]:{id:data.id, inTime, date}}))
    showToast(`✅ ${empName.split(' ')[0]} clocked in at ${inTime}`)
    load()
  }

  async function clockOut(empName) {
    const entry = clocking[empName]
    if (!entry) return
    const outTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    const hours = calcHours(entry.inTime, outTime)
    const {error} = await supabase.from('timeentries').update({outTime, hours: hours || 0, updated_at:new Date().toISOString()}).eq('id',entry.id)
    if (error) { showToast('Error: '+error.message); return }
    setClocking(c=>{ const n={...c}; delete n[empName]; return n })
    showToast(`✅ ${empName.split(' ')[0]} clocked out — ${hours}h logged`)
    load()
  }

  async function save() {
    if (!form.employee || !form.date) { showToast('Employee and date required'); return }
    setSaving(true)
    const hours = calcHours(form.inTime, form.outTime) || (form.hours ? parseFloat(form.hours) : null)
    if (editId) {
      const {error} = await supabase.from('timeentries').update({...form, hours, updated_at:new Date().toISOString()}).eq('id',editId)
      if (error) { showToast('Error: '+error.message); setSaving(false); return }
      showToast('✅ Entry updated!')
    } else {
      const {error} = await supabase.from('timeentries').insert([{...form, hours, created_at:new Date().toISOString()}])
      if (error) { showToast('Error: '+error.message); setSaving(false); return }
      showToast('✅ Time entry saved!')
    }
    setSaving(false); setModal(false); setForm(BLANK); setEditId(null); load()
  }

  async function del(id) {
    if (!confirm('Delete this entry?')) return
    await supabase.from('timeentries').delete().eq('id',id)
    showToast('Deleted'); load()
  }

  const empNames = employees.length>0 ? employees.map(e=>e.name) : ['Romy Cruz','Dana Richard','Yesenia Gonzalez']

  // Filter logic
  const filtered = items.filter(e=>{
    const matchEmp = filterEmp==='All' || e.employee===filterEmp
    const matchSearch = !search || e.employee?.toLowerCase().includes(search.toLowerCase()) || e.notes?.toLowerCase().includes(search.toLowerCase())
    if (filterWeek==='all') return matchEmp && matchSearch
    const now2 = new Date()
    const today = new Date(now2); today.setHours(0,0,0,0)
    const entry = new Date(e.date)
    if (filterWeek==='today') return matchEmp && matchSearch && e.date===now2.toISOString().slice(0,10)
    if (filterWeek==='week') {
      const weekStart = new Date(today); weekStart.setDate(today.getDate()-today.getDay())
      return matchEmp && matchSearch && entry >= weekStart
    }
    if (filterWeek==='month') {
      return matchEmp && matchSearch && e.date?.slice(0,7)===now2.toISOString().slice(0,7)
    }
    return matchEmp && matchSearch
  })

  const totalHours = filtered.reduce((s,e)=>s+parseFloat(e.hours||0),0)

  return (
    <div>
      {toast&&<div className="toast show">{toast}</div>}

      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
        <h2 style={{fontSize:15,fontWeight:700,margin:0}}>⏱️ Time Clock</h2>
        <div style={{display:'flex',gap:8}}>
          <div style={{fontSize:12,color:'var(--t3)',padding:'6px 10px',background:'var(--s2)',borderRadius:6,fontVariantNumeric:'tabular-nums'}}>
            {now.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}
          </div>
          <button className="btn pri" onClick={()=>{setForm({...BLANK, date:new Date().toISOString().slice(0,10)});setEditId(null);setModal(true)}}>+ Log Entry</button>
        </div>
      </div>

      {/* Clock In/Out Cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:10,marginBottom:16}}>
        {empNames.map(emp=>{
          const active = clocking[emp]
          const elapsed = active ? elapsedStr(active.inTime) : null
          const todayHrs = items.filter(e=>e.employee===emp&&e.date===new Date().toISOString().slice(0,10)).reduce((s,e)=>s+parseFloat(e.hours||0),0)
          return (
            <div key={emp} className="card" style={{padding:'14px 16px',border:active?'1px solid var(--ok)':'1px solid var(--br)',background:active?'var(--ok)11':''}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                <div>
                  <div style={{fontWeight:700,fontSize:13}}>{emp}</div>
                  <div style={{fontSize:10,color:'var(--t3)',marginTop:1}}>
                    {active ? <span style={{color:'var(--ok)',fontWeight:600}}>● CLOCKED IN {active.inTime}</span> : <span style={{color:'var(--t3)'}}>○ Clocked Out</span>}
                  </div>
                </div>
                <div style={{textAlign:'right'}}>
                  {active && <div style={{fontFamily:'monospace',fontSize:14,fontWeight:700,color:'var(--ok)'}}>{elapsed}</div>}
                  {todayHrs>0&&<div style={{fontSize:10,color:'var(--t3)'}}>{todayHrs.toFixed(2)}h today</div>}
                </div>
              </div>
              <button
                onClick={()=>active ? clockOut(emp) : clockIn(emp)}
                style={{width:'100%',padding:'7px',borderRadius:6,border:'none',cursor:'pointer',fontWeight:700,fontSize:12,
                  background:active?'var(--bad)':'var(--ok)',color:'#fff'}}>
                {active ? '⏹ Clock Out' : '▶ Clock In'}
              </button>
            </div>
          )
        })}
      </div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:8,marginBottom:12}}>
        {[['Total Hours',totalHours.toFixed(1)+'h','var(--b2c)'],['Entries',filtered.length,'var(--tx)'],
          ['Active Now',Object.keys(clocking).length,'var(--ok)'],
          ...empNames.map(e=>[e.split(' ')[0], filtered.filter(en=>en.employee===e).reduce((s,en)=>s+parseFloat(en.hours||0),0).toFixed(1)+'h','var(--t2)'])
        ].map(([l,v,c])=>(
          <div key={l} className="card" style={{padding:'8px 12px',textAlign:'center'}}>
            <div style={{fontWeight:800,fontSize:16,color:c}}>{v}</div>
            <div style={{fontSize:10,color:'var(--t3)',marginTop:2}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…"
          style={{flex:1,minWidth:140,padding:'7px 12px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',fontSize:12}}/>
        <select value={filterEmp} onChange={e=>setFilterEmp(e.target.value)}
          style={{padding:'7px 10px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',fontSize:12}}>
          <option value="All">All Staff</option>
          {empNames.map(e=><option key={e}>{e}</option>)}
        </select>
        {[['all','All Time'],['today','Today'],['week','This Week'],['month','This Month']].map(([k,l])=>(
          <button key={k} className={`btn ${filterWeek===k?'pri':'sec'}`} style={{fontSize:10,padding:'4px 10px'}} onClick={()=>setFilterWeek(k)}>{l}</button>
        ))}
      </div>

      {/* Table */}
      <div className="card" style={{padding:0,overflow:'hidden'}}>
        {filtered.length===0 ? (
          <div style={{padding:24,textAlign:'center',color:'var(--t3)',fontSize:13}}>No time entries yet.</div>
        ) : (
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{borderBottom:'1px solid var(--br)',background:'var(--s2)'}}>
                {['Employee','Date','Clock In','Clock Out','Hours','Notes',''].map(h=>(
                  <th key={h} style={{padding:'9px 12px',textAlign:'left',fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.05em'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(e=>(
                <tr key={e.id} style={{borderBottom:'1px solid var(--br)'}}
                  onMouseEnter={ev=>ev.currentTarget.style.background='var(--s2)'}
                  onMouseLeave={ev=>ev.currentTarget.style.background=''}>
                  <td style={{padding:'9px 12px',fontWeight:600}}>{e.employee}</td>
                  <td style={{padding:'9px 12px',color:'var(--t2)'}}>{e.date}</td>
                  <td style={{padding:'9px 12px',color:'var(--ok)',fontWeight:600}}>{fmt12(e.inTime)||e.inTime||'—'}</td>
                  <td style={{padding:'9px 12px',color:e.outTime?'var(--bad)':'var(--t3)'}}>
                    {e.outTime||<span className="bdg ba">Active</span>}
                  </td>
                  <td style={{padding:'9px 12px',fontWeight:700,color:'var(--b2c)'}}>{e.hours?e.hours+'h':'—'}</td>
                  <td style={{padding:'9px 12px',color:'var(--t2)',fontSize:11,maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.notes||'—'}</td>
                  <td style={{padding:'9px 12px'}}>
                    <div style={{display:'flex',gap:5}}>
                      <button className="btn sec" style={{fontSize:10,padding:'3px 8px'}} onClick={()=>{setForm({...BLANK,...e});setEditId(e.id);setModal(true)}}>Edit</button>
                      <button className="btn del" style={{fontSize:10,padding:'3px 8px'}} onClick={()=>del(e.id)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modal&&(
        <div className="modal-bg open" onClick={ev=>ev.target===ev.currentTarget&&(setModal(false),setEditId(null))}>
          <div className="modal">
            <div className="mh">
              <span className="mt">{editId?'Edit Entry':'Log Time Entry'}</span>
              <button className="xbtn" onClick={()=>{setModal(false);setEditId(null)}}>&times;</button>
            </div>
            <div className="fg2">
              <div className="field"><label>Employee</label>
                <select value={form.employee} onChange={e=>fld('employee',e.target.value)}>
                  <option value="">— Select —</option>
                  {empNames.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="field"><label>Date</label><input type="date" value={form.date} onChange={e=>fld('date',e.target.value)}/></div>
            </div>
            <div className="fg2">
              <div className="field"><label>Time In</label><input type="time" value={form.inTime} onChange={e=>fld('inTime',e.target.value)}/></div>
              <div className="field"><label>Time Out</label>
                <input type="time" value={form.outTime} onChange={e=>{fld('outTime',e.target.value);fld('hours',calcHours(form.inTime,e.target.value))}}/>
              </div>
            </div>
            <div className="fg2">
              <div className="field"><label>Hours (auto-calc or override)</label>
                <input type="number" step="0.25" value={form.hours} onChange={e=>fld('hours',e.target.value)} placeholder="Auto-calculated"/>
              </div>
              <div className="field"><label>Notes</label><input value={form.notes||''} onChange={e=>fld('notes',e.target.value)}/></div>
            </div>
            {form.inTime&&form.outTime&&(
              <div style={{background:'var(--s3)',borderRadius:6,padding:'8px 12px',marginBottom:10,fontSize:12,display:'flex',justifyContent:'space-between'}}>
                <span style={{color:'var(--t2)'}}>Calculated Hours</span>
                <span style={{fontWeight:700,color:'var(--ok)'}}>{calcHours(form.inTime,form.outTime)||'—'}h</span>
              </div>
            )}
            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={save} disabled={saving}>
              {saving?'Saving…':editId?'Update Entry':'Save Entry'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
