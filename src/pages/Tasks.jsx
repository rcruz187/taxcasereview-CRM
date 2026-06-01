import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BLANK = { title:'', clientName:'', caseNum:'', assignedTo:'Romy Cruz', dueDate:'', priority:'Normal', notes:'', done:false }

export default function Tasks() {
  const [tasks, setTasks]     = useState([])
  const [clients, setClients] = useState([])
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(BLANK)
  const [qtForm, setQt]       = useState({title:'',dueDate:'',priority:'Normal',clientName:'',assignedTo:'Romy Cruz'})
  const [suggestions, setSug] = useState([])
  const [qtSug, setQtSug]     = useState([])
  const [saving, setSaving]   = useState(false)
  const [toast, setToast]     = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: t }, { data: c }] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('id,name')
    ])
    if (t) setTasks(t)
    if (c) setClients(c)
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3000) }
  function fld(k,v) { setForm(f=>({...f,[k]:v})) }

  function searchClient(val, isQt=false) {
    if (isQt) setQt(f=>({...f,clientName:val})); else fld('clientName',val)
    if (val.length < 2) { isQt ? setQtSug([]) : setSug([]); return }
    const res = clients.filter(c=>c.name.toLowerCase().includes(val.toLowerCase())).slice(0,6)
    isQt ? setQtSug(res) : setSug(res)
  }

  async function save(data) {
    if (!data.title.trim()) { showToast('Title required'); return }
    setSaving(true)
    const { error } = await supabase.from('tasks').insert([{ ...data, created_at: new Date().toISOString() }])
    setSaving(false)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('Task added!')
    setModal(false)
    setForm(BLANK)
    setQt({title:'',dueDate:'',priority:'Normal',clientName:'',assignedTo:'Romy Cruz'})
    load()
  }

  async function toggleDone(t) {
    await supabase.from('tasks').update({ done: !t.done }).eq('id', t.id)
    load()
  }

  async function deleteTask(id) {
    await supabase.from('tasks').delete().eq('id', id)
    showToast('Deleted')
    load()
  }

  const open = tasks.filter(t => !t.done)
  const done = tasks.filter(t => t.done)

  function TaskItem({ t }) {
    const pc = t.priority === 'Urgent' ? 'br' : t.priority === 'High' ? 'ba' : 'bn'
    return (
      <div className="task-item">
        <div className={`tcb${t.done?' done':''}`} onClick={()=>toggleDone(t)} style={{cursor:'pointer'}}>
          {t.done ? '✓' : ''}
        </div>
        <div style={{flex:1}}>
          <div style={{textDecoration:t.done?'line-through':'',opacity:t.done?.5:1}}>{t.title}</div>
          <div style={{fontSize:11,color:'var(--t3)'}}>
            {t.assignedTo||''}{t.dueDate ? ' · due '+t.dueDate : ''}{t.clientName ? ' · '+t.clientName : ''}
          </div>
        </div>
        <span className={`bdg ${pc}`}>{t.priority||'Normal'}</span>
        <button className="btn del" style={{marginLeft:6}} onClick={()=>deleteTask(t.id)}>Del</button>
      </div>
    )
  }

  return (
    <div>
      {toast && <div className="toast show">{toast}</div>}
      <div className="g2">
        {/* Left: task list */}
        <div>
          <div className="card">
            <div className="ch">
              <span className="ct">Open Tasks ({open.length})</span>
              <button className="btn pri" onClick={()=>setModal(true)}>+ Add Task</button>
            </div>
            {open.length === 0 ? <div style={{color:'var(--t3)',fontSize:12,padding:'8px 0'}}>No open tasks 🎉</div>
              : open.map(t=><TaskItem key={t.id} t={t}/>)}
          </div>
          {done.length > 0 && (
            <div className="card" style={{marginTop:0}}>
              <div className="ch"><span className="ct" style={{color:'var(--t3)'}}>Completed ({done.length})</span></div>
              {done.map(t=><TaskItem key={t.id} t={t}/>)}
            </div>
          )}
        </div>

        {/* Right: Quick Add */}
        <div className="card">
          <div className="ch"><span className="ct">Quick Add Task</span></div>
          <div className="field"><label>Title *</label>
            <input value={qtForm.title} onChange={e=>setQt(f=>({...f,title:e.target.value}))} placeholder="Task description"/>
          </div>
          <div className="fg2">
            <div className="field"><label>Due Date</label>
              <input type="date" value={qtForm.dueDate} onChange={e=>setQt(f=>({...f,dueDate:e.target.value}))}/>
            </div>
            <div className="field"><label>Priority</label>
              <select value={qtForm.priority} onChange={e=>setQt(f=>({...f,priority:e.target.value}))}>
                <option>Normal</option><option>High</option><option>Urgent</option>
              </select>
            </div>
          </div>
          <div className="fg2">
            <div className="field" style={{position:'relative'}}>
              <label>Linked Client</label>
              <input value={qtForm.clientName} onChange={e=>searchClient(e.target.value,true)} placeholder="Search..." autoComplete="off"/>
              {qtSug.length > 0 && (
                <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--s3)',border:'1px solid var(--b2c)',borderRadius:7,zIndex:500}}>
                  {qtSug.map(c=>(
                    <div key={c.id} onClick={()=>{setQt(f=>({...f,clientName:c.name}));setQtSug([])}} style={{padding:'7px 12px',cursor:'pointer',fontSize:13}}>
                      {c.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="field"><label>Assigned To</label>
              <select value={qtForm.assignedTo} onChange={e=>setQt(f=>({...f,assignedTo:e.target.value}))}>
                <option>Romy Cruz</option><option>Dana Richard</option><option>Yesenia Gonzalez</option>
              </select>
            </div>
          </div>
          <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={()=>save(qtForm)} disabled={saving}>
            {saving ? 'Adding...' : 'Add Task'}
          </button>
        </div>
      </div>

      {/* Full modal */}
      {modal && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal">
            <div className="mh">
              <span className="mt">Add Task</span>
              <button className="xbtn" onClick={()=>setModal(false)}>&times;</button>
            </div>
            <div className="field"><label>Title *</label><input value={form.title} onChange={e=>fld('title',e.target.value)} placeholder="Task description"/></div>
            <div className="field" style={{position:'relative'}}>
              <label>Client / Lead</label>
              <input value={form.clientName} onChange={e=>searchClient(e.target.value)} placeholder="Search clients..." autoComplete="off"/>
              {suggestions.length > 0 && (
                <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--s3)',border:'1px solid var(--b2c)',borderRadius:7,zIndex:500}}>
                  {suggestions.map(c=>(
                    <div key={c.id} onClick={()=>{fld('clientName',c.name);setSug([])}} style={{padding:'7px 12px',cursor:'pointer',fontSize:13}}>
                      {c.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="fg2">
              <div className="field"><label>Case #</label><input value={form.caseNum} onChange={e=>fld('caseNum',e.target.value)}/></div>
              <div className="field"><label>Assigned To</label>
                <select value={form.assignedTo} onChange={e=>fld('assignedTo',e.target.value)}>
                  <option>Romy Cruz</option><option>Dana Richard</option><option>Yesenia Gonzalez</option>
                </select>
              </div>
            </div>
            <div className="fg2">
              <div className="field"><label>Due Date</label><input type="date" value={form.dueDate} onChange={e=>fld('dueDate',e.target.value)}/></div>
              <div className="field"><label>Priority</label>
                <select value={form.priority} onChange={e=>fld('priority',e.target.value)}>
                  <option>Normal</option><option>High</option><option>Urgent</option>
                </select>
              </div>
            </div>
            <div className="field"><label>Notes</label><textarea value={form.notes} onChange={e=>fld('notes',e.target.value)}/></div>
            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={()=>save(form)} disabled={saving}>
              {saving ? 'Saving...' : 'Add Task'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
