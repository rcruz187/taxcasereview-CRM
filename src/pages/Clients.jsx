import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateServiceAgreement, generateAddendum, generateEngagementLetter, generatePOACoverLetter } from '../lib/docUtils'

const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS   = Array.from({length:31},(_,i)=>String(i+1).padStart(2,'0'))
const YDOB   = Array.from({length:80},(_,i)=>2005-i)

const PIPELINE_STAGES = [
  { label:'Investigation', key:'investigation' },
  { label:'Transcripts',   key:'transcripts' },
  { label:'Analysis',      key:'analysis' },
  { label:'Proposal',      key:'proposal' },
  { label:'Negotiation',   key:'negotiation' },
  { label:'Resolution',    key:'resolution' },
  { label:'Closed',        key:'closed' },
]

const BLANK_DEP = { name:'', ssn:'', dob:'', relationship:'Child' }
const BLANK = {
  clientType:'Individual', name:'', phone:'', phone2:'', email:'',
  street:'', city:'', state:'', zip:'', county:'',
  ssn:'', ein:'', dobM:'', dobD:'', dobY:'',
  spouseName:'', spouseSsn:'', filingStatus:'Single',
  irsBalance:'', issueType:'OIC', irsOrState:'IRS Federal', taxYears:'',
  clientSince:'', status:'Active', notes:'', assignedTo:'',
  pipelineStage:'investigation', dependents:[]
}

function Bdg({s,c}) { return <span className={`bdg ${c||'bn'}`}>{s}</span> }
function PhoneLink({val}) {
  const nav = useNavigate()
  if (!val) return <span style={{color:'var(--t3)'}}>—</span>
  return (
    <span
      onClick={() => {
        sessionStorage.setItem('dialerNumber', val.replace(/\D/g,''))
        nav('/dialer')
      }}
      style={{color:'var(--blue)',textDecoration:'none',fontWeight:600,display:'inline-flex',alignItems:'center',gap:5,cursor:'pointer'}}
      onMouseEnter={e=>e.currentTarget.style.textDecoration='underline'}
      onMouseLeave={e=>e.currentTarget.style.textDecoration='none'}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.18 1h3a2 2 0 012 1.72 12.05 12.05 0 00.7 2.81 2 2 0 01-.45 2.11L4.91 8.15a16 16 0 006.29 6.29l1.51-1.52a2 2 0 012.11-.45 12.05 12.05 0 002.81.7A2 2 0 0122 16.92z"/></svg>
      {val}
    </span>
  )
}
function DR({label,val}) {
  const isPhone = label==='Phone'||label==='Phone 2'||label==='Phone2'
  const renderVal = () => {
    if (!val) return <span style={{color:'var(--t3)'}}>—</span>
    if (isPhone) return (
      <PhoneLink val={val}/>
    )
    return val
  }
  return (
    <div style={{display:'flex',borderBottom:'1px solid var(--br)',padding:'7px 0',gap:12}}>
      <div style={{minWidth:130,fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--t3)',paddingTop:1}}>{label}</div>
      <div style={{flex:1,fontSize:13,color:'var(--tx)'}}>{renderVal()}</div>
    </div>
  )
}
function formatBalance(val) {
  if (!val) return '—'
  if (typeof val==='string'&&(val.includes('$')||isNaN(Number(val)))) return val
  const n=Number(val); return isNaN(n)?val:'$'+n.toLocaleString()
}
function parseDependents(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return [] }
}

// ─── Action Button ────────────────────────────────────────────────────────────
function ActionBtn({color, icon, label, sub, onClick}) {
  return (
    <button onClick={onClick} style={{
      background:color, color:'#fff', border:'none', borderRadius:8,
      padding:'10px 12px', cursor:'pointer', display:'flex', flexDirection:'column',
      alignItems:'center', gap:3, fontSize:11, fontWeight:700, textAlign:'center',
      flex:1, minWidth:90
    }}>
      <span style={{fontSize:18}}>{icon}</span>
      <span>{label}</span>
      {sub && <span style={{fontSize:9,opacity:.8,fontWeight:400}}>{sub}</span>}
    </button>
  )
}


// ── Inline Fax Form ─────────────────────────────────────────────────────────
function InlineFaxForm({ client, onClose, showToast }) {
  const [toNum,   setToNum]   = useState((client?.phone||'').replace(/\D/g,''))
  const [subject, setSubject] = useState('')
  const [notes,   setNotes]   = useState('')
  const [file,    setFile]    = useState(null)
  const [sending, setSending] = useState(false)

  async function send() {
    if (!toNum) { showToast('Fax number required','err'); return }
    setSending(true)
    const { data:s } = await supabase.from('settings').select('telnyx_api_key,firm_fax_number').limit(1).maybeSingle()
    let fileUrl = null
    if (file) {
      const path = 'fax/'+Date.now()+'_'+file.name
      await supabase.storage.from('documents').upload(path, file, {upsert:true})
      const { data:u } = supabase.storage.from('documents').getPublicUrl(path)
      fileUrl = u?.publicUrl
    }
    const toFull = '+1'+toNum.slice(-10)
    const fromNum = s?.firm_fax_number || ''
    if (s?.telnyx_api_key) {
      await fetch('https://api.telnyx.com/v2/faxes', {
        method:'POST',
        headers:{'Authorization':'Bearer '+s.telnyx_api_key,'Content-Type':'application/json'},
        body: JSON.stringify({to:toFull,from:fromNum,...(fileUrl?{media_url:fileUrl}:{})})
      }).catch(()=>{})
    }
    await supabase.from('fax_logs').insert([{
      to_number:toFull, from_number:fromNum, client_name:client?.name,
      subject, notes, file_name:file?.name||null, file_url:fileUrl,
      status: s?.telnyx_api_key ? 'Sent' : 'Logged',
      sent_by:'CRM', sent_at:new Date().toISOString(), created_at:new Date().toISOString()
    }])
    setSending(false)
    showToast('📠 Fax '+(s?.telnyx_api_key?'sent':'logged')+'!')
    onClose()
  }

  return (
    <div style={{padding:'0 4px 4px'}}>
      <div className="field"><label>To Fax Number</label>
        <input value={toNum} onChange={e=>setToNum(e.target.value.replace(/\D/g,''))} placeholder="10 digits"/>
      </div>
      <div className="field"><label>Subject</label>
        <input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="e.g. Form 2848"/>
      </div>
      <div className="field"><label>Attach PDF</label>
        <input type="file" accept=".pdf,.tiff,.jpg,.png" onChange={e=>setFile(e.target.files[0])}
          style={{padding:'6px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',width:'100%',fontSize:12}}/>
      </div>
      <div className="field"><label>Notes</label>
        <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Internal notes"/>
      </div>
      <div style={{display:'flex',gap:8}}>
        <button className="btn sec" style={{flex:1,justifyContent:'center'}} onClick={onClose}>Cancel</button>
        <button className="btn pri" style={{flex:1,justifyContent:'center',background:'#dc2626',borderColor:'#dc2626'}} onClick={send} disabled={sending}>
          {sending?'Sending…':'📠 Send Fax'}
        </button>
      </div>
    </div>
  )
}

// ── Inline E-Sign Form ───────────────────────────────────────────────────────
const DOC_TYPES_INLINE = ['Engagement Letter','Form 2848 — Power of Attorney','Form 8821 — Tax Info Auth',
  'Service Agreement','Fee Agreement Addendum','9465 Installment Agreement','OIC Application (656)','Custom Document']

function InlineEsignForm({ client, onClose, showToast }) {
  const [docType,  setDocType]  = useState('Engagement Letter')
  const [message,  setMessage]  = useState('Please review and sign the attached document at your earliest convenience.')
  const [priority, setPriority] = useState('Normal')
  const [saving,   setSaving]   = useState(false)
  const [link,     setLink]     = useState('')

  async function create() {
    setSaving(true)
    const { data, error } = await supabase.from('esigns').insert([{
      doc_type: docType, client_name: client?.name, client_email: client?.email||'',
      message, priority, status:'Awaiting', sent_at: new Date().toISOString(), created_at: new Date().toISOString()
    }]).select().single()
    setSaving(false)
    if (error) { showToast('Error: '+error.message,'err'); return }
    const url = window.location.origin+'/taxcasereview-CRM/#/sign/'+data.id
    setLink(url)
    navigator.clipboard.writeText(url).catch(()=>{})
    showToast('✅ Signing link copied!')
  }

  if (link) return (
    <div style={{padding:'0 4px 4px'}}>
      <div style={{background:'rgba(34,197,94,.08)',border:'1px solid rgba(34,197,94,.3)',borderRadius:8,padding:'12px 14px',marginBottom:14}}>
        <div style={{fontSize:12,fontWeight:700,color:'var(--ok)',marginBottom:6}}>✅ Signing link created & copied!</div>
        <div style={{fontSize:11,color:'var(--t3)',wordBreak:'break-all',marginBottom:8}}>{link}</div>
        <div style={{fontSize:11,color:'var(--t2)'}}>Send this link to <strong>{client?.name}</strong> via email or SMS. When they sign, their IP address and timestamp are automatically recorded and a copy is saved to their documents.</div>
      </div>
      <button className="btn sec" style={{width:'100%',justifyContent:'center'}} onClick={onClose}>Done</button>
    </div>
  )

  return (
    <div style={{padding:'0 4px 4px'}}>
      <div className="field"><label>Document Type</label>
        <select value={docType} onChange={e=>setDocType(e.target.value)}>
          {DOC_TYPES_INLINE.map(t=><option key={t}>{t}</option>)}
        </select>
      </div>
      <div className="field"><label>Message to Client</label>
        <textarea value={message} onChange={e=>setMessage(e.target.value)} rows={3}
          style={{width:'100%',resize:'vertical',padding:'8px 12px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',fontSize:13,fontFamily:'inherit'}}/>
      </div>
      <div className="field"><label>Priority</label>
        <select value={priority} onChange={e=>setPriority(e.target.value)}>
          <option>Normal</option><option>High</option><option>Urgent</option>
        </select>
      </div>
      <div style={{background:'var(--s2)',borderRadius:6,padding:'8px 12px',fontSize:11,color:'var(--t3)',marginBottom:14,lineHeight:1.6}}>
        💡 A unique signing link will be generated. Send to client via email or SMS. Their signature, IP, and timestamp are all recorded automatically.
      </div>
      <div style={{display:'flex',gap:8}}>
        <button className="btn sec" style={{flex:1,justifyContent:'center'}} onClick={onClose}>Cancel</button>
        <button className="btn pri" style={{flex:1,justifyContent:'center',background:'#7c3aed',borderColor:'#7c3aed'}} onClick={create} disabled={saving}>
          {saving?'Creating…':'✍️ Create & Copy Link'}
        </button>
      </div>
    </div>
  )
}

export default function Clients() {
  const navigate = useNavigate()
  const { id: urlId } = useParams()
  const [clients,   setClients]   = useState([])
  const [employees, setEmployees] = useState([])
  const [filter,    setFilter]    = useState('All')
  const [modal,     setModal]     = useState(false)
  const [editModal, setEditModal] = useState(false)
  const [form,      setForm]      = useState(BLANK)
  const [saving,    setSaving]    = useState(false)
  const [toast,     setToast]     = useState('')
  const [detail,    setDetail]    = useState(null)
  // Addendum modal
  const [addModal,    setAddModal]    = useState(false)
  const [addForm,     setAddForm]     = useState({ resolutionFee:'', paymentPlan:'', startDate:'', notes:'' })
  // Related data for detail view
  const [relCases,    setRelCases]    = useState([])
  const [relDocs,     setRelDocs]     = useState([])
  const [uploadingDoc,setUploadingDoc]= useState(false)
  const [docForm,     setDocForm]     = useState({ name:'', docType:'IRS Notice', notes:'' })
  const [relNotes,    setRelNotes]    = useState([])
  const [notesExpanded, setNotesExpanded] = useState(false)
  const [newNote,     setNewNote]     = useState('')
  const [addingNote,  setAddingNote]  = useState(false)
  const [relTasks,    setRelTasks]    = useState([])
  const [relInvoices, setRelInvoices] = useState([])
  const [relPayments, setRelPayments] = useState([])
  const [loadingRel,  setLoadingRel]  = useState(false)
  // Quick add task inline
  const [quickTask,   setQuickTask]   = useState('')
  const [addingTask,  setAddingTask]  = useState(false)
  // Add task modal (from action button)
  const [taskModal,   setTaskModal]   = useState(false)
  const [taskTitle,   setTaskTitle]   = useState('')
  const [taskPriority,setTaskPriority]= useState('Normal')
  const [taskDueDate, setTaskDueDate] = useState('')
  // Add payment modal
  const [payModal,    setPayModal]    = useState(false)
  const [faxModal,    setFaxModal]    = useState(false)
  const [faxClient,   setFaxClient]   = useState(null)
  const [esignModal,  setEsignModal]  = useState(false)
  const [esignClient, setEsignClient] = useState(null)
  const [payForm,     setPayForm]     = useState({ amount:'', method:'Credit Card', date:'', notes:'' })
  const [savingPay,   setSavingPay]   = useState(false)

  useEffect(() => { load() }, [])

  // Auto-open client from URL param (/clients/:id)
  useEffect(() => {
    if (urlId && clients.length > 0 && !detail) {
      const found = clients.find(c => String(c.id) === String(urlId))
      if (found) openDetail(found)
    }
  }, [urlId, clients])

  async function load() {
    const [{ data:cl },{ data:em }] = await Promise.all([
      supabase.from('clients').select('*').order('created_at',{ascending:false}),
      supabase.from('employees').select('id,name')
    ])
    if (cl) setClients(cl)
    if (em) setEmployees(em)
  }

  async function loadRelated(clientName) {
    setLoadingRel(true)
    const [{ data:cases },{ data:tasks },{ data:invoices },{ data:docs },{ data:clientNotes },{ data:payments }] = await Promise.all([
      supabase.from('cases').select('*').eq('clientName', clientName).order('created_at',{ascending:false}),
      supabase.from('tasks').select('*').eq('clientName', clientName).order('created_at',{ascending:false}),
      supabase.from('invoices').select('*').eq('clientName', clientName).order('created_at',{ascending:false}),
      supabase.from('documents').select('*').eq('client', clientName).order('created_at',{ascending:false}),
      supabase.from('client_notes').select('*').eq('clientName', clientName).order('created_at',{ascending:false}),
      supabase.from('payments').select('*').eq('clientName', clientName).order('created_at',{ascending:false}),
    ])
    setRelCases(cases||[])
    setRelTasks(tasks||[])
    setRelInvoices(invoices||[])
    setRelDocs(docs||[])
    setRelNotes(clientNotes||[])
    setRelPayments(payments||[])
    setLoadingRel(false)
  }

  function showToast(msg){setToast(msg);setTimeout(()=>setToast(''),3500)}
  function fld(k,v){setForm(f=>({...f,[k]:v}))}
  const filtered = filter==='All'?clients:clients.filter(c=>c.clientType===filter)

  function buildPayload(f) {
    const {dobM,dobD,dobY,id,created_at,pipelineStage,...rest}=f
    const dob=dobM&&dobD&&dobY?`${dobM}/${dobD}/${dobY}`:f.dob||''
    // pipelineStage excluded from main payload — updated separately
    const safe={...rest,dob,dependents:JSON.stringify(f.dependents||[])}
    return safe
  }

  async function save() {
    if (!form.name.trim()){showToast('Name is required');return}
    setSaving(true)
    const {error}=await supabase.from('clients').insert([{...buildPayload(form),created_at:new Date().toISOString()}])
    setSaving(false)
    if (error){showToast('Error: '+error.message);return}
    showToast('✅ Client added!')
    setModal(false);setForm(BLANK);load()
  }

  async function saveEdit() {
    setSaving(true)
    const {error}=await supabase.from('clients').update(buildPayload(form)).eq('id',form.id)
    setSaving(false)
    if (error){showToast('Error: '+error.message);return}
    showToast('✅ Saved!')
    setEditModal(false)
    const {data}=await supabase.from('clients').select('*').eq('id',form.id).single()
    if (data){setDetail(data);loadRelated(data.name)}
    load()
  }

  async function deleteClient(id,name) {
    if (!confirmDel) { setConfirmDel(id); return }
    setConfirmDel(null)
    await supabase.from('clients').delete().eq('id',id)
    showToast('Deleted');setDetail(null);load()
  }

  async function toggleTask(task) {
    const {error}=await supabase.from('tasks').update({done:!task.done}).eq('id',task.id)
    if (!error && detail) loadRelated(detail.name)
  }

  async function addQuickTask() {
    if (!quickTask.trim()||!detail) return
    setAddingTask(true)
    const {error}=await supabase.from('tasks').insert([{
      title:quickTask.trim(), clientName:detail.name, priority:'Normal',
      done:false, created_at:new Date().toISOString()
    }])
    setAddingTask(false)
    if (error){showToast('Task error: '+error.message);return}
    setQuickTask('')
    loadRelated(detail.name)
    showToast('✅ Task added!')
  }

  async function addClientNote() {
    if (!newNote.trim()||!detail) return
    setAddingNote(true)
    const {error}=await supabase.from('client_notes').insert([{
      clientName:detail.name, text:newNote.trim(),
      author:'Rep', type:'Note',
      created_at:new Date().toISOString()
    }])
    setAddingNote(false)
    if(error){showToast('Error: '+error.message);return}
    setNewNote('');loadRelated(detail.name)
    showToast('✅ Note added!')
  }

  async function addTaskFromModal() {
    if (!taskTitle.trim()||!detail) return
    setAddingTask(true)
    const {error}=await supabase.from('tasks').insert([{
      title:taskTitle.trim(), clientName:detail.name,
      priority:taskPriority, dueDate:taskDueDate||null,
      done:false, created_at:new Date().toISOString()
    }])
    setAddingTask(false)
    if(error){showToast('Task error: '+error.message);return}
    setTaskTitle('');setTaskPriority('Normal');setTaskDueDate('')
    setTaskModal(false)
    loadRelated(detail.name)
    showToast('✅ Task added!')
  }

  async function addPaymentForClient() {
    if (!payForm.amount||!detail) return
    setSavingPay(true)
    const {error}=await supabase.from('payments').insert([{
      clientName:detail.name, amount:payForm.amount,
      method:payForm.method, date:payForm.date||new Date().toISOString().slice(0,10),
      notes:payForm.notes, status:'Cleared',
      created_at:new Date().toISOString()
    }])
    setSavingPay(false)
    if(error){showToast('Payment error: '+error.message);return}
    setPayForm({amount:'',method:'Credit Card',date:'',notes:''})
    setPayModal(false)
    showToast('✅ Payment recorded!')
  }

  function openEdit(c) {
    const deps=parseDependents(c.dependents)
    let dobM='',dobD='',dobY=''
    if (c.dob){const p=c.dob.split('/');if(p.length===3){dobM=p[0];dobD=p[1];dobY=p[2]}}
    setForm({...BLANK,...c,dobM,dobD,dobY,dependents:deps})
    setEditModal(true)
  }

  function openDetail(c) {
    setDetail(c)
    setRelCases([]);setRelTasks([]);setRelInvoices([])
    loadRelated(c.name)
    navigate(`/clients/${c.id}`, { replace: true })
  }

  const reps=employees.length>0?employees.map(e=>e.name):['Romy Cruz','Dana Richard','Yesenia Gonzalez']
  const stageIdx=c=>PIPELINE_STAGES.findIndex(s=>s.key===(c.pipelineStage||'investigation'))

  // ── Detail View ──────────────────────────────────────────────────────────────
  if (detail) {
    const c=detail
    const deps=parseDependents(c.dependents)
    const si=stageIdx(c)

    return (
      <div style={{maxWidth:960,margin:'0 auto'}}>
        {toast&&<div className="toast show">{toast}</div>}

        {/* Back + top actions */}
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,flexWrap:'wrap'}}>
          <button className="btn" style={{padding:'8px 16px',fontSize:13,fontWeight:600}} onClick={()=>{setDetail(null);navigate('/clients',{replace:true})}}>← Back to Clients</button>
          <button className="btn pri" style={{marginLeft:'auto',padding:'8px 18px',fontSize:13,fontWeight:700}} onClick={()=>openEdit(c)}>✏️ Edit</button>
          <button className="btn del" style={{padding:'8px 18px',fontSize:13,fontWeight:700}} onClick={()=>deleteClient(c.id,c.name)}>🗑 Delete</button>
        </div>

        {/* Header card */}
        <div className="card" style={{marginBottom:12}}>
          <div style={{display:'flex',alignItems:'center',gap:16,padding:'4px 0 8px',flexWrap:'wrap'}}>
            <div style={{width:56,height:56,borderRadius:'50%',background:'var(--blue)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:22,color:'#fff',flexShrink:0}}>
              {(c.name||'?')[0].toUpperCase()}
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:22,fontWeight:800}}>{c.name}</div>
              <div style={{display:'flex',gap:6,marginTop:5,flexWrap:'wrap'}}>
                <Bdg s={c.clientType||'Individual'} c="bb"/>
                <Bdg s={c.status||'Active'} c={c.status==='Active'?'bg':'bn'}/>
                {c.irsOrState&&<Bdg s={c.irsOrState} c="ba"/>}
                {c.issueType&&<Bdg s={c.issueType} c="bb"/>}
                {c.assignedTo&&<Bdg s={'👤 '+c.assignedTo} c="bn"/>}
              </div>
            </div>
            {c.internal_note && (
              <div style={{maxWidth:280,background:'rgba(245,158,11,.12)',border:'1.5px solid #f59e0b',borderRadius:8,padding:'8px 12px',fontSize:11,lineHeight:1.5}}>
                <div style={{fontWeight:700,color:'#f59e0b',marginBottom:3,display:'flex',alignItems:'center',gap:4}}>📌 Staff Note</div>
                <div style={{color:'var(--tx)'}}>{c.internal_note}</div>
              </div>
            )}
          </div>

          {/* Pipeline */}
          <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid var(--br)'}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>Case Pipeline</div>
            <div style={{display:'flex',alignItems:'center',gap:0,overflowX:'auto',paddingBottom:4}}>
              {PIPELINE_STAGES.map((s,i)=>(
                <div key={s.key} style={{display:'flex',alignItems:'center'}}>
                  <div
                    onClick={async()=>{
                      // Try to update pipelineStage (run SQL: alter table clients add column if not exists "pipelineStage" text default 'investigation')
                      const {error}=await supabase.from('clients').update({pipelineStage:s.key}).eq('id',c.id)
                      if(error){
                        // Column missing - update local state only
                        setClients(prev=>prev.map(cl=>cl.id===c.id?{...cl,pipelineStage:s.key}:cl))
                        if(detail?.id===c.id) setDetail({...c,pipelineStage:s.key})
                        return
                      }
                      const {data}=await supabase.from('clients').select('*').eq('id',c.id).single()
                      if(data)setDetail(data)
                    }}
                    style={{
                      padding:'5px 10px',borderRadius:20,fontSize:11,fontWeight:600,cursor:'pointer',
                      whiteSpace:'nowrap',
                      background:i<=si?'var(--blue)':'var(--s3)',
                      color:i<=si?'#fff':'var(--t3)',
                      border:i===si?'2px solid var(--blue)':'2px solid transparent',
                      transform:i===si?'scale(1.05)':'scale(1)',
                      transition:'all .15s'
                    }}>{s.label}</div>
                  {i<PIPELINE_STAGES.length-1&&<div style={{width:16,height:2,background:i<si?'var(--blue)':'var(--br)',flexShrink:0}}/>}
                </div>
              ))}
            </div>
          </div>

          {/* Balance summary */}
          {(() => {
            const totalPaid = relPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
            const rawBal = c.irsBalance
            const irsNum = rawBal && !isNaN(Number(rawBal)) ? Number(rawBal) : null
            const remaining = irsNum !== null ? irsNum - totalPaid : null
            if (!irsNum && totalPaid === 0) return null
            return (
              <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid var(--br)',display:'flex',gap:20,flexWrap:'wrap'}}>
                {irsNum !== null && (
                  <div style={{display:'flex',flexDirection:'column',gap:2}}>
                    <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)'}}>IRS Balance</div>
                    <div style={{fontSize:16,fontWeight:800,color:'var(--bad)'}}>${irsNum.toLocaleString()}</div>
                  </div>
                )}
                {totalPaid > 0 && (
                  <div style={{display:'flex',flexDirection:'column',gap:2}}>
                    <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)'}}>Paid to Firm</div>
                    <div style={{fontSize:16,fontWeight:800,color:'var(--ok)'}}>${totalPaid.toLocaleString()}</div>
                  </div>
                )}
                {remaining !== null && (
                  <div style={{display:'flex',flexDirection:'column',gap:2}}>
                    <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)'}}>Remaining Balance</div>
                    <div style={{fontSize:16,fontWeight:800,color:remaining<=0?'var(--ok)':'var(--tx)'}}>${Math.max(0,remaining).toLocaleString()}</div>
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {/* Action Buttons */}
        <div className="card" style={{marginBottom:12}}>
          <div style={{fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Quick Actions</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <ActionBtn color="#22863a" icon="📄" label="Service Agreement" sub="Print/Sign" onClick={()=>generateServiceAgreement(c)}/>
            <ActionBtn color="#1A7FD4" icon="✉️" label="Engagement Letter" sub="Print" onClick={()=>generateEngagementLetter(c)}/>
            <ActionBtn color="#d97706" icon="📋" label="Addendum" sub="Add Services" onClick={()=>{setAddForm({resolutionFee:'',paymentPlan:'',startDate:'',notes:''});setAddModal(true)}}/>
            <ActionBtn color="#6c5ce7" icon="🔐" label="POA Cover Letter" sub="Form 2848" onClick={()=>generatePOACoverLetter(c)}/>
            <ActionBtn color="#0891b2" icon="📁" label="New Case" sub="Open Case" onClick={()=>navigate('/cases')}/>
            <ActionBtn color="#7c3aed" icon="✅" label="Add Task" sub="Assign Work" onClick={()=>{setTaskTitle('');setTaskPriority('Normal');setTaskDueDate('');setTaskModal(true)}}/>
            <ActionBtn color="#be185d" icon="🧾" label="New Invoice" sub="Bill Client" onClick={()=>navigate('/invoices')}/>
            <ActionBtn color="#059669" icon="💳" label="Add Payment" sub="Record Payment" onClick={()=>{setPayForm({amount:'',method:'Credit Card',date:'',notes:''});setPayModal(true)}}/>
            <ActionBtn color="#0f766e" icon="📊" label="P&amp;L" sub="Books &amp; Ledger" onClick={()=>navigate('/books?client='+encodeURIComponent(c.name))}/>
            <ActionBtn color="#dc2626" icon="📠" label="Send Fax" sub="Telnyx Fax" onClick={()=>{setFaxClient(c);setFaxModal(true)}}/>
            <ActionBtn color="#7c3aed" icon="✍️" label="E-Signature" sub="Request Sign" onClick={()=>{setEsignClient(c);setEsignModal(true)}}/>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,alignItems:'start'}}>
          {/* LEFT COLUMN */}
          <div style={{display:'flex',flexDirection:'column',gap:12}}>

            {/* Contact Info */}
            <div className="card">
              <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)',marginBottom:10}}>Contact Info</div>
              <DR label="Phone"   val={c.phone}/>
              <DR label="Phone 2" val={c.phone2}/>
              <DR label="Email"   val={c.email}/>
              <DR label="Address" val={[c.street,c.city,c.state,c.zip].filter(Boolean).join(', ')}/>
              <DR label="County"  val={c.county}/>
            </div>

            {/* Taxpayer Info */}
            <div className="card">
              <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)',marginBottom:10}}>🔒 Taxpayer Info</div>
              <DR label="SSN"           val={c.ssn?'***-**-'+c.ssn.replace(/-/g,'').slice(-4):null}/>
              <DR label="EIN"           val={c.ein}/>
              <DR label="Date of Birth" val={c.dob}/>
              <DR label="Filing Status" val={c.filingStatus}/>
              <DR label="Spouse Name"   val={c.spouseName}/>
              <DR label="Spouse SSN"    val={c.spouseSsn?'***-**-'+c.spouseSsn.replace(/-/g,'').slice(-4):null}/>
            </div>

            {/* Dependents */}
            {deps.length>0&&(
              <div className="card">
                <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)',marginBottom:10}}>👨‍👩‍👧 Dependents ({deps.length})</div>
                {deps.map((d,i)=>(
                  <div key={i} style={{borderBottom:'1px solid var(--br)',padding:'8px 0',display:'flex',gap:10}}>
                    <div style={{width:26,height:26,borderRadius:'50%',background:'var(--s3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'var(--t2)',flexShrink:0}}>{i+1}</div>
                    <div>
                      <div style={{fontWeight:600,fontSize:13}}>{d.name||'Unnamed'}</div>
                      <div style={{fontSize:11,color:'var(--t3)',marginTop:2,display:'flex',gap:10,flexWrap:'wrap'}}>
                        <span>{d.relationship||'—'}</span>
                        {d.dob&&<span>DOB: {d.dob}</span>}
                        {d.ssn&&<span>SSN: ***-**-{d.ssn.replace(/-/g,'').slice(-4)}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Payments */}
            <div className="card">
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)'}}>💳 Payments ({relPayments.length})</div>
                <button className="btn pri" style={{fontSize:11,padding:'3px 10px'}} onClick={()=>{setPayForm({amount:'',method:'Credit Card',date:'',notes:''});setPayModal(true)}}>+ Add</button>
              </div>
              {loadingRel&&<div style={{color:'var(--t3)',fontSize:12}}>Loading…</div>}
              {!loadingRel&&relPayments.length===0&&(
                <div style={{color:'var(--t3)',fontSize:12,marginBottom:6}}>No payments recorded yet.</div>
              )}
              {relPayments.map(p=>(
                <div key={p.id} style={{borderBottom:'1px solid var(--br)',padding:'8px 0',display:'flex',alignItems:'center',gap:10}}>
                  <div style={{width:32,height:32,borderRadius:'50%',background:'var(--ok)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,flexShrink:0}}>💳</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:14,color:'var(--ok)'}}>+${Number(p.amount||0).toLocaleString()}</div>
                    <div style={{fontSize:11,color:'var(--t3)',marginTop:1,display:'flex',gap:8,flexWrap:'wrap'}}>
                      <span>{p.method||'—'}</span>
                      {p.date&&<span>{p.date}</span>}
                      {p.notes&&<span style={{color:'var(--t2)'}}>{p.notes}</span>}
                    </div>
                  </div>
                  <span className="bdg bg" style={{fontSize:10}}>{p.status||'Cleared'}</span>
                </div>
              ))}
              {relPayments.length > 0 && (
                <div style={{paddingTop:10,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:12,color:'var(--t3)'}}>Total received</span>
                  <span style={{fontWeight:800,fontSize:15,color:'var(--ok)'}}>
                    ${relPayments.reduce((s,p)=>s+(Number(p.amount)||0),0).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="card">
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)'}}>📝 Notes ({relNotes.length})</div>
                {relNotes.length>3&&<button className="btn sec" style={{fontSize:11,padding:'2px 8px'}} onClick={()=>setNotesExpanded(v=>!v)}>{notesExpanded?'Show Less':'See All'}</button>}
              </div>
              {/* Add note input */}
              <div style={{display:'flex',gap:6,marginBottom:10}}>
                <textarea
                  value={newNote}
                  onChange={e=>setNewNote(e.target.value)}
                  placeholder="Add a note... (emails, calls, updates)"
                  style={{flex:1,padding:'7px 10px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',fontSize:12,lineHeight:1.5,resize:'vertical',minHeight:80,fontFamily:'inherit'}}
                  rows={4}
                  onKeyDown={e=>{if(e.key==='Enter'&&e.ctrlKey)addClientNote()}}
                />
                <button className="btn pri" style={{fontSize:11,padding:'6px 10px',alignSelf:'flex-end'}} onClick={async()=>{
                  if(!newNote.trim()||!detail)return
                  setAddingNote(true)
                  const {error}=await supabase.from('client_notes').insert([{
                    clientName:detail.name, text:newNote.trim(),
                    author: 'Rep', type:'Note',
                    created_at:new Date().toISOString()
                  }])
                  setAddingNote(false)
                  if(error){showToast('Error: '+error.message);return}
                  setNewNote('');loadRelated(detail.name)
                }} disabled={addingNote}>{addingNote?'…':'+'}</button>
              </div>
              {/* Notes list */}
              {relNotes.length===0&&<div style={{color:'var(--t3)',fontSize:12}}>No notes yet. Add one above.</div>}
              {(notesExpanded?relNotes:relNotes.slice(0,3)).map((n,i)=>(
                <div key={n.id||i} style={{borderTop:'1px solid var(--br)',padding:'8px 0',display:'flex',gap:8,alignItems:'flex-start'}}>
                  <div style={{width:28,height:28,borderRadius:'50%',background:n.type==='Email'?'var(--blue)':'var(--s3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,flexShrink:0,color:n.type==='Email'?'#fff':'var(--t2)'}}>
                    {n.type==='Email'?'✉️':'📝'}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,lineHeight:1.6,whiteSpace:'pre-wrap',color:'var(--tx)'}}>{n.text}</div>
                    <div style={{fontSize:10,color:'var(--t3)',marginTop:3,display:'flex',gap:8}}>
                      {n.author&&<span>{n.author}</span>}
                      {n.type&&n.type!=='Note'&&<span className="bdg bn" style={{fontSize:9}}>{n.type}</span>}
                      <span>{n.created_at?new Date(n.created_at).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):''}</span>
                    </div>
                  </div>
                  <button onClick={async()=>{await supabase.from('client_notes').delete().eq('id',n.id);loadRelated(detail.name)}} style={{background:'none',border:'none',color:'var(--t3)',cursor:'pointer',fontSize:14,lineHeight:1,flexShrink:0}}>×</button>
                </div>
              ))}
              {!notesExpanded&&relNotes.length>3&&(
                <div style={{textAlign:'center',paddingTop:8,fontSize:12,color:'var(--t3)',cursor:'pointer'}} onClick={()=>setNotesExpanded(true)}>
                  + {relNotes.length-3} more notes — click See All
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div style={{display:'flex',flexDirection:'column',gap:12}}>

            {/* IRS / Case Info */}
            <div className="card">
              <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)',marginBottom:10}}>IRS / Case Info</div>
              <DR label="IRS Balance"  val={formatBalance(c.irsBalance)}/>
              <DR label="Issue Type"   val={c.issueType}/>
              <DR label="IRS or State" val={c.irsOrState}/>
              <DR label="Tax Years"    val={c.taxYears}/>
              <DR label="Assigned Rep" val={c.assignedTo}/>
              <DR label="Client Since" val={c.clientSince}/>
            </div>

            {/* Cases */}
            <div className="card">
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)'}}>📁 Cases ({relCases.length})</div>
              </div>
              {loadingRel&&<div style={{color:'var(--t3)',fontSize:12}}>Loading…</div>}
              {!loadingRel&&relCases.length===0&&(
                <div style={{color:'var(--t3)',fontSize:12}}>No cases linked to this client.</div>
              )}
              {relCases.map(cas=>(
                <div key={cas.id} style={{borderBottom:'1px solid var(--br)',padding:'8px 0'}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                    <div>
                      <div style={{fontWeight:600,fontSize:13}}>{cas.caseType||'Case'}</div>
                      <div style={{fontSize:11,color:'var(--t3)',marginTop:2}}>
                        {cas.irsBalance&&<span>Balance: {formatBalance(cas.irsBalance)} · </span>}
                        {cas.assignedTo&&<span>Rep: {cas.assignedTo}</span>}
                      </div>
                    </div>
                    <span className={`bdg ${cas.status==='Open'?'bb':cas.status==='Closed'?'bg':'bn'}`}>{cas.status||'Open'}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Invoices */}
            <div className="card">
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)'}}>🧾 Invoices ({relInvoices.length})</div>
              </div>
              {loadingRel&&<div style={{color:'var(--t3)',fontSize:12}}>Loading…</div>}
              {!loadingRel&&relInvoices.length===0&&(
                <div style={{color:'var(--t3)',fontSize:12}}>No invoices for this client.</div>
              )}
              {relInvoices.map(inv=>(
                <div key={inv.id} style={{borderBottom:'1px solid var(--br)',padding:'8px 0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div>
                    <div style={{fontWeight:600,fontSize:13}}>{inv.caseNum?`#${inv.caseNum} · `:''}{inv.lineItems||'Invoice'}</div>
                    <div style={{fontSize:11,color:'var(--t3)',marginTop:2}}>
                      {inv.dueDate&&<span>Due: {inv.dueDate}</span>}
                    </div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontWeight:700,fontSize:13}}>{inv.total?'$'+Number(inv.total).toLocaleString():'—'}</div>
                    <span className={`bdg ${inv.status==='Paid'?'bg':inv.status==='Overdue'?'br':'bn'}`}>{inv.status||'Unpaid'}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Tasks */}
            <div className="card">
              <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)',marginBottom:10}}>
                ✅ Tasks ({relTasks.length})
              </div>
              {loadingRel&&<div style={{color:'var(--t3)',fontSize:12}}>Loading…</div>}
              {!loadingRel&&relTasks.length===0&&(
                <div style={{color:'var(--t3)',fontSize:12,marginBottom:10}}>No tasks yet for this client.</div>
              )}
              {relTasks.map(t=>(
                <div key={t.id} style={{display:'flex',gap:10,alignItems:'flex-start',padding:'6px 0',borderBottom:'1px solid var(--br)'}}>
                  <div
                    onClick={()=>toggleTask(t)}
                    style={{width:18,height:18,borderRadius:4,border:'1.5px solid var(--b2c)',background:t.done?'var(--ok)':'var(--s2)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0,marginTop:1,color:'#fff',fontSize:11}}
                  >{t.done?'✓':''}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:t.done?400:600,textDecoration:t.done?'line-through':'none',color:t.done?'var(--t3)':'var(--tx)'}}>{t.title}</div>
                    <div style={{fontSize:10,color:'var(--t3)',marginTop:2,display:'flex',gap:8}}>
                      {t.priority&&<span className={`bdg ${t.priority==='High'?'br':t.priority==='Low'?'bn':'ba'}`} style={{fontSize:9}}>{t.priority}</span>}
                      {t.dueDate&&<span>Due: {t.dueDate}</span>}
                      {t.assignedTo&&<span>→ {t.assignedTo}</span>}
                    </div>
                  </div>
                </div>
              ))}
              {/* Quick add task */}
              <div style={{display:'flex',gap:6,marginTop:10}}>
                <input
                  value={quickTask}
                  onChange={e=>setQuickTask(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&addQuickTask()}
                  placeholder="Add a task…"
                  style={{flex:1,padding:'6px 10px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',fontSize:12}}
                />
                <button className="btn pri" style={{fontSize:11,padding:'5px 10px'}} onClick={addQuickTask} disabled={addingTask}>
                  {addingTask?'…':'+'}
                </button>
              </div>
            </div>

            {/* Documents */}
            <div className="card">
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)'}}>📁 Documents ({relDocs.length})</div>
                <button className="btn pri" style={{fontSize:11,padding:'3px 10px'}} onClick={()=>setUploadingDoc(v=>!v)}>+ Add Doc</button>
              </div>
              {uploadingDoc&&(
                <div style={{background:'var(--s3)',borderRadius:6,padding:10,marginBottom:10}}>
                  <div className="fg2">
                    <div className="field"><label>Document Name *</label>
                      <input value={docForm.name} onChange={e=>setDocForm(f=>({...f,name:e.target.value}))} placeholder="e.g. 2022 W2"/>
                    </div>
                    <div className="field"><label>Type</label>
                      <select value={docForm.docType} onChange={e=>setDocForm(f=>({...f,docType:e.target.value}))}>
                        {['IRS Notice','IRS Form','Transcript','Agreement','W2 / 1099','Tax Return','Financial Statement','Bank Statement','Correspondence','Engagement Letter','Other'].map(t=><option key={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="field"><label>Notes</label>
                    <input value={docForm.notes} onChange={e=>setDocForm(f=>({...f,notes:e.target.value}))} placeholder="Brief description"/>
                  </div>
                  <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:8}} onClick={async()=>{
                    if(!docForm.name.trim()){showToast('Name required');return}
                    const {error}=await supabase.from('documents').insert([{...docForm,client:c.name,created_at:new Date().toISOString()}])
                    if(error){showToast('Error: '+error.message);return}
                    showToast('✅ Document added!')
                    setDocForm({name:'',docType:'IRS Notice',notes:''})
                    setUploadingDoc(false)
                    loadRelated(c.name)
                  }}>Save Document</button>
                </div>
              )}
              {loadingRel&&<div style={{color:'var(--t3)',fontSize:12}}>Loading…</div>}
              {!loadingRel&&relDocs.length===0&&!uploadingDoc&&(
                <div style={{color:'var(--t3)',fontSize:12}}>No documents stored for this client.</div>
              )}
              {relDocs.map(d=>(
                <div key={d.id} style={{borderBottom:'1px solid var(--br)',padding:'7px 0',display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontSize:18}}>📄</span>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:13}}>{d.name}</div>
                    <div style={{fontSize:11,color:'var(--t3)',marginTop:2,display:'flex',gap:10}}>
                      <span className="bdg bn" style={{fontSize:9}}>{d.docType}</span>
                      {d.notes&&<span>{d.notes}</span>}
                      <span>{d.created_at?.slice(0,10)}</span>
                    </div>
                  </div>
                  <button className="btn del" style={{fontSize:10,padding:'2px 7px'}} onClick={async()=>{
                    await supabase.from('documents').delete().eq('id',d.id)
                    loadRelated(c.name)
                  }}>Del</button>
                </div>
              ))}
            </div>

            {/* Notes */}
            {c.notes&&(
              <div className="card">
                <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)',marginBottom:8}}>Notes</div>
                <div style={{fontSize:13,color:'var(--t2)',lineHeight:1.7,whiteSpace:'pre-wrap'}}>{c.notes}</div>
              </div>
            )}
          </div>
        </div>

        {editModal&&<ClientFormModal form={form} fld={fld} reps={reps} saving={saving} onSave={saveEdit} onClose={()=>setEditModal(false)} title="Edit Client"/>}

        {/* ── Add Task Modal ── */}
        {taskModal&&(
          <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setTaskModal(false)}>
            <div className="modal" style={{width:440}}>
              <div className="mh">
                <span className="mt">✅ Add Task — {detail?.name}</span>
                <button className="xbtn" onClick={()=>setTaskModal(false)}>&times;</button>
              </div>
              <div className="field"><label>Task Title *</label>
                <input value={taskTitle} onChange={e=>setTaskTitle(e.target.value)}
                  placeholder="e.g. Request transcripts, Follow up on offer..."
                  onKeyDown={e=>e.key==='Enter'&&addTaskFromModal()}
                  autoFocus/>
              </div>
              <div className="fg2">
                <div className="field"><label>Priority</label>
                  <select value={taskPriority} onChange={e=>setTaskPriority(e.target.value)}>
                    <option>Low</option><option>Normal</option><option>High</option><option>Urgent</option>
                  </select>
                </div>
                <div className="field"><label>Due Date</label>
                  <input type="date" value={taskDueDate} onChange={e=>setTaskDueDate(e.target.value)}/>
                </div>
              </div>
              <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={addTaskFromModal} disabled={addingTask}>
                {addingTask?'Adding…':'✅ Add Task'}
              </button>
            </div>
          </div>
        )}

        {/* ── Add Payment Modal ── */}
        {payModal&&(
          <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setPayModal(false)}>
            <div className="modal" style={{width:440}}>
              <div className="mh">
                <span className="mt">💳 Record Payment — {detail?.name}</span>
                <button className="xbtn" onClick={()=>setPayModal(false)}>&times;</button>
              </div>
              <div className="field">
                <label>Amount *</label>
                <div style={{position:'relative'}}>
                  <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--t3)'}}>$</span>
                  <input type="number" value={payForm.amount} onChange={e=>setPayForm(f=>({...f,amount:e.target.value}))} style={{paddingLeft:22}} placeholder="0.00" autoFocus/>
                </div>
              </div>
              <div className="fg2">
                <div className="field"><label>Method</label>
                  <select value={payForm.method} onChange={e=>setPayForm(f=>({...f,method:e.target.value}))}>
                    {['Credit Card','ACH / Bank Transfer','Check','Cash','Zelle','Venmo','Wire Transfer','Other'].map(m=><option key={m}>{m}</option>)}
                  </select>
                </div>
                <div className="field"><label>Date</label>
                  <input type="date" value={payForm.date} onChange={e=>setPayForm(f=>({...f,date:e.target.value}))}/>
                </div>
              </div>
              <div className="field"><label>Notes (optional)</label>
                <input value={payForm.notes||''} onChange={e=>setPayForm(f=>({...f,notes:e.target.value}))} placeholder="e.g. Partial payment, invoice INV-XXXXX"/>
              </div>
              <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={addPaymentForClient} disabled={savingPay}>
                {savingPay?'Saving…':'💳 Record Payment'}
              </button>
            </div>
          </div>
        )}

        {addModal&&(
          <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setAddModal(false)}>
            <div className="modal" style={{width:560}}>
              <div className="mh">
                <span className="mt">📋 Generate Addendum — {c.name}</span>
                <button className="xbtn" onClick={()=>setAddModal(false)}>&times;</button>
              </div>
              <div style={{fontSize:12,color:'var(--t3)',marginBottom:14}}>
                Fill in the resolution fee and scope details before generating. These will print directly on the document for the client to sign.
              </div>
              <div className="fg2">
                <div className="field"><label>Resolution Service Fee ($) *</label>
                  <input type="number" value={addForm.resolutionFee} onChange={e=>setAddForm(f=>({...f,resolutionFee:e.target.value}))} placeholder="e.g. 3500"/>
                </div>
                <div className="field"><label>Monthly Payment Plan ($)</label>
                  <input type="number" value={addForm.paymentPlan} onChange={e=>setAddForm(f=>({...f,paymentPlan:e.target.value}))} placeholder="e.g. 350"/>
                </div>
              </div>
              <div className="field"><label>Payments Start Date</label>
                <input type="date" value={addForm.startDate} onChange={e=>setAddForm(f=>({...f,startDate:e.target.value}))}/>
              </div>
              <div className="field"><label>Additional Scope / Work Notes</label>
                <textarea value={addForm.notes} onChange={e=>setAddForm(f=>({...f,notes:e.target.value}))} style={{minHeight:80}} placeholder="e.g. Includes filing 3 years of unfiled returns, OIC preparation, lien subordination..."/>
              </div>
              <div style={{background:'var(--s3)',borderRadius:6,padding:10,fontSize:11,color:'var(--t3)',marginBottom:12}}>
                The standard resolution services (IRS representation, POA, negotiation, case management) are always included. Use the notes field to add anything specific to this client's case.
              </div>
              <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:11}} onClick={()=>{
                if(!addForm.resolutionFee){showToast('Enter the resolution fee first');return}
                generateAddendum(c, addForm)
                setAddModal(false)
              }}>
                🖨️ Generate &amp; Print Addendum
              </button>
            </div>
          </div>
        )}

      {faxModal && faxClient && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setFaxModal(false)}>
          <div className="modal" style={{width:500}}>
            <div className="mh"><span className="mt">📠 Send Fax — {faxClient.name}</span><button className="xbtn" onClick={()=>setFaxModal(false)}>&times;</button></div>
            <InlineFaxForm client={faxClient} onClose={()=>setFaxModal(false)} showToast={showToast}/>
          </div>
        </div>
      )}

      {esignModal && esignClient && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setEsignModal(false)}>
          <div className="modal" style={{width:500}}>
            <div className="mh"><span className="mt">✍️ E-Signature — {esignClient.name}</span><button className="xbtn" onClick={()=>setEsignModal(false)}>&times;</button></div>
            <InlineEsignForm client={esignClient} onClose={()=>setEsignModal(false)} showToast={showToast}/>
          </div>
        </div>
      )}
      </div>
    )
  }

  // ── List View ────────────────────────────────────────────────────────────────
  return (
    <div>
      {toast&&<div className="toast show">{toast}</div>}
      <div className="card">
        <div className="ch">
          <span className="ct">Client Roster ({filtered.length})</span>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
            {['All','Individual','Business'].map(f=>(
              <span key={f} className={`chip${filter===f?' on':''}`} onClick={()=>setFilter(f)}>{f}</span>
            ))}
            <button className="btn pri" onClick={()=>{setForm(BLANK);setModal(true)}}>+ Add Client</button>
          </div>
        </div>
        <div className="ovx">
          <table>
            <thead>
              <tr><th>Name</th><th>Type</th><th>Phone</th><th>Email</th><th>IRS Balance</th><th>Issue</th><th>Assigned</th><th>Status</th><th>Since</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.length===0?(
                <tr><td colSpan={10} style={{textAlign:'center',color:'var(--t3)',padding:20}}>No clients yet</td></tr>
              ):filtered.map(c=>(
                <tr key={c.id} style={{cursor:'pointer'}} onClick={()=>openDetail(c)}>
                  <td style={{fontWeight:600}}>{c.name}</td>
                  <td><span className="bdg bb">{c.clientType||'Individual'}</span></td>
                  <td><PhoneLink val={c.phone}/></td>
                  <td style={{color:'var(--t2)',fontSize:12}}>{c.email||'—'}</td>
                  <td>{formatBalance(c.irsBalance)}</td>
                  <td>{c.issueType||'—'}</td>
                  <td style={{color:'var(--t2)',fontSize:12}}>{c.assignedTo||'—'}</td>
                  <td><span className={`bdg ${c.status==='Active'?'bg':'bn'}`}>{c.status||'Active'}</span></td>
                  <td style={{color:'var(--t2)',fontSize:12}}>{c.clientSince||'—'}</td>
                  <td onClick={e=>e.stopPropagation()}>
                    <button className="btn del" onClick={()=>deleteClient(c.id,c.name)}>Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {modal&&<ClientFormModal form={form} fld={fld} reps={reps} saving={saving} onSave={save} onClose={()=>setModal(false)} title="Add Client"/>}

      {faxModal && faxClient && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setFaxModal(false)}>
          <div className="modal" style={{width:500}}>
            <div className="mh"><span className="mt">📠 Send Fax — {faxClient.name}</span><button className="xbtn" onClick={()=>setFaxModal(false)}>&times;</button></div>
            <InlineFaxForm client={faxClient} onClose={()=>setFaxModal(false)} showToast={showToast}/>
          </div>
        </div>
      )}

      {esignModal && esignClient && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setEsignModal(false)}>
          <div className="modal" style={{width:500}}>
            <div className="mh"><span className="mt">✍️ E-Signature — {esignClient.name}</span><button className="xbtn" onClick={()=>setEsignModal(false)}>&times;</button></div>
            <InlineEsignForm client={esignClient} onClose={()=>setEsignModal(false)} showToast={showToast}/>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Form Modal ────────────────────────────────────────────────────────────────
function ClientFormModal({form,fld,reps,saving,onSave,onClose,title}) {
  function addDep(){fld('dependents',[...(form.dependents||[]),{...BLANK_DEP}])}
  function updDep(i,k,v){const d=[...(form.dependents||[])];d[i]={...d[i],[k]:v};fld('dependents',d)}
  function remDep(i){const d=[...(form.dependents||[])];d.splice(i,1);fld('dependents',d)}

  return (
    <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{width:680,maxHeight:'92vh',overflowY:'auto'}}>
        <div className="mh">
          <span className="mt">{title}</span>
          <button className="xbtn" onClick={onClose}>&times;</button>
        </div>

        <div className="fg2">
          <div className="field"><label>Client Type</label>
            <select value={form.clientType} onChange={e=>fld('clientType',e.target.value)}>
              <option>Individual</option><option>Business</option><option>Individual &amp; Biz</option>
            </select>
          </div>
          <div className="field"><label>Full Name *</label>
            <input value={form.name} onChange={e=>fld('name',e.target.value)} placeholder="First Last"/>
          </div>
        </div>
        <div className="fg3">
          <div className="field"><label>Phone 1</label><input value={form.phone||''} onChange={e=>fld('phone',e.target.value)} placeholder="(305) 555-0000"/></div>
          <div className="field"><label>Phone 2</label><input value={form.phone2||''} onChange={e=>fld('phone2',e.target.value)}/></div>
          <div className="field"><label>Email</label><input value={form.email||''} onChange={e=>fld('email',e.target.value)}/></div>
        </div>
        <div className="field"><label>Street Address</label><input value={form.street||''} onChange={e=>fld('street',e.target.value)}/></div>
        <div className="fg3">
          <div className="field"><label>City</label><input value={form.city||''} onChange={e=>fld('city',e.target.value)}/></div>
          <div className="field"><label>State</label>
            <select value={form.state||''} onChange={e=>fld('state',e.target.value)}>
              <option value="">Select…</option>{STATES.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="field"><label>ZIP</label><input value={form.zip||''} onChange={e=>fld('zip',e.target.value)}/></div>
        </div>
        <div className="field"><label>County</label><input value={form.county||''} onChange={e=>fld('county',e.target.value)} placeholder="e.g. Palm Beach"/></div>

        {/* Taxpayer */}
        <div style={{background:'var(--s3)',borderRadius:8,padding:12,marginBottom:10}}>
          <div style={{fontWeight:700,fontSize:12,marginBottom:8}}>🔒 Taxpayer Info</div>
          <div className="fg2">
            <div className="field"><label>SSN</label><input value={form.ssn||''} onChange={e=>fld('ssn',e.target.value)} placeholder="XXX-XX-XXXX" maxLength={11}/></div>
            <div className="field"><label>EIN (if business)</label><input value={form.ein||''} onChange={e=>fld('ein',e.target.value)} placeholder="XX-XXXXXXX"/></div>
          </div>
          <div className="field"><label>Date of Birth</label>
            <div style={{display:'flex',gap:6}}>
              <select value={form.dobM||''} onChange={e=>fld('dobM',e.target.value)} style={{flex:2}}>
                <option value="">Month</option>{MONTHS.map((m,i)=><option key={m} value={String(i+1).padStart(2,'0')}>{m}</option>)}
              </select>
              <select value={form.dobD||''} onChange={e=>fld('dobD',e.target.value)} style={{flex:1}}>
                <option value="">Day</option>{DAYS.map(d=><option key={d}>{d}</option>)}
              </select>
              <select value={form.dobY||''} onChange={e=>fld('dobY',e.target.value)} style={{flex:2}}>
                <option value="">Year</option>{YDOB.map(y=><option key={y}>{y}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Spouse */}
        <div style={{background:'var(--s3)',borderRadius:8,padding:12,marginBottom:10}}>
          <div style={{fontWeight:700,fontSize:12,marginBottom:8}}>👥 Spouse / Partner</div>
          <div className="fg2">
            <div className="field"><label>Spouse Full Name</label><input value={form.spouseName||''} onChange={e=>fld('spouseName',e.target.value)}/></div>
            <div className="field"><label>Spouse SSN</label><input value={form.spouseSsn||''} onChange={e=>fld('spouseSsn',e.target.value)} placeholder="XXX-XX-XXXX" maxLength={11}/></div>
          </div>
          <div className="field"><label>Filing Status</label>
            <select value={form.filingStatus||'Single'} onChange={e=>fld('filingStatus',e.target.value)}>
              {['Single','Married Filing Jointly','Married Filing Separately','Head of Household','Qualifying Widow(er)'].map(o=><option key={o}>{o}</option>)}
            </select>
          </div>
        </div>

        {/* Dependents */}
        <div style={{background:'var(--s3)',borderRadius:8,padding:12,marginBottom:10}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <div style={{fontWeight:700,fontSize:12}}>👨‍👩‍👧 Dependents ({(form.dependents||[]).length})</div>
            <button className="btn sec" style={{fontSize:11,padding:'3px 10px'}} onClick={addDep}>+ Add</button>
          </div>
          {(form.dependents||[]).length===0&&<div style={{color:'var(--t3)',fontSize:12,textAlign:'center',padding:'6px 0'}}>None added</div>}
          {(form.dependents||[]).map((d,i)=>(
            <div key={i} style={{background:'var(--s2)',borderRadius:6,padding:10,marginBottom:8}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                <span style={{fontSize:11,fontWeight:700,color:'var(--t2)',textTransform:'uppercase'}}>Dependent {i+1}</span>
                <button onClick={()=>remDep(i)} style={{background:'none',border:'none',color:'var(--red)',cursor:'pointer',fontSize:16}}>×</button>
              </div>
              <div className="fg2">
                <div className="field"><label>Full Name</label><input value={d.name||''} onChange={e=>updDep(i,'name',e.target.value)}/></div>
                <div className="field"><label>Relationship</label>
                  <select value={d.relationship||'Child'} onChange={e=>updDep(i,'relationship',e.target.value)}>
                    {['Child','Stepchild','Foster Child','Sibling','Parent','Other'].map(r=><option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div className="fg2">
                <div className="field"><label>Date of Birth</label><input type="date" value={d.dob||''} onChange={e=>updDep(i,'dob',e.target.value)}/></div>
                <div className="field"><label>SSN</label><input value={d.ssn||''} onChange={e=>updDep(i,'ssn',e.target.value)} placeholder="XXX-XX-XXXX" maxLength={11}/></div>
              </div>
            </div>
          ))}
        </div>

        {/* IRS Info */}
        <div className="fg2">
          <div className="field"><label>Est. IRS Balance</label><input type="text" value={form.irsBalance||''} onChange={e=>fld('irsBalance',e.target.value)} placeholder="e.g. 45000 or $30,000 - $50,000"/></div>
          <div className="field"><label>Issue Type</label>
            <select value={form.issueType||'OIC'} onChange={e=>fld('issueType',e.target.value)}>
              {['OIC','Installment Agreement','CNC','Penalty Abatement','Payroll Tax','Unfiled Returns','Appeals','Audit','Liens/Levies','Tax Investigation','ACS','Notice Status','Other'].map(o=><option key={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <div className="fg2">
          <div className="field"><label>IRS or State?</label>
            <select value={form.irsOrState||'IRS Federal'} onChange={e=>fld('irsOrState',e.target.value)}>
              <option>IRS Federal</option><option>State</option><option>Both IRS + State</option>
            </select>
          </div>
          <div className="field"><label>Tax Years</label><input value={form.taxYears||''} onChange={e=>fld('taxYears',e.target.value)} placeholder="2020, 2021, 2022"/></div>
        </div>
        <div className="fg2">
          <div className="field"><label>Pipeline Stage</label>
            <select value={form.pipelineStage||'investigation'} onChange={e=>fld('pipelineStage',e.target.value)}>
              {PIPELINE_STAGES.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div className="field"><label>Client Since</label><input type="date" value={form.clientSince||''} onChange={e=>fld('clientSince',e.target.value)}/></div>
        </div>
        <div className="fg2">
          <div className="field"><label>Status</label>
            <select value={form.status||'Active'} onChange={e=>fld('status',e.target.value)}>
              <option>Active</option><option>Inactive</option><option>Prospect</option>
            </select>
          </div>
          <div className="field"><label>Assigned Rep</label>
            <select value={form.assignedTo||''} onChange={e=>fld('assignedTo',e.target.value)}>
              <option value="">Unassigned</option>{reps.map(r=><option key={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label style={{display:'flex',alignItems:'center',gap:6}}>
            <span>📌 Internal Note</span>
            <span style={{fontSize:10,color:'var(--warn)',fontWeight:400}}>(staff only — shows as sticky alert on file)</span>
          </label>
          <input value={form.internal_note||''} onChange={e=>fld('internal_note',e.target.value)}
            placeholder="e.g. Call husband John for updates, not the wife — (850) 555-0100"
            style={{width:'100%'}}/>
        </div>
        <div className="field"><label>Notes</label><textarea value={form.notes||''} onChange={e=>fld('notes',e.target.value)} style={{minHeight:80}}/></div>

        <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={onSave} disabled={saving}>
          {saving?'Saving…':title}
        </button>
      </div>
    </div>
  )
}


