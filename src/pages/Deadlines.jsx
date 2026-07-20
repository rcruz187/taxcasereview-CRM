import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { sendGmailEmail } from '../lib/gmailUtils'
import ClientLink from '../components/ClientLink'

const TYPES    = ['ACS','Appeals','CDP','CSED','General','Installment Agreement','IRS Notice','Levy Release','OIC','Penalty Abatement','Return Filing']
const STATUSES = ['Tracking','Action Required','Scheduled','Completed']

const BLANK = { name:'', title:'', client:'', clientName:'', type:'General', dueDate:'', status:'Tracking', notes:'' }

export default function Deadlines() {
  const [items,   setItems]   = useState([])
  const [clients, setClients] = useState([])
  const [modal,   setModal]   = useState(false)
  const [form,    setForm]    = useState(BLANK)
  const [sug,     setSug]     = useState([])
  const [saving,  setSaving]  = useState(false)
  const [toast,   setToast]   = useState('')
  const [filter,  setFilter]  = useState('All')

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data },{ data:cl }] = await Promise.all([
      supabase.from('deadlines').select('*').order('dueDate',{ascending:true}),
      supabase.from('clients').select('id,name')
    ])
    if (data) setItems(data)
    if (cl)   setClients(cl)
  }

  function showToast(msg){setToast(msg);setTimeout(()=>setToast(''),4000)}
  function fld(k,v){setForm(f=>({...f,[k]:v}))}

  // Support both 'name' and 'title' column names
  function getName(d) { return d.name || d.title || '—' }
  function getClient(d) { return d.client || d.clientName || '—' }
  function getStatus(d) { return d.status || 'Tracking' }

  function daysLeft(d) {
    const due = d.dueDate || d.due_date
    if (!due) return 999
    return Math.ceil((new Date(due) - new Date()) / 86400000)
  }
  function urgencyColor(dy) { return dy<0?'var(--bad)':dy<=3?'var(--bad)':dy<=7?'var(--warn)':'var(--t2)' }
  function urgencyBdg(dy)   { return dy<0?'br':dy<=3?'br':dy<=7?'ba':'bg' }
  function daysText(dy)     { return dy<0?'OVERDUE':dy===0?'TODAY':dy+'d left' }

  function searchClient(val) {
    fld('client',val); fld('clientName',val)
    if (val.length<2){setSug([]);return}
    setSug(clients.filter(c=>c.name.toLowerCase().includes(val.toLowerCase())).slice(0,6))
  }

  async function save() {
    if (!form.name.trim()&&!form.title.trim()) { showToast('Deadline name is required'); return }
    if (!form.dueDate) { showToast('Due date is required'); return }
    setSaving(true)
    // Send both name and title to handle either column
    const payload = {
      ...form,
      name:  form.name||form.title,
      title: form.name||form.title,
      client: form.client||form.clientName,
      clientName: form.client||form.clientName,
      created_at: new Date().toISOString()
    }
    const { data, error } = await supabase.from('deadlines').insert([payload]).select()
    setSaving(false)
    if (error) { showToast('❌ Error: ' + error.message); return }
    showToast('✅ Deadline added!')
    setModal(false); setForm(BLANK); load()
  }

  async function markStatus(id, status) {
    const { error } = await supabase.from('deadlines').update({status}).eq('id',id)
    if (error) { showToast('❌ '+error.message); return }
    load()
  }

  async function deleteItem(id) {
    const { error } = await supabase.from('deadlines').delete().eq('id',id)
    if (error) { showToast('❌ '+error.message); return }
    setItems(prev => prev.filter(i => i.id !== id)); showToast('Deleted')
  }

  // CSED = Collection Statute Expiration Date — 10 years from assessment date by default
  function calcCSED() {
    const assessDate = prompt('Enter the IRS assessment date (YYYY-MM-DD):')
    if (!assessDate) return
    const extraDays = prompt('Any tolling days to add (bankruptcy, OIC pending, CDP appeal, etc.)? Enter 0 if none:', '0')
    const d = new Date(assessDate + 'T00:00:00')
    if (isNaN(d.getTime())) { showToast('Invalid date'); return }
    d.setFullYear(d.getFullYear() + 10)
    d.setDate(d.getDate() + (parseInt(extraDays)||0))
    const csedDate = d.toISOString().slice(0,10)
    fld('name', 'CSED'); fld('title', 'CSED')
    fld('type', 'CSED')
    fld('dueDate', csedDate)
    fld('notes', `CSED calculated from assessment date ${assessDate}${extraDays&&extraDays!=='0' ? ` + ${extraDays} tolling days` : ''}.`)
    showToast(`✅ CSED calculated: ${csedDate}`)
  }

  async function sendDeadlineReminder(d) {
    const clientName = getClient(d)
    const { data: client } = await supabase.from('clients').select('email').eq('name', clientName).maybeSingle()
    const { data: lead }   = await supabase.from('leads').select('email').eq('name', clientName).maybeSingle()
    const to = client?.email || lead?.email
    if (!to) { showToast('No email on file for ' + clientName); return }
    const dy = daysLeft(d)
    const subject = `Reminder: ${getName(d)} — ${d.dueDate||d.due_date}`
    const body = `Dear ${clientName},\n\nThis is a reminder regarding an upcoming deadline on your case:\n\n${getName(d)} (${d.type})\nDue: ${d.dueDate||d.due_date} (${daysText(dy)})\n\n${d.notes||''}\n\nPlease contact our office if you have any questions.`
    try {
      await sendGmailEmail(supabase, { to, subject, body })
      showToast(`✅ Reminder sent to ${to}`)
    } catch (e) { showToast('Email error: ' + e.message) }
  }

  const filtered = filter==='All' ? items : filter==='Upcoming' ? items.filter(d=>daysLeft(d)>=0&&getStatus(d)!=='Completed') : filter==='Overdue' ? items.filter(d=>daysLeft(d)<0&&getStatus(d)!=='Completed') : items.filter(d=>getStatus(d)===filter)
  const urgent   = items.filter(d=>{ const dy=daysLeft(d); return dy<=7&&getStatus(d)!=='Completed' })

  const overdueCount   = items.filter(d=>daysLeft(d)<0&&getStatus(d)!=='Completed').length
  const dueSoonCount   = items.filter(d=>{const dy=daysLeft(d);return dy>=0&&dy<=7&&getStatus(d)!=='Completed'}).length
  const completedCount = items.filter(d=>getStatus(d)==='Completed').length

  function StatCard({label,val,color,icon,onClick,active}) {
    return (
      <div onClick={onClick} style={{
        background:'var(--sf)',border:'1px solid '+(active?color:'var(--br)'),borderRadius:10,
        padding:'12px 14px',cursor:onClick?'pointer':'default',position:'relative',overflow:'hidden',
        transition:'transform .15s, border-color .15s',
      }}
        onMouseEnter={e=>{ if(onClick){ e.currentTarget.style.transform='translateY(-2px)' }}}
        onMouseLeave={e=>{ e.currentTarget.style.transform='' }}>
        <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:color}}/>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',paddingTop:4}}>
          <div>
            <div style={{fontSize:10,color:'var(--t3)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:5}}>{label}</div>
            <div style={{fontSize:24,fontWeight:800,color,lineHeight:1}}>{val}</div>
          </div>
          <div style={{fontSize:20,opacity:.25}}>{icon}</div>
        </div>
      </div>
    )
  }

  function Row({d}) {
    const dy = daysLeft(d)
    return (
      <tr>
        <td style={{fontWeight:600,color:urgencyColor(dy)}}>{getName(d)}</td>
        <td style={{fontSize:12,color:'var(--t2)'}}>{getClient(d)!=='—' ? <ClientLink name={getClient(d)} /> : '—'}</td>
        <td><span className="bdg bb" style={{fontSize:10}}>{d.type}</span></td>
        <td style={{color:urgencyColor(dy),fontSize:12}}>{d.dueDate||d.due_date||'—'}</td>
        <td><span className={`bdg ${urgencyBdg(dy)}`}>{daysText(dy)}</span></td>
        <td>
          <select
            value={getStatus(d)}
            onChange={e=>markStatus(d.id,e.target.value)}
            style={{background:'var(--s2)',border:'1px solid var(--br)',borderRadius:5,color:'var(--tx)',fontSize:11,padding:'2px 6px',cursor:'pointer'}}
          >
            {STATUSES.map(s=><option key={s}>{s}</option>)}
          </select>
        </td>
        <td>
          <div style={{display:'flex',gap:4}}>
            {getClient(d)!=='—'&&<button className="btn sec" style={{fontSize:12,padding:'4px 10px'}} onClick={()=>sendDeadlineReminder(d)} title="Email reminder to client">📧</button>}
            <button className="btn del" style={{fontSize:12,padding:'4px 10px'}} onClick={()=>deleteItem(d.id)}>🗑</button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div style={{padding:'20px 24px',maxWidth:1000,margin:'0 auto'}}>
      {toast&&<div className="toast show">{toast}</div>}

      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:10}}>
        <div>
          <h2 style={{fontSize:17,fontWeight:700,margin:0}}>⏰ Deadlines</h2>
          <p style={{fontSize:12,color:'var(--t3)',margin:'4px 0 0'}}>Track IRS deadlines, CSED dates, and compliance due dates.</p>
        </div>
        <button className="btn pri" onClick={()=>{setForm(BLANK);setModal(true)}}>+ Add Deadline</button>
      </div>

      {/* Stat cards — double as quick filters */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10,marginBottom:14}}>
        <StatCard label="Total" val={items.length} color="var(--blue)" icon="📋" active={filter==='All'} onClick={()=>setFilter('All')}/>
        <StatCard label="Overdue" val={overdueCount} color="var(--bad)" icon="🚨" active={filter==='Overdue'} onClick={()=>setFilter('Overdue')}/>
        <StatCard label="Due Soon (7d)" val={dueSoonCount} color="var(--warn)" icon="⏰" active={filter==='Upcoming'} onClick={()=>setFilter('Upcoming')}/>
        <StatCard label="Completed" val={completedCount} color="var(--ok)" icon="✅" active={filter==='Completed'} onClick={()=>setFilter('Completed')}/>
      </div>

      {/* Urgent banner */}
      {urgent.length>0&&(
        <div className="card" style={{borderColor:'var(--bad)',marginBottom:12}}>
          <div className="ch"><span className="ct" style={{color:'var(--bad)'}}>⚠️ Urgent — Within 7 Days ({urgent.length})</span></div>
          <div className="ovx">
            <table>
              <thead><tr><th>Deadline</th><th>Client</th><th>Type</th><th>Due</th><th>Days</th><th>Status</th><th></th></tr></thead>
              <tbody>{urgent.map(d=><Row key={d.id} d={d}/>)}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filter chips */}
      <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:10}}>
        {['All','Upcoming','Overdue',...STATUSES].map(f=>(
          <span key={f} className={`chip${filter===f?' on':''}`} onClick={()=>setFilter(f)}>{f}</span>
        ))}
      </div>

      <div className="card">
        <div className="ch">
          <span className="ct">All Deadlines ({filtered.length})</span>
          <button className="btn pri" onClick={()=>{setForm(BLANK);setModal(true)}}>+ Add Deadline</button>
        </div>
        <div className="ovx">
          <table>
            <thead><tr><th>Deadline</th><th>Client</th><th>Type</th><th>Due</th><th>Days</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.length===0
                ?<tr><td colSpan={7} style={{textAlign:'center',color:'var(--t3)',padding:20}}>No deadlines</td></tr>
                :filtered.map(d=><Row key={d.id} d={d}/>)
              }
            </tbody>
          </table>
        </div>
      </div>

      {modal&&(
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal" style={{width:520}}>
            <div className="mh"><span className="mt">Add Deadline</span><button className="xbtn" onClick={()=>setModal(false)}>&times;</button></div>
            <div className="fg2">
              <div className="field"><label>Deadline Name *</label>
                <input value={form.name} onChange={e=>fld('name',e.target.value)} placeholder="e.g. OIC Response Due"/>
              </div>
              <div className="field" style={{position:'relative'}}>
                <label>Client</label>
                <input value={form.client} onChange={e=>searchClient(e.target.value)} placeholder="Type client name..." autoComplete="off"/>
                {sug.length>0&&(
                  <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--s3)',border:'1px solid var(--b2c)',borderRadius:7,zIndex:500}}>
                    {sug.map(c=><div key={c.id} onClick={()=>{fld('client',c.name);fld('clientName',c.name);setSug([])}} style={{padding:'7px 12px',cursor:'pointer',fontSize:13}}>{c.name}</div>)}
                  </div>
                )}
              </div>
            </div>
            <div className="fg2">
              <div className="field"><label>Type</label>
                <div style={{display:'flex',gap:6}}>
                  <select value={form.type} onChange={e=>fld('type',e.target.value)} style={{flex:1}}>
                    {TYPES.map(t=><option key={t}>{t}</option>)}
                  </select>
                  {form.type==='CSED'&&<button type="button" className="btn sec" style={{fontSize:11,padding:'6px 10px',whiteSpace:'nowrap'}} onClick={calcCSED}>📅 Calc</button>}
                </div>
              </div>
              <div className="field"><label>Due Date *</label>
                <input type="date" value={form.dueDate} onChange={e=>fld('dueDate',e.target.value)}/>
              </div>
            </div>
            <div className="field"><label>Status</label>
              <select value={form.status} onChange={e=>fld('status',e.target.value)}>
                {STATUSES.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="field"><label>Notes</label>
              <textarea value={form.notes} onChange={e=>fld('notes',e.target.value)} style={{minHeight:60}} placeholder="Optional details..."/>
            </div>
            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={save} disabled={saving}>
              {saving?'Saving…':'Add Deadline'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
