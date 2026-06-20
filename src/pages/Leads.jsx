import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useFirm } from '../lib/useFirm'
import { generateClientPackage, generateAddendum, generatePOACoverLetter, sendFullPackage, generateCreditCardAuthForm } from '../lib/docUtils'
import BookingWidget from '../components/BookingWidget'
import IRSFormFiller from '../components/IRSFormFiller'
import ErrorBoundary from '../components/ErrorBoundary'
import ComplianceGrids from './ComplianceGrids'
import { ClientDocs } from './Clients'
import InPlaceCaller from '../components/InPlaceCaller'
import ChargeResolutionFeeModal from '../components/ChargeResolutionFeeModal'
import FinancialIntakeView from '../components/FinancialIntakeView'
import SendPaymentLinkModal from '../components/SendPaymentLinkModal'
import SavedCardsPanel from '../components/SavedCardsPanel'
import SplitPaymentModal from '../components/SplitPaymentModal'

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

// Setting a lead to either of these statuses means the lead is done —
// no more follow-up is coming. Auto-archive it so it drops out of the
// default working list, instead of relying on someone to remember to
// click Archive separately. Still fully reversible via Restore.
const AUTO_ARCHIVE_STATUSES = ['Dead', 'Do Not Contact']

const PIPELINE_STAGES = [
  { label:'Contacted',    key:'contacted', statusMap:'Contacted' },
  { label:'Consultation', key:'consult',   statusMap:'Consultation Completed' },
  { label:'Agr Signed',   key:'agreement', statusMap:'Tax Inv Agreement Signed' },
  { label:'Fee Paid',     key:'paid',      statusMap:'Tax Inv Fee Paid' },
  { label:'Tax Inv',      key:'taxinv',    statusMap:'Tax Investigation Active' },
  { label:'Addendum',     key:'addendum',  statusMap:'Addendum Signed' },
  { label:'Converted',    key:'client',    statusMap:'Converted to Client' },
]

function stagesDone(status) {
  const order = ['Contacted','Consultation Scheduled','Consultation Completed',
    'Tax Inv Agreement Sent','Tax Inv Agreement Signed','Tax Inv Fee Paid',
    'Tax Investigation Active','IRS Facts Received','Addendum Sent','Addendum Signed',
    'Resolution Fee Paid','Converted to Client']
  const idx = order.indexOf(status)
  return [idx>=0, idx>=2, idx>=4, idx>=5, idx>=6, idx>=9, idx>=11]
}

const YEARS  = Array.from({length:21},(_,i)=>2027-i)
const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

const BLANK = {
  clientType:'Individual', name:'', first:'', mi:'', last:'', phone:'', phone2:'', email:'',
  ssn:'', ein:'', dob:'',
  spouseName:'', spouseSsn:'', spouseDob:'', filingStatus:'Single',
  street:'', city:'', state:'', zip:'', county:'', source:'Referral',
  irsBalance:'', stateBalance:'', issueType:'OIC', irsOrState:'IRS Federal', taxYears:[],
  filingRequirements:[],
  irsStatus:'', irsStatusOther:'', irsDeadline:'',
  stateStatus:'', stateStatusOther:'', stateDeadline:'',
  taxYearsCustom:'', notes:'', assignedTo:'', status:'New Lead', taxFee:'', taxFeeOverride:''
}

const IRS_STATUS_OPTIONS = ['ACS','Notice Status','Queue for ACS','Currently Not Collectible','Installment Agreement','Garnishment','Levy Issued','Levied','Lien Filed','Appeals','Litigation','Released','Other']

function Bdg({s}) { return <span className={`bdg ${STATUS_C[s]||'bn'}`}>{s}</span> }

function TypeBdg({t}) {
  const m = {'OIC':'bb','Installment Agreement':'bg','CNC':'bn','Penalty Abatement':'bb','Appeals':'bn','Payroll Tax':'br','Audit':'br','Liens/Levies':'br'}
  return <span className={`bdg ${m[t]||'bn'}`}>{t}</span>
}


function ActionBtn({color, icon, label, sub, onClick}) {
  return (
    <div onClick={onClick} style={{
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      gap:4,padding:'10px 8px',borderRadius:10,cursor:'pointer',minWidth:80,flex:'1 1 80px',
      background:color,color:'#fff',textAlign:'center',userSelect:'none',
      transition:'transform .1s,opacity .1s',
    }}
      onMouseEnter={e=>{e.currentTarget.style.opacity='.85';e.currentTarget.style.transform='translateY(-2px)'}}
      onMouseLeave={e=>{e.currentTarget.style.opacity='1';e.currentTarget.style.transform=''}}
    >
      <span style={{fontSize:20}}>{icon}</span>
      <span style={{fontSize:11,fontWeight:700,lineHeight:1.2}}>{label}</span>
      {sub&&<span style={{fontSize:9,opacity:.85,lineHeight:1.1}}>{sub}</span>}
    </div>
  )
}

function LeadInlineFax({ lead, onClose }) {
  const [toNum,set0]=useState((lead?.phone||'').replace(/\D/g,''))
  const [subject,set1]=useState('')
  const [file,set2]=useState(null)
  const [sending,set3]=useState(false)
  async function send() {
    set3(true)
    const {data:s}=await supabase.from('settings').select('signalwire_backend,sw_inbound_did').limit(1).maybeSingle()
    let fileUrl=null
    if(file){const path='fax/'+Date.now()+'_'+file.name;await supabase.storage.from('documents').upload(path,file,{upsert:true});const{data:u}=supabase.storage.from('documents').getPublicUrl(path);fileUrl=u?.publicUrl}
    const toFull='+1'+toNum.slice(-10)
    const fromNum=s?.sw_inbound_did||''
    let sent=false
    if(s?.signalwire_backend){
      try{
        const res=await fetch(s.signalwire_backend+'/fax/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:toFull,from:fromNum,...(fileUrl?{media_url:fileUrl}:{})})})
        const d=await res.json()
        sent=res.ok&&d?.success
      }catch(e){}
    }
    await supabase.from('fax_logs').insert([{to_number:toFull,from_number:fromNum,client_name:lead?.name,subject,file_url:fileUrl,file_name:file?.name||null,status:sent?'Sent':(s?.signalwire_backend?'Failed':'Logged'),sent_at:new Date().toISOString(),created_at:new Date().toISOString()}])
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
  const [docType,set0]=useState('Tax Service Agreement')
  const [sendVia,setSendVia]=useState(lead?.email ? 'email' : 'sms')
  const [saving,set2]=useState(false)
  const [done,setDone]=useState(null)
  async function create() {
    set2(true)
    const{data,error}=await supabase.from('esigns').insert([{
      doc_type:docType,
      client_name:lead?.name,
      client_email:lead?.email||'',
      client_phone:lead?.phone||'',
      investigation_fee:lead?.taxFee||null,
      tax_years:lead?.taxYearsCustom||lead?.taxYears||null,
      rep_name:lead?.assignedTo||null,
      send_via:sendVia,
      priority:'Normal',status:'Awaiting',
      sent_at:new Date().toISOString(),created_at:new Date().toISOString()
    }]).select().single()
    if(error){set2(false);alert('Error: '+error.message);return}
    const url=window.location.origin+'/taxcasereview-CRM/sign/'+data.id
    await navigator.clipboard.writeText(url).catch(()=>{})
    let smsSent=false,emailSent=false
    const{data:cfg}=await supabase.from('settings').select('signalwire_backend').limit(1).maybeSingle()
    if((sendVia==='email'||sendVia==='both')&&lead?.email){
      try{
        const{error:eErr}=await supabase.functions.invoke('send-email',{body:{
          to:lead.email,
          subject:`Please Sign: ${docType} — Tax Case Review`,
          html:`<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px"><div style="font-size:18px;font-weight:800;color:#1d4ed8;margin-bottom:16px">Tax Case Review</div><p>Dear <strong>${lead.name}</strong>,</p><p>Please review and sign your <strong>${docType}</strong>.</p><p style="text-align:center;margin:24px 0"><a href="${url}" style="background:#16a34a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">Sign Document</a></p><p style="font-size:12px;color:#64748b">Link: ${url}</p><p style="font-size:11px;color:#94a3b8;margin-top:24px">Tax Case Review · 631 US Highway One Ste 304, North Palm Beach, FL 33408</p></div>`
        }})
        if(!eErr)emailSent=true
      }catch(e){console.error('Email error:',e)}
    }
    if((sendVia==='sms'||sendVia==='both')&&lead?.phone&&cfg?.signalwire_backend){
      try{
        const r=await fetch(cfg.signalwire_backend+'/sms/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:lead.phone,body:`Hi ${lead?.name}, Tax Case Review sent you a document to sign: ${url}`})})
        const d=await r.json();if(d.success)smsSent=true
      }catch(e){console.error('SMS error:',e)}
    }
    set2(false)
    const sent=[emailSent&&'email',smsSent&&'SMS'].filter(Boolean)
    setDone({url,sent})
  }
  if(done) return <div style={{padding:'0 4px 12px'}}>
    <div style={{background:'rgba(34,197,94,.08)',border:'1px solid rgba(34,197,94,.3)',borderRadius:8,padding:'12px 14px',marginBottom:14}}>
      <div style={{fontSize:13,fontWeight:700,color:'var(--ok)',marginBottom:6}}>{done.sent.length?`Sent via ${done.sent.join(' & ')}!`:'Link copied — share manually'}</div>
      {!done.sent.length&&<div style={{fontSize:11,color:'var(--warn)',marginBottom:4}}>Email/SMS not configured in Settings yet.</div>}
      <div style={{fontSize:11,color:'var(--t3)',wordBreak:'break-all'}}>{done.url}</div>
    </div>
    <button className="btn sec" style={{width:'100%',justifyContent:'center'}} onClick={onClose}>Done</button>
  </div>
  return <div style={{padding:'0 4px 4px'}}>
    <div className="field"><label>Document Type</label>
      <select value={docType} onChange={e=>set0(e.target.value)}>
        {['Tax Service Agreement','Form 2848 — Power of Attorney','Form 8821 — Tax Info Auth','Fee Agreement Addendum','Custom Document'].map(t=><option key={t}>{t}</option>)}
      </select>
    </div>
    <div style={{background:'var(--s2)',borderRadius:6,padding:'9px 12px',marginBottom:12,fontSize:12,color:'var(--t3)',lineHeight:1.7}}>
      <div>Email: {lead?.email||<span style={{color:'var(--warn)'}}>No email on file</span>}</div>
      <div>Phone: {lead?.phone||<span style={{color:'var(--warn)'}}>No phone on file</span>}</div>
    </div>
    <div className="field"><label>Send Via</label>
      <div style={{display:'flex',gap:8}}>
        {[['email','Email Only'],['sms','SMS Only'],['both','Both']].map(([v,l])=>(
          <button key={v} type="button"
            style={{flex:1,padding:'7px 4px',borderRadius:7,border:'1px solid',fontSize:12,fontWeight:600,cursor:'pointer',
              borderColor:sendVia===v?'var(--blue)':'var(--br)',
              background:sendVia===v?'var(--blue)22':'var(--s2)',
              color:sendVia===v?'var(--blue)':'var(--t2)'}}
            onClick={()=>setSendVia(v)}>{l}</button>
        ))}
      </div>
    </div>
    <div style={{display:'flex',gap:8,marginTop:4}}>
      <button className="btn sec" style={{flex:1,justifyContent:'center'}} onClick={onClose}>Cancel</button>
      <button className="btn sm" style={{flex:1,justifyContent:'center',background:'#7c3aed',color:'#fff',borderColor:'#7c3aed'}} onClick={create} disabled={saving}>{saving?'Sending...':'Send Request'}</button>
    </div>
  </div>
}

export default function Leads() {
  const { user } = useApp()
  const { id: urlLeadId } = useParams()
  const [searchParams] = useSearchParams()

  // Auto-open Add Lead modal when navigated here with ?new=1
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setForm(BLANK)
      setModal(true)
      setShowScript(true)
    }
  }, [searchParams])
  const navigate = useNavigate()
  const [leads, setLeads]   = useState([])
  const [filter, setFilter] = useState('All')
  const [showArchived, setShowArchived] = useState(false)
  const [modal, setModal]   = useState(false)
  const [showScript, setShowScript] = useState(false)
  const [bookingLead, setBookingLead] = useState(null)
  const [resolutionFeeLead, setResolutionFeeLead] = useState(null)
  const [fillerLead, setFillerLead] = useState(null)
  const [paymentLinkModal, setPaymentLinkModal] = useState(false)
  const [splitPaymentModal, setSplitPaymentModal] = useState(false)
  const [detail, setDetail] = useState(null)
  const [leadNotes, setLeadNotes]     = useState([])
  const [leadDetailTab, setLeadDetailTab] = useState('overview')
  const [newLeadNote, setNewLeadNote] = useState('')
  const [addingLeadNote, setAddingLeadNote] = useState(false)
  const [noteType, setNoteType]       = useState('Call')
  const [showAllNotes, setShowAllNotes] = useState(false)
  const [form, setForm]     = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [toast, setToast]   = useState('')
  const [converting, setConverting] = useState(false)
  const [pkgSending, setPkgSending] = useState(false)
  const [intakeSending, setIntakeSending] = useState(false)
  const [inlineFaxLead, setInlineFaxLead] = useState(null)
  const [showFaxModal, setShowFaxModal] = useState(false)
  const [inlineEsignLead, setInlineEsignLead] = useState(null)
  const [showEsignModal, setShowEsignModal] = useState(false)
  const [showFlow, setShowFlow]     = useState(false)
  const [leadDocCount, setLeadDocCount] = useState(0)

  useEffect(() => { load() }, [])

  // Save scroll position before refresh/navigation away, restore once the
  // lead loads back in — keyed to .page-content, the element that actually scrolls.
  useEffect(() => {
    if (!detail) return
    const key = `leadScroll_${detail.id}`
    const el = document.querySelector('.page-content')
    const saveScroll = () => { if (el) sessionStorage.setItem(key, String(el.scrollTop)) }
    window.addEventListener('beforeunload', saveScroll)
    window.addEventListener('pagehide', saveScroll)
    const saved = sessionStorage.getItem(key)
    if (saved) requestAnimationFrame(() => { if (el) el.scrollTop = parseInt(saved, 10) || 0 })
    return () => {
      saveScroll()
      window.removeEventListener('beforeunload', saveScroll)
      window.removeEventListener('pagehide', saveScroll)
    }
  }, [detail?.id])
  useEffect(() => {
    if (!detail) return
    supabase.from('documents').select('id', { count: 'exact', head: true }).eq('client', detail.name)
      .then(({ count }) => setLeadDocCount(count || 0))
  }, [detail?.id])
  // Fast path: same fix as Clients — don't make opening one lead wait on
  // the entire leads table downloading first.
  useEffect(() => {
    if (!urlLeadId || detail) return
    let cancelled = false
    supabase.from('leads').select('*').eq('id', urlLeadId).single().then(({ data }) => {
      if (!cancelled && data) setDetail(data)
    })
    return () => { cancelled = true }
  }, [urlLeadId])
  useEffect(() => {
    if (urlLeadId && leads.length > 0 && !detail) {
      const found = leads.find(l => String(l.id) === String(urlLeadId))
      if (found) setDetail(found)
    }
  }, [urlLeadId, leads])
  // If the URL no longer points at the lead currently being shown (e.g.
  // clicking "Leads" in the sidebar while a detail page is open), drop the
  // stale detail state so the page actually reflects the URL again.
  useEffect(() => {
    if (detail && String(detail.id) !== String(urlLeadId || '')) {
      setDetail(null)
    }
  }, [urlLeadId, detail])

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
      author: user?.user_metadata?.name || user?.email?.split('@')[0] || 'Staff',
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
  // Tab buttons swap content of different heights, which lets the browser
  // naturally clamp .page-content's scroll position toward the top. Capture
  // it before the switch and lock it back using a MutationObserver, which
  // reapplies on every DOM change rather than guessing fixed delays --
  // a fixed-timing reapply schedule wasn't reliably catching whatever
  // resets scroll (browser scroll anchoring, async content settling, or
  // both), so this reacts to actual content changes instead.
  function switchLeadTab(tab) {
    const el = document.querySelector('.page-content')
    const y = el ? el.scrollTop : 0
    setLeadDetailTab(tab)
    if (!el) return
    let active = true
    const reapply = () => { if (active) el.scrollTop = y }
    reapply()
    const observer = new MutationObserver(reapply)
    observer.observe(el, { childList: true, subtree: true, attributes: true })
    setTimeout(() => { active = false; observer.disconnect() }, 1000)
  }
  function composeName(first,mi,last) { return [first, mi?mi+'.':'', last].filter(Boolean).join(' ').replace(/\s+/g,' ').trim() }
  // For Individual leads the Full Name is derived automatically from First/MI/Last
  // as the rep types, so there's no separate name to re-type. Business leads keep
  // a dedicated Business Name field instead.
  function fldClientType(v) { setForm(f=>({...f, clientType:v, name: v==='Individual' ? composeName(f.first,f.mi,f.last) : f.name })) }
  function fldFirst(v) { setForm(f=>({...f, first:v, name: f.clientType==='Individual' ? composeName(v,f.mi,f.last) : f.name })) }
  function fldMi(v)    { setForm(f=>({...f, mi:v,    name: f.clientType==='Individual' ? composeName(f.first,v,f.last) : f.name })) }
  function fldLast(v)  { setForm(f=>({...f, last:v,  name: f.clientType==='Individual' ? composeName(f.first,f.mi,v) : f.name })) }
  function toggleYear(y) { setForm(f=>({...f, taxYears: f.taxYears.includes(y)?f.taxYears.filter(x=>x!==y):[...f.taxYears,y]})) }

  const filtered = leads
    .filter(l => showArchived ? !!l.archived : !l.archived)
    .filter(l => filter === 'All' || l.status === filter)

  async function save() {
    if (!form.name.trim()) { showToast('Name is required'); return }
    setSaving(true)
    let payload = { ...form, taxYears: JSON.stringify(form.taxYears), filingRequirements: JSON.stringify(form.filingRequirements||[]) }
    // Empty-string values blow up non-text columns (date, numeric) with
    // "invalid input syntax" — Postgres wants null for "no value", not ''.
    Object.keys(payload).forEach(k => { if (payload[k] === '') payload[k] = null })
    let error
    let oldName = null
    if (modal === 'edit') {
      const { id, created_at, ...rest } = payload
      payload = rest
      oldName = detail?.name
    } else {
      payload.created_at = new Date().toISOString()
    }
    // Self-healing save: if Postgres/PostgREST reports an unknown column,
    // strip it and retry so one missing field doesn't block the whole save.
    const skipped = []
    for (let attempt = 0; attempt < 12; attempt++) {
      if (modal === 'edit') {
        ;({ error } = await supabase.from('leads').update(payload).eq('id', form.id))
      } else {
        ;({ error } = await supabase.from('leads').insert([payload]))
      }
      if (!error) break
      const match = error.message?.match(/column ['"]?(\w+)['"]? (of relation .* )?does not exist/i)
        || error.message?.match(/Could not find the '(\w+)' column/i)
      if (match && match[1] in payload) {
        const { [match[1]]: _, ...rest } = payload
        payload = rest
        skipped.push(match[1])
        continue
      }
      break
    }
    setSaving(false)
    if (error) { showToast('Error: '+error.message); return }
    if (skipped.length) showToast(`✅ Saved — but these fields aren't set up in the database yet and were skipped: ${skipped.join(', ')}`)
    // If the name changed, repoint any compliance records gathered under the old name
    // so they don't get orphaned (compliance is stored keyed by client_name text).
    if (oldName && oldName !== form.name) {
      await supabase.from('client_compliance_records').update({ client_name: form.name }).eq('client_name', oldName)
    }
    if (!skipped.length) showToast(modal==='edit' ? '✅ Lead updated!' : '✅ Lead added!')
    setModal(false); setForm(BLANK); load()
    if (modal==='edit' && detail) {
      const { data } = await supabase.from('leads').select('*').eq('id', form.id).single()
      if (data) setDetail(data)
    }
  }

  // Leads are archived, never permanently deleted — this hides them from the
  // active list but keeps every field, note, and document intact.
  async function archiveLead(l) {
    if (!window.confirm(`Archive ${l.name}? This hides it from the active list — nothing is deleted, and you can restore it anytime from the Archived view.`)) return
    const { error } = await supabase.from('leads').update({ archived: true }).eq('id', l.id)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('Lead archived'); setDetail(null); load()
  }

  async function restoreLead(l) {
    const { error } = await supabase.from('leads').update({ archived: false }).eq('id', l.id)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('Lead restored'); load()
  }

  async function updateStatus(l, status) {
    if (status === l.status) return
    const prevStatus = l.status || 'New Lead'
    const willArchive = AUTO_ARCHIVE_STATUSES.includes(status) && !l.archived
    const willRestore = !AUTO_ARCHIVE_STATUSES.includes(status) && AUTO_ARCHIVE_STATUSES.includes(prevStatus) && l.archived
    const payload = { status }
    if (willArchive) payload.archived = true
    if (willRestore) payload.archived = false
    const { error } = await supabase.from('leads').update(payload).eq('id', l.id)
    if (error) { showToast('Error: ' + error.message); return }
    const actor = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Staff'
    const noteText = willArchive
      ? `📊 Status changed: ${prevStatus} → ${status} (auto-archived)`
      : willRestore
        ? `📊 Status changed: ${prevStatus} → ${status} (auto-restored from archive)`
        : `📊 Status changed: ${prevStatus} → ${status}`
    await supabase.from('lead_notes').insert([{
      lead_id: l.id, lead_name: l.name,
      text: noteText,
      type: 'System', author: actor, created_at: new Date().toISOString()
    }])
    showToast(willArchive ? 'Status updated — lead archived' : willRestore ? 'Status updated — lead restored' : 'Status updated!')
    load()
    if (detail?.id === l.id) loadLeadNotes(l.id)
  }

  async function sendFinancialIntake(l) {
    if (!l.email) { showToast('No email on file for this lead'); return }
    setIntakeSending(true)
    let intakeId
    const { data: existing } = await supabase.from('financial_intake_responses')
      .select('id').eq('client_name', l.name).order('created_at',{ascending:false}).limit(1).maybeSingle()
    if (existing) {
      intakeId = existing.id
    } else {
      const { data: created, error: createErr } = await supabase.from('financial_intake_responses').insert([{
        client_name: l.name, client_email: l.email || '', status: 'Sent',
        answers: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }]).select().single()
      if (createErr) { setIntakeSending(false); showToast('Error: '+createErr.message); return }
      intakeId = created.id
    }
    const intakeUrl = window.location.origin + '/taxcasereview-CRM/financial-intake/' + intakeId
    const { error: emailErr } = await supabase.functions.invoke('send-email', {
      body: {
        to: l.email,
        subject: `Your Financial Intake Form — Tax Case Review`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px"><div style="font-size:18px;font-weight:800;color:#1d4ed8;margin-bottom:16px">Tax Case Review</div><p>Dear <strong>${l.name}</strong>,</p><p>Here's your link to fill out (or finish) your financial intake form — it takes about 10-15 minutes and your progress saves automatically.</p><p style="text-align:center;margin:24px 0"><a href="${intakeUrl}" style="background:#1d4ed8;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">Start My Financial Intake</a></p><p style="font-size:12px;color:#64748b">Link: ${intakeUrl}</p><p style="font-size:11px;color:#94a3b8;margin-top:24px">Tax Case Review · 631 US Highway One Ste 304, North Palm Beach, FL 33408</p></div>`
      }
    })
    setIntakeSending(false)
    if (emailErr) { showToast('Error sending email: '+emailErr.message); return }
    showToast('✅ Financial Intake link sent to '+l.email)
  }

  async function handleSendFullPackage(l) {
    if (!l.email && !l.phone) { showToast('Lead needs an email or phone to send the package.'); return }
    setPkgSending(true)
    const res = await sendFullPackage({...l, address:l.street, business_name:l.name}, supabase)
    if (res.error) { setPkgSending(false); showToast('Error: '+res.error); return }

    const url = res.url
    await navigator.clipboard.writeText(url).catch(()=>{})
    let smsSent=false,emailSent=false
    const{data:cfg}=await supabase.from('settings').select('signalwire_backend').limit(1).maybeSingle()

    if(l.email){
      try{
        const{error:eErr}=await supabase.functions.invoke('send-email',{body:{
          to:l.email,
          subject:`Action Required: Sign Your Tax Investigation Package — Tax Case Review`,
          html:`<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px"><div style="text-align:center;margin-bottom:24px"><div style="font-size:20px;font-weight:800;color:#1d4ed8">Tax Case Review</div></div><p>Dear <strong>${l.name}</strong>,</p><p>Your Tax Investigation Package is ready for review and signature. This package includes your Tax Service Agreement and IRS authorization forms (Form 2848 / Form 8821).</p><p style="text-align:center;margin:28px 0"><a href="${url}" style="background:#16a34a;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block">Review &amp; Sign Package</a></p><p style="font-size:12px;color:#64748b">Or copy this link: ${url}</p><hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/><p style="font-size:11px;color:#94a3b8;text-align:center">Tax Case Review · 631 US Highway One Ste 304, North Palm Beach, FL 33408</p></div>`
        }})
        if(!eErr)emailSent=true
      }catch(e){console.error('Email error:',e)}
    }
    if(l.phone&&cfg?.signalwire_backend){
      try{
        const r=await fetch(cfg.signalwire_backend+'/sms/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:l.phone,body:`Hi ${l.name}, Tax Case Review sent you a Tax Investigation Package to review and sign: ${url}`})})
        const d=await r.json();if(d.success)smsSent=true
      }catch(e){console.error('SMS error:',e)}
    }

    setPkgSending(false)
    const sent=[emailSent&&`email to ${l.email}`,smsSent&&`SMS to ${l.phone}`].filter(Boolean)
    showToast(sent.length?`Package sent via ${sent.join(' & ')}!`:'Package created — link copied (configure email/SMS in Settings to auto-send).')
    await supabase.from('leads').update({status:'Tax Inv Agreement Sent'}).eq('id',l.id)
    load()
  }

  async function convertToClient(l, skipConfirm) {
    if (!skipConfirm && !confirm(`Convert "${l.name}" to a full client?`)) return
    setConverting(true)
    const taxYearsStr = l.taxYearsCustom || (()=>{try{return JSON.parse(l.taxYears||'[]').join(', ')}catch{return l.taxYears||''}})()
    const { error } = await supabase.from('clients').insert([{
      name: l.name, clientType: l.clientType || 'Individual',
      first: l.first, mi: l.mi, last: l.last,
      phone: l.phone, phone2: l.phone2, email: l.email,
      ssn: l.ssn, ein: l.ein, dob: l.dob,
      spouseName: l.spouseName, spouseSsn: l.spouseSsn, spouseDob: l.spouseDob, filingStatus: l.filingStatus,
      stripe_customer_id: l.stripe_customer_id,
      default_payment_method_id: l.default_payment_method_id,
      payment_method_type: l.payment_method_type,
      payment_method_brand: l.payment_method_brand,
      payment_method_last4: l.payment_method_last4,
      street: l.street, city: l.city, state: l.state, zip: l.zip, county: l.county,
      source: l.source, assignedTo: l.assignedTo,
      irsBalance: l.irsBalance, stateBalance: l.stateBalance, issueType: l.issueType, irsOrState: l.irsOrState,
      irsStatus: l.irsStatus, irsStatusOther: l.irsStatusOther, irsDeadline: l.irsDeadline,
      stateStatus: l.stateStatus, stateStatusOther: l.stateStatusOther, stateDeadline: l.stateDeadline,
      filingRequirements: l.filingRequirements,
      taxYears: taxYearsStr,
      notes: l.notes, status: 'Active',
      clientSince: new Date().toISOString().slice(0,10),
      created_at: new Date().toISOString()
    }])
    if (error) { showToast('Error: '+error.message); setConverting(false); return }
    // Update lead status
    await supabase.from('leads').update({ status: 'Converted to Client' }).eq('id', l.id)
    // Carry lead notes over to the new client record so case history isn't lost
    const { data: oldNotes } = await supabase.from('lead_notes').select('*').eq('lead_id', l.id)
    if (oldNotes && oldNotes.length) {
      await supabase.from('client_notes').insert(
        oldNotes.map(n => ({ client_name: l.name, content: n.text, created_by: n.author || 'Staff', created_at: n.created_at }))
      )
    }
    // Auto-create the 3 onboarding tasks now that contracts are signed
    const today = new Date()
    const addDays = n => { const d = new Date(today); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10) }
    await supabase.from('tasks').insert([
      { title: `Email IRS POA — ${l.name}`,        clientName: l.name, priority: 'High', dueDate: addDays(0), done: false, created_at: new Date().toISOString() },
      { title: `Call IRS — ${l.name}`,             clientName: l.name, priority: 'High', dueDate: addDays(1), done: false, created_at: new Date().toISOString() },
      { title: `Schedule TaxCase Review call — ${l.name}`, clientName: l.name, priority: 'Normal', dueDate: addDays(3), done: false, created_at: new Date().toISOString() },
    ])
    // Carry over the lead's financial intake instead of always creating a
    // fresh blank one. The client page shows whichever row is most recent
    // for this name -- inserting a new empty row here unconditionally was
    // burying any answers the lead had already submitted while still a
    // lead, since the new blank row would always be "more recent" than
    // their real submission. Now: if one already exists for this lead
    // (sent or submitted), leave it alone and skip the email if they've
    // already submitted it. Only create + send a fresh one if they never
    // had one at all.
    let intakeSent = false
    let intakeAlreadySubmitted = false
    try {
      const { data: existingIntake } = await supabase.from('financial_intake_responses')
        .select('id, status').eq('client_name', l.name).order('created_at', { ascending: false }).limit(1).maybeSingle()

      if (existingIntake) {
        // Already has one (sent or submitted while a lead) -- leave it as
        // the carried-over record. Don't re-send the email if they've
        // already submitted; that would be a confusing "fill this out"
        // nudge for something they already finished.
        if (existingIntake.status === 'Submitted') {
          intakeAlreadySubmitted = true
        } else if (l.email) {
          const intakeUrl = window.location.origin + '/taxcasereview-CRM/financial-intake/' + existingIntake.id
          const { error: emailErr } = await supabase.functions.invoke('send-email', {
            body: {
              to: l.email,
              subject: `Your Financial Intake Form — Tax Case Review`,
              html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px"><div style="font-size:18px;font-weight:800;color:#1d4ed8;margin-bottom:16px">Tax Case Review</div><p>Dear <strong>${l.name}</strong>,</p><p>Welcome aboard! To get your case moving, please finish your financial intake form — it gives your advisor the full picture needed to put together your resolution plan. Your progress is saved.</p><p style="text-align:center;margin:24px 0"><a href="${intakeUrl}" style="background:#1d4ed8;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">Finish My Financial Intake</a></p><p style="font-size:12px;color:#64748b">Link: ${intakeUrl}</p><p style="font-size:11px;color:#94a3b8;margin-top:24px">Tax Case Review · 631 US Highway One Ste 304, North Palm Beach, FL 33408</p></div>`
            }
          })
          if (!emailErr) intakeSent = true
        }
      } else {
        const { data: intakeRec, error: intakeErr } = await supabase.from('financial_intake_responses').insert([{
          client_name: l.name, client_email: l.email || '', status: 'Sent',
          answers: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }]).select().single()
        if (!intakeErr && intakeRec) {
          const intakeUrl = window.location.origin + '/taxcasereview-CRM/financial-intake/' + intakeRec.id
          if (l.email) {
            const { error: emailErr } = await supabase.functions.invoke('send-email', {
              body: {
                to: l.email,
                subject: `Your Financial Intake Form — Tax Case Review`,
                html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px"><div style="font-size:18px;font-weight:800;color:#1d4ed8;margin-bottom:16px">Tax Case Review</div><p>Dear <strong>${l.name}</strong>,</p><p>Welcome aboard! To get your case moving, please fill out this short financial intake form — it gives your advisor the full picture needed to put together your resolution plan. It takes about 10-15 minutes and your progress saves automatically.</p><p style="text-align:center;margin:24px 0"><a href="${intakeUrl}" style="background:#1d4ed8;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">Start My Financial Intake</a></p><p style="font-size:12px;color:#64748b">Link: ${intakeUrl}</p><p style="font-size:11px;color:#94a3b8;margin-top:24px">Tax Case Review · 631 US Highway One Ste 304, North Palm Beach, FL 33408</p></div>`
              }
            })
            if (!emailErr) intakeSent = true
          }
        }
      }
    } catch (e) { console.error('Financial intake carry-over/auto-send error:', e) }
    setConverting(false)
    const { count } = await supabase.from('client_compliance_records').select('*', { count: 'exact', head: true }).eq('client_name', l.name)
    const intakeMsg = intakeAlreadySubmitted ? ', financial intake already on file'
      : intakeSent ? ', financial intake form emailed'
      : (l.email ? '' : ', financial intake created but no email on file to send it to')
    showToast(count ? `✅ ${l.name} converted to Client! 3 onboarding tasks created${intakeMsg}, compliance data (${count} records) carried over.` : `✅ ${l.name} converted to Client! 3 onboarding tasks created${intakeMsg}.`)
    setDetail(null); load()
  }

  // ── Detail View ──
  const editLeadModal = modal && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal" style={{width:showScript&&modal!=='edit'?1080:640,maxWidth:'98vw',maxHeight:'90vh',display:'flex',flexDirection:'row',gap:0,padding:0,overflow:'hidden'}}>
            <div style={{flex:1,minWidth:0,padding:20,display:'flex',flexDirection:'column',overflowY:'auto',maxHeight:'90vh'}}>
            <div className="mh" style={{display:'flex',alignItems:'center',gap:8}}>
              <span className="mt">{modal==='edit'?'Edit Lead':'Add Lead'}</span>
              {modal!=='edit'&&(
                <button
                  onClick={()=>setShowScript(s=>!s)}
                  style={{marginLeft:'auto',marginRight:8,padding:'4px 10px',fontSize:11,fontWeight:700,
                    background:showScript?'#1e3a5f':'var(--s3)',color:showScript?'#60a5fa':'var(--t2)',
                    border:'1px solid '+(showScript?'#3b82f6':'var(--br)'),borderRadius:6,cursor:'pointer'}}>
                  📞 {showScript?'Hide Script':'Call Script'}
                </button>
              )}
              <button className="xbtn" onClick={()=>{setModal(false);setShowScript(false)}}>&times;</button>
            </div>

            <div className="fg2">
              <div className="field"><label>Client Type</label>
                <select value={form.clientType} onChange={e=>fldClientType(e.target.value)}>
                  <option>Individual</option><option>Business</option><option>Individual &amp; Biz</option>
                </select>
              </div>
              {form.clientType !== 'Individual' && (
                <div className="field"><label>Business Name *</label>
                  <input value={form.name} onChange={e=>fld('name',e.target.value)} placeholder="Business Name"/>
                </div>
              )}
            </div>
            <div className="fg3">
              <div className="field"><label>First Name{form.clientType==='Individual'?' *':''}</label><input value={form.first} onChange={e=>fldFirst(e.target.value)}/></div>
              <div className="field"><label>MI</label><input value={form.mi} onChange={e=>fldMi(e.target.value)} maxLength={1}/></div>
              <div className="field"><label>Last Name{form.clientType==='Individual'?' *':''}</label><input value={form.last} onChange={e=>fldLast(e.target.value)}/></div>
            </div>
            <div className="fg2">
              <div className="field"><label>Phone</label><input value={form.phone} onChange={e=>fld('phone',e.target.value)} placeholder="(305) 555-0000"/></div>
              <div className="field"><label>Phone 2 <span style={{color:'var(--t3)',fontWeight:400}}>(optional)</span></label><input value={form.phone2||''} onChange={e=>fld('phone2',e.target.value)} placeholder="(305) 555-0000"/></div>
              <div className="field"><label>Email</label><input value={form.email} onChange={e=>fld('email',e.target.value)}/></div>
            </div>
            <div className="fg3">
              <div className="field"><label>SSN</label><input value={form.ssn} onChange={e=>fld('ssn',e.target.value)} placeholder="XXX-XX-XXXX" maxLength={11}/></div>
              <div className="field"><label>EIN (if business)</label><input value={form.ein||''} onChange={e=>fld('ein',e.target.value)} placeholder="XX-XXXXXXX"/></div>
              <div className="field"><label>Date of Birth</label><input type="date" value={form.dob} onChange={e=>fld('dob',e.target.value)}/></div>
            </div>

            {/* Spouse */}
            <div style={{background:'var(--s3)',borderRadius:8,padding:12,marginBottom:10}}>
              <div style={{fontWeight:700,fontSize:12,marginBottom:8}}>👥 Spouse / Partner</div>
              <div className="fg2">
                <div className="field"><label>Spouse Full Name</label><input value={form.spouseName||''} onChange={e=>fld('spouseName',e.target.value)}/></div>
                <div className="field"><label>Spouse SSN</label><input value={form.spouseSsn||''} onChange={e=>fld('spouseSsn',e.target.value)} placeholder="XXX-XX-XXXX" maxLength={11}/></div>
              </div>
              <div className="fg2">
                <div className="field"><label>Spouse Date of Birth</label><input type="date" value={form.spouseDob||''} onChange={e=>fld('spouseDob',e.target.value)}/></div>
                <div className="field"><label>Filing Status</label>
                  <select value={form.filingStatus||'Single'} onChange={e=>fld('filingStatus',e.target.value)}>
                    {['Single','Married Filing Jointly','Married Filing Separately','Head of Household','Qualifying Widow(er)'].map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>
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
            {(form.irsOrState||'IRS Federal')!=='IRS Federal' && (
              <div className="field"><label>Est. State Balance</label>
                <select value={form.stateBalance||''} onChange={e=>fld('stateBalance',e.target.value)}>
                  <option value="">Unknown</option>
                  {['Under $10,000','$10,000 - $20,000','$20,000 - $30,000','$30,000 - $50,000','$50,000 - $100,000','$100,000 - $250,000','Over $250,000'].map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
            )}
            <div className="fg2">
              <div className="field"><label>Issue Type</label>
                <select value={form.issueType} onChange={e=>fld('issueType',e.target.value)}>
                  {['OIC','Installment Agreement','CNC','Penalty Abatement','Lien Withdrawal','TFRP','Payroll Tax','Unfiled Returns','Appeals','Audit','Liens/Levies','Tax Investigation','ACS','Notice Status','Other'].map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
              <div className="field"><label>IRS or State?</label>
                <select value={form.irsOrState} onChange={e=>fld('irsOrState',e.target.value)}>
                  <option>IRS Federal</option><option>State</option><option>Both IRS + State</option>
                </select>
              </div>
            </div>
            {(form.irsOrState||'IRS Federal')!=='State' && (
              <div className="fg2">
                <div className="field"><label>IRS Status</label>
                  <select value={form.irsStatus||''} onChange={e=>fld('irsStatus',e.target.value)}>
                    <option value="">— Select —</option>
                    {IRS_STATUS_OPTIONS.map(o=><option key={o}>{o}</option>)}
                  </select>
                  {form.irsStatus==='Other'&&<input style={{marginTop:6}} value={form.irsStatusOther||''} onChange={e=>fld('irsStatusOther',e.target.value)} placeholder="Specify status"/>}
                </div>
                <div className="field"><label>IRS Deadline</label><input type="date" value={form.irsDeadline||''} onChange={e=>fld('irsDeadline',e.target.value)}/></div>
              </div>
            )}
            {(form.irsOrState||'IRS Federal')!=='IRS Federal' && (
              <div className="fg2">
                <div className="field"><label>State Status</label>
                  <select value={form.stateStatus||''} onChange={e=>fld('stateStatus',e.target.value)}>
                    <option value="">— Select —</option>
                    {IRS_STATUS_OPTIONS.map(o=><option key={o}>{o}</option>)}
                  </select>
                  {form.stateStatus==='Other'&&<input style={{marginTop:6}} value={form.stateStatusOther||''} onChange={e=>fld('stateStatusOther',e.target.value)} placeholder="Specify status"/>}
                </div>
                <div className="field"><label>State Deadline</label><input type="date" value={form.stateDeadline||''} onChange={e=>fld('stateDeadline',e.target.value)}/></div>
              </div>
            )}
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
            <div className="field">
              <label>Filing Requirements</label>
              <div style={{display:'flex',gap:14,flexWrap:'wrap',padding:'6px 0'}}>
                {['1040','1120','1065','1120S','940','941'].map(ft=>(
                  <label key={ft} style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:13,cursor:'pointer'}}>
                    <input type="checkbox" style={{width:'auto'}}
                      checked={(form.filingRequirements||[]).includes(ft)}
                      onChange={()=>fld('filingRequirements', (form.filingRequirements||[]).includes(ft)
                        ? form.filingRequirements.filter(x=>x!==ft)
                        : [...(form.filingRequirements||[]),ft])}/>
                    {ft}
                  </label>
                ))}
              </div>
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
                <div className="field"><label>Fee Amount ($399–$599)</label>
                  <input type="number" value={form.taxFee} onChange={e=>fld('taxFee',e.target.value)} min={399} max={599} placeholder="399"/>
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
            </div>{/* end form column */}

            {/* ── Inbound Call Script Panel ───────────────────── */}
            {showScript&&modal!=='edit'&&(
              <div style={{width:440,flexShrink:0,background:'#071120',borderLeft:'2px solid #1e40af',
                overflowY:'auto',padding:'20px',display:'flex',flexDirection:'column',gap:14}}>
                <div style={{fontSize:17,fontWeight:900,color:'#60a5fa',letterSpacing:'.05em',
                  borderBottom:'1px solid #1e3a5f',paddingBottom:10,marginBottom:2}}>
                  📞 INBOUND CALL SCRIPT
                </div>
                {[
                  {step:'1',color:'#3b82f6',title:'Greeting',lines:[
                    '"Thank you for calling Tax Case Review, this is [Name] — how can I help you today?"',
                    'Be warm and confident. Let them speak first. Do not rush.',
                  ]},
                  {step:'2',color:'#8b5cf6',title:'Get the Story',lines:[
                    '"Can you tell me a little about your situation? How many tax years are we looking at?"',
                    '"Have you received any IRS letters or notices?"',
                    'Listen fully — do not interrupt. Write down years, IRS vs State.',
                  ]},
                  {step:'3',color:'#f59e0b',title:'Qualify the Balance',lines:[
                    '"Do you have a rough idea of what you owe?"',
                    'Under $10K → may not qualify for major programs.',
                    '$10K–$50K → strong candidate. $50K+ → high priority.',
                  ]},
                  {step:'4',color:'#ef4444',title:'Create Urgency',lines:[
                    '"The IRS does not wait. Every day this goes unresolved, interest and penalties are stacking up."',
                    '"They can file a lien, levy your bank, or garnish your wages — often with very little warning."',
                    'State facts calmly. Real urgency, not scare tactics.',
                  ]},
                  {step:'5',color:'#10b981',title:'Introduce Tax Investigation',lines:[
                    '"The first thing we do is a Tax Investigation — we pull your IRS transcripts and give you the full picture: what you owe, what years, and exactly what your options are."',
                    '"Our Tax Investigation fee starts at $399 and goes up to $599 depending on complexity. That gets you a complete analysis and a clear resolution plan."',
                    'Frame it as the only logical next step — not a sales pitch.',
                  ]},
                  {step:'6',color:'#f97316',title:'Handle Objections',lines:[
                    'PRICE: "I understand — starting at $399 is a fraction of what the IRS can take. Without knowing your real position, you are flying blind."',
                    'NEED TO THINK: "Totally fair. What specific questions can I answer for you right now?"',
                    'HAVE SOMEONE: "Great — are they pulling your IRS transcripts? That is the only way to truly know what you are dealing with."',
                    'DOING IT MYSELF: "You can — but the IRS has deadlines and rules most people do not know about. One missed step can permanently close your options."',
                  ]},
                  {step:'7',color:'#6366f1',title:'Collect Their Info',lines:[
                    '"Let me get your information so we can get this started right away."',
                    'Full name · phone · email · address · years owed · IRS or State · rough balance.',
                    'Fill the form on the LEFT as you talk — do not wait until the end.',
                  ]},
                  {step:'8',color:'#22c55e',title:'Close & Confirm',lines:[
                    '"Perfect — I have everything I need. Our team will review this and reach out within 24 hours."',
                    '"We are going to get this taken care of for you."',
                    'End with confidence and a clear commitment. No vague language.',
                  ]},
                ].map(s=>(
                  <div key={s.step} style={{background:'#0c1e35',border:`1px solid ${s.color}55`,
                    borderLeft:`4px solid ${s.color}`,borderRadius:8,padding:'14px 16px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                      <div style={{width:28,height:28,borderRadius:'50%',background:s.color,color:'#fff',
                        display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:900,flexShrink:0}}>
                        {s.step}
                      </div>
                      <div style={{fontSize:15,fontWeight:800,color:s.color}}>{s.title}</div>
                    </div>
                    {s.lines.map((line,i)=>(
                      <div key={i} style={{
                        fontSize:13.5,lineHeight:1.7,
                        marginBottom: i<s.lines.length-1 ? 6 : 0,
                        color: line.startsWith('"') ? '#e2e8f0' : '#7dd3fc',
                        fontStyle: line.startsWith('"') ? 'normal' : 'italic',
                      }}>{line}</div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>{/* end modal flex row */}
        </div>
      )

  if (detail) {
    const l = detail
    const done = stagesDone(l.status)
    const taxYearsList = (() => { try { return JSON.parse(l.taxYears||'[]').join(', ') } catch { return l.taxYearsCustom||'—' } })()

    return (
      <div style={{maxWidth:960,margin:'0 auto'}}>
        {toast && <div className="toast show">{toast}</div>}

        {/* Top bar — matches clients page */}
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,flexWrap:'wrap'}}>
          <button className="btn" style={{padding:'8px 16px',fontSize:13,fontWeight:600}} onClick={()=>{ setDetail(null); navigate('/leads',{replace:true}); document.querySelector('.page-content')?.scrollTo(0,0) }}>← Back</button>
          {(l.status !== 'Converted to Client' || user?.role === 'Admin' || user?.role === 'Manager') ? (
            <button className="btn pri" style={{marginLeft:'auto',padding:'8px 18px',fontSize:13,fontWeight:700}} onClick={()=>{setForm({...BLANK,...l,taxYears:(() => {try{return JSON.parse(l.taxYears||'[]')}catch{return []}})(),filingRequirements:(() => {try{return JSON.parse(l.filingRequirements||'[]')}catch{return []}})()});setModal('edit')}}>✏️ Edit</button>
          ) : (
            <span style={{marginLeft:'auto',fontSize:11,color:'var(--t3)',padding:'8px 12px',background:'var(--s2)',borderRadius:6}}>🔒 Admin Only</span>
          )}
          <button className="btn ok" style={{padding:'8px 18px',fontSize:13,fontWeight:700}} onClick={()=>convertToClient(l)} disabled={converting}>{converting?'Converting…':'✓ Convert to Client'}</button>
          {l.archived ? (
            <button className="btn" style={{padding:'8px 18px',fontSize:13,fontWeight:700}} onClick={()=>restoreLead(l)}>↩ Restore</button>
          ) : (
            <button className="btn del" style={{padding:'8px 18px',fontSize:13,fontWeight:700}} onClick={()=>archiveLead(l)}>🗑 Archive</button>
          )}
        </div>

        {/* Header card — matches clients */}
        <div className="card" style={{marginBottom:12}}>
          <div style={{display:'flex',alignItems:'center',gap:16,padding:'4px 0 8px',flexWrap:'wrap'}}>
            <div style={{width:56,height:56,borderRadius:'50%',background:'var(--blue)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:22,color:'#fff',flexShrink:0}}>
              {(l.name||'?')[0].toUpperCase()}
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:22,fontWeight:800}}>{l.name}</div>
              <div style={{display:'flex',gap:6,marginTop:5,flexWrap:'wrap'}}>
                <span className="bdg bb">{l.clientType||'Individual'}</span>
                <Bdg s={l.status||'New Lead'}/>
                {l.irsOrState && <span className="bdg ba">{l.irsOrState}</span>}
                {l.issueType  && <TypeBdg t={l.issueType}/>}
                {l.taxFee     && <span className="bdg bg">Tax Inv Fee: ${l.taxFee}</span>}
              </div>
            </div>
          </div>

          {/* Pipeline — clickable chips like clients */}
          <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid var(--br)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em'}}>Pipeline</div>
              <button className="btn sec" style={{padding:'2px 8px',fontSize:10}} onClick={()=>setShowFlow(true)}>📊 View Flow</button>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:0,overflowX:'auto',paddingBottom:4}}>
              {PIPELINE_STAGES.map((stage,i) => (
                <div key={stage.key} style={{display:'flex',alignItems:'center'}}>
                  <div style={{
                    padding:'5px 10px',borderRadius:20,fontSize:11,fontWeight:600,cursor:'pointer',
                    whiteSpace:'nowrap',
                    background:done[i]?'var(--ok)':'var(--s3)',
                    color:done[i]?'#fff':'var(--t3)',
                    border:done[i]&&i===done.lastIndexOf(true)?'2px solid var(--ok)':'2px solid transparent',
                    transition:'all .15s'
                  }} onClick={()=>updateStatus(l, stage.statusMap || stage.label)}>
                    {stage.label}
                  </div>
                  {i < PIPELINE_STAGES.length-1 && <div style={{width:16,height:2,background:done[i]?'var(--ok)':'var(--br)',flexShrink:0}}/>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Actions — matches clients ActionBtn style */}
        <div className="card" style={{marginBottom:12}}>
          <div style={{fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Quick Actions</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <ActionBtn color="#16a34a" icon="📦" label={pkgSending?'Building…':'Full Package'} sub="2848/8821 + Agreement" onClick={()=>!pkgSending&&handleSendFullPackage(l)}/>
            <ActionBtn color="#22863a" icon="📄" label="Tax Engagement" sub="Service Agreement" onClick={()=>generateClientPackage(l)}/>
            <ActionBtn color="#0369a1" icon="🖋️" label="Pre-Fill 8821/2848" sub="IRS PDF Forms" onClick={()=>{
              try {
                if (!l) { showToast('Error: no lead data found'); return }
                setFillerLead({...l, address:l.street, business_name:l.name})
              } catch (err) { showToast('Error opening form: ' + err.message) }
            }}/>
            <ActionBtn color="#0891b2" icon="📅" label="Schedule" sub="Book Appointment" onClick={()=>setBookingLead(l)}/>
            <ActionBtn color="#d97706" icon="📝" label="Addendum" sub="After IRS facts" onClick={()=>generateAddendum(l)}/>
            {l.status==='Addendum Signed' && (
              <ActionBtn color="#059669" icon="💰" label="Charge Resolution Fee" sub="& Convert to Client" onClick={()=>setResolutionFeeLead(l)}/>
            )}

            <ActionBtn color="#dc2626" icon="📠" label="Send Fax" sub="SignalWire Fax" onClick={()=>{setInlineFaxLead(l);setShowFaxModal(true)}}/>
            <ActionBtn color="#7c3aed" icon="✍️" label="E-Signature" sub="Request Sign" onClick={()=>{setInlineEsignLead(l);setShowEsignModal(true)}}/>

            <ActionBtn color="#1d4ed8" icon="📊" label={intakeSending?'Sending…':'Financial Intake'} sub="Send / Resend Link" onClick={()=>!intakeSending&&sendFinancialIntake(l)}/>
          </div>
        </div>

        {/* Update Status */}
        <div className="card" style={{marginBottom:12}}>
          <div style={{fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Update Status</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {STATUSES.map(st => (
              <span key={st} className={`chip${l.status===st?' on':''}`} onClick={()=>updateStatus(l, st)} style={{fontSize:11}}>{st}</span>
            ))}
          </div>
        </div>

        {/* Overview / Notes / Documents — tabbed, matching the Clients detail page style */}
        <div className="card" style={{padding:0,overflow:'hidden',marginBottom:12}}>
          <div style={{display:'flex',borderBottom:'1px solid var(--br)',background:'var(--s2)'}}>
            {[
              {key:'overview', label:'📋 Overview'},
              {key:'notes', label:`📝 Notes & Activity (${leadNotes.length})`},
              {key:'docs',  label:'📁 Documents'},
              {key:'compliance', label:'📋 Compliance'},
              {key:'finintake', label:'💰 Financial Intake'},
              {key:'payments', label:'💳 Payments'},
            ].map(t=>(
              <button key={t.key} onClick={()=>switchLeadTab(t.key)}
                style={{padding:'10px 16px',border:'none',borderBottom:leadDetailTab===t.key?'2px solid var(--blue)':'2px solid transparent',
                  background:'none',cursor:'pointer',fontSize:12,fontWeight:leadDetailTab===t.key?700:500,
                  color:leadDetailTab===t.key?'var(--blue)':'var(--t2)',whiteSpace:'nowrap',transition:'all .15s'}}>
                {t.label}
              </button>
            ))}
          </div>

          {leadDetailTab==='overview' && (
            <div style={{padding:16}}>
              {(leadNotes.length>0||l.notes) && (
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)',marginBottom:6}}>Case Notes</div>
                  {leadNotes.length>0?(
                    <>
                      <div style={{fontSize:13,color:'var(--t2)',lineHeight:1.7,whiteSpace:'pre-wrap'}}>{leadNotes[0].text}</div>
                      <div style={{fontSize:11,color:'var(--t3)',marginTop:4}}>{leadNotes[0].author||'Staff'} · {leadNotes[0].created_at?new Date(leadNotes[0].created_at).toLocaleString():''}</div>
                    </>
                  ):(
                    <div style={{fontSize:13,color:'var(--t2)',lineHeight:1.7,whiteSpace:'pre-wrap'}}>{l.notes}</div>
                  )}
                </div>
              )}
              <div style={{display:'flex',gap:24,flexWrap:'wrap'}}>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em'}}>Documents</div>
                  <div style={{fontSize:22,fontWeight:800,color:'var(--blue)'}}>{leadDocCount}</div>
                </div>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em'}}>Notes</div>
                  <div style={{fontSize:22,fontWeight:800,color:'var(--blue)'}}>{leadNotes.length}</div>
                </div>
              </div>
            </div>
          )}

          {leadDetailTab==='notes' && (
            <div style={{padding:16}}>
              <div style={{display:'flex',gap:8,marginBottom:14}}>
                <textarea
                  value={newLeadNote} onChange={e=>setNewLeadNote(e.target.value)}
                  placeholder="Log a call, email, or note about this lead…"
                  style={{flex:1,padding:'8px 10px',borderRadius:8,border:'1px solid var(--br)',resize:'vertical',minHeight:60,fontSize:13,fontFamily:'inherit',background:'var(--s2)',color:'var(--tx)'}}
                />
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  <select value={noteType} onChange={e=>setNoteType(e.target.value)} style={{fontSize:11,padding:'5px 8px',borderRadius:6}}>
                    {['Call','Email','Text','Voicemail','Meeting','Note'].map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                  <button className="btn pri" style={{padding:'8px 14px',fontSize:12}} disabled={!newLeadNote.trim()||addingLeadNote} onClick={addLeadNote}>
                    {addingLeadNote?'…':'+ Add'}
                  </button>
                </div>
              </div>
              {leadNotes.length===0&&<div style={{color:'var(--t3)',fontSize:13,textAlign:'center',padding:'20px 0'}}>No notes yet.</div>}
              {leadNotes.map((n,i)=>(
                <div key={n.id||i} style={{padding:'10px 0',borderBottom:'1px solid var(--br)'}}>
                  {n.type&&n.type!=='System'&&<Bdg s={n.type} c="bn"/>}
                  <div style={{fontSize:13,lineHeight:1.6,color:'var(--tx)',whiteSpace:'pre-wrap',marginTop:n.type&&n.type!=='System'?4:0}}>{n.text}</div>
                  <div style={{fontSize:11,color:'var(--t3)',marginTop:4}}>{n.author||'Staff'} · {n.created_at?new Date(n.created_at).toLocaleString():''}</div>
                </div>
              ))}
            </div>
          )}

          {leadDetailTab==='docs' && (
            <div style={{padding:0}}>
              <ClientDocs clientName={l.name} supabase={supabase} showToast={showToast}/>
            </div>
          )}
          {leadDetailTab==='compliance' && (
            <div style={{padding:16}}>
              <div style={{fontSize:11,color:'var(--t3)',marginBottom:10,lineHeight:1.6}}>
                Enter what the tax investigation finds (filed status, balances, liens, assessment dates) for each year/form. This is the data you use to convert the lead — and it automatically stays attached once they become a client.
              </div>
              <ComplianceGrids clientName={l.name}/>
            </div>
          )}
          {leadDetailTab==='finintake' && (
            <ErrorBoundary>
              <FinancialIntakeView clientName={l.name}/>
            </ErrorBoundary>
          )}
          {leadDetailTab==='payments' && (
            <div style={{padding:16}}>
              <div style={{fontSize:11,color:'var(--t3)',marginBottom:14,lineHeight:1.6}}>
                Capture the client's card here during the call — it goes straight into Stripe's secure form, never our database, and carries over automatically when this lead converts to a client.
              </div>

              <SavedCardsPanel
                record={l} recordType="lead" showToast={showToast}
                onChanged={async()=>{ const {data}=await supabase.from('leads').select('*').eq('id',l.id).single(); if (data) setDetail(data) }}
              />

              <div className="card" style={{marginTop:12}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)',marginBottom:4}}>💸 Split Payment</div>
                    <div style={{fontSize:11,color:'var(--t3)'}}>Charge part on one saved card, the rest on another.</div>
                  </div>
                  <button className="btn pri" style={{padding:'4px 10px',fontSize:11}} onClick={()=>setSplitPaymentModal(true)}>Split Payment</button>
                </div>
              </div>

              <div className="card" style={{marginTop:12}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                  <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)'}}>🔗 Send Payment Link</div>
                  <button className="btn pri" style={{padding:'4px 10px',fontSize:11}} onClick={()=>setPaymentLinkModal(true)}>Send Link</button>
                </div>
                <div style={{fontSize:11,color:'var(--t3)'}}>
                  {l.stripe_checkout_sent_at ? `Last link sent ${new Date(l.stripe_checkout_sent_at).toLocaleString()}` : 'No link sent yet — use this if they\'d rather enter their own card.'}
                </div>
              </div>

              <div className="card" style={{marginTop:12}}>
                <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)',marginBottom:10}}>📄 Signed Authorization (Paper Trail)</div>
                <div style={{fontSize:11,color:'var(--t3)',marginBottom:10}}>Printable authorization form for the file — separate from the card on file above, this is the signed legal consent to charge.</div>
                <div style={{display:'flex'}}>
                  <ActionBtn color="#16a34a" icon="💳" label="Credit Card Auth" sub="Print" onClick={()=>generateCreditCardAuthForm(l)}/>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Info grid — side by side like clients, shown only on the Overview tab */}
        {leadDetailTab==='overview' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
          <div className="card">
            <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)',marginBottom:10}}>Contact Info</div>
            {[['Phone',l.phone],['Phone 2',l.phone2],['Email',l.email],['SSN',l.ssn?'***-**-'+l.ssn.replace(/-/g,'').slice(-4):null],['EIN',l.ein],['Date of Birth',l.dob],['Filing Status',l.filingStatus],['Spouse Name',l.spouseName],['Spouse DOB',l.spouseDob],['Spouse SSN',l.spouseSsn?'***-**-'+l.spouseSsn.replace(/-/g,'').slice(-4):null],['Address',[l.street,l.city,l.state,l.zip].filter(Boolean).join(', ')],['County',l.county],['Source',l.source]].map(([label,val])=>(
              <div key={label} className="dr"><span className="dl">{label}</span><span className="dv">
                {(label==='Phone'||label==='Phone 2') && val
                  ? <InPlaceCaller phone={val} name={l.name} entityType="lead" entityId={l.id} supabase={supabase} showToast={showToast} onLogged={()=>loadLeadNotes(l.id)}/>
                  : label==='Address' && val
                  ? <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(val)}`} target="_blank" rel="noopener noreferrer" style={{color:'var(--blue)'}}>{val} ↗</a>
                  : (val||'—')}
              </span></div>
            ))}
          </div>
          <div className="card">
            <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)',marginBottom:10}}>IRS / Case Info</div>
            {[
              ['Est. Balance', l.irsBalance ? <span style={{fontWeight:700,color:'var(--bad)'}}>~{l.irsBalance}</span> : '—'],
              ...((l.irsOrState||'IRS Federal')!=='IRS Federal' ? [
                ['Est. State Balance', l.stateBalance ? <span style={{fontWeight:700,color:'var(--bad)'}}>~{l.stateBalance}</span> : '—'],
              ] : []),
              ['Issue Type',   <TypeBdg t={l.issueType||'—'}/>],
              ['IRS or State', l.irsOrState],
              ['Tax Years',    taxYearsList],
              ['Filing Reqs',  (()=>{try{return JSON.parse(l.filingRequirements||'[]').join(', ')}catch{return ''}})()],
              ...((l.irsOrState||'IRS Federal')!=='State' ? [
                ['IRS Status',   l.irsStatus==='Other'?l.irsStatusOther:l.irsStatus],
                ['IRS Deadline', l.irsDeadline],
              ] : []),
              ...((l.irsOrState||'IRS Federal')!=='IRS Federal' ? [
                ['State Status',   l.stateStatus==='Other'?l.stateStatusOther:l.stateStatus],
                ['State Deadline', l.stateDeadline],
              ] : []),
              ['Assigned Rep', l.assignedTo||<span style={{color:'var(--warn)'}}>Unassigned</span>],
              ['Tax Inv Fee',  l.taxFee?<span style={{fontWeight:700,color:'var(--ok)'}}>${l.taxFee}</span>:'Not set'],
            ].map(([label,val])=>(
              <div key={label} className="dr"><span className="dl">{label}</span><span className="dv">{val||'—'}</span></div>
            ))}
          </div>
        </div>
        )}

        {/* Initial Notes */}
        {l.notes && (
          <div className="card" style={{marginBottom:12}}>
            <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)',marginBottom:10}}>Initial Notes</div>
            <div style={{fontSize:13,color:'var(--t2)',lineHeight:1.7,whiteSpace:'pre-wrap'}}>{l.notes}</div>
          </div>
        )}
        {/* Status Flow Modal */}
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
                    {s:'New Lead',c:'#3b82f6'},{s:'Contacted',c:'#6366f1'},
                    {s:'Consultation Scheduled',c:'#8b5cf6'},{s:'Consultation Completed',c:'#a855f7'},
                    {s:'Tax Inv Agreement Sent',c:'#f59e0b'},{s:'Tax Inv Agreement Signed',c:'#f97316'},
                    {s:'Tax Inv Fee Paid',c:'#10b981'},{s:'Tax Investigation Active',c:'#059669'},
                    {s:'IRS Facts Received',c:'#0ea5e9'},{s:'Addendum Sent',c:'#f59e0b'},
                    {s:'Addendum Signed',c:'#f97316'},{s:'Resolution Fee Paid',c:'#10b981'},
                    {s:'Converted to Client',c:'#25A25A'},
                  ].map((item,i,arr) => (
                    <div key={item.s} style={{display:'flex',alignItems:'center',gap:0}}>
                      <div style={{background:item.c,color:'#fff',borderRadius:8,padding:'6px 10px',fontSize:11,fontWeight:700,textAlign:'center',whiteSpace:'nowrap',maxWidth:110,lineHeight:1.3}}>{item.s}</div>
                      {i < arr.length-1 && <div style={{color:'var(--t3)',fontSize:16,margin:'0 4px'}}>→</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Inline Fax Modal */}
        {showFaxModal && inlineFaxLead && (
          <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setShowFaxModal(false)}>
            <div className="modal" style={{width:520}}>
              <div className="mh"><span className="mt">📠 Send Fax — {inlineFaxLead.name}</span><button className="xbtn" onClick={()=>setShowFaxModal(false)}>&times;</button></div>
              <LeadInlineFax lead={inlineFaxLead} onClose={()=>setShowFaxModal(false)}/>
            </div>
          </div>
        )}

        {/* Inline E-Sign Modal */}
        {showEsignModal && inlineEsignLead && (
          <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setShowEsignModal(false)}>
            <div className="modal" style={{width:520}}>
              <div className="mh"><span className="mt">✍️ E-Signature — {inlineEsignLead.name}</span><button className="xbtn" onClick={()=>setShowEsignModal(false)}>&times;</button></div>
              <LeadInlineEsign lead={inlineEsignLead} onClose={()=>setShowEsignModal(false)}/>
            </div>
          </div>
        )}

        {editLeadModal}

        {bookingLead && (
          <BookingWidget contact={{name:bookingLead.name, email:bookingLead.email, phone:bookingLead.phone}} onClose={()=>setBookingLead(null)} mode="lead"/>
        )}
        {resolutionFeeLead && (
          <ChargeResolutionFeeModal
            lead={resolutionFeeLead}
            showToast={showToast}
            onClose={()=>setResolutionFeeLead(null)}
            onPaid={()=>{ setResolutionFeeLead(null); convertToClient(l, true) }}
          />
        )}
        {fillerLead && (
          <ErrorBoundary onClose={()=>setFillerLead(null)}>
            <IRSFormFiller client={fillerLead} onClose={()=>setFillerLead(null)}/>
          </ErrorBoundary>
        )}
        {paymentLinkModal && (
          <SendPaymentLinkModal
            record={l}
            recordType="lead"
            showToast={showToast}
            onClose={async()=>{ setPaymentLinkModal(false); const {data}=await supabase.from('leads').select('*').eq('id',l.id).single(); if (data) setDetail(data) }}
          />
        )}
        {splitPaymentModal && (
          <SplitPaymentModal
            record={l}
            recordType="lead"
            showToast={showToast}
            onClose={()=>setSplitPaymentModal(false)}
            onCharged={async()=>{ const {data}=await supabase.from('leads').select('*').eq('id',l.id).single(); if (data) setDetail(data) }}
          />
        )}
      </div>
    )
  }

  return (
    <div>
      {toast && <div className="toast show">{toast}</div>}

      <div style={{marginBottom:10,display:'flex',flexWrap:'wrap',gap:4,alignItems:'center'}}>
        {['All',...STATUSES.slice(0,8)].map(s => (
          <span key={s} className={`chip${filter===s?' on':''}`} onClick={()=>setFilter(s)}>{s}</span>
        ))}
        <span className={`chip${showArchived?' on':''}`} style={{marginLeft:8}} onClick={()=>setShowArchived(a=>!a)}>🗄 Archived</span>
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
                <tr key={l.id} onClick={()=>{ setDetail(l); loadLeadNotes(l.id); navigate('/leads/'+l.id, {replace:true}) }} style={{cursor:'pointer'}}>
                  <td style={{fontWeight:600}}>{l.name}</td>
                  <td><span className="bdg bb">{l.clientType||'Individual'}</span></td>
                  <td>{l.phone||'—'}</td>
                  <td><TypeBdg t={l.issueType||'—'}/></td>
                  <td style={{color:'var(--t2)'}}>{l.irsBalance||'—'}</td>
                  <td style={{color:'var(--t2)'}}>{l.source||'—'}</td>
                  <td><Bdg s={l.status||'New Lead'}/></td>
                  <td style={{color:'var(--t2)',fontSize:12}}>{l.assignedTo||<span style={{color:'var(--warn)'}}>Unassigned</span>}</td>
                  <td onClick={e=>e.stopPropagation()}>
                    {l.archived
                      ? <button className="btn" onClick={()=>restoreLead(l)}>↩</button>
                      : <button className="btn del" onClick={()=>archiveLead(l)}>Del</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {editLeadModal}

    </div>
  )
}


