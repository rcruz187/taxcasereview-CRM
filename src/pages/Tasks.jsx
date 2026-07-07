import DeleteConfirmModal from '../components/DeleteConfirmModal'
import { logActivity, getActor } from '../lib/activityLog'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'

const BLANK = { title:'', clientName:'', caseNum:'', assignedTo:'', dueDate:'', priority:'Normal', notes:'', done:false, section_title:'' }
const QT_BLANK = { title:'', dueDate:'', priority:'Normal', clientName:'', assignedTo:'' }

function resolveActorName(user, employees) {
  const email = user?.email?.toLowerCase()
  const emp = email ? employees.find(e => e.email && e.email.toLowerCase() === email) : null
  return emp?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Staff'
}

export default function Tasks() {
  const { user } = useApp()
  const [tasks,     setTasks]     = useState([])
  const [deleted,   setDeleted]   = useState([])   // soft-deleted tasks
  const [clients,   setClients]   = useState([])
  const [leads,     setLeads]     = useState([])
  const [employees, setEmployees] = useState([])
  const [statusCategories, setStatusCategories] = useState([]) // [{...category, statuses:[...]}]
  const [modal,     setModal]     = useState(false)
  const [form,      setForm]      = useState(BLANK)
  // Additional sub-task titles being built in the same Add Task session —
  // lets someone create a whole section (main task + N sub-tasks) in one
  // go, instead of reopening the modal repeatedly (Karbon-style).
  const [subtasks,  setSubtasks]  = useState([])
  const [qtForm,    setQt]        = useState(QT_BLANK)
  const [sug,       setSug]       = useState([])
  const [qtSug,     setQtSug]     = useState([])
  const [saving,    setSaving]    = useState(false)
  const [confirmDelId, setConfirmDelId] = useState(null)
  const [toast,     setToast]     = useState('')
  const [view,      setView]      = useState('open') // 'open' | 'completed' | 'deleted'
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [filterPri, setFilterPri] = useState('All')
  const [filterAssign, setFilterAssign] = useState('All')
  const [sortBy, setSortBy] = useState('dueDate') // 'dueDate' | 'priority' | 'created'

  useEffect(() => {
    load()
    // Request notification permission for reminders
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Check for due tasks and show browser notifications
  useEffect(() => {
    if (!tasks.length) return
    const today = new Date().toISOString().slice(0,10)
    const dueSoon = tasks.filter(t => !t.done && t.dueDate && t.dueDate <= today)
    if (dueSoon.length > 0 && Notification.permission === 'granted') {
      dueSoon.forEach(t => {
        const overdue = t.dueDate < today
        new Notification(`${overdue?'⚠️ OVERDUE':'📅 Due Today'}: ${t.title}`, {
          body: `${t.clientName ? 'Client: '+t.clientName+'\n' : ''}Priority: ${t.priority||'Normal'}`,
          icon: '/taxcasereview-CRM/favicon.ico',
          tag: 'task-'+t.id,
        })
      })
    }
  }, [tasks])
  useEffect(() => {
    // Check if current user is Super Admin
    if (user?.email) checkRole(user.email)
  }, [user])

  async function checkRole(email) {
    const { data } = await supabase.from('employees').select('access').eq('email', email).maybeSingle()
    if (data?.access === 'Super Admin') setIsSuperAdmin(true)
    // Also check against known super admin email directly
    if (email === 'romy@taxcasereview.org') setIsSuperAdmin(true)
  }

  async function load() {
    const [{ data:t },{ data:dt },{ data:c },{ data:lds },{ data:e },{ data:cats },{ data:sts }] = await Promise.all([
      supabase.from('tasks').select('*').eq('deleted', false).order('created_at',{ascending:false}),
      supabase.from('tasks').select('*').eq('deleted', true).order('deleted_at',{ascending:false}),
      supabase.from('clients').select('id,name'),
      supabase.from('leads').select('id,name'),
      supabase.from('employees').select('id,name,email,avatar_url'),
      supabase.from('workflow_status_categories').select('*').order('sort_order'),
      supabase.from('workflow_statuses').select('*').order('sort_order'),
    ])
    // Handle case where 'deleted' column may not exist yet — fall back gracefully
    if (t) setTasks(t)
    else {
      const { data: fallback } = await supabase.from('tasks').select('*').order('created_at',{ascending:false})
      if (fallback) setTasks(fallback)
    }
    if (dt) setDeleted(dt)
    if (c) setClients(c)
    if (lds) setLeads(lds)
    if (e) setEmployees(e)
    if (cats) setStatusCategories(cats.map(cat => ({ ...cat, statuses: (sts||[]).filter(s => s.category_id === cat.id) })))
  }

  function showToast(msg){setToast(msg);setTimeout(()=>setToast(''),3500)}
  function fld(k,v){setForm(f=>({...f,[k]:v}))}

  function searchClient(val, isQt=false) {
    if (isQt) setQt(f=>({...f,clientName:val})); else fld('clientName',val)
    if (val.length<2){isQt?setQtSug([]):setSug([]);return}
    const res=clients.filter(c=>c.name.toLowerCase().includes(val.toLowerCase())).slice(0,6)
    isQt?setQtSug(res):setSug(res)
  }

  async function save(data) {
    if (!data.title.trim()){showToast('Title required');return}
    setSaving(true)
    const sectionTitle = data.section_title?.trim() || null
    const extraTitles = subtasks.map(s=>s.trim()).filter(Boolean)
    // If there are extra sub-tasks but no section name was given, use the
    // main task's own title as the section heading so they still group.
    const effectiveSection = extraTitles.length && !sectionTitle ? data.title.trim() : sectionTitle
    const base = { clientName:data.clientName, caseNum:data.caseNum, assignedTo:data.assignedTo, dueDate:data.dueDate, priority:data.priority, done:false, deleted:false, created_at:new Date().toISOString() }
    const rows = [
      { ...base, title:data.title, notes:data.notes, section_title:effectiveSection },
      ...extraTitles.map(t => ({ ...base, title:t, notes:'', section_title:effectiveSection })),
    ]
    const {error} = await supabase.from('tasks').insert(rows)
    setSaving(false)
    if (error){showToast('❌ '+error.message);return}
    showToast(rows.length>1 ? `✅ ${rows.length} tasks added!` : '✅ Task added!')
    setModal(false); setForm(BLANK); setQt(QT_BLANK); setSubtasks([]); load()
    const _ta=getActor(user); await logActivity(supabase,{employeeName:_ta.name,employeeEmail:_ta.email,action:'task_created',category:'task',description:`Created task: ${form.title}`,entityName:form.clientName,meta:{assignedTo:form.assignedTo,priority:form.priority}}).catch(()=>{})
  }

  async function toggleDone(t) {
    await supabase.from('tasks').update({done:!t.done}).eq('id',t.id)
    load()
  }

  async function updateTaskStatus(t, value) {
    if (!value) { await supabase.from('tasks').update({status_category:null, status_label:null}).eq('id',t.id); load(); return }
    const [category, label] = value.split('|||')
    // "Completed" category also flips the done flag so existing done-based
    // logic elsewhere (dashboards, counts) stays correct.
    const completed = statusCategories.find(c=>c.name===category)?.name?.toLowerCase() === 'completed'
    const prevLabel = t.status_label || (t.done ? 'Completed' : 'Ready to Start')
    await supabase.from('tasks').update({status_category:category, status_label:label, done:completed}).eq('id',t.id)

    // Log a note on whichever entity this task is linked to.
    if (t.clientName) {
      const actor = resolveActorName(user, employees)
      const noteText = `🔄 Task status changed: "${t.title}" — ${prevLabel} → ${label}`
      const lead = leads.find(l => l.name === t.clientName)
      if (lead) {
        await supabase.from('lead_notes').insert([{
          lead_id: lead.id, lead_name: lead.name,
          text: noteText, type: 'System', author: actor, created_at: new Date().toISOString()
        }])
      } else if (clients.find(c => c.name === t.clientName)) {
        await supabase.from('client_notes').insert({
          clientname: t.clientName, text: noteText, author: actor, created_at: new Date().toISOString()
        })
      }
    }
    load()
  }

  // Add a sub-task under an existing task/group. If the parent task doesn't
  // have a section yet, this promotes it (uses its own title as the section
  // heading) so it and the new sibling now group together. Existing
  // standalone tasks are otherwise completely unaffected until this is used.
  async function addSubtask(parent) {
    const sectionTitle = parent.section_title || parent.title
    if (parent.id && !parent.section_title) {
      await supabase.from('tasks').update({ section_title: sectionTitle }).eq('id', parent.id)
      setTasks(prev => prev.map(x => x.id === parent.id ? { ...x, section_title: sectionTitle } : x))
    }
    setForm({ ...BLANK, clientName: parent.clientName || '', section_title: sectionTitle })
    setModal(true)
  }

  // Soft delete — sets deleted=true, records timestamp
  async function softDelete(id) {
    const {error} = await supabase.from('tasks').update({deleted:true, deleted_at:new Date().toISOString()}).eq('id',id)
    if (error) {
      const { error: hardErr } = await supabase.from('tasks').delete().eq('id',id)
      if (hardErr) { showToast('❌ ' + hardErr.message); return }
      setTasks(prev => prev.filter(t => t.id !== id))
      showToast('Task deleted')
    } else {
      setTasks(prev => prev.map(t => t.id === id ? {...t, deleted:true, deleted_at:new Date().toISOString()} : t))
      showToast('Task moved to deleted')
    }
  }

  // Restore a deleted task (Super Admin only)
  async function restore(id) {
    const {error} = await supabase.from('tasks').update({deleted:false, deleted_at:null}).eq('id',id)
    if (error){showToast('❌ '+error.message);return}
    setTasks(prev => prev.map(t => t.id === id ? {...t, deleted:false, deleted_at:null} : t))
    showToast('✅ Task restored!')
  }

  // Permanent delete (Super Admin only)
  async function permDelete(id) {
    if (!window._confirmDel) { setConfirmDelId(id); return }
    window._confirmDel = false
    const { error } = await supabase.from('tasks').delete().eq('id',id)
    if (error) { showToast('❌ ' + error.message); return }
    setTasks(prev => prev.filter(t => t.id !== id)); showToast('Permanently deleted')
  }

  const reps = employees.length>0 ? employees.map(e=>e.name) : ['Romy Cruz','Dana Richard','Yesenia Gonzalez']
  const today2 = new Date().toISOString().slice(0,10)
  const PRIORITY_ORDER = { 'High':0, 'Normal':1, 'Low':2, '':3 }
  const allOpen = tasks.filter(t=>!t.done && !t.deleted)
  const open = allOpen
    .filter(t => filterPri === 'All' || (t.priority||'Normal') === filterPri)
    .filter(t => filterAssign === 'All' || t.assignedTo === filterAssign)
    .sort((a,b) => {
      if (sortBy === 'priority') return (PRIORITY_ORDER[a.priority||'']||1) - (PRIORITY_ORDER[b.priority||'']||1)
      if (sortBy === 'dueDate') {
        if (!a.dueDate && !b.dueDate) return 0
        if (!a.dueDate) return 1; if (!b.dueDate) return -1
        return a.dueDate.localeCompare(b.dueDate)
      }
      return (b.created_at||'').localeCompare(a.created_at||'')
    })
  const completed = tasks.filter(t=>t.done  && !t.deleted)
  const assignees = [...new Set(tasks.filter(t=>t.assignedTo).map(t=>t.assignedTo))].sort()
  const pc = p => p==='Urgent'?'br':p==='High'?'ba':'bn'

  // Group tasks sharing a client + section_title (Karbon-style grouped
  // sub-tasks). Tasks with no section_title each remain their own group of
  // one and render exactly as before -- no visual change for existing data.
  function groupTasks(list) {
    const groups = []
    const byKey = new Map()
    list.forEach(t => {
      const key = t.section_title ? `${t.clientName||''}::${t.section_title}` : `t-${t.id}`
      if (!byKey.has(key)) {
        const g = { key, section_title: t.section_title || null, clientName: t.clientName, tasks: [] }
        byKey.set(key, g)
        groups.push(g)
      }
      byKey.get(key).tasks.push(t)
    })
    return groups
  }
  const openGroups = groupTasks(open)

  const AVATAR_PALETTE = ['#e8590c','#2563eb','#16a34a','#9333ea','#d97706','#0891b2','#dc2626','#4f46e5']
  function avatarColor(name){
    const s = name || '?'
    let hash = 0
    for (let i=0;i<s.length;i++) hash = s.charCodeAt(i) + ((hash<<5)-hash)
    return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
  }
  function initials(name){ return (name||'?').trim().split(/\s+/).filter(Boolean).map(p=>p[0]).join('').slice(0,2).toUpperCase() || '?' }

  function TaskItem({t, showRestore=false, onAddSub}) {
    const emp = employees.find(e => e.name && t.assignedTo && e.name.toLowerCase()===t.assignedTo.toLowerCase())
    const overdue = t.dueDate && new Date(t.dueDate)<new Date() && !t.done
    return (
      <div style={{display:'flex',gap:10,alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--br)'}}>
        {/* Checkbox */}
        <div
          onClick={()=>!showRestore&&toggleDone(t)}
          style={{
            width:20,height:20,borderRadius:5,flexShrink:0,cursor:showRestore?'default':'pointer',
            border:'1.5px solid var(--b2c)',
            background:t.done?'var(--ok)':'var(--s2)',
            display:'flex',alignItems:'center',justifyContent:'center',
            color:'#fff',fontSize:12,fontWeight:700
          }}
        >{t.done?'✓':''}</div>

        {/* Content */}
        <div style={{flex:1,minWidth:0}}>
          <div style={{
            fontSize:13,fontWeight:t.done?400:600,
            textDecoration:t.done||showRestore?'line-through':'none',
            opacity:t.done||showRestore?0.55:1,
            color:'var(--tx)',
            overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'
          }}>{t.title}</div>
          <div style={{fontSize:11,color:'var(--t3)',marginTop:2,display:'flex',gap:8,flexWrap:'wrap'}}>
            {t.clientName&&<span>🏢 {t.clientName}</span>}
            {t.priority&&<span className={`bdg ${pc(t.priority)}`} style={{fontSize:9}}>{t.priority}</span>}
            {showRestore&&t.deleted_at&&<span style={{color:'var(--bad)'}}>Deleted {t.deleted_at?.slice(0,10)}</span>}
          </div>
          {t.notes&&<div style={{fontSize:11,color:'var(--t2)',marginTop:3,lineHeight:1.5}}>{t.notes}</div>}
        </div>

        {/* Status dropdown */}
        <div style={{width:150,flexShrink:0,position:'relative'}}>
          <select
            value={t.status_category && t.status_label ? `${t.status_category}|||${t.status_label}` : ''}
            onChange={e=>updateTaskStatus(t, e.target.value)}
            style={{
              width:'100%',fontSize:10,fontWeight:700,padding:'4px 20px 4px 6px',borderRadius:20,textAlign:'center',
              border:'1px solid rgba(148,163,184,.35)',cursor:'pointer',appearance:'none',WebkitAppearance:'none',
              background:t.done?'rgba(22,163,74,.15)':'rgba(148,163,184,.15)',
              color:t.done?'var(--ok)':'var(--tx)'
            }}
          >
            <option value="" style={{color:'#000',background:'#fff'}}>{t.done?'Completed':'Ready to Start'}</option>
            {statusCategories.map(cat => (
              <optgroup key={cat.id} label={cat.name} style={{color:'#000',background:'#fff'}}>
                <option value={`${cat.name}|||${cat.name}`} style={{color:'#000',background:'#fff',fontWeight:700}}>{cat.name} (general)</option>
                {cat.statuses.map(s => (
                  <option key={s.id} value={`${cat.name}|||${s.label}`} style={{color:'#000',background:'#fff'}}>{s.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <span style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',fontSize:9,color:t.done?'var(--ok)':'var(--tx)',pointerEvents:'none'}}>▾</span>
        </div>

        {/* Due date */}
        <div style={{width:100,flexShrink:0,fontSize:11,color:overdue?'var(--bad)':'var(--t3)',textAlign:'center'}}>
          {t.dueDate || 'No due date'}
        </div>

        {/* Assignee + avatar */}
        <div style={{width:130,flexShrink:0,display:'flex',alignItems:'center',gap:6,justifyContent:'flex-end'}}>
          {t.assignedTo && (
            <>
              <span style={{fontSize:11,color:'var(--t3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.assignedTo}</span>
              <div style={{width:24,height:24,borderRadius:'50%',flexShrink:0,overflow:'hidden',background:avatarColor(t.assignedTo),display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800,color:'#fff'}}>
                {emp?.avatar_url ? <img src={emp.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/> : initials(t.assignedTo)}
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div style={{display:'flex',gap:4,flexShrink:0}}>
          {!showRestore ? (
            <>
              {!t.done&&<button className="btn sec" style={{fontSize:12,padding:'4px 10px'}} onClick={()=>toggleDone(t)}>✓ Done</button>}
              {onAddSub&&<button className="btn sec" style={{fontSize:12,padding:'4px 10px'}} onClick={()=>onAddSub(t)}>+ Sub</button>}
              <button className="btn del" style={{fontSize:12,padding:'4px 10px'}} onClick={()=>softDelete(t.id)}>Del</button>
            </>
          ) : isSuperAdmin ? (
            <>
              <button className="btn sec" style={{fontSize:12,padding:'4px 10px',color:'var(--ok)'}} onClick={()=>restore(t.id)}>↩ Restore</button>
              <button className="btn del" style={{fontSize:12,padding:'4px 10px'}} onClick={()=>permDelete(t.id)}>☠ Perm</button>
            </>
          ) : null}
        </div>
      </div>
    )
  }

  // Stats bar
  const totalCreated   = tasks.length + deleted.length
  const totalCompleted = completed.length
  const totalDeleted   = deleted.length

  return (
    <div style={{padding:'20px 24px',maxWidth:1000,margin:'0 auto'}}>
      {toast&&<div className="toast show">{toast}</div>}

      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:10}}>
        <div>
          <h2 style={{fontSize:17,fontWeight:700,margin:0}}>✅ Tasks</h2>
          <p style={{fontSize:12,color:'var(--t3)',margin:'4px 0 0'}}>Track and manage work assigned to the team.</p>
        </div>
        <button className="btn pri" onClick={()=>setModal(true)}>+ Add Task</button>
      </div>

      {/* Stats */}
      <div className="metrics" style={{marginBottom:12}}>
        <div className="metric" style={{cursor:'pointer'}} onClick={()=>setView('open')}><div className="ml">Open</div><div className="mv" style={{color:'var(--b2)'}}>{open.length}</div></div>
        <div className="metric" style={{cursor:'pointer'}} onClick={()=>setView('completed')}><div className="ml">Completed</div><div className="mv" style={{color:'var(--ok)'}}>{totalCompleted}</div></div>
        <div className="metric"><div className="ml">Total Created</div><div className="mv">{totalCreated}</div></div>
        {isSuperAdmin&&<div className="metric" style={{cursor:'pointer'}} onClick={()=>setView('deleted')}>
          <div className="ml">Deleted</div>
          <div className="mv" style={{color:totalDeleted>0?'var(--bad)':'var(--t3)'}}>{totalDeleted}</div>
        </div>}
      </div>

      {/* View tabs */}
      <div style={{display:'flex',gap:6,marginBottom:12}}>
        <span className={`chip${view==='open'?' on':''}`} onClick={()=>setView('open')}>Open ({open.length})</span>
        <span className={`chip${view==='completed'?' on':''}`} onClick={()=>setView('completed')}>Completed ({totalCompleted})</span>
        {isSuperAdmin&&<span className={`chip${view==='deleted'?' on':''}`} onClick={()=>setView('deleted')} style={{color:totalDeleted>0?'var(--bad)':'',borderColor:totalDeleted>0?'var(--bad)':''}}>🗑 Deleted ({totalDeleted}) — Admin Only</span>}
      </div>

      <div className="g2" style={{alignItems:'start'}}>
        {/* Left: task list */}
        <div>
          {/* Open tasks */}
          {view==='open'&&(
            <div className="card">
              <div className="ch">
                <span className="ct">Open Tasks ({open.length}{allOpen.length !== open.length ? ` / ${allOpen.length}` : ''})</span>
                <button className="btn pri" onClick={()=>setModal(true)}>+ Add Task</button>
              </div>
              {/* Filter + Sort bar */}
              <div style={{ display:'flex', gap:6, padding:'0 16px 12px', flexWrap:'wrap', alignItems:'center' }}>
                <select value={filterPri} onChange={e=>setFilterPri(e.target.value)}
                  style={{ fontSize:11, padding:'4px 8px', background:'var(--s2)', border:'1px solid var(--br)', borderRadius:6, color:'var(--tx)' }}>
                  <option value="All">All Priorities</option>
                  {['High','Normal','Low'].map(p=><option key={p}>{p}</option>)}
                </select>
                {assignees.length > 0 && (
                  <select value={filterAssign} onChange={e=>setFilterAssign(e.target.value)}
                    style={{ fontSize:11, padding:'4px 8px', background:'var(--s2)', border:'1px solid var(--br)', borderRadius:6, color:'var(--tx)' }}>
                    <option value="All">All Assignees</option>
                    {assignees.map(a=><option key={a}>{a}</option>)}
                  </select>
                )}
                <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
                  style={{ fontSize:11, padding:'4px 8px', background:'var(--s2)', border:'1px solid var(--br)', borderRadius:6, color:'var(--tx)' }}>
                  <option value="dueDate">Sort: Due Date</option>
                  <option value="priority">Sort: Priority</option>
                  <option value="created">Sort: Newest</option>
                </select>
                {(filterPri!=='All'||filterAssign!=='All') && (
                  <button className="btn sec" style={{ fontSize:10, padding:'4px 8px' }} onClick={()=>{setFilterPri('All');setFilterAssign('All')}}>✕ Clear</button>
                )}
              </div>
              {open.length===0
                ?<div style={{color:'var(--t3)',fontSize:13,textAlign:'center',padding:'20px 0'}}>🎉 No open tasks!</div>
                :openGroups.map(g => g.section_title ? (
                    <div key={g.key} style={{marginBottom:12,borderRadius:9,overflow:'hidden',border:'1px solid var(--br)'}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'11px 14px',background:'var(--s2)'}}>
                        <div style={{fontSize:13,fontWeight:700,color:'var(--tx)'}}>
                          📋 {g.section_title}{g.clientName?<span style={{fontWeight:400,color:'var(--t3)'}}> · {g.clientName}</span>:''}
                        </div>
                        <button className="btn pri" style={{fontSize:11,padding:'5px 12px',fontWeight:600}} onClick={()=>addSubtask({clientName:g.clientName, section_title:g.section_title})}>+ Add Task</button>
                      </div>
                      <div style={{padding:'2px 14px 4px'}}>
                        {g.tasks.map(t=><TaskItem key={t.id} t={t} onAddSub={addSubtask}/>)}
                      </div>
                    </div>
                  ) : (
                    g.tasks.map(t=><TaskItem key={t.id} t={t} onAddSub={addSubtask}/>)
                  )
                )
              }
            </div>
          )}

          {/* Completed */}
          {view==='completed'&&(
            <div className="card">
              <div className="ch"><span className="ct">Completed Tasks ({totalCompleted})</span></div>
              {totalCompleted===0
                ?<div style={{color:'var(--t3)',fontSize:13,padding:'8px 0'}}>No completed tasks yet</div>
                :completed.map(t=><TaskItem key={t.id} t={t}/>)
              }
            </div>
          )}

          {/* Deleted — Super Admin only */}
          {view==='deleted'&&isSuperAdmin&&(
            <div className="card" style={{borderColor:'var(--bad)'}}>
              <div className="ch">
                <span className="ct" style={{color:'var(--bad)'}}>🗑 Deleted Tasks ({totalDeleted})</span>
                <span style={{fontSize:11,color:'var(--t3)'}}>Super Admin View</span>
              </div>
              {totalDeleted===0
                ?<div style={{color:'var(--t3)',fontSize:13,padding:'8px 0'}}>No deleted tasks</div>
                :deleted.map(t=><TaskItem key={t.id} t={t} showRestore={true}/>)
              }
            </div>
          )}

          {/* Blocked non-admin */}
          {view==='deleted'&&!isSuperAdmin&&(
            <div className="card" style={{textAlign:'center',padding:40}}>
              <div style={{fontSize:32,marginBottom:8}}>🔒</div>
              <div style={{fontWeight:700}}>Super Admin Only</div>
              <div style={{fontSize:13,color:'var(--t3)',marginTop:4}}>You don't have permission to view deleted tasks.</div>
            </div>
          )}
        </div>

        {/* Right: Quick Add */}
        <div className="card">
          <div className="ch"><span className="ct">Quick Add Task</span></div>
          <div className="field"><label>Title *</label>
            <input value={qtForm.title} onChange={e=>setQt(f=>({...f,title:e.target.value}))}
              onKeyDown={e=>e.key==='Enter'&&save(qtForm)}
              placeholder="Task description"/>
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
              {qtSug.length>0&&(
                <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--s3)',border:'1px solid var(--b2c)',borderRadius:7,zIndex:500}}>
                  {qtSug.map(c=><div key={c.id} onClick={()=>{setQt(f=>({...f,clientName:c.name}));setQtSug([])}} style={{padding:'7px 12px',cursor:'pointer',fontSize:13}}>{c.name}</div>)}
                </div>
              )}
            </div>
            <div className="field"><label>Assigned To</label>
              <select value={qtForm.assignedTo} onChange={e=>setQt(f=>({...f,assignedTo:e.target.value}))}>
                <option value="">Unassigned</option>
                {reps.map(r=><option key={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={()=>save(qtForm)} disabled={saving}>
            {saving?'Adding…':'Add Task'}
          </button>

          {/* Summary box */}
          <div style={{marginTop:16,padding:12,background:'var(--s2)',borderRadius:8}}>
            <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--t3)',marginBottom:8}}>Summary</div>
            <div style={{display:'flex',flexDirection:'column',gap:5}}>
              {[
                ['Open Tasks',      open.length,      'var(--b2)'],
                ['Completed Today', completed.filter(t=>t.created_at?.slice(0,10)===new Date().toISOString().slice(0,10)).length, 'var(--ok)'],
                ['Total Completed', totalCompleted,   'var(--ok)'],
                ['Total Created',   totalCreated,     'var(--tx)'],
              ].map(([label,val,color])=>(
                <div key={label} style={{display:'flex',justifyContent:'space-between',fontSize:12}}>
                  <span style={{color:'var(--t2)'}}>{label}</span>
                  <span style={{fontWeight:700,color}}>{val}</span>
                </div>
              ))}
              {isSuperAdmin&&(
                <div style={{display:'flex',justifyContent:'space-between',fontSize:12}}>
                  <span style={{color:'var(--t2)'}}>Deleted</span>
                  <span style={{fontWeight:700,color:totalDeleted>0?'var(--bad)':'var(--t3)',cursor:'pointer'}} onClick={()=>setView('deleted')}>{totalDeleted} {totalDeleted>0?'— view →':''}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Full add modal */}
      {modal&&(
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&(setModal(false),setSubtasks([]))}>
          <div className="modal" style={{width:540}}>
            <div className="mh"><span className="mt">Add Task</span><button className="xbtn" onClick={()=>{setModal(false);setSubtasks([])}}>&times;</button></div>
            <div className="field"><label>Title *</label><input value={form.title} onChange={e=>fld('title',e.target.value)} placeholder="Task description"/></div>
            <div className="field" style={{position:'relative'}}>
              <label>Client / Lead</label>
              <input value={form.clientName} onChange={e=>searchClient(e.target.value)} placeholder="Search clients..." autoComplete="off"/>
              {sug.length>0&&(
                <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--s3)',border:'1px solid var(--b2c)',borderRadius:7,zIndex:500}}>
                  {sug.map(c=><div key={c.id} onClick={()=>{fld('clientName',c.name);setSug([])}} style={{padding:'7px 12px',cursor:'pointer',fontSize:13}}>{c.name}</div>)}
                </div>
              )}
            </div>
            <div className="fg2">
              <div className="field"><label>Section</label><input value={form.section_title||''} onChange={e=>fld('section_title',e.target.value)} placeholder="Optional — groups with other sub-tasks"/></div>
              <div className="field"><label>Case #</label><input value={form.caseNum} onChange={e=>fld('caseNum',e.target.value)}/></div>
            </div>
            <div style={{margin:'2px 0 4px'}}>
              <label style={{display:'block',fontSize:11,fontWeight:700,color:'var(--t3)',marginBottom:6,textTransform:'uppercase',letterSpacing:'.04em'}}>Add More Tasks To This Section</label>
              {subtasks.map((s,i)=>(
                <div key={i} style={{display:'flex',gap:6,marginBottom:6}}>
                  <input value={s} onChange={e=>setSubtasks(arr=>arr.map((x,idx)=>idx===i?e.target.value:x))}
                    placeholder="Another task title…"
                    style={{flex:1,padding:'8px 10px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',fontSize:13}}/>
                  <button onClick={()=>setSubtasks(arr=>arr.filter((_,idx)=>idx!==i))}
                    style={{background:'none',border:'none',color:'var(--bad)',cursor:'pointer',fontSize:18,padding:'0 6px'}}>×</button>
                </div>
              ))}
              <button className="btn sec" style={{fontSize:11,padding:'5px 12px',fontWeight:600}} onClick={()=>setSubtasks(arr=>[...arr,''])}>+ Add Another Task</button>
            </div>
            <div className="fg2">
              <div className="field"><label>Assigned To</label>
                <select value={form.assignedTo} onChange={e=>fld('assignedTo',e.target.value)}>
                  <option value="">Unassigned</option>
                  {reps.map(r=><option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="field"><label>Due Date</label><input type="date" value={form.dueDate} onChange={e=>fld('dueDate',e.target.value)}/></div>
            </div>
            <div className="field"><label>Priority</label>
              <select value={form.priority} onChange={e=>fld('priority',e.target.value)}>
                <option>Normal</option><option>High</option><option>Urgent</option>
              </select>
            </div>
            <div className="field"><label>Notes</label><textarea value={form.notes} onChange={e=>fld('notes',e.target.value)} style={{minHeight:70}}/></div>
            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={()=>save(form)} disabled={saving}>
              {saving?'Saving…':'Add Task'}
            </button>
          </div>
        </div>
      )}
      <DeleteConfirmModal open={!!confirmDelId} label="task" onConfirm={() => { window._confirmDel=true; permDelete(confirmDelId); setConfirmDelId(null) }} onCancel={() => setConfirmDelId(null)} />
    </div>
  )
}
