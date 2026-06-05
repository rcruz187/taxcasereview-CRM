import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useFirm } from '../lib/useFirm'
import { generateClientPackage, generateAddendum, generatePOACoverLetter, generateForm8821Personal, generateForm8821Business, generateForm2848Personal, generateForm2848Business } from '../lib/docUtils'

const STATUSES = ['New Lead','Contacted','Consultation Scheduled','Consultation Completed',
  'Tax Inv Agreement Sent','Tax Inv Agreement Signed','Tax Inv Fee Paid',
  'Tax Investigation Active','IRS Facts Received','Addendum Sent','Addendum Signed',
  'Resolution Fee Paid','Converted to Client','Dead','Do Not Contact']

const STATUS_C = {
  'New Lead':'bb','Contacted':'bn','Consultation Scheduled':'ba','Consultation Completed':'ba',
  'Tax Inv Agreement Sent':'ba','Tax Inv Agreement Signed':'bg','Tax Inv Fee Paid':'bg',
  'Tax Investigation Active':'bg','IRS Facts Received':'bg','Addendum Sent':'ba',
  'Addendum Signed':'bg','Resolution Fee Paid':'bg','Converted to Client':'bg',
  'Dead':'br','Do Not Contact':'br'
}

const PIPELINE_STAGES = [
  { label:'Contacted',    key:'contacted' },
  { label:'Consultation', key:'consult' },
  { label:'Agr Signed',   key:'agreement' },
  { label:'Fee Paid',     key:'paid' },
  { label:'Tax Inv',      key:'taxinv' },
  { label:'Addendum',     key:'addendum' },
  { label:'Converted',    key:'client' },
]

function stagesDone(status) {
  const order = ['Contacted','Consultation Scheduled','Consultation Completed',
    'Tax Inv Agreement Sent','Tax Inv Agreement Signed','Tax Inv Fee Paid',
    'Tax Investigation Active','IRS Facts Received','Addendum Sent','Addendum Signed',
    'Resolution Fee Paid','Converted to Client']
  const idx = order.indexOf(status)
  return [idx>=0, idx>=2, idx>=5, idx>=6, idx>=8, idx>=10, idx>=11]
}

const YEARS  = Array.from({length:20},(_,i)=>2026-i)
const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

const BLANK = {
  clientType:'Individual', name:'', first:'', mi:'', last:'', phone:'', email:'',
  street:'', city:'', state:'', zip:'', county:'', source:'Referral',
  irsBalance:'', issueType:'OIC', irsOrState:'IRS Federal', taxYears:[],
  taxYearsCustom:'', notes:'', assignedTo:'', status:'New Lead', taxFee:'', taxFeeOverride:''
}

function Bdg({s}) { return <span className={`bdg ${STATUS_C[s]||'bn'}`}>{s}</span> }

function TypeBdg({t}) {
  const m = {'OIC':'bb','Installment Agreement':'bg','CNC':'bn','Penalty Abatement':'bb','Appeals':'bn','Payroll Tax':'br','Audit':'br','Liens/Levies':'br'}
  return <span className={`bdg ${m[t]||'bn'}`}>{t}</span>
}


function LeadInlineFax({ lead, onClose }) {
  const [toNum,set0]=useState((lead?.phone||'').replace(/\D/g,''))
  const [subject,set1]=useState('')
  const [file,set2]=useState(null)
  const [sending,set3]=useState(false)
  async function send() {
    set3(true)
    const {data:s}=await supabase.from('settings').select('telnyx_api_key,firm_fax_number').limit(1).maybeSingle()
    let fileUrl=null
    if(file){const path='fax/'+Date.now()+'_'+file.name;await supabase.storage.from('documents').upload(path,file,{upsert:true});const{data:u}=supabase.storage.from('documents').getPublicUrl(path);fileUrl=u?.publicUrl}
    await supabase.from('fax_logs').insert([{to_number:'+1'+toNum.slice(-10),from_number:s?.firm_fax_number||'',client_name:lead?.name,subject,file_url:fileUrl,file_name:file?.name||null,status:s?.telnyx_api_key?'Sent':'Logged',sent_at:new Date().toISOString(),created_at:new Date().toISOString()}])
    set3(false);onClose()
  }
  return <div style={{padding:'0 4px 4px'}}>
    <div className="field"><label>To Fax Number</label><input value={toNum} onChange={e=>set0(e.target.value.replace(/\D/g,''))} placeholder="10 digits"/></div>
    <div className="field"><label>Subject</label><input value={subject} onChange={e=>set1(e.target.value)} placeholder="Document subject"/></div>
    <div className="field"><label>Attach PDF</label><input type="file" accept=".pdf,.tiff,.jpg,.png" onChange={e=>set2(e.target.files[0])} style={{padding:'6px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',width:'100%',fontSize:12}}/></div>
    <div style={{display:'flex',gap:8}}>
      <button className="btn sec" style={{flex:1,justifyContent:'center'}} onClick={onClose}>Cancel</button>
      <button className="btn sm" style={{flex:1,justifyContent:'center',background:'#dc2626',color:'#fff',borderColor:'#dc2626'}} onClick={send} disabled={sending}>{sending?'Sending…':'📠 Send'}</button>
    </div>
  </div>
}

function LeadInlineEsign({ lead, onClose }) {
  const [docType,set0]=useState('Engagement Letter')
  const [message,set1]=useState('Please review and sign the attached document.')
  const [saving,set2]=useState(false)
  const [link,set3]=useState('')
  async function create() {
    set2(true)
    const{data,error}=await supabase.from('esigns').insert([{doc_type:docType,client_name:lead?.name,client_email:lead?.email||'',message,priority:'Normal',status:'Awaiting',sent_at:new Date().toISOString(),created_at:new Date().toISOString()}]).select().single()
    set2(false)
    if(error){alert('Error: '+error.message);return}
    const url=window.location.origin+'/taxcasereview-CRM/#/sign/'+data.id
    set3(url);navigator.clipboard.writeText(url).catch(()=>{})
  }
  if(link) return <div style={{padding:'0 4px 4px'}}>
    <div style={{background:'rgba(34,197,94,.08)',border:'1px solid rgba(34,197,94,.3)',borderRadius:8,padding:'12px 14px',marginBottom:14}}>
      <div style={{fontSize:12,fontWeight:700,color:'var(--ok)',marginBottom:6}}>✅ Link copied!</div>
      <div style={{fontSize:11,color:'var(--t3)',wordBreak:'break-all'}}>{link}</div>
    </div>
    <button className="btn sec" style={{width:'100%',justifyContent:'center'}} onClick={onClose}>Done</button>
  </div>
  return <div style={{padding:'0 4px 4px'}}>
    <div className="field"><label>Document Type</label>
      <select value={docType} onChange={e=>set0(e.target.value)}>
        {['Engagement Letter','Form 2848 — Power of Attorney','Form 8821 — Tax Info Auth','Service Agreement','Fee Agreement Addendum','Custom Document'].map(t=><option key={t}>{t}</option>)}
      </select>
    </div>
    <div className="field"><label>Message</label>
      <textarea value={message} onChange={e=>set1(e.target.value)} rows={3} style={{width:'100%',resize:'none',padding:'8px 12px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',fontSize:13,fontFamily:'inherit'}}/>
    </div>
    <div style={{display:'flex',gap:8}}>
      <button className="btn sec" style={{flex:1,justifyContent:'center'}} onClick={onClose}>Cancel</button>
      <button className="btn sm" style={{flex:1,justifyContent:'center',background:'#7c3aed',color:'#fff',borderColor:'#7c3aed'}} onClick={create} disabled={saving}>{saving?'Creating…':'✍️ Create Link'}</button>
    </div>
  </div>
}

export default function Leads() {
  const navigate = useNavigate()
  const [leads, setLeads]   = useState([])
  const [filter, setFilter] = useState('All')
  const [modal, setModal]   = useState(false)
  const [detail, setDetail] = useState(null)
  const [leadNotes, setLeadNotes]     = useState([])
  const [newLeadNote, setNewLeadNote] = useState('')
  const [addingLeadNote, setAddingLeadNote] = useState(false)
  const [noteType, setNoteType]       = useState('Call')
  const [showAllNotes, setShowAllNotes] = useState(false)
  const [form, setForm]     = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [toast, setToast]   = useState('')
  const [converting, setConverting] = useState(false)
  const [inlineFaxLead, setInlineFaxLead] = useState(null)
  const [showFaxModal, setShowFaxModal] = useState(false)
  const [inlineEsignLead, setInlineEsignLead] = useState(null)
  const [showEsignModal, setShowEsignModal] = useState(false)
  const [showFlow, setShowFlow]     = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('leads').select('*').order('created_at', { ascending: false })
    if (data) {
      setLeads(data)
      const badge = document.getElementById('badge-leads')
      if (badge) badge.textContent = data.filter(l => l.status === 'New Lead').length || 0
      // refresh detail if open
      if (detail) setDetail(data.find(l => l.id === detail.id) || null)
    }
  }

  async function loadLeadNotes(leadId) {
    const { data } = await supabase.from('lead_notes').select('*').eq('lead_id', leadId).order('created_at', { ascending: false })
    setLeadNotes(data || [])
  }

  async function addLeadNote() {
    if (!newLeadNote.trim() || !detail) return
    setAddingLeadNote(true)
    const { error } = await supabase.from('lead_notes').insert([{
      lead_id: detail.id,
      lead_name: detail.name,
      text: newLeadNote.trim(),
      type: noteType,
      author: 'Rep',
      created_at: new Date().toISOString()
    }])
    setAddingLeadNote(false)
    if (error) { showToast('Error: ' + error.message); return }
    setNewLeadNote('')
    loadLeadNotes(detail.id)
    showToast('Note added!')
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3000) }
  function fld(k,v) { setForm(f=>({...f,[k]:v})) }
  function toggleYear(y) { setForm(f=>({...f, taxYears: f.taxYears.includes(y)?f.taxYears.filter(x=>x!==y):[...f.taxYears,y]})) }

  const filtered = filter === 'All' ? leads : leads.filter(l => l.status === filter)

  async function save() {
    if (!form.name.trim()) { showToast('Name is required'); return }
    setSaving(true)
    const payload = { ...form, taxYears: JSON.stringify(form.taxYears) }
    let error
    if (modal === 'edit') {
      const { id, created_at, ...rest } = payload
      ;({ error } = await supabase.from('leads').update(rest).eq('id', form.id))
    } else {
      payload.created_at = new Date().toISOString()
      ;({ error } = await supabase.from('leads').insert([payload]))
    }
    setSaving(false)
    if (error) { showToast('Error: '+error.message); return }
    showToast(modal==='edit' ? '✅ Lead updated!' : '✅ Lead added!')
    setModal(false); setForm(BLANK); load()
    if (modal==='edit' && detail) {
      const { data } = await supabase.from('leads').select('*').eq('id', form.id).single()
      if (data) setDetail(data)
    }
  }

  async function deleteLead(id) {
    if (!confirm('Delete this lead?')) return
    await supabase.from('leads').delete().eq('id', id)
    showToast('Deleted'); setDetail(null); load()
  }

  async function updateStatus(id, status) {
    await supabase.from('leads').update({ status }).eq('id', id)
    showToast('Status updated!'); load()
  }

  async function convertToClient(l) {
    if (!confirm(`Convert "${l.name}" to a full client?`)) return
    setConverting(true)
    const taxYearsStr = l.taxYearsCustom || (()=>{try{return JSON.parse(l.taxYears||'[]').join(', ')}catch{return l.taxYears||''}})()
    const { error } = await supabase.from('clients').insert([{
      name: l.name, clientType: l.clientType || 'Individual',
      first: l.first, mi: l.mi, last: l.last,
      phone: l.phone, email: l.email,
      street: l.street, city: l.city, state: l.state, zip: l.zip, county: l.county,
      source: l.source, assignedTo: l.assignedTo,
      irsBalance: l.irsBalance, issueType: l.issueType, irsOrState: l.irsOrState,
      taxYears: taxYearsStr,
      notes: l.notes, status: 'Active',
      clientSince: new Date().toISOString().slice(0,10),
      created_at: new Date().toISOString()
    }])
    if (error) { showToast('Error: '+error.message); setConverting(false); return }
    // Update lead status
    await supabase.from('leads').update({ status: 'Converted to Client' }).eq('id', l.id)
    setConverting(false)
    showToast(`✅ ${l.name} converted to Client!`)
    setDetail(null); load()
  }

  // ── Detail View ──
  if (detail) {
    const l = detail
    const done = stagesDone(l.status)
    const taxYearsList = (() => { try { return JSON.parse(l.taxYears||'[]').join(', ') } catch { return l.taxYearsCustom||'—' } })()

    return (
      <div style={{maxWidth:900}}>
        {toast && <div className="toast show">{toast}</div>}

        {/* Top bar */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <button className="btn sm" onClick={()=>setDetail(null)}>← Back</button>
            <span style={{color:'var(--t3)',fontSize:12}}>Leads / {l.name}</span>
          </div>
          <div style={{display:'flex',gap:6}}>
            <button className="btn sm" onClick={()=>{setForm({...BLANK,...l,taxYears:(() => {try{return JSON.parse(l.taxYears||'[]')}catch{return []}})()});setModal('edit')}}>✏️ Edit</button>
            <button className="btn ok sm" onClick={()=>convertToClient(l)} disabled={converting}>✓ Convert to Client</button>
            <button className="btn del sm" onClick={()=>deleteLead(l.id)}>🗑 Delete</button>
          </div>
        </div>

        {/* Header card — compact */}
        <div className="card" style={{padding:'14px 16px',marginBottom:10}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:42,height:42,borderRadius:'50%',background:'var(--blt)',color:'var(--b2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:800,flexShrink:0}}>
              {(l.name||'?')[0].toUpperCase()}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:17,fontWeight:800,lineHeight:1.2}}>{l.name}</div>
              <div style={{display:'flex',gap:5,marginTop:4,flexWrap:'wrap'}}>
                <span className="bdg bb" style={{fontSize:10}}>{l.clientType||'Individual'}</span>
                <Bdg s={l.status||'New Lead'}/>
                {l.taxFee && <span className="bdg bg" style={{fontSize:10}}>Tax Inv Fee: ${l.taxFee}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Pipeline tracker — slim */}
        <div className="card" style={{padding:'10px 16px',marginBottom:10}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <span style={{fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em'}}>Pipeline</span>
            <button className="btn sec" style={{padding:'2px 8px',fontSize:10}} onClick={()=>setShowFlow(true)}>📊 View Flow</button>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:0,overflowX:'auto'}}>
            {PIPELINE_STAGES.map((s,i) => (
              <div key={s.key} style={{display:'flex',alignItems:'center',flex:1,minWidth:60}}>
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',flex:1}}>
                  <div style={{width:22,height:22,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,flexShrink:0,background:done[i]?'var(--ok)':'var(--s3)',color:done[i]?'#fff':'var(--t3)',border:`2px solid ${done[i]?'var(--ok)':'var(--br)'}`}}>
                    {done[i] ? '✓' : i+1}
                  </div>
                  <div style={{fontSize:9,marginTop:3,textAlign:'center',color:done[i]?'var(--ok)':'var(--t3)',whiteSpace:'nowrap'}}>{s.label}</div>
                </div>
                {i < PIPELINE_STAGES.length-1 && <div style={{height:2,flex:1,maxWidth:20,background:done[i]?'var(--ok)':'var(--br)',marginBottom:14}}/>}
              </div>
            ))}
          </div>
        </div>

        {/* Info + IRS side by side */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
          <div className="card" style={{padding:'12px 16px'}}>
            <div className="stitle" style={{marginBottom:8}}>Contact Info</div>
            {[['Phone', l.phone],['Email', l.email],['Address', [l.street,l.city,l.state,l.zip].filter(Boolean).join(' ')],['County', l.county],['Source', l.source]].map(([label,val])=>(
              <div key={label} className="dr"><span className="dl">{label}</span><span className="dv">{val||'—'}</span></div>
            ))}
          </div>
          <div className="card" style={{padding:'12px 16px'}}>
            <div className="stitle" style={{marginBottom:8}}>IRS Info</div>
            {[['Est. Balance', l.irsBalance ? <span style={{fontWeight:700,color:'var(--bad)'}}>~{l.irsBalance}</span> : '—'],
              ['Issue Type', <TypeBdg t={l.issueType||'—'}/>],
              ['IRS or State', l.irsOrState],
              ['Tax Years', taxYearsList],
              ['Assigned Rep', l.assignedTo || <span style={{color:'var(--warn)'}}>Unassigned</span>],
              ['Tax Inv Fee', l.taxFee ? <span style={{fontWeight:700,color:'var(--ok)'}}>${l.taxFee}</span> : 'Not set'],
            ].map(([label,val])=>(
              <div key={label} className="dr"><span className="dl">{label}</span><span className="dv">{val||'—'}</span></div>
            ))}
          </div>
        </div>

        {/* Status chips */}
        <div className="card" style={{padding:'10px 16px',marginBottom:10}}>
          <div style={{fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>Update Status</div>
          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
            {STATUSES.map(s => (
              <span key={s} className={`chip${l.status===s?' on':''}`} onClick={()=>updateStatus(l.id, s)} style={{fontSize:10}}>{s}</span>
            ))}
          </div>
        </div>

        {/* Action buttons — compact row */}
        <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap'}}>
          <button className="btn ok sm" style={{flex:1,minWidth:130,justifyContent:'center',flexDirection:'column',gap:2,padding:'8px 10px',textAlign:'center'}} onClick={()=>generateClientPackage(l)}>
            <span style={{fontSize:11,fontWeight:700}}>📄 Tax Engagement</span>
            <span style={{fontSize:10,opacity:.8}}>Service Agreement</span>
          </button>
          {/* 8821 — show personal, business, or both based on clientType */}
          {(l.clientType !== 'Business') && (
            <button className="btn sm" style={{flex:1,minWidth:130,background:'#0369a1',color:'#fff',borderColor:'#0369a1',justifyContent:'center',flexDirection:'column',gap:2,padding:'8px 10px',textAlign:'center'}} onClick={()=>generateForm8821Personal(l)}>
              <span style={{fontSize:11,fontWeight:700}}>📋 8821 Personal</span>
              <span style={{fontSize:10,opacity:.8}}>Tax Info Auth</span>
            </button>
          )}
          {(l.clientType === 'Business' || l.clientType === 'Both') && (
            <button className="btn sm" style={{flex:1,minWidth:130,background:'#0369a1',color:'#fff',borderColor:'#0369a1',justifyContent:'center',flexDirection:'column',gap:2,padding:'8px 10px',textAlign:'center'}} onClick={()=>generateForm8821Business(l)}>
              <span style={{fontSize:11,fontWeight:700}}>📋 8821 Business</span>
              <span style={{fontSize:10,opacity:.8}}>Tax Info Auth</span>
            </button>
          )}
          {/* 2848 — same logic */}
          {(l.clientType !== 'Business') && (
            <button className="btn sm" style={{flex:1,minWidth:130,background:'#7c3aed',color:'#fff',borderColor:'#7c3aed',justifyContent:'center',flexDirection:'column',gap:2,padding:'8px 10px',textAlign:'center'}} onClick={()=>generateForm2848Personal(l)}>
              <span style={{fontSize:11,fontWeight:700}}>🔏 2848 Personal</span>
              <span style={{fontSize:10,opacity:.8}}>Power of Attorney</span>
            </button>
          )}
          {(l.clientType === 'Business' || l.clientType === 'Both') && (
            <button className="btn sm" style={{flex:1,minWidth:130,background:'#7c3aed',color:'#fff',borderColor:'#7c3aed',justifyContent:'center',flexDirection:'column',gap:2,padding:'8px 10px',textAlign:'center'}} onClick={()=>generateForm2848Business(l)}>
              <span style={{fontSize:11,fontWeight:700}}>🔏 2848 Business</span>
              <span style={{fontSize:10,opacity:.8}}>Power of Attorney</span>
            </button>
          )}
          <button className="btn sm" style={{flex:1,minWidth:130,background:'var(--warn)',color:'#fff',borderColor:'var(--warn)',justifyContent:'center',flexDirection:'column',gap:2,padding:'8px 10px',textAlign:'center'}} onClick={()=>generateAddendum(l)}>
            <span style={{fontSize:11,fontWeight:700}}>📝 Addendum</span>
            <span style={{fontSize:10,opacity:.8}}>After IRS facts</span>
          </button>
          <button className="btn sm" style={{flex:1,minWidth:130,background:'#6c5ce7',color:'#fff',borderColor:'#6c5ce7',justifyContent:'center',flexDirection:'column',gap:2,padding:'8px 10px',textAlign:'center'}} onClick={()=>generatePOACoverLetter(l)}>
            <span style={{fontSize:11,fontWeight:700}}>🔐 POA Letter</span>
            <span style={{fontSize:10,opacity:.8}}>Cover Letter</span>
          </button>
          <button className="btn ok sm" style={{flex:1,minWidth:120,justifyContent:'center',flexDirection:'column',gap:2,padding:'8px 10px',textAlign:'center'}} onClick={()=>convertToClient(l)} disabled={converting}>
            <span style={{fontSize:11,fontWeight:700}}>✓ Convert to Client</span>
            <span style={{fontSize:10,opacity:.8}}>{converting?'Converting…':'Move to Clients'}</span>
          </button>
          <button className="btn sm" style={{flex:1,minWidth:120,background:'#dc2626',color:'#fff',borderColor:'#dc2626',justifyContent:'center',flexDirection:'column',gap:2,padding:'8px 10px',textAlign:'center'}} onClick={()=>{setInlineFaxLead(l);setShowFaxModal(true)}}>
            <span style={{fontSize:11,fontWeight:700}}>📠 Send Fax</span>
            <span style={{fontSize:10,opacity:.8}}>Telnyx Fax</span>
          </button>
          <button className="btn sm" style={{flex:1,minWidth:120,background:'#7c3aed',color:'#fff',borderColor:'#7c3aed',justifyContent:'center',flexDirection:'column',gap:2,padding:'8px 10px',textAlign:'center'}} onClick={()=>{setInlineEsignLead(l);setShowEsignModal(true)}}>
            <span style={{fontSize:11,fontWeight:700}}>✍️ E-Signature</span>
            <span style={{fontSize:10,opacity:.8}}>Request Sign</span>
          </button>
        </div>

        {l.notes && (
          <div className="card" style={{padding:'10px 16px',marginBottom:10}}>
            <div className="stitle" style={{marginBottom:4}}>Initial Notes</div>
            <div style={{fontSize:13,color:'var(--t2)',lineHeight:1.6}}>{l.notes}</div>
          </div>
        )}

        {/* ── Status Flow Modal ──────────────────────────────────────────────── */}
      {showFlow && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setShowFlow(false)}>
          <div className="modal" style={{maxWidth:820,width:'95vw'}}>
            <div className="mh">
              <span className="mt">📊 Lead Status Flow</span>
              <button className="xbtn" onClick={()=>setShowFlow(false)}>&times;</button>
            </div>
            <div style={{overflowX:'auto',padding:'8px 0'}}>
              <div style={{display:'flex',alignItems:'center',gap:0,minWidth:700,flexWrap:'wrap',rowGap:16}}>
                {[
                  {s:'New Lead',       c:'#3b82f6', doc:null},
                  {s:'Contacted',      c:'#6366f1', doc:null},
                  {s:'Consultation Scheduled', c:'#8b5cf6', doc:null},
                  {s:'Consultation Completed', c:'#a855f7', doc:null},
                  {s:'Tax Inv Agreement Sent', c:'#f59e0b', doc:'📄 Service Agreement'},
                  {s:'Tax Inv Agreement Signed', c:'#f97316', doc:'✍️ Client Signs'},
                  {s:'Tax Inv Fee Paid', c:'#10b981', doc:'💰 Fee Collected'},
                  {s:'Tax Investigation Active', c:'#059669', doc:'🔍 Transcripts'},
                  {s:'IRS Facts Received', c:'#0ea5e9', doc:'📋 Facts In'},
                  {s:'Addendum Sent', c:'#f59e0b', doc:'📄 Addendum'},
                  {s:'Addendum Signed', c:'#f97316', doc:'✍️ Client Signs'},
                  {s:'Resolution Fee Paid', c:'#10b981', doc:'💰 Fee Collected'},
                  {s:'Converted to Client', c:'#25A25A', doc:'🎉 Client!'},
                ].map((item, i, arr) => (
                  <div key={item.s} style={{display:'flex',alignItems:'center',gap:0}}>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                      <div style={{
                        background: item.c, color:'#fff', borderRadius:8,
                        padding:'6px 10px', fontSize:11, fontWeight:700,
                        textAlign:'center', whiteSpace:'nowrap', maxWidth:110,
                        lineHeight:1.3
                      }}>{item.s}</div>
                      {item.doc && <div style={{fontSize:9,color:'var(--t3)',textAlign:'center',maxWidth:110}}>{item.doc}</div>}
                    </div>
                    {i < arr.length - 1 && (
                      <div style={{color:'var(--t3)',fontSize:16,margin:'0 4px',flexShrink:0}}>→</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Off-track statuses */}
              <div style={{marginTop:16,paddingTop:12,borderTop:'1px solid var(--br)'}}>
                <div style={{fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>Off-Track</div>
                <div style={{display:'flex',gap:8}}>
                  {[{s:'Dead',c:'#ef4444'},{s:'Do Not Contact',c:'#6b7280'}].map(item=>(
                    <div key={item.s} style={{background:item.c,color:'#fff',borderRadius:8,padding:'6px 12px',fontSize:11,fontWeight:700}}>
                      {item.s}
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick legend */}
              <div style={{marginTop:12,padding:10,background:'var(--bg)',borderRadius:8,fontSize:11,color:'var(--t2)',lineHeight:1.8}}>
                <b style={{color:'var(--tx)'}}>Key Actions per Stage:</b><br/>
                🔵 <b>New → Consultation Completed</b> — Phone outreach & consult scheduling<br/>
                🟡 <b>Agreement Sent → Fee Paid</b> — Generate Service Agreement → collect $499–$699 investigation fee<br/>
                🟢 <b>Tax Investigation Active → IRS Facts</b> — File Form 2848/8821, pull transcripts<br/>
                🟠 <b>Addendum Sent → Resolution Fee Paid</b> — Present resolution plan, collect full service fee<br/>
                ✅ <b>Convert to Client</b> — Opens full client file & case management
              </div>
            </div>
          </div>
        </div>
      )}

      {showFaxModal && inlineFaxLead && (
          <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setShowFaxModal(false)}>
            <div className="modal" style={{width:520}}>
              <div className="mh"><span className="mt">📠 Send Fax — {inlineFaxLead.name}</span><button className="xbtn" onClick={()=>setShowFaxModal(false)}>&times;</button></div>
              <LeadInlineFax lead={inlineFaxLead} onClose={()=>setShowFaxModal(false)}/>
            </div>
          </div>
        )}

        {showEsignModal && inlineEsignLead && (
          <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setShowEsignModal(false)}>
            <div className="modal" style={{width:520}}>
              <div className="mh"><span className="mt">✍️ E-Signature — {inlineEsignLead.name}</span><button className="xbtn" onClick={()=>setShowEsignModal(false)}>&times;</button></div>
              <LeadInlineEsign lead={inlineEsignLead} onClose={()=>setShowEsignModal(false)}/>
            </div>
          </div>
        )}

        {/* ── Call Log / Activity Notes ── compact ── */}
        <div className="card" style={{marginTop:12}}>
          {/* Header */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <div style={{fontWeight:700,fontSize:13,color:'var(--tx)'}}>📞 Activity Log</div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              {leadNotes.length > 3 && (
                <span onClick={()=>setShowAllNotes(s=>!s)} style={{fontSize:11,color:'var(--blue)',cursor:'pointer',fontWeight:600}}>
                  {showAllNotes ? 'Show less' : `View all ${leadNotes.length}`}
                </span>
              )}
              <span style={{fontSize:11,color:'var(--t3)'}}>{leadNotes.length} entries</span>
            </div>
          </div>

          {/* Quick log row */}
          <div style={{display:'flex',gap:6,marginBottom:10,alignItems:'center'}}>
            <select value={noteType} onChange={e=>setNoteType(e.target.value)}
              style={{padding:'5px 8px',borderRadius:6,border:'1px solid var(--br)',background:'var(--s2)',color:'var(--tx)',fontSize:12,flexShrink:0,width:100}}>
              <option>Call</option><option>Email</option><option>SMS</option>
              <option>Meeting</option><option>Note</option><option>Follow Up</option>
            </select>
            <input
              value={newLeadNote}
              onChange={e=>setNewLeadNote(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter') addLeadNote() }}
              placeholder="Log activity... (Enter to save)"
              style={{flex:1,padding:'6px 10px',borderRadius:6,border:'1px solid var(--br)',background:'var(--s2)',color:'var(--tx)',fontSize:12}}
            />
            <button className="btn pri" onClick={addLeadNote} disabled={addingLeadNote || !newLeadNote.trim()}
              style={{padding:'5px 12px',flexShrink:0,fontSize:12}}>
              {addingLeadNote ? '…' : 'Log'}
            </button>
          </div>

          {/* Notes list — last 3 or all */}
          {leadNotes.length === 0 ? (
            <div style={{color:'var(--t3)',fontSize:12,textAlign:'center',padding:'8px 0'}}>No activity yet.</div>
          ) : (showAllNotes ? leadNotes : leadNotes.slice(0,3)).map((n,i) => {
            const typeColors = {Call:'#3b82f6',Email:'#8b5cf6',SMS:'#06b6d4',Meeting:'#f59e0b',Note:'#64748b','Follow Up':'#ec4899'}
            const tc = typeColors[n.type] || '#64748b'
            return (
              <div key={n.id||i} style={{display:'flex',gap:8,padding:'6px 0',borderTop:'1px solid var(--br)',alignItems:'flex-start'}}>
                <span style={{fontSize:14,flexShrink:0,marginTop:1}}>
                  {n.type==='Call'?'📞':n.type==='Email'?'✉️':n.type==='SMS'?'💬':n.type==='Meeting'?'🤝':n.type==='Follow Up'?'🔔':'📝'}
                </span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                    <span style={{fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:10,background:tc+'22',color:tc,border:'1px solid '+tc+'33'}}>{n.type}</span>
                    <span style={{fontSize:11,color:'var(--tx)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{n.text}</span>
                    <span style={{fontSize:10,color:'var(--t3)',flexShrink:0,whiteSpace:'nowrap'}}>
                      {n.created_at?new Date(n.created_at).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):''}
                    </span>
                    <button onClick={async()=>{ await supabase.from('lead_notes').delete().eq('id',n.id); loadLeadNotes(detail.id) }}
                      style={{background:'none',border:'none',color:'var(--t3)',cursor:'pointer',fontSize:13,flexShrink:0,padding:'0 2px',lineHeight:1}}>×</button>
                  </div>
                </div>
              </div>
            )
          })}
          {!showAllNotes && leadNotes.length > 3 && (
            <div onClick={()=>setShowAllNotes(true)} style={{textAlign:'center',padding:'6px 0',fontSize:11,color:'var(--blue)',cursor:'pointer',borderTop:'1px solid var(--br)',marginTop:4}}>
              + {leadNotes.length - 3} more entries — click to view all
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── List View ──
  return (
    <div>
      {toast && <div className="toast show">{toast}</div>}

      <div style={{marginBottom:10,display:'flex',flexWrap:'wrap',gap:4}}>
        {['All',...STATUSES.slice(0,8)].map(s => (
          <span key={s} className={`chip${filter===s?' on':''}`} onClick={()=>setFilter(s)}>{s}</span>
        ))}
      </div>

      <div className="card">
        <div className="ch">
          <span className="ct">All Leads ({filtered.length})</span>
          <button className="btn pri" onClick={()=>{ setForm(BLANK); setModal(true) }}>+ Add Lead</button>
        </div>
        <div className="ovx">
          <table>
            <thead>
              <tr><th>Name</th><th>Type</th><th>Phone</th><th>Issue</th><th>Balance</th><th>Source</th><th>Status</th><th>Assigned</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} style={{textAlign:'center',color:'var(--t3)',padding:20}}>No leads yet — add your first one!</td></tr>
              ) : filtered.map(l => (
                <tr key={l.id} onClick={()=>{ setDetail(l); loadLeadNotes(l.id) }} style={{cursor:'pointer'}}>
                  <td style={{fontWeight:600}}>{l.name}</td>
                  <td><span className="bdg bb">{l.clientType||'Individual'}</span></td>
                  <td>{l.phone||'—'}</td>
                  <td><TypeBdg t={l.issueType||'—'}/></td>
                  <td style={{color:'var(--t2)'}}>{l.irsBalance||'—'}</td>
                  <td style={{color:'var(--t2)'}}>{l.source||'—'}</td>
                  <td><Bdg s={l.status||'New Lead'}/></td>
                  <td style={{color:'var(--t2)',fontSize:12}}>{l.assignedTo||<span style={{color:'var(--warn)'}}>Unassigned</span>}</td>
                  <td onClick={e=>e.stopPropagation()}>
                    <button className="btn del" onClick={()=>deleteLead(l.id)}>Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modal && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal" style={{width:640}}>
            <div className="mh">
              <span className="mt">{modal==='edit'?'Edit Lead':'Add Lead'}</span>
              <button className="xbtn" onClick={()=>setModal(false)}>&times;</button>
            </div>

            <div className="fg2">
              <div className="field"><label>Client Type</label>
                <select value={form.clientType} onChange={e=>fld('clientType',e.target.value)}>
                  <option>Individual</option><option>Business</option><option>Individual &amp; Biz</option>
                </select>
              </div>
              <div className="field"><label>Full Name *</label>
                <input value={form.name} onChange={e=>fld('name',e.target.value)} placeholder="First Last / Business Name"/>
              </div>
            </div>
            <div className="fg3">
              <div className="field"><label>First Name</label><input value={form.first} onChange={e=>fld('first',e.target.value)}/></div>
              <div className="field"><label>MI</label><input value={form.mi} onChange={e=>fld('mi',e.target.value)} maxLength={1}/></div>
              <div className="field"><label>Last Name</label><input value={form.last} onChange={e=>fld('last',e.target.value)}/></div>
            </div>
            <div className="fg2">
              <div className="field"><label>Phone</label><input value={form.phone} onChange={e=>fld('phone',e.target.value)} placeholder="(305) 555-0000"/></div>
              <div className="field"><label>Email</label><input value={form.email} onChange={e=>fld('email',e.target.value)}/></div>
            </div>
            <div className="field"><label>Street Address</label><input value={form.street} onChange={e=>fld('street',e.target.value)}/></div>
            <div className="fg3">
              <div className="field"><label>City</label><input value={form.city} onChange={e=>fld('city',e.target.value)}/></div>
              <div className="field"><label>State</label>
                <select value={form.state} onChange={e=>fld('state',e.target.value)}>
                  <option value="">Select...</option>{STATES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="field"><label>ZIP</label><input value={form.zip} onChange={e=>fld('zip',e.target.value)}/></div>
            </div>
            <div className="fg2">
              <div className="field"><label>Source</label>
                <select value={form.source} onChange={e=>fld('source',e.target.value)}>
                  {['Referral','Web Form','Google Ad','Social Media','Phone Call','Walk-In','Other'].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="field"><label>Est. IRS Balance</label>
                <select value={form.irsBalance} onChange={e=>fld('irsBalance',e.target.value)}>
                  <option value="">Unknown</option>
                  {['Under $10,000','$10,000 - $20,000','$20,000 - $30,000','$30,000 - $50,000','$50,000 - $100,000','$100,000 - $250,000','Over $250,000'].map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div className="fg2">
              <div className="field"><label>Issue Type</label>
                <select value={form.issueType} onChange={e=>fld('issueType',e.target.value)}>
                  {['OIC','Installment Agreement','CNC','Penalty Abatement','Payroll Tax','Unfiled Returns','Appeals','Audit','Liens/Levies','Tax Investigation','ACS','Notice Status','Other'].map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
              <div className="field"><label>IRS or State?</label>
                <select value={form.irsOrState} onChange={e=>fld('irsOrState',e.target.value)}>
                  <option>IRS Federal</option><option>State</option><option>Both IRS + State</option>
                </select>
              </div>
            </div>
            <div className="field"><label>Tax Years</label>
              <div style={{background:'var(--s2)',border:'1px solid var(--b2c)',borderRadius:7,padding:'8px 10px',maxHeight:80,overflowY:'auto',display:'flex',flexWrap:'wrap',gap:'2px 12px'}}>
                {YEARS.map(y=>(
                  <label key={y} style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:12,cursor:'pointer',whiteSpace:'nowrap'}}>
                    <input type="checkbox" checked={form.taxYears.includes(String(y))} onChange={()=>toggleYear(String(y))} style={{width:'auto'}}/>
                    {y}
                  </label>
                ))}
              </div>
              <input value={form.taxYearsCustom} onChange={e=>fld('taxYearsCustom',e.target.value)} placeholder="Or type custom years: 2019, 2020" style={{marginTop:5}}/>
            </div>
            <div className="field"><label>Notes</label><textarea value={form.notes} onChange={e=>fld('notes',e.target.value)}/></div>
            <div className="fg2">
              <div className="field"><label>Assigned Rep</label>
                <select value={form.assignedTo} onChange={e=>fld('assignedTo',e.target.value)}>
                  <option value="">Unassigned</option>
                  <option>Romy Cruz</option><option>Dana Richard</option><option>Yesenia Gonzalez</option>
                </select>
              </div>
              <div className="field"><label>Lead Status</label>
                <select value={form.status} onChange={e=>fld('status',e.target.value)}>
                  {STATUSES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{background:'var(--s3)',borderRadius:7,padding:10,marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:'var(--ok)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>💰 Tax Investigation Fee</div>
              <div className="fg2">
                <div className="field"><label>Fee Amount ($499–$699)</label>
                  <input type="number" value={form.taxFee} onChange={e=>fld('taxFee',e.target.value)} min={499} max={699} placeholder="599"/>
                </div>
                <div className="field"><label>Manager Override?</label>
                  <select value={form.taxFeeOverride} onChange={e=>fld('taxFeeOverride',e.target.value)}>
                    <option value="">No Override</option><option>Manager Approved</option>
                  </select>
                </div>
              </div>
            </div>
            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={save} disabled={saving}>
              {saving ? 'Saving...' : modal==='edit' ? 'Save Changes' : 'Add Lead'}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}


