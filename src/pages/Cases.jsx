import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const STATUSES = ['Open','Pending IRS','Active Plan','Docs Needed','POA Sent','Under Review','Resolved','Completed','Closed']
const STATUS_C = {'Open':'bb','Pending IRS':'ba','Active Plan':'bg','Docs Needed':'ba','POA Sent':'bb','Under Review':'bn','Resolved':'bg','Completed':'bg','Closed':'bn'}
const CASE_TYPES = ['OIC','Installment Agreement','CNC','Penalty Abatement','Appeals','Payroll Tax','Audit','Liens/Levies','Unfiled Returns','Tax Investigation','Other']

const BLANK = { clientName:'', caseType:'OIC', irsBalance:'', status:'Open', assignedTo:'', deadline:'', taxYears:'', resolutionAmount:'', notes:'' }

export default function Cases() {
  const [cases,     setCases]     = useState([])
  const [confirmDel, setConfirmDel] = useState(null)
  const [clients,   setClients]   = useState([])
  const [employees, setEmployees] = useState([])
  const [filter,    setFilter]    = useState('All')
  const [modal,     setModal]     = useState(false)
  const [editCase,  setEditCase]  = useState(null)
  const [form,      setForm]      = useState(BLANK)
  const [sug,       setSug]       = useState([])
  const [saving,    setSaving]    = useState(false)
  const [toast,     setToast]     = useState('')
  const [detail,    setDetail]    = useState(null)
  const [caseNotes, setCaseNotes] = useState([])
  const [newNote, setNewNote]     = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [showAllCaseNotes, setShowAllCaseNotes] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data:cs },{ data:cl },{ data:em }] = await Promise.all([
      supabase.from('cases').select('*').order('created_at',{ascending:false}),
      supabase.from('clients').select('id,name,irsBalance,taxYears,issueType'),
      supabase.from('employees').select('id,name')
    ])
    if (cs) setCases(cs)
    if (cl) setClients(cl)
    if (em) setEmployees(em)
    const badge = document.getElementById('badge-cases')
    if (badge && cs) badge.textContent = cs.filter(c=>c.status==='Open'||c.status==='Pending IRS').length || ''
  }

  async function loadCaseNotes(caseId) {
    const { data } = await supabase.from('case_notes').select('*').eq('case_id', caseId).order('created_at', { ascending: false })
    setCaseNotes(data || [])
  }

  async function addCaseNote() {
    if (!newNote.trim() || !detail) return
    setAddingNote(true)
    await supabase.from('case_notes').insert([{ case_id: detail.id, text: newNote.trim(), created_at: new Date().toISOString() }])
    setAddingNote(false)
    setNewNote('')
    loadCaseNotes(detail.id)
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),4000) }
  function fld(k,v) { setForm(f=>({...f,[k]:v})) }

  function searchClient(val) {
    fld('clientName',val)
    if (val.length<2){setSug([]);return}
    setSug(clients.filter(c=>c.name.toLowerCase().includes(val.toLowerCase())).slice(0,6))
  }
  function pickClient(c) {
    setForm(f=>({...f, clientName:c.name, irsBalance:c.irsBalance||'', taxYears:c.taxYears||'', caseType:c.issueType||f.caseType}))
    setSug([])
  }

  const filtered = filter==='All' ? cases : cases.filter(c=>c.status===filter)
  const reps = employees.length>0 ? employees.map(e=>e.name) : ['Romy Cruz','Dana Richard','Yesenia Gonzalez']

  async function save() {
    if (!form.clientName.trim()) { showToast('Client name is required'); return }
    setSaving(true)
    const caseNum = 'C-' + Date.now().toString().slice(-6)
    const payload = { ...form, caseNum, created_at: new Date().toISOString() }
    const { data, error } = await supabase.from('cases').insert([payload]).select()
    setSaving(false)
    if (error) { showToast('❌ Save error: ' + error.message); return }
    showToast('✅ Case created!')
    setModal(false); setForm(BLANK); load()
  }

  async function saveEdit() {
    setSaving(true)
    const { id, created_at, caseNum, ...rest } = form
    const { error } = await supabase.from('cases').update(rest).eq('id', id)
    setSaving(false)
    if (error) { showToast('❌ Update error: ' + error.message); return }
    showToast('✅ Saved!')
    setEditCase(null)
    const { data } = await supabase.from('cases').select('*').eq('id', id).single()
    if (data) setDetail(data)
    load()
  }

  async function deleteCase(id) {
    if (!confirmDel) { setConfirmDel('pending'); return }
    setConfirmDel(null)
    await supabase.from('cases').delete().eq('id',id)
    showToast('Deleted'); setDetail(null); load()
  }

  function openDetail(c) { setDetail(c); loadCaseNotes(c.id) }
  function openEdit(c) { setForm({...BLANK,...c}); setEditCase(c) }

  // ── Detail view ──────────────────────────────────────────────────────────────
  if (detail) {
    const c = detail
    return (
      <div style={{maxWidth:760,margin:'0 auto'}}>
        {toast&&<div className="toast show">{toast}</div>}
        <div style={{display:'flex',gap:8,marginBottom:16,alignItems:'center'}}>
          <button className="btn" onClick={()=>setDetail(null)}>← Back to Cases</button>
          <button className="btn pri" style={{marginLeft:'auto'}} onClick={()=>openEdit(c)}>✏️ Edit</button>
          <button className="btn del" onClick={()=>deleteCase(c.id)}>🗑 Delete</button>
        </div>

        <div className="card" style={{marginBottom:12}}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
            <div>
              <div style={{fontSize:20,fontWeight:800}}>{c.clientName}</div>
              <div style={{display:'flex',gap:6,marginTop:5,flexWrap:'wrap'}}>
                <span className={`bdg ${STATUS_C[c.status]||'bn'}`}>{c.status}</span>
                <span className="bdg bb">{c.caseType}</span>
                <span className="bdg bn" style={{fontSize:10}}>{c.caseNum}</span>
                {c.assignedTo&&<span className="bdg bn">👤 {c.assignedTo}</span>}
              </div>
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12,marginTop:16,paddingTop:16,borderTop:'1px solid var(--br)'}}>
            {[
              ['IRS Balance',      c.irsBalance?'$'+Number(c.irsBalance).toLocaleString():'—'],
              ['Resolution Amt',   c.resolutionAmount?'$'+Number(c.resolutionAmount).toLocaleString():'—'],
              ['Tax Years',        c.taxYears||'—'],
              ['Deadline',         c.deadline||'—'],
              ['Case #',           c.caseNum||'—'],
              ['Created',          c.created_at?.slice(0,10)||'—'],
            ].map(([label,val])=>(
              <div key={label}>
                <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--t3)',marginBottom:3}}>{label}</div>
                <div style={{fontSize:13,fontWeight:600}}>{val}</div>
              </div>
            ))}
          </div>

          {c.notes&&(
            <div style={{marginTop:12,padding:12,background:'var(--s2)',borderRadius:7,fontSize:13,lineHeight:1.7,whiteSpace:'pre-wrap',color:'var(--t2)'}}>
              {c.notes}
            </div>
          )}
        </div>

        {/* Status changer */}
        <div className="card">
          <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)',marginBottom:10}}>Update Status</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
            {STATUSES.map(s=>(
              <button key={s}
                className={`btn ${c.status===s?'pri':'sec'}`}
                style={{fontSize:11,padding:'4px 10px'}}
                onClick={async()=>{
                  const {error}=await supabase.from('cases').update({status:s}).eq('id',c.id)
                  if(error){showToast('❌ '+error.message);return}
                  const {data}=await supabase.from('cases').select('*').eq('id',c.id).single()
                  if(data)setDetail(data)
                  load()
                }}
              >{s}</button>
            ))}
          </div>
        </div>

        {/* Case Notes */}
        <div className="card" style={{marginTop:12}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <div style={{fontWeight:700,fontSize:13,color:'var(--tx)'}}>📝 Case Notes</div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              {caseNotes.length > 3 && <span onClick={()=>setShowAllCaseNotes(s=>!s)} style={{fontSize:11,color:'var(--blue)',cursor:'pointer',fontWeight:600}}>{showAllCaseNotes?'Show less':'View all '+caseNotes.length}</span>}
              <span style={{fontSize:11,color:'var(--t3)'}}>{caseNotes.length} notes</span>
            </div>
          </div>
          <div style={{display:'flex',gap:6,marginBottom:10}}>
            <input value={newNote} onChange={e=>setNewNote(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addCaseNote()}
              placeholder="Add a case note... (Enter to save)"
              style={{flex:1,padding:'6px 10px',borderRadius:6,border:'1px solid var(--br)',background:'var(--s2)',color:'var(--tx)',fontSize:12}}/>
            <button className="btn pri" onClick={addCaseNote} disabled={addingNote||!newNote.trim()} style={{padding:'5px 12px',fontSize:12}}>
              {addingNote?'…':'Add'}
            </button>
          </div>
          {caseNotes.length===0
            ? <div style={{color:'var(--t3)',fontSize:12,textAlign:'center',padding:'8px 0'}}>No notes yet.</div>
            : (showAllCaseNotes?caseNotes:caseNotes.slice(0,3)).map((n,i)=>(
              <div key={n.id||i} style={{display:'flex',gap:8,padding:'6px 0',borderTop:'1px solid var(--br)',alignItems:'flex-start'}}>
                <span style={{fontSize:14,flexShrink:0}}>📝</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,color:'var(--tx)',lineHeight:1.5}}>{n.text}</div>
                  <div style={{fontSize:10,color:'var(--t3)',marginTop:2}}>{n.created_at?new Date(n.created_at).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):''}</div>
                </div>
                <button onClick={async()=>{await supabase.from('case_notes').delete().eq('id',n.id);loadCaseNotes(detail.id)}}
                  style={{background:'none',border:'none',color:'var(--t3)',cursor:'pointer',fontSize:13,flexShrink:0}}>×</button>
              </div>
            ))
          }
        </div>

        {editCase&&<CaseModal form={form} fld={fld} reps={reps} saving={saving} onSave={saveEdit} onClose={()=>setEditCase(null)} title="Edit Case" clients={clients} sug={sug} searchClient={searchClient} pickClient={pickClient}/>}
      </div>
    )
  }

  // ── List view ────────────────────────────────────────────────────────────────
  return (
    <div>
      {toast&&<div className="toast show">{toast}</div>}
      <div style={{marginBottom:10,display:'flex',flexWrap:'wrap',gap:4}}>
        {['All',...STATUSES].map(s=>(
          <span key={s} className={`chip${filter===s?' on':''}`} onClick={()=>setFilter(s)}>{s}</span>
        ))}
      </div>
      {/* Cases by Rep breakdown */}
      {(() => {
        const reps = {}
        cases.forEach(c => { const r = c.assignedTo || 'Unassigned'; reps[r] = (reps[r]||0)+1 })
        const repList = Object.entries(reps).sort((a,b) => b[1]-a[1])
        if (!repList.length) return null
        return (
          <div className="card" style={{padding:'10px 16px',marginBottom:10}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>Cases by Rep</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {repList.map(([rep,count]) => (
                <div key={rep} style={{display:'flex',alignItems:'center',gap:6,background:'var(--s2)',borderRadius:6,padding:'4px 12px',fontSize:12}}>
                  <span style={{fontWeight:700}}>{rep}</span>
                  <span style={{background:'var(--blue)',color:'#fff',borderRadius:20,padding:'1px 8px',fontSize:11,fontWeight:800}}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      <div className="card">
        <div className="ch">
          <span className="ct">All Cases ({filtered.length})</span>
          <button className="btn pri" onClick={()=>{setForm(BLANK);setModal(true)}}>+ New Case</button>
        </div>
        <div className="ovx">
          <table>
            <thead><tr><th>#</th><th>Client</th><th>Type</th><th>Balance</th><th>Status</th><th>Assigned</th><th>Deadline</th><th></th></tr></thead>
            <tbody>
              {filtered.length===0
                ?<tr><td colSpan={8} style={{textAlign:'center',color:'var(--t3)',padding:20}}>No cases yet</td></tr>
                :filtered.map(c=>(
                  <tr key={c.id} style={{cursor:'pointer'}} onClick={()=>openDetail(c)}>
                    <td style={{color:'var(--t2)',fontSize:11}}>{c.caseNum}</td>
                    <td style={{fontWeight:600}}>{c.clientName}</td>
                    <td><span className="bdg bb">{c.caseType}</span></td>
                    <td>{c.irsBalance?'$'+Number(c.irsBalance).toLocaleString():'—'}</td>
                    <td><span className={`bdg ${STATUS_C[c.status]||'bn'}`}>{c.status}</span></td>
                    <td style={{color:'var(--t2)',fontSize:12}}>{c.assignedTo||'—'}</td>
                    <td style={{color:c.deadline&&new Date(c.deadline)<new Date()?'var(--bad)':'var(--t2)',fontSize:12}}>{c.deadline||'—'}</td>
                    <td onClick={e=>e.stopPropagation()}>
                      <button className="btn del" onClick={()=>deleteCase(c.id)}>Del</button>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
      {modal&&<CaseModal form={form} fld={fld} reps={reps} saving={saving} onSave={save} onClose={()=>setModal(false)} title="New Case" clients={clients} sug={sug} searchClient={searchClient} pickClient={pickClient}/>}
    </div>
  )
}

function CaseModal({form,fld,reps,saving,onSave,onClose,title,sug,searchClient,pickClient}) {
  return (
    <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{width:600,maxHeight:'90vh',overflowY:'auto'}}>
        <div className="mh"><span className="mt">{title}</span><button className="xbtn" onClick={onClose}>&times;</button></div>

        <div className="field" style={{position:'relative'}}>
          <label>Client Name * (search)</label>
          <input value={form.clientName} onChange={e=>searchClient(e.target.value)} placeholder="Type to search clients..." autoComplete="off"/>
          {sug.length>0&&(
            <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--s3)',border:'1px solid var(--b2c)',borderRadius:7,zIndex:500,maxHeight:160,overflowY:'auto'}}>
              {sug.map(c=><div key={c.id} onClick={()=>pickClient(c)} style={{padding:'8px 12px',cursor:'pointer',fontSize:13}}>{c.name}</div>)}
            </div>
          )}
        </div>
        <div className="fg2">
          <div className="field"><label>Case Type</label>
            <select value={form.caseType} onChange={e=>fld('caseType',e.target.value)}>
              {['OIC','Installment Agreement','CNC','Penalty Abatement','Appeals','Payroll Tax','Audit','Liens/Levies','Unfiled Returns','Tax Investigation','Other'].map(o=><option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="field"><label>Status</label>
            <select value={form.status} onChange={e=>fld('status',e.target.value)}>
              {STATUSES.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="fg2">
          <div className="field"><label>IRS Balance ($)</label><input type="number" value={form.irsBalance} onChange={e=>fld('irsBalance',e.target.value)} placeholder="Auto-filled from client"/></div>
          <div className="field"><label>Resolution Amount ($)</label><input type="number" value={form.resolutionAmount} onChange={e=>fld('resolutionAmount',e.target.value)} placeholder="Proposed settlement"/></div>
        </div>
        <div className="fg2">
          <div className="field"><label>Assigned To</label>
            <select value={form.assignedTo} onChange={e=>fld('assignedTo',e.target.value)}>
              <option value="">Unassigned</option>
              {reps.map(r=><option key={r}>{r}</option>)}
            </select>
          </div>
          <div className="field"><label>Tax Years</label><input value={form.taxYears} onChange={e=>fld('taxYears',e.target.value)} placeholder="2020, 2021, 2022"/></div>
        </div>
        <div className="field"><label>IRS Deadline</label><input type="date" value={form.deadline} onChange={e=>fld('deadline',e.target.value)}/></div>
        <div className="field"><label>Case Notes</label><textarea value={form.notes} onChange={e=>fld('notes',e.target.value)} style={{minHeight:80}}/></div>
        <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={onSave} disabled={saving}>
          {saving?'Saving…':title}
        </button>
      </div>

      {confirmDel && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setConfirmDel(null)}>
          <div className="modal" style={{maxWidth:360,textAlign:'center'}}>
            <div style={{fontSize:36,marginBottom:12}}>🗑</div>
            <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>Delete this case?</div>
            <div style={{fontSize:13,color:'var(--t3)',marginBottom:20}}>This cannot be undone.</div>
            <div style={{display:'flex',gap:8}}>
              <button className="btn sec" style={{flex:1,justifyContent:'center'}} onClick={()=>setConfirmDel(null)}>Cancel</button>
              <button className="btn del" style={{flex:1,justifyContent:'center'}} onClick={()=>{ deleteCase(confirmDel); setConfirmDel(null) }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
