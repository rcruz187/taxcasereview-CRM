import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { triggerWorkflow } from '../lib/triggerWorkflow'
import { useApp } from '../context/AppContext'
import { useFirm } from '../lib/useFirm'
import { generateClientPackage, generateAddendum, generatePOACoverLetter, sendFullPackage, generateCreditCardAuthForm, sendAddendumForSignature } from '../lib/docUtils'
import { generatePOACoverLetterPdf, RESOLUTION_SERVICES, generateFinancialIntakePdf } from '../lib/irsFormUtils'
import { advanceLeadStatus } from '../lib/leadStatus'
import BookingWidget from '../components/BookingWidget'
import IRSFormFiller from '../components/IRSFormFiller'
import ErrorBoundary from '../components/ErrorBoundary'
import ComplianceGrids from './ComplianceGrids'
import { ClientDocs } from './Clients'
import InPlaceCaller from '../components/InPlaceCaller'
import ChargeResolutionFeeModal from '../components/ChargeResolutionFeeModal'
import FinancialIntakeView from '../components/FinancialIntakeView'
import FinancialProfile from './FinancialProfile'
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

// Full status flow, in order, left to right — shared by the inline Pipeline
// widget on the lead card and the "View Flow" reference modal, so both
// always show the exact same 13 forward statuses with matching colors.
const STATUS_FLOW = [
  {s:'New Lead',c:'#3b82f6'},{s:'Contacted',c:'#6366f1'},
  {s:'Consultation Scheduled',c:'#8b5cf6'},{s:'Consultation Completed',c:'#a855f7'},
  {s:'Tax Inv Agreement Sent',c:'#f59e0b'},{s:'Tax Inv Agreement Signed',c:'#f97316'},
  {s:'Tax Inv Fee Paid',c:'#10b981'},{s:'Tax Investigation Active',c:'#059669'},
  {s:'IRS Facts Received',c:'#0ea5e9'},{s:'Addendum Sent',c:'#f59e0b'},
  {s:'Addendum Signed',c:'#f97316'},{s:'Resolution Fee Paid',c:'#10b981'},
  {s:'Converted to Client',c:'#25A25A'},
]
// Exit statuses — can be set from any stage above, not part of the linear sequence.
const EXIT_FLOW = [{s:'Dead',c:'#E84B5A'},{s:'Do Not Contact',c:'#E84B5A'}]

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

function Bdg({s,style}) { return <span className={`bdg ${STATUS_C[s]||'bn'}`} style={style}>{s}</span> }

function TypeBdg({t,style}) {
  const m = {'OIC':'bb','Installment Agreement':'bg','CNC':'bn','Penalty Abatement':'bb','Appeals':'bn','Payroll Tax':'br','Audit':'br','Liens/Levies':'br'}
  return <span className={`bdg ${m[t]||'bn'}`} style={style}>{t}</span>
}


const menuBtnStyle = {
  display:'block', width:'100%', textAlign:'left', padding:'9px 14px', fontSize:12.5,
  background:'none', border:'none', color:'var(--tx)', cursor:'pointer'
}
function PhoneLink({val, name}) {
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (!val) return <span style={{color:'var(--t3)'}}>—</span>
  const digits = val.replace(/\D/g,'')

  function callNow() {
    sessionStorage.setItem('dialerNumber', digits)
    sessionStorage.setItem('dialerName', name||'')
    nav('/dialer')
    setOpen(false)
  }
  function addToQueue() {
    const queue = JSON.parse(sessionStorage.getItem('dialerQueue')||'[]')
    queue.push({ name: name||'', phone: digits })
    sessionStorage.setItem('dialerQueue', JSON.stringify(queue))
    setOpen(false)
  }
  function copyNumber() {
    navigator.clipboard?.writeText(val)
    setOpen(false)
  }

  return (
    <div ref={ref} style={{position:'relative',display:'inline-block'}}>
      <span
        onClick={() => setOpen(o=>!o)}
        style={{color:'var(--blue)',fontWeight:600,display:'inline-flex',alignItems:'center',gap:5,cursor:'pointer'}}
        onMouseEnter={e=>e.currentTarget.style.textDecoration='underline'}
        onMouseLeave={e=>e.currentTarget.style.textDecoration='none'}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.18 1h3a2 2 0 012 1.72 12.05 12.05 0 00.7 2.81 2 2 0 01-.45 2.11L4.91 8.15a16 16 0 006.29 6.29l1.51-1.52a2 2 0 012.11-.45 12.05 12.05 0 002.81.7A2 2 0 0122 16.92z"/></svg>
        {val}
      </span>
      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:50,
          background:'var(--s2)', border:'1px solid var(--br)', borderRadius:8,
          boxShadow:'0 6px 20px rgba(0,0,0,.35)', minWidth:180, overflow:'hidden'
        }}>
          <button onClick={callNow} style={menuBtnStyle}>📞 Call via Dialer</button>
          <button onClick={addToQueue} style={menuBtnStyle}>➕ Add to Call Queue</button>
          <button onClick={copyNumber} style={menuBtnStyle}>📋 Copy Number</button>
        </div>
      )}
    </div>
  )
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

function LeadInlineFax({ lead, onClose, onLogged }) {
  const [toNum,set0]=useState((lead?.phone||'').replace(/\D/g,''))
  const [subject,set1]=useState('')
  const [file,set2]=useState(null)
  const [sending,set3]=useState(false)
  const [poaBusy,setPoaBusy]=useState(false)
  async function usePOATemplate() {
    setPoaBusy(true)
    try {
      const bytes = await generatePOACoverLetterPdf(lead)
      const fname = `POA-Cover-Letter-${(lead?.name||'lead').replace(/[^a-zA-Z0-9]+/g,'-')}.pdf`
      set2(new File([bytes], fname, { type: 'application/pdf' }))
      if (!subject) set1('Power of Attorney Cover Letter — Form 2848')
    } catch (e) {
      alert('Error generating POA Cover Letter: ' + e.message)
    } finally {
      setPoaBusy(false)
    }
  }
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

    // Auto-log to Notes -- every outbound fax shows in the lead's activity
    // timeline, same pattern as the SMS tab, including what was actually faxed.
    const { data: { user } } = await supabase.auth.getUser()
    const actor = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Staff'
    const noteContent = `📠 Fax ${sent?'sent':'logged'} to ${toFull}${subject?' — '+subject:''}${file?.name?' (' + file.name + ')':''}`
    await supabase.from('lead_notes').insert([{ lead_id: lead.id, lead_name: lead?.name, text: noteContent, type:'System', author: actor, created_at: new Date().toISOString() }])

    set3(false);onLogged?.();onClose()
  }
  return <div style={{padding:'0 4px 4px'}}>
    <div className="field"><label>To Fax Number</label><input value={toNum} onChange={e=>set0(e.target.value.replace(/\D/g,''))} placeholder="10 digits"/></div>
    <div className="field"><label>Subject</label><input value={subject} onChange={e=>set1(e.target.value)} placeholder="Document subject"/></div>
    <button type="button" onClick={usePOATemplate} disabled={poaBusy} className="btn sec" style={{fontSize:11,padding:'5px 10px',marginBottom:10}}>
      {poaBusy?'Generating…':'📋 Use POA Cover Letter Template'}
    </button>
    <div className="field"><label>Attach PDF</label><input type="file" accept=".pdf,.tiff,.jpg,.png" onChange={e=>set2(e.target.files[0])} style={{padding:'6px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',width:'100%',fontSize:12}}/>
      {file && <div style={{fontSize:11,color:'var(--ok)',marginTop:4}}>📄 {file.name}</div>}
    </div>
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
          html:`<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
  <tr><td style="background:linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 100%);padding:32px 40px;text-align:center">
    <img src="https://mpxgxfqdbquzkrvvejkh.supabase.co/storage/v1/object/public/firm-assets/logo" alt="Tax Case Review" style="max-height:60px;max-width:240px;object-fit:contain" onerror="this.style.display='none'"/>
    <div style="font-size:22px;font-weight:800;color:#ffffff;margin-top:12px">Tax Case Review</div>
    <div style="font-size:12px;color:#93c5fd;margin-top:4px;letter-spacing:.08em;text-transform:uppercase">IRS Resolution Services</div>
  </td></tr>
  <tr><td style="padding:40px 40px 32px">
    <p style="margin:0 0 16px;font-size:16px;color:#0f172a">Dear <strong>${lead.name}</strong>,</p>
    <p style="margin:0 0 24px;font-size:15px;color:#334155;line-height:1.7">Your <strong>${docType}</strong> is ready for your review and electronic signature. Please click the button below to open the document — it only takes a moment.</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 28px">
      <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#16a34a,#15803d);color:#ffffff;padding:16px 40px;border-radius:10px;text-decoration:none;font-weight:700;font-size:17px;box-shadow:0 4px 14px rgba(22,163,74,.35)">Review &amp; Sign Document →</a>
    </td></tr></table>
    <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;text-align:center">Or copy this link:</p>
    <p style="margin:0 0 32px;font-size:12px;color:#3b82f6;text-align:center;word-break:break-all"><a href="${url}" style="color:#3b82f6">${url}</a></p>
    <div style="background:#f8fafc;border-radius:8px;padding:16px 20px;border-left:4px solid #3b82f6">
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.6">💬 <strong>Questions?</strong> We're here to help.<br>📞 <strong>(888) 334-5052</strong> &nbsp;·&nbsp; ✉️ <strong>info@taxcasereview.org</strong></p>
    </div>
  </td></tr>
  <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center">
    <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.8">Tax Case Review &nbsp;·&nbsp; 631 US Highway One Ste 304, North Palm Beach, FL 33408</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
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
  const { user, role, employeeName } = useApp()
  const { id: urlLeadId } = useParams()
  const [searchParams] = useSearchParams()
  const isTaxAdvisor = role === 'Tax Advisor'

  // Auto-open Add Lead modal when navigated here with ?new=1
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setForm(isTaxAdvisor && employeeName ? { ...BLANK, assignedTo: employeeName } : BLANK)
      setModal(true)
      setShowScript(true)
    }
  }, [searchParams])
  const navigate = useNavigate()
  const [leads, setLeads]   = useState([])
  const [filter, setFilter] = useState('All')
  const [repFilter, setRepFilter] = useState('All')
  // Tax Advisors only ever see their own leads — lock the existing rep
  // filter to their name instead of building a separate filter path.
  useEffect(() => {
    if (isTaxAdvisor && employeeName) setRepFilter(employeeName)
  }, [isTaxAdvisor, employeeName])
  const [employees, setEmployees] = useState([])
  const [showArchived, setShowArchived] = useState(false)
  const [modal, setModal]   = useState(false)
  const [showScript, setShowScript] = useState(false)
  const [bookingLead, setBookingLead] = useState(null)
  const [resolutionFeeLead, setResolutionFeeLead] = useState(null)
  const [fillerLead, setFillerLead] = useState(null)
  const [paymentLinkModal, setPaymentLinkModal] = useState(null)
  const [splitPaymentModal, setSplitPaymentModal] = useState(false)
  const [detail, setDetail] = useState(null)
  const [leadNotes, setLeadNotes]     = useState([])
  const [leadSms, setLeadSms]         = useState([])
  const [leadSmsBody, setLeadSmsBody] = useState('')
  const [leadSmsSending, setLeadSmsSending] = useState(false)
  const [leadTasks, setLeadTasks]     = useState([])
  const [leadQuickTask, setLeadQuickTask] = useState('')
  const [addingLeadTask, setAddingLeadTask] = useState(false)
  const [addModal, setAddModal] = useState(false)
  const [poaLead, setPoaLead] = useState(null)
  const [poaModal, setPoaModal] = useState(false)
  const [poaSending, setPoaSending] = useState(false)
  const [poaSendVia, setPoaSendVia] = useState('email')
  const [addForm, setAddForm] = useState({ resolutionFee:'', paymentPlan:'', startDate:'', notes:'', services:[], sendVia:'email' })
  const [addendumSending, setAddendumSending] = useState(false)
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
  const [backfillingIntake, setBackfillingIntake] = useState(false)
  const [inlineFaxLead, setInlineFaxLead] = useState(null)
  const [showFaxModal, setShowFaxModal] = useState(false)
  const [inlineEsignLead, setInlineEsignLead] = useState(null)
  const [showEsignModal, setShowEsignModal] = useState(false)
  const [showFlow, setShowFlow]     = useState(false)
  const [leadDocCount, setLeadDocCount] = useState(0)

  useEffect(() => {
    load()
    const ch = supabase.channel('leads-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

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
    const [{ data }, { data: emp }] = await Promise.all([
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
      supabase.from('employees').select('id,name').order('name'),
    ])
    if (emp) setEmployees(emp)
    if (data) {
      setLeads(data)
      // refresh detail if open
      if (detail) setDetail(data.find(l => l.id === detail.id) || null)
    }
  }

  async function loadLeadNotes(leadId) {
    const { data } = await supabase.from('lead_notes').select('*').eq('lead_id', leadId).order('created_at', { ascending: false })
    setLeadNotes(data || [])
  }

  // Scoped strictly to this lead's name — sms_messages.clientName is the
  // shared text key receive-sms already matches against both leads and
  // clients by phone number, so a lead's inbound replies were already
  // landing in the table correctly. There just wasn't a tab here to show
  // them, so the only place to see a lead's texts was the global SMS page
  // (every contact's messages, unfiltered).
  async function loadLeadSms(leadName) {
    const { data } = await supabase.from('sms_messages').select('*').eq('clientName', leadName).order('created_at', { ascending: false })
    setLeadSms(data || [])
  }
  // Same clientName key the tasks table already uses for clients, and that
  // convertToClient() already writes the onboarding tasks under (using
  // l.name, which becomes the new client's name unchanged). So a task
  // added here while still a lead doesn't need any copy/transfer step at
  // conversion time — it's the same row, same key, still there afterward.
  async function loadLeadTasks(leadName) {
    const { data } = await supabase.from('tasks').select('*').eq('clientName', leadName).order('created_at', { ascending: false })
    setLeadTasks(data || [])
  }
  // Covers every way the detail view can open — list click, direct URL/
  // refresh, the fast-path single-lead fetch — not just the row onClick.
  useEffect(() => {
    if (!detail) return
    loadLeadSms(detail.name)
    loadLeadTasks(detail.name)
  }, [detail?.id])

  async function toggleLeadTask(task) {
    const { error } = await supabase.from('tasks').update({ done: !task.done }).eq('id', task.id)
    if (!error && detail) loadLeadTasks(detail.name)
  }

  async function addQuickLeadTask() {
    if (!leadQuickTask.trim() || !detail) return
    setAddingLeadTask(true)
    const { error } = await supabase.from('tasks').insert([{
      title: leadQuickTask.trim(), clientName: detail.name, priority: 'Normal',
      done: false, created_at: new Date().toISOString()
    }])
    setAddingLeadTask(false)
    if (error) { showToast('Task error: ' + error.message); return }
    setLeadQuickTask('')
    loadLeadTasks(detail.name)
    showToast('✅ Task added!')
  }

  // Sends the Service Addendum for e-signature (vs. the print-only path,
  // which stays available as a separate button in the same modal). Mirrors
  // the equivalent function in Clients.jsx — same docUtils helper, same
  // email/SMS pattern, just logs to lead_notes instead of client_notes.
  const STATE_POA_FORMS = [
    { num:'FL-DR-835',state:'FL',label:'Power of Attorney',file:'FL_POA.pdf' },
    { num:'NC-GEN-58B',state:'NC',label:'Power of Attorney',file:'NC_POA.pdf' },
    { num:'TX-89-224',state:'TX',label:'Power of Attorney',file:'TX_POA.pdf' },
    { num:'OH-1-2',state:'OH',label:'Power of Attorney',file:'OH_POA.pdf' },
    { num:'NY-POA-1',state:'NY',label:'Power of Attorney',file:'NY_POA.pdf' },
    { num:'PA-REV-677',state:'PA',label:'Power of Attorney',file:'PA_POA.pdf' },
    { num:'CA-3520-PIT',state:'CA',label:'Individual or Fiduciary POA',file:'CA_POA.pdf' },
    { num:'GA-RD-1061',state:'GA',label:'Power of Attorney',file:'GA_POA.pdf' },
    { num:'IL-2848',state:'IL',label:'Power of Attorney',file:'IL_POA.pdf' },
    { num:'MA-M-2848',state:'MA',label:'Power of Attorney',file:'MA_POA.pdf' },
    { num:'MO-2827',state:'MO',label:'Power of Attorney',file:'MO_POA.pdf' },
    { num:'OR-150-800-005',state:'OR',label:'Tax Info Auth & POA',file:'OR_POA.pdf' },
    { num:'TN-RV-F0103801',state:'TN',label:'Power of Attorney',file:'TN_POA.pdf' },
    { num:'WA-42-2446',state:'WA',label:'Confidential Tax Info Auth',file:'Washington_POA.pdf' },
    { num:'WY-POA',state:'WY',label:'Power of Attorney',file:'Wyoming.pdf' },
    { num:'AZ-285-I',state:'AZ',label:'Individual Tax Disclosure / POA',file:'AZ_POA.pdf' },
    { num:'ID-POA',state:'ID',label:'Power of Attorney',file:'ID_POA.pdf' },
  ]

  async function sendLeadStatePOA(lead, formDef, via) {
    setPoaSending(true)
    try {
      const actor = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Staff'
      const base = import.meta.env.BASE_URL.replace(/\/$/, '')
      const pdfRes = await fetch(`${base}/state-forms/${formDef.file}`)
      if (!pdfRes.ok) throw new Error('Could not load ' + formDef.state + ' POA PDF')
      const pdfBlob = await pdfRes.blob()
      const safeName = (lead.name||'lead').replace(/[^a-zA-Z0-9]+/g,'-')
      const path = `docs/${safeName}/state-poa/${formDef.state}_POA_${Date.now()}.pdf`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, pdfBlob, { upsert:true, contentType:'application/pdf' })
      if (upErr) throw new Error(upErr.message)
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
      const { data: esign, error: esignErr } = await supabase.from('esigns').insert([{
        doc_type: `State POA — ${formDef.state} (${formDef.num})`,
        client_name: lead.name, client_email: lead.email||'', client_phone: lead.phone||'',
        message: `Please review and sign your ${formDef.state} Power of Attorney. This authorizes Tax Case Review to represent you before the ${formDef.state} tax authority.`,
        pdf_attachments: [{ formType:'state_poa', label:`${formDef.state} POA — ${formDef.label}`, url:urlData.publicUrl }],
        priority:'Normal', status:'Awaiting', sent_at:new Date().toISOString(), created_at:new Date().toISOString(), sent_by:actor,
      }]).select().single()
      if (esignErr) throw new Error(esignErr.message)
      const sigUrl = `${window.location.origin}/taxcasereview-CRM/sign/${esign.id}`
      await navigator.clipboard.writeText(sigUrl).catch(()=>{})
      let emailSent=false, smsSent=false
      if ((via==='email'||via==='both') && lead.email) {
        const { error:eErr } = await supabase.functions.invoke('send-email', { body: { to:lead.email, subject:`Action Required: Sign Your ${formDef.state} Power of Attorney — Tax Case Review`, html:`<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px"><div style="font-size:18px;font-weight:800;color:#1d4ed8;margin-bottom:16px">Tax Case Review</div><p>Dear <strong>${lead.name}</strong>,</p><p>Your <strong>${formDef.state} Power of Attorney (${formDef.num})</strong> is ready for your review and signature.</p><p style="text-align:center;margin:24px 0"><a href="${sigUrl}" style="background:#1d4ed8;color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block">Review &amp; Sign →</a></p><p style="font-size:12px;color:#64748b">${sigUrl}</p><p style="font-size:11px;color:#94a3b8;margin-top:24px">Tax Case Review · 631 US Highway One Ste 304, North Palm Beach, FL 33408</p></div>` }})
        emailSent = !eErr
      }
      if ((via==='sms'||via==='both') && lead.phone) {
        const { data:cfg } = await supabase.from('settings').select('signalwire_backend').limit(1).maybeSingle()
        if (cfg?.signalwire_backend) { try { await fetch(cfg.signalwire_backend+'/sms/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:lead.phone,body:`Tax Case Review: sign your ${formDef.state} POA here: ${sigUrl}`})}); smsSent=true } catch(_){} }
      }
      await supabase.from('lead_notes').insert({ lead_id:lead.id, text:`🏛️ ${formDef.state} State POA sent for e-signature (${formDef.num})${emailSent?' via email':''}${smsSent?' via SMS':''}`, author:actor })
      setPoaModal(false)
      showToast(emailSent||smsSent ? `✅ ${formDef.state} POA sent for signature!` : '✅ Signing link copied to clipboard')
    } catch(e) { showToast('Error: '+e.message) }
    setPoaSending(false)
  }

  async function sendAddendum(l) {
    if (!addForm.resolutionFee) { showToast('Enter the resolution fee first'); return }
    const via = addForm.sendVia || 'email'
    if (via !== 'sms' && !l.email) { showToast('Lead has no email on file'); return }
    if (via !== 'email' && !l.phone) { showToast('Lead has no phone on file'); return }
    setAddendumSending(true)
    const actor = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Staff'
    const res = await sendAddendumForSignature(l, addForm, supabase, actor)
    if (res.error) { setAddendumSending(false); showToast('Error: '+res.error); return }

    const url = res.url
    await navigator.clipboard.writeText(url).catch(()=>{})
    let emailSent=false, smsSent=false

    if ((via==='email'||via==='both') && l.email) {
      const { error: eErr } = await supabase.functions.invoke('send-email', { body: {
        to: l.email,
        subject: `Action Required: Sign Your Service Addendum — Tax Case Review`,
        html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
  <tr><td style="background:linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 100%);padding:32px 40px;text-align:center">
    <img src="https://mpxgxfqdbquzkrvvejkh.supabase.co/storage/v1/object/public/firm-assets/logo" alt="Tax Case Review" style="max-height:60px;max-width:240px;object-fit:contain" onerror="this.style.display='none'"/>
    <div style="font-size:22px;font-weight:800;color:#ffffff;margin-top:12px">Tax Case Review</div>
    <div style="font-size:12px;color:#93c5fd;margin-top:4px;letter-spacing:.08em;text-transform:uppercase">IRS Resolution Services</div>
  </td></tr>
  <tr><td style="padding:40px 40px 32px">
    <p style="margin:0 0 16px;font-size:16px;color:#0f172a">Dear <strong>${l.name}</strong>,</p>
    <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.7">Your <strong>Service Addendum</strong> is ready for your review and signature. This document authorizes Tax Case Review to proceed with the resolution services we've outlined for your case and confirms the associated service fee.</p>
    <p style="margin:0 0 24px;font-size:14px;color:#64748b;line-height:1.7">Please review the details carefully, then sign electronically. If you have any questions before signing, don't hesitate to call us.</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 28px">
      <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#16a34a,#15803d);color:#ffffff;padding:16px 40px;border-radius:10px;text-decoration:none;font-weight:700;font-size:17px;box-shadow:0 4px 14px rgba(22,163,74,.35)">Review &amp; Sign Addendum →</a>
    </td></tr></table>
    <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;text-align:center">Or copy this link:</p>
    <p style="margin:0 0 32px;font-size:12px;color:#3b82f6;text-align:center;word-break:break-all"><a href="${url}" style="color:#3b82f6">${url}</a></p>
    <div style="background:#f8fafc;border-radius:8px;padding:16px 20px;border-left:4px solid #3b82f6">
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.6">💬 <strong>Questions?</strong> We're here to help.<br>📞 <strong>(888) 334-5052</strong> &nbsp;·&nbsp; ✉️ <strong>info@taxcasereview.org</strong></p>
    </div>
  </td></tr>
  <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center">
    <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.8">Tax Case Review &nbsp;·&nbsp; 631 US Highway One Ste 304, North Palm Beach, FL 33408</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
      }})
      emailSent = !eErr
    }
    if ((via==='sms'||via==='both') && l.phone) {
      const { data: cfg } = await supabase.from('settings').select('signalwire_backend').limit(1).maybeSingle()
      if (cfg?.signalwire_backend) {
        try {
          await fetch(cfg.signalwire_backend + '/sms/send', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: l.phone, body: `Tax Case Review: please review and sign your Service Addendum here: ${url}` })
          })
          smsSent = true
        } catch (_) {}
      }
    }

    const feeText = `$${Number(addForm.resolutionFee).toLocaleString()}`
    const channels = [emailSent&&'email', smsSent&&'sms'].filter(Boolean).join(' + ')
    const noteContent = `📋 Service Addendum sent for e-signature — Resolution Fee ${feeText}${channels?` (${channels})`:''}`
    await supabase.from('lead_notes').insert({ lead_id: l.id, lead_name: l.name, text: noteContent, type: 'System', author: actor, created_at: new Date().toISOString() })
    await advanceLeadStatus(supabase, l.name, 'Addendum Sent')

    setAddendumSending(false)
    setAddModal(false)
    loadLeadNotes(l.id)
    showToast(emailSent||smsSent ? '✅ Addendum sent for signature!' : '⚠️ Link copied — configure email/SMS to send automatically')
  }

  async function sendLeadSms(l) {
    if (!leadSmsBody.trim()) { showToast('Message required'); return }
    if (!l.phone) { showToast('No phone number on file for this lead'); return }
    setLeadSmsSending(true)

    const toNum = '+1' + l.phone.replace(/\D/g,'').slice(-10)
    const { data: settings } = await supabase.from('settings').select('sw_space_url').limit(1).maybeSingle()
    let status = 'Sent', swId = null, errMsg = null

    if (settings?.sw_space_url) {
      try {
        const { data: resData, error: invokeErr } = await supabase.functions.invoke('send-sms', {
          body: { to: toNum, body: leadSmsBody, lead_id: l.id || null, user_id: user?.id || null }
        })
        if (!invokeErr && resData?.success) {
          swId = resData.sid || null
        } else {
          status = 'Failed'
          errMsg = resData?.error || invokeErr?.message || 'SignalWire send failed'
        }
      } catch (e) {
        status = 'Failed'
        errMsg = e.message
      }
    } else {
      status = 'Logged (not sent)'
    }

    const actor = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Staff'
    const { error } = await supabase.from('sms_messages').insert([{
      clientName: l.name, phone: toNum, body: leadSmsBody, status,
      signalwire_sms_id: swId, sent_by: actor, error_msg: errMsg,
      created_at: new Date().toISOString(),
    }])
    setLeadSmsSending(false)
    if (error) { showToast('Error: '+error.message); return }

    if (status === 'Sent') { showToast('✅ Text sent!'); await triggerWorkflow('lead_sms_sent', 'lead', l?.name || '', actor).catch(()=>{}) }
    else if (status === 'Failed') showToast('SignalWire error: ' + (errMsg||'send failed'))
    else showToast('Logged — add SignalWire credentials in Settings to actually send')

    const noteContent = `💬 Text sent: "${leadSmsBody.length > 120 ? leadSmsBody.slice(0,120)+'…' : leadSmsBody}"`
    await supabase.from('lead_notes').insert({ lead_id: l.id, lead_name: l.name, text: noteContent, type: 'System', author: actor, created_at: new Date().toISOString() })

    setLeadSmsBody('')
    loadLeadSms(l.name)
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

  function fmtPhone(v) {
    const d = v.replace(/\D/g,'').slice(0,10)
    if (d.length <= 3) return d
    if (d.length <= 6) return `(${d.slice(0,3)}) ${d.slice(3)}`
    return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  }
  function fmtSsn(v) {
    const d = v.replace(/\D/g,'').slice(0,9)
    if (d.length <= 3) return d
    if (d.length <= 5) return `${d.slice(0,3)}-${d.slice(3)}`
    return `${d.slice(0,3)}-${d.slice(3,5)}-${d.slice(5)}`
  }
  function fmtEin(v) {
    const d = v.replace(/\D/g,'').slice(0,9)
    if (d.length <= 2) return d
    return `${d.slice(0,2)}-${d.slice(2)}`
  }
  async function handleZip(v) {
    const d = v.replace(/\D/g,'').slice(0,5)
    fld('zip', d)
    if (d.length === 5) {
      try {
        const r = await fetch(`https://api.zippopotam.us/us/${d}`)
        if (r.ok) {
          const data = await r.json()
          const place = data.places?.[0]
          if (place) setForm(f=>({...f, zip:d, city: place['place name'], state: place['state abbreviation']}))
        }
      } catch(e) {}
    }
  }
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
    .filter(l => repFilter === 'All' || (repFilter === 'Unassigned' ? !l.assignedTo : l.assignedTo === repFilter))

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
    if (!skipped.length) { showToast(modal==='edit' ? '✅ Lead updated!' : '✅ Lead added!'); if (modal !== 'edit') await triggerWorkflow('lead_created', 'lead', form.name, actor) }
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
    showToast('Lead archived'); await triggerWorkflow('lead_archived', 'lead', detail?.name || '', actor); setDetail(null); load()
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

    // ── Pipeline trigger tasks ──────────────────────────────────────────
    // When a lead moves to "Tax Investigation Active", assign tasks to the
    // tax associate (or any staff if none assigned) to call the IRS and
    // review the financial intake info so they can build the resolution.
    // When it moves to "IRS Facts Received", notify the original tax advisor
    // so they can go over the IRS results with the client.
    if (status === 'Tax Investigation Active') {
      const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + 1)
      const dueDateStr = dueDate.toISOString().slice(0, 10)
      await supabase.from('tasks').insert([
        {
          title: `📞 Call IRS — gather tax investigation info for ${l.name}`,
          clientName: l.name,
          priority: 'High',
          dueDate: dueDateStr,
          done: false,
          assignedTo: actor, // assigned to whoever triggered this (tax associate on file)
          notes: 'Call IRS with POA to pull transcripts, balances, lien info, assessment dates, and filing history. Enter results into the Compliance tab on this lead.',
          created_at: new Date().toISOString(),
        },
        {
          title: `🧾 Review financial intake — build resolution plan for ${l.name}`,
          clientName: l.name,
          priority: 'High',
          dueDate: dueDateStr,
          done: false,
          assignedTo: actor,
          notes: 'Review the Financial Profile (I&E, Assets & Equity tabs) populated from the client\'s intake submission. Cross-reference with IRS results to determine the best resolution path (OIC, IA, CNC, etc.).',
          created_at: new Date().toISOString(),
        },
      ])
      showToast('Status updated — 2 tasks created for tax investigation')
    } else if (status === 'IRS Facts Received') {
      // Notify the original tax advisor who sold this lead
      const advisor = l.assignedTo || actor
      const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + 1)
      const dueDateStr = dueDate.toISOString().slice(0, 10)
      await supabase.from('tasks').insert([{
        title: `📋 Review IRS results with ${l.name} — go over findings`,
        clientName: l.name,
        priority: 'High',
        dueDate: dueDateStr,
        done: false,
        assignedTo: advisor,
        notes: 'IRS/State investigation is complete. Review the Compliance tab for the results and call the client to go over what the IRS has on file and the proposed resolution.',
        created_at: new Date().toISOString(),
      }])
      showToast(`Status updated — task created for ${advisor} to review IRS results`)
    } else {
      showToast(willArchive ? 'Status updated — lead archived' : willRestore ? 'Status updated — lead restored' : 'Status updated!')
    }

    // ── Workflow engine — fires alongside hardcoded triggers ──
    await triggerWorkflow('lead_status_changed', 'lead', l.name, actor, status)

    load()
    if (detail?.id === l.id) loadLeadNotes(l.id)
  }

  async function backfillFromIntake(l) {
    setBackfillingIntake(true)
    try {
      const { data: rec, error } = await supabase
        .from('financial_intake_responses')
        .select('answers')
        .eq('lead_id', l.id)
        .eq('status', 'Submitted')
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error || !rec) { showToast('No submitted intake found for this lead'); return }
      const a = rec.answers
      const n = v => parseFloat(v) || 0
      const jobs = a.jobs_list || []
      const myJobs = jobs.filter(j => j.whose_job !== "My Spouse's")
      const spouseJobs = jobs.filter(j => j.whose_job === "My Spouse's")
      function mapJob(j) {
        if (!j) return {}
        return { employer: j.employer||'', position: j.position||'', length_employed: j.length_employed||'',
          pay_frequency: j.pay_frequency||'', gross_monthly: n(j.gross_monthly),
          fed_withheld: n(j.fed_withheld), ss_med_withheld: n(j.ss_med_withheld), state_withheld: n(j.state_withheld) }
      }
      const businesses = a.business_list || []
      function mapBiz(b) {
        if (!b) return {}
        return { business_name: b.business_name||'', ein: b.ein||'', structure: b.structure||'',
          pct_ownership: b.pct_ownership||'', num_employees: b.num_employees||'',
          net_income_monthly: n(b.net_income_monthly), notes: b.notes||'' }
      }
      const otherIncome = (a.other_income_list||[]).map(r => ({ source: r.source||'', amount: n(r.monthly_amount) }))
      const realEstate = (a.real_estate_list||[]).map(r => ({
        address: r.address||'', property_type: r.property_type||'',
        estimated_value: n(r.estimated_value), mortgage_balance: n(r.mortgage_balance),
        monthly_payment: n(r.monthly_payment), rental_income: n(r.rental_income)
      }))
      const vehicles = (a.vehicles_list||[]).map(v => ({
        make_model: v.make_model||'', estimated_value: n(v.estimated_value),
        remaining_balance: n(v.remaining_balance), monthly_payment: n(v.monthly_payment)
      }))
      const assets = (a.assets_list||[]).map(asset => ({
        asset_type: asset.asset_type||'', description: asset.description||'',
        value: n(asset.value), loan_against: n(asset.loan_against)
      }))
      const creditCards = (a.credit_cards_list||[]).map(c => ({
        card_name: c.card_name||'', balance: n(c.balance),
        credit_limit: n(c.credit_limit), min_payment: n(c.min_payment)
      }))
      const otherSecuredDebt = a.has_other_debt === 'Yes'
        ? { monthly_payment: n(a.other_debt_payment), remaining_balance: n(a.other_debt_balance) } : {}
      const expenses = {
        food_clothing: n(a.food_clothing), housing: n(a.housing_payment),
        homeowners_renters_insurance: n(a.homeowners_renters_insurance), property_taxes: n(a.property_taxes),
        hoa_dues: n(a.hoa_dues), electricity: n(a.electricity), water_sewer_trash: n(a.water_sewer_trash),
        cell_phone: n(a.cell_phone), internet: n(a.internet), cable: n(a.cable),
        maintenance: n(a.maintenance), public_transportation: n(a.public_transportation),
        car_misc: n(a.car_misc), health_insurance: n(a.health_insurance),
        health_dental_vision: n(a.health_dental_vision), health_oop: n(a.health_oop),
        child_care: n(a.child_care), child_support: n(a.child_support),
        court_judgment: n(a.court_judgment), life_insurance: n(a.life_insurance),
        irs_installment: n(a.irs_installment), state_installment: n(a.state_installment),
      }
      const profileData = {
        client_name: l.name,
        dob: a.dob || null, county: a.county||'', filing_status: a.filing_status||'',
        household_under_65: n(a.household_under_65), household_over_65: n(a.household_over_65),
        tax_years_not_filed: a.tax_years_not_filed||'', has_lived_other_states: a.lived_other_states||'',
        other_states_notes: a.other_states_notes||'',
        employment_taxpayer_1: myJobs[0] ? mapJob(myJobs[0]) : undefined,
        employment_taxpayer_2: myJobs[1] ? mapJob(myJobs[1]) : undefined,
        employment_spouse_1: spouseJobs[0] ? mapJob(spouseJobs[0]) : undefined,
        employment_spouse_2: spouseJobs[1] ? mapJob(spouseJobs[1]) : undefined,
        business_1: businesses[0] ? mapBiz(businesses[0]) : undefined,
        business_2: businesses[1] ? mapBiz(businesses[1]) : undefined,
        other_income: otherIncome.length ? otherIncome : undefined,
        real_estate: realEstate.length ? realEstate : undefined,
        vehicles: vehicles.length ? vehicles : undefined,
        assets: assets.length ? assets : undefined,
        cash_on_hand: n(a.cash_on_hand),
        credit_cards: creditCards.length ? creditCards : undefined,
        other_secured_debt: Object.keys(otherSecuredDebt).length ? otherSecuredDebt : undefined,
        expenses,
        updated_at: new Date().toISOString(),
      }
      const cleanProfile = Object.fromEntries(Object.entries(profileData).filter(([,v]) => v !== undefined))
      const { error: upsertErr } = await supabase.from('client_financial_profiles').upsert(cleanProfile, {
        onConflict: 'client_name', ignoreDuplicates: false
      })
      if (upsertErr) { showToast('Error syncing profile: ' + upsertErr.message) }
      else { showToast('✅ Financial Profile populated from intake!') }
    } catch (e) { showToast('Error: ' + e.message) }
    finally { setBackfillingIntake(false) }
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
    const taxFeeAmt = parseFloat(l.taxFee)
    if (!taxFeeAmt || taxFeeAmt <= 0) {
      showToast('Set the Tax Investigation Fee on this lead before sending the package.')
      return
    }
    setPkgSending(true)
    const res = await sendFullPackage({...l, address:l.street, business_name:l.name}, supabase)
    if (res.error) { setPkgSending(false); showToast('Error: '+res.error); return }

    const url = res.url
    await navigator.clipboard.writeText(url).catch(()=>{})

    // Build Financial Intake link for this lead
    const intakeUrl = `${window.location.origin}/taxcasereview-CRM/intake/${l.id}`

    // Generate Stripe Checkout link for the 1st Trade investigation fee
    let stripePayUrl = null
    try {
      const { data: stripeData, error: stripeErr } = await supabase.functions.invoke('stripe-create-checkout-session', {
        body: {
          recordType: 'lead',
          recordId: l.id,
          name: l.name,
          email: l.email,
          amount: String(taxFeeAmt),
          description: 'Tax Investigation Fee — 1st Trade',
          purpose: 'investigation_fee',
        }
      })
      if (!stripeErr && stripeData?.url) stripePayUrl = stripeData.url
    } catch(e) { console.error('Stripe link error:', e) }
    let smsSent=false,emailSent=false
    const{data:cfg}=await supabase.from('settings').select('signalwire_backend').limit(1).maybeSingle()

    if(l.email){
      try{
        const paymentSection = stripePayUrl ? `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px 24px;margin:0 0 24px">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:.06em">💳 Step 2 — Pay Your Investigation Fee</p>
      <p style="margin:0 0 14px;font-size:14px;color:#15803d;line-height:1.6">Your Tax Investigation Fee of <strong>$${Number(taxFeeAmt).toLocaleString()}</strong> is due to begin your case. Pay securely below — your card will be saved on file for future billing.</p>
      <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
        <a href="${stripePayUrl}" style="display:inline-block;background:linear-gradient(135deg,#0ea5e9,#0284c7);color:#ffffff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;letter-spacing:-.01em;box-shadow:0 4px 14px rgba(14,165,233,.35)">Pay $${Number(taxFeeAmt).toLocaleString()} Now →</a>
      </td></tr></table>
    </div>` : ''
        const{error:eErr}=await supabase.functions.invoke('send-email',{body:{
          to:l.email,
          subject:`Action Required: Sign & Pay — Tax Case Review Investigation Package`,
          html:`<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
  <tr><td style="background:linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 100%);padding:32px 40px;text-align:center">
    <img src="https://mpxgxfqdbquzkrvvejkh.supabase.co/storage/v1/object/public/firm-assets/logo" alt="Tax Case Review" style="max-height:60px;max-width:240px;object-fit:contain" onerror="this.style.display='none'"/>
    <div style="font-size:22px;font-weight:800;color:#ffffff;margin-top:12px;letter-spacing:-.02em">Tax Case Review</div>
    <div style="font-size:12px;color:#93c5fd;margin-top:4px;letter-spacing:.08em;text-transform:uppercase">IRS Resolution Services</div>
  </td></tr>
  <tr><td style="padding:40px 40px 32px">
    <p style="margin:0 0 16px;font-size:16px;color:#0f172a">Dear <strong>${l.name}</strong>,</p>
    <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.7">Your <strong>Tax Investigation Package</strong> is ready. Please complete both steps below to get started — it only takes a few minutes.</p>
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:20px 24px;margin:0 0 20px">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:.06em">📋 Step 1 — Review &amp; Sign Your Documents</p>
      <p style="margin:0 0 10px;font-size:14px;color:#334155;line-height:1.6">This package includes:</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px">
        <tr><td style="padding:5px 0;border-bottom:1px solid #dbeafe;font-size:14px;color:#334155">📋 &nbsp;<strong>Tax Service Agreement</strong> — outlines the scope of our representation</td></tr>
        <tr><td style="padding:5px 0;border-bottom:1px solid #dbeafe;font-size:14px;color:#334155">📄 &nbsp;<strong>Form 2848 — Power of Attorney</strong> — authorizes us to speak with the IRS on your behalf</td></tr>
        <tr><td style="padding:5px 0;font-size:14px;color:#334155">📄 &nbsp;<strong>Form 8821 — Tax Information Authorization</strong> — allows us to access your IRS transcripts</td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
        <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#16a34a,#15803d);color:#ffffff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;letter-spacing:-.01em;box-shadow:0 4px 14px rgba(22,163,74,.35)">Review &amp; Sign Package →</a>
      </td></tr></table>
    </div>
    ${paymentSection}
    <p style="margin:0 0 4px;font-size:11px;color:#94a3b8;text-align:center">Sign link: <a href="${url}" style="color:#3b82f6">${url}</a></p>
    ${stripePayUrl?`<p style="margin:0 0 4px;font-size:11px;color:#94a3b8;text-align:center">Payment link: <a href="${stripePayUrl}" style="color:#0ea5e9">${stripePayUrl}</a></p>`:''}
    <div style="background:#fdf4ff;border:1px solid #e9d5ff;border-radius:10px;padding:20px 24px;margin:0 0 24px">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#7e22ce;text-transform:uppercase;letter-spacing:.06em">📋 Step 3 — Complete Your Financial Intake</p>
      <p style="margin:0 0 14px;font-size:14px;color:#6b21a8;line-height:1.6">To build your resolution strategy, your advisor needs a picture of your current finances. This takes about 10 minutes and your progress saves automatically.</p>
      <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
        <a href="${intakeUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#ffffff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;letter-spacing:-.01em;box-shadow:0 4px 14px rgba(124,58,237,.35)">Start Financial Intake →</a>
      </td></tr></table>
      <p style="margin:12px 0 0;font-size:11px;color:#94a3b8;text-align:center">Financial Intake link: <a href="${intakeUrl}" style="color:#7c3aed">${intakeUrl}</a></p>
    </div>
    <div style="background:#f8fafc;border-radius:8px;padding:16px 20px;border-left:4px solid #3b82f6;margin-bottom:8px">
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.6">💬 <strong>Questions?</strong> Don't hesitate to reach out. We're here every step of the way.<br>📞 <strong>(888) 334-5052</strong> &nbsp;·&nbsp; ✉️ <strong>info@taxcasereview.org</strong></p>
    </div>
  </td></tr>
  <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center">
    <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.8">Tax Case Review &nbsp;·&nbsp; 631 US Highway One Ste 304, North Palm Beach, FL 33408<br>This email was sent regarding your active tax resolution case.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
        }})
        if(!eErr)emailSent=true
      }catch(e){console.error('Email error:',e)}
    }
    if(l.phone&&cfg?.signalwire_backend){
      try{
        const smsBody = stripePayUrl
          ? `Hi ${l.name}, Tax Case Review sent your Investigation Package. Step 1 – Sign: ${url}  |  Step 2 – Pay $${Number(taxFeeAmt).toLocaleString()}: ${stripePayUrl}  |  Step 3 – Financial Intake: ${intakeUrl}`
          : `Hi ${l.name}, Tax Case Review sent you a Tax Investigation Package to review and sign: ${url}  |  Financial Intake: ${intakeUrl}`
        const r=await fetch(cfg.signalwire_backend+'/sms/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:l.phone,body:smsBody})})
        const d=await r.json();if(d.success)smsSent=true
      }catch(e){console.error('SMS error:',e)}
    }

    setPkgSending(false)
    const sent=[emailSent&&`email to ${l.email}`,smsSent&&`SMS to ${l.phone}`].filter(Boolean)
    showToast(sent.length?`Package sent via ${sent.join(' & ')}!`:'Package created — link copied (configure email/SMS in Settings to auto-send).')
    await advanceLeadStatus(supabase, l.name, 'Tax Inv Agreement Sent')
    load()
  }

  async function convertToClient(l, skipConfirm) {
    if (!skipConfirm && !confirm(`Convert "${l.name}" to a full client?`)) return
    setConverting(true)
    const taxYearsStr = l.taxYearsCustom || (()=>{try{return JSON.parse(l.taxYears||'[]').join(', ')}catch{return l.taxYears||''}})()
    const { data: newClient, error } = await supabase.from('clients').insert([{
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
    }]).select().single()
    if (error) { showToast('Error: '+error.message); setConverting(false); return }
    // Re-point every saved card on the lead to the new client record — the
    // multi-card list (and split payment) would otherwise show empty for a
    // client that arrived with cards already on file as a lead.
    await supabase.from('payment_methods').update({
      record_type: 'client', record_id: newClient.id,
    }).eq('record_type', 'lead').eq('record_id', l.id)
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
        .select('id, status, answers, submitted_at').eq('client_name', l.name).order('created_at', { ascending: false }).limit(1).maybeSingle()

      if (existingIntake) {
        // Already has one (sent or submitted while a lead) -- leave it as
        // the carried-over record. Don't re-send the email if they've
        // already submitted; that would be a confusing "fill this out"
        // nudge for something they already finished.
        if (existingIntake.status === 'Submitted') {
          intakeAlreadySubmitted = true
          // Snapshot the submitted answers into a PDF and file it under the
          // new client's Financial Statements folder — this is the resolution-
          // case data captured at the lead stage; once they're a client the
          // live wizard answers aren't needed anymore, just this record.
          try {
            const pdfBytes = await generateFinancialIntakePdf(l.name, existingIntake.answers || {}, existingIntake.submitted_at)
            const safeName = l.name.replace(/[^a-zA-Z0-9]+/g, '-')
            const path = `docs/${safeName}/financial-intake/financial-intake-${Date.now()}.pdf`
            const { error: upErr } = await supabase.storage.from('documents')
              .upload(path, new Blob([pdfBytes], { type: 'application/pdf' }), { upsert: true, contentType: 'application/pdf' })
            if (!upErr) {
              const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
              await supabase.from('documents').insert([{
                client: l.name, name: 'Financial Intake', docType: 'Financial Statements',
                file_url: urlData.publicUrl, file_name: 'Financial Intake.pdf',
                notes: `Submitted ${existingIntake.submitted_at ? new Date(existingIntake.submitted_at).toLocaleDateString() : ''}`,
                created_at: new Date().toISOString(),
              }])
            }
          } catch (e) { console.error('Financial intake PDF snapshot error:', e) }
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
    // ── Workflow engine — lead converted trigger ──
    const convActor = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Staff'
    await triggerWorkflow('lead_converted', 'lead', l.name, convActor)
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
              <div className="field"><label>Phone</label><input value={form.phone} onChange={e=>fld('phone',fmtPhone(e.target.value))} placeholder="(305) 555-0000" maxLength={14}/></div>
              <div className="field"><label>Phone 2 <span style={{color:'var(--t3)',fontWeight:400}}>(optional)</span></label><input value={form.phone2||''} onChange={e=>fld('phone2',fmtPhone(e.target.value))} placeholder="(305) 555-0000" maxLength={14}/></div>
              <div className="field"><label>Email</label><input value={form.email} onChange={e=>fld('email',e.target.value)}/></div>
            </div>
            <div className="fg3">
              <div className="field"><label>SSN</label><input value={form.ssn} onChange={e=>fld('ssn',fmtSsn(e.target.value))} placeholder="XXX-XX-XXXX" maxLength={11}/></div>
              <div className="field"><label>EIN (if business)</label><input value={form.ein||''} onChange={e=>fld('ein',fmtEin(e.target.value))} placeholder="XX-XXXXXXX" maxLength={10}/></div>
              <div className="field"><label>Date of Birth</label><input type="date" value={form.dob} onChange={e=>fld('dob',e.target.value)}/></div>
            </div>

            {/* Spouse */}
            <div style={{background:'var(--s3)',borderRadius:8,padding:12,marginBottom:10}}>
              <div style={{fontWeight:700,fontSize:12,marginBottom:8}}>👥 Spouse / Partner</div>
              <div className="fg2">
                <div className="field"><label>Spouse Full Name</label><input value={form.spouseName||''} onChange={e=>fld('spouseName',e.target.value)}/></div>
                <div className="field"><label>Spouse SSN</label><input value={form.spouseSsn||''} onChange={e=>fld('spouseSsn',fmtSsn(e.target.value))} placeholder="XXX-XX-XXXX" maxLength={11}/></div>
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
              <div className="field"><label>ZIP</label><input value={form.zip} onChange={e=>handleZip(e.target.value)} maxLength={5} placeholder="33408"/></div>
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
                  {(employees.length>0?employees.map(e=>e.name):['Romy Cruz','Dana Richard','Yesenia Gonzalez']).map(n=><option key={n}>{n}</option>)}
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
                <span className="bdg bb" style={{fontSize:13,padding:'4px 10px'}}>{l.clientType||'Individual'}</span>
                <Bdg s={l.status||'New Lead'} style={{fontSize:13,padding:'4px 10px'}}/>
                {l.irsOrState && <span className="bdg ba" style={{fontSize:13,padding:'4px 10px'}}>{l.irsOrState}</span>}
                {l.issueType  && <TypeBdg t={l.issueType} style={{fontSize:13,padding:'4px 10px'}}/>}
                {l.taxFee     && <span className="bdg bg" style={{fontSize:13,padding:'4px 10px'}}>Tax Inv Fee: ${l.taxFee}</span>}
              </div>
            </div>
          </div>

          {/* Pipeline — full status flow, left to right, current status highlighted */}
          <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid var(--br)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em'}}>Pipeline</div>
              <button className="btn sec" style={{padding:'2px 8px',fontSize:10}} onClick={()=>setShowFlow(true)}>📊 View Flow</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(118px,1fr))',gap:6}}>
              {STATUS_FLOW.map(item => (
                <div key={item.s} onClick={()=>updateStatus(l, item.s)} style={{
                  background:item.c,color:'#fff',borderRadius:6,padding:'6px 9px',fontSize:11,fontWeight:700,
                  textAlign:'center',lineHeight:1.2,cursor:'pointer',
                  display:'flex',alignItems:'center',justifyContent:'center',minHeight:30,
                  outline:l.status===item.s?'2px solid #fff':'none',outlineOffset:-2,
                  boxShadow:l.status===item.s?'0 2px 6px rgba(0,0,0,.35)':'none',
                  opacity:l.status===item.s?1:0.5,transition:'opacity .15s, box-shadow .15s'
                }}>{item.s}</div>
              ))}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(118px,1fr))',gap:6,marginTop:8,paddingTop:8,borderTop:'1px solid var(--br)'}}>
              {EXIT_FLOW.map(item => (
                <div key={item.s} onClick={()=>updateStatus(l, item.s)} style={{
                  background:item.c,color:'#fff',borderRadius:6,padding:'6px 9px',fontSize:11,fontWeight:700,
                  textAlign:'center',lineHeight:1.2,cursor:'pointer',
                  display:'flex',alignItems:'center',justifyContent:'center',minHeight:30,
                  outline:l.status===item.s?'2px solid #fff':'none',outlineOffset:-2,
                  boxShadow:l.status===item.s?'0 2px 6px rgba(0,0,0,.35)':'none',
                  opacity:l.status===item.s?1:0.5,transition:'opacity .15s, box-shadow .15s'
                }}>{item.s}</div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Actions — matches clients ActionBtn style */}
        <div className="card" style={{marginBottom:12}}>
          <div style={{fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Quick Actions</div>
          <div className="ovx">
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <ActionBtn color="#0891b2" icon="📅" label="Schedule" sub="Book Appointment" onClick={()=>setBookingLead(l)}/>
            <ActionBtn color="#16a34a" icon="📦" label={pkgSending?'Building…':'Full Package'} sub="2848/8821 + Agreement" onClick={()=>!pkgSending&&handleSendFullPackage(l)}/>
            <ActionBtn color="#22863a" icon="📄" label="Tax Engagement" sub="Service Agreement" onClick={()=>generateClientPackage(l)}/>
            <ActionBtn color="#0369a1" icon="🖋️" label="Pre-Fill 8821/2848" sub="IRS PDF Forms" onClick={()=>{
              try {
                if (!l) { showToast('Error: no lead data found'); return }
                setFillerLead({...l, address:l.street, business_name:l.name})
              } catch (err) { showToast('Error opening form: ' + err.message) }
            }}/>
            <ActionBtn color="#0f766e" icon="🏛️" label="Pre-Fill State POA" sub={l.state ? l.state+' Form' : 'State Form'} onClick={()=>{ setPoaLead(l); setPoaModal(true) }}/>
            <ActionBtn color="#1d4ed8" icon="📊" label={intakeSending?'Sending…':'Financial Intake'} sub="Send / Resend Link" onClick={()=>!intakeSending&&sendFinancialIntake(l)}/>
            <ActionBtn color="#0d9488" icon="💵" label="Charge Investigation Fee" sub={l.taxFee?`Quoted: $${l.taxFee}`:'Send Payment Link'} onClick={()=>setPaymentLinkModal({purpose:'investigation_fee', defaultAmount:l.taxFee||'', defaultDescription:'Tax Investigation Fee'})}/>
            <ActionBtn color="#d97706" icon="📝" label="Addendum" sub="After IRS facts" onClick={()=>{setAddForm({resolutionFee:'',paymentPlan:'',startDate:'',notes:'',services:[],sendVia:'email'});setAddModal(true)}}/>
            {l.status==='Addendum Signed' && (
              <ActionBtn color="#059669" icon="💰" label="Charge Resolution Fee" sub="& Convert to Client" onClick={()=>setResolutionFeeLead(l)}/>
            )}

            <ActionBtn color="#dc2626" icon="📠" label="Send Fax" sub="SignalWire Fax" onClick={()=>{setInlineFaxLead(l);setShowFaxModal(true)}}/>
            <ActionBtn color="#7c3aed" icon="✍️" label="E-Signature" sub="Request Sign" onClick={()=>{setInlineEsignLead(l);setShowEsignModal(true)}}/>
          </div>
          </div>
        </div>

        {/* Overview / Notes / Documents — tabbed, matching the Clients detail page style */}
        <div className="card" style={{padding:0,overflow:'hidden',marginBottom:12}}>
          <div style={{display:'flex',flexWrap:'nowrap',overflowX:'auto',borderBottom:'1px solid var(--br)',background:'var(--s2)',scrollbarWidth:'none'}}>
            {[
              {key:'overview', icon:'📋', text:'Overview'},
              {key:'sms', icon:'💬', text:'SMS'},
              {key:'notes', icon:'📝', text:`Notes & Activity (${leadNotes.length})`},
              {key:'tasks', icon:'✅', text:`Tasks (${leadTasks.length})`},
              {key:'payments', icon:'💳', text:'Payments'},
              {key:'finintake', icon:'💰', text:'Financial Intake'},
              {key:'finprofile', icon:'🧮', text:'Financial Profile'},
              {key:'docs',  icon:'📁', text:'Documents'},
            ].filter(Boolean).map(t=>(
              <button key={t.key} onClick={()=>switchLeadTab(t.key)}
                style={{display:'inline-flex',alignItems:'center',gap:5,padding:'12px 7px',border:'none',borderBottom:leadDetailTab===t.key?'2px solid var(--blue)':'2px solid transparent',
                  background:'none',cursor:'pointer',fontWeight:leadDetailTab===t.key?700:500,
                  color:leadDetailTab===t.key?'var(--blue)':'var(--t2)',whiteSpace:'nowrap',transition:'all .15s',flexShrink:0}}>
                <span style={{fontSize:22,lineHeight:1}}>{t.icon}</span>
                <span style={{fontSize:11}}>{t.text}</span>
              </button>
            ))}
          </div>

          {leadDetailTab==='sms' && (
            <div style={{padding:16}}>
              <div style={{display:'flex',gap:8,marginBottom:14}}>
                <textarea
                  value={leadSmsBody} onChange={e=>setLeadSmsBody(e.target.value)}
                  placeholder={l.phone ? `Text ${l.name}…` : 'No phone number on file for this lead'}
                  disabled={!l.phone}
                  style={{flex:1,padding:'8px 10px',borderRadius:8,border:'1px solid var(--br)',resize:'vertical',minHeight:60,fontSize:13,fontFamily:'inherit',background:'var(--s2)',color:'var(--tx)'}}
                />
                <div style={{display:'flex',flexDirection:'column',gap:6,alignItems:'flex-end',justifyContent:'space-between'}}>
                  <span style={{fontSize:10,color:leadSmsBody.length>160?'var(--warn)':'var(--t3)',whiteSpace:'nowrap'}}>{leadSmsBody.length} chars</span>
                  <button className="btn pri" style={{padding:'8px 14px',fontSize:12,whiteSpace:'nowrap'}}
                    disabled={!leadSmsBody.trim()||!l.phone||leadSmsSending}
                    onClick={()=>sendLeadSms(l)}>
                    {leadSmsSending?'…':'Send'}
                  </button>
                </div>
              </div>
              {!l.phone && (
                <div style={{fontSize:12,color:'var(--warn)',marginBottom:12}}>Add a phone number to this lead to send texts.</div>
              )}
              {leadSms.length===0&&<div style={{color:'var(--t3)',fontSize:13,textAlign:'center',padding:'20px 0'}}>No texts yet.</div>}
              {leadSms.map(s=>(
                <div key={s.id} style={{padding:'10px 0',borderBottom:'1px solid var(--br)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
                    {s.direction==='inbound'
                      ? <span title="Received" style={{color:'var(--blue)',fontSize:11}}>📥 Received</span>
                      : <span title="Sent" style={{color:'var(--t3)',fontSize:11}}>📤 Sent</span>}
                    <span className={`bdg ${s.status==='Sent'?'bg':s.status==='Failed'?'br':'bn'}`} style={{fontSize:9}}>{s.status||'Sent'}</span>
                  </div>
                  <div style={{fontSize:13,lineHeight:1.6,color:'var(--tx)',whiteSpace:'pre-wrap'}}>{s.body}</div>
                  <div style={{fontSize:11,color:'var(--t3)',marginTop:4}}>{s.sent_by||'Staff'} · {s.created_at?new Date(s.created_at).toLocaleString():''}</div>
                </div>
              ))}
            </div>
          )}

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
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em'}}>Tasks</div>
                  <div style={{fontSize:22,fontWeight:800,color:'var(--ok)'}}>{leadTasks.filter(t=>t.done).length}/{leadTasks.length}</div>
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

          {leadDetailTab==='tasks' && (
            <div style={{padding:16}}>
              <div style={{fontSize:12,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:12}}>
                ✅ Tasks ({leadTasks.length})
              </div>
              {leadTasks.length===0&&(
                <div style={{color:'var(--t3)',fontSize:13,textAlign:'center',padding:'20px 0'}}>No tasks yet for this lead.</div>
              )}
              {leadTasks.map(t=>(
                <div key={t.id} style={{display:'flex',gap:10,alignItems:'flex-start',padding:'8px 0',borderBottom:'1px solid var(--br)'}}>
                  <div
                    onClick={()=>toggleLeadTask(t)}
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
              <div style={{display:'flex',gap:6,marginTop:12}}>
                <input
                  value={leadQuickTask}
                  onChange={e=>setLeadQuickTask(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&addQuickLeadTask()}
                  placeholder="Add a task…"
                  style={{flex:1,padding:'8px 10px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',fontSize:12}}
                />
                <button className="btn pri" style={{fontSize:11,padding:'7px 14px'}} onClick={addQuickLeadTask} disabled={addingLeadTask}>
                  {addingLeadTask?'…':'+ Add'}
                </button>
              </div>
            </div>
          )}

          {leadDetailTab==='docs' && (
            <div style={{padding:0}}>
              <ClientDocs clientName={l.name} supabase={supabase} showToast={showToast}/>
            </div>
          )}
          {leadDetailTab==='finprofile' && (
            <ErrorBoundary>
              <FinancialProfile clientName={l.name} client={l} isLead={true}/>
            </ErrorBoundary>
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
              <div style={{padding:'10px 16px 0',display:'flex',justifyContent:'flex-end'}}>
                <button className="btn sec" style={{fontSize:12,padding:'6px 14px'}}
                  onClick={()=>backfillFromIntake(l)} disabled={backfillingIntake}>
                  {backfillingIntake ? '⏳ Importing…' : '⬇️ Import into Financial Profile'}
                </button>
              </div>
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
                  <button className="btn pri" style={{padding:'4px 10px',fontSize:11}} onClick={()=>setPaymentLinkModal({})}>Send Link</button>
                </div>
                <div style={{fontSize:11,color:'var(--t3)'}}>
                  {l.stripe_checkout_sent_at ? `Last link sent ${new Date(l.stripe_checkout_sent_at).toLocaleString()}` : 'No link sent yet — use this if they\'d rather enter their own card.'}
                </div>
              </div>

              <div className="card" style={{marginTop:12}}>
                <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)',marginBottom:10}}>📄 Signed Authorization (Paper Trail)</div>
                <div style={{fontSize:11,color:'var(--t3)',marginBottom:10}}>This is now included automatically in the "Full Package" e-sign bundle (Quick Actions above) — no card number on it, just the signed consent to charge whatever's on file above. Use the print button only if you need a standalone paper copy.</div>
                <div style={{display:'flex'}}>
                  <ActionBtn color="#16a34a" icon="💳" label="Credit Card Auth" sub="Print" onClick={()=>generateCreditCardAuthForm(l)}/>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Info grid — side by side like clients, shown only on the Overview tab */}
        {leadDetailTab==='overview' && (
        <div className="detail-2col" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
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
                <div style={{display:'flex',alignItems:'center',gap:0,minWidth:620,flexWrap:'wrap',rowGap:12}}>
                  {STATUS_FLOW.map((item,i,arr) => (
                    <div key={item.s} style={{display:'flex',alignItems:'center',gap:0}}>
                      <div onClick={()=>{updateStatus(detail, item.s);setShowFlow(false)}} style={{background:item.c,color:'#fff',borderRadius:6,padding:'7px 9px',fontSize:11,fontWeight:700,textAlign:'center',width:112,lineHeight:1.2,cursor:'pointer',outline:detail?.status===item.s?'2px solid #fff':'none',outlineOffset:-2}}>{item.s}</div>
                      {i < arr.length-1 && <div style={{color:'var(--t3)',fontSize:13,margin:'0 3px'}}>→</div>}
                    </div>
                  ))}
                </div>
                <div style={{marginTop:16,paddingTop:12,borderTop:'1px solid var(--br)'}}>
                  <div style={{fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>Exit statuses — can be set from any stage above</div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    {EXIT_FLOW.map(item => (
                      <div key={item.s} onClick={()=>{updateStatus(detail, item.s);setShowFlow(false)}} style={{background:item.c,color:'#fff',borderRadius:6,padding:'7px 9px',fontSize:11,fontWeight:700,textAlign:'center',width:112,lineHeight:1.2,cursor:'pointer',outline:detail?.status===item.s?'2px solid #fff':'none',outlineOffset:-2}}>{item.s}</div>
                    ))}
                  </div>
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
              <LeadInlineFax lead={inlineFaxLead} onClose={()=>setShowFaxModal(false)} onLogged={()=>loadLeadNotes(inlineFaxLead.id)}/>
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

        {addModal && detail && (
          <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setAddModal(false)}>
            <div className="modal" style={{width:620,maxHeight:'90vh',overflowY:'auto'}}>
              <div className="mh">
                <span className="mt">📋 Addendum & 2nd Trade — {detail.name}</span>
                <button className="xbtn" onClick={()=>setAddModal(false)}>&times;</button>
              </div>

              {/* ── Addendum Section ── */}
              <div style={{fontSize:11,fontWeight:700,color:'var(--blue)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:10}}>📋 Service Addendum</div>
              <div style={{fontSize:12,color:'var(--t3)',marginBottom:14}}>
                Fill in the resolution fee and scope details, check off the services that apply based on the investigation results, then print or send for e-signature.
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
              <div className="field"><label>Resolution Services Authorized — based on investigation results</label>
                <div style={{background:'var(--s2)',border:'1px solid var(--br)',borderRadius:7,padding:'8px 12px',maxHeight:180,overflowY:'auto'}}>
                  {RESOLUTION_SERVICES.map(s=>(
                    <label key={s.key} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 0',fontSize:12.5,cursor:'pointer'}}>
                      <input type="checkbox" style={{width:'auto'}}
                        checked={addForm.services.includes(s.key)}
                        onChange={()=>setAddForm(f=>({...f,services:f.services.includes(s.key)?f.services.filter(k=>k!==s.key):[...f.services,s.key]}))}/>
                      {s.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="field"><label>Additional Scope / Work Notes</label>
                <textarea value={addForm.notes} onChange={e=>setAddForm(f=>({...f,notes:e.target.value}))} style={{minHeight:60}} placeholder="e.g. Includes filing 3 years of unfiled returns..."/>
              </div>
              <div className="field"><label>Send Via</label>
                <select value={addForm.sendVia} onChange={e=>setAddForm(f=>({...f,sendVia:e.target.value}))}>
                  <option value="email">Email</option>
                  <option value="sms">Text Message</option>
                  <option value="both">Email + Text</option>
                </select>
              </div>
              <div style={{display:'flex',gap:8,marginBottom:20}}>
                <button className="btn sec" style={{flex:1,justifyContent:'center',padding:11}} onClick={()=>{
                  if(!addForm.resolutionFee){showToast('Enter the resolution fee first');return}
                  generateAddendum(detail, addForm)
                }}>🖨️ Print</button>
                <button className="btn pri" style={{flex:2,justifyContent:'center',padding:11}} disabled={addendumSending} onClick={()=>sendAddendum(detail)}>
                  {addendumSending ? 'Sending…' : '✍️ Send for E-Signature'}
                </button>
              </div>

              {/* ── 2nd Trade Section ── */}
              <div style={{borderTop:'1px solid var(--br)',paddingTop:18}}>
                <div style={{fontSize:11,fontWeight:700,color:'var(--ok)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:10}}>💳 Charge 2nd Trade</div>
                <div style={{fontSize:12,color:'var(--t3)',marginBottom:12,lineHeight:1.6}}>
                  Charge the resolution fee directly to the card on file. Commission goes to whoever sent the addendum.
                </div>
                <div style={{background:'var(--s2)',borderRadius:8,padding:'10px 14px',border:'1px solid var(--br)',marginBottom:12,fontSize:13}}>
                  <div style={{fontWeight:700}}>{detail.name}</div>
                  {detail.email&&<div style={{fontSize:12,color:'var(--t3)',marginTop:2}}>{detail.email}</div>}
                  {addForm.resolutionFee&&<div style={{fontSize:12,color:'var(--ok)',marginTop:4,fontWeight:600}}>Fee entered: ${Number(addForm.resolutionFee).toLocaleString()}</div>}
                </div>
                <button className="btn pri" style={{width:'100%',padding:11,fontWeight:700,justifyContent:'center'}}
                  onClick={()=>{setAddModal(false);setResolutionFeeLead(detail)}}>
                  💳 Open Stripe Charge Form →
                </button>
              </div>
            </div>
          </div>
        )}

        {bookingLead && (
          <BookingWidget contact={{name:bookingLead.name, email:bookingLead.email, phone:bookingLead.phone}} onClose={()=>setBookingLead(null)} mode="lead"/>
        )}
        {resolutionFeeLead && (
          <ChargeResolutionFeeModal
            lead={resolutionFeeLead}
            showToast={showToast}
            onClose={()=>setResolutionFeeLead(null)}
            onPaid={async ()=>{ setResolutionFeeLead(null); await advanceLeadStatus(supabase, l.name, 'Resolution Fee Paid'); convertToClient(l, true) }}
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
            purpose={paymentLinkModal.purpose}
            defaultAmount={paymentLinkModal.defaultAmount}
            defaultDescription={paymentLinkModal.defaultDescription}
            onClose={async()=>{ setPaymentLinkModal(null); const {data}=await supabase.from('leads').select('*').eq('id',l.id).single(); if (data) setDetail(data) }}
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

        {poaModal && poaLead && (() => {
          const matchedForms = STATE_POA_FORMS.filter(f => f.state === poaLead.state)
          const hasMatch = matchedForms.length > 0
          return (
            <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setPoaModal(false)}>
              <div className="modal" style={{width:560,maxHeight:'88vh',overflowY:'auto'}}>
                <div className="mh">
                  <span className="mt">🏛️ State POA — {poaLead.name}</span>
                  <button className="xbtn" onClick={()=>setPoaModal(false)}>&times;</button>
                </div>
                <div style={{fontSize:12,color:'var(--t3)',marginBottom:16,lineHeight:1.6}}>
                  Send the {poaLead.state||'state'} Power of Attorney for e-signature. Client gets an email/text with a signing link.
                </div>
                <div style={{background:'var(--s2)',borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:13}}>
                  <div style={{fontWeight:700}}>{poaLead.name}</div>
                  <div style={{color:'var(--t3)',marginTop:2}}>{poaLead.email} {poaLead.phone ? '· '+poaLead.phone : ''}</div>
                  {poaLead.state && <div style={{color:'var(--blue)',marginTop:2,fontWeight:600}}>State: {poaLead.state}</div>}
                </div>
                {!poaLead.state ? (
                  <div style={{color:'var(--warn)',fontSize:13,marginBottom:16}}>⚠️ No state on file. Edit the lead profile to add their state first.</div>
                ) : !hasMatch ? (
                  <div style={{color:'var(--t3)',fontSize:13,marginBottom:16}}>No POA form on file for {poaLead.state}. Available: FL, NC, TX, OH, NY, PA, CA, GA, IL, MA, MO, OR, TN, WA, WY, AZ, ID.</div>
                ) : (
                  <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:16}}>
                    {matchedForms.map(form=>(
                      <div key={form.num} style={{background:'var(--s2)',borderRadius:8,padding:'10px 14px',border:'1px solid var(--br)'}}>
                        <div style={{fontWeight:600,fontSize:13}}>{form.state} — {form.label}</div>
                        <div style={{fontSize:11,color:'var(--t3)',marginTop:2}}>{form.num}</div>
                      </div>
                    ))}
                  </div>
                )}
                {hasMatch && poaLead.state && (<>
                  <div className="field"><label>Send Via</label>
                    <select value={poaSendVia} onChange={e=>setPoaSendVia(e.target.value)}>
                      <option value="email">Email</option>
                      <option value="sms">Text Message</option>
                      <option value="both">Email + Text</option>
                    </select>
                  </div>
                  <div style={{display:'flex',gap:8,marginTop:6}}>
                    <button className="btn sec" style={{flex:1,justifyContent:'center',padding:11}}
                      onClick={()=>window.open(`${import.meta.env.BASE_URL.replace(/\/$/,'')}/state-forms/${matchedForms[0].file}`,'_blank')}>
                      ⬇ Download Blank
                    </button>
                    <button className="btn pri" style={{flex:2,justifyContent:'center',padding:11}}
                      disabled={poaSending} onClick={()=>sendLeadStatePOA(poaLead, matchedForms[0], poaSendVia)}>
                      {poaSending ? 'Sending…' : '✍️ Send for E-Signature'}
                    </button>
                  </div>
                </>)}
              </div>
            </div>
          )
        })()}
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
        {isTaxAdvisor ? (
          <span className="chip on" style={{marginLeft:8}}>🎯 My Leads</span>
        ) : (
          <select value={repFilter} onChange={e=>setRepFilter(e.target.value)}
            style={{marginLeft:8,padding:'6px 10px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',fontSize:12}}>
            <option value="All">All Reps</option>
            <option value="Unassigned">Unassigned</option>
            {employees.map(e=><option key={e.id} value={e.name}>{e.name}</option>)}
          </select>
        )}
      </div>

      <div className="card">
        <div className="ch">
          <span className="ct">All Leads ({filtered.length})</span>
          <button className="btn pri" onClick={()=>{ setForm(isTaxAdvisor && employeeName ? { ...BLANK, assignedTo: employeeName } : BLANK); setModal(true) }}>+ Add Lead</button>
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
                  <td onClick={e=>e.stopPropagation()}><PhoneLink val={l.phone} name={l.name}/></td>
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



