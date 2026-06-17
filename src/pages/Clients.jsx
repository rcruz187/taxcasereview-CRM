import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import IRSFormFiller from '../components/IRSFormFiller'
import ErrorBoundary from '../components/ErrorBoundary'
import InPlaceCaller from '../components/InPlaceCaller'
import BookingWidget from '../components/BookingWidget'
import FinancialProfile from './FinancialProfile'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { generateServiceAgreement, generateAddendum, generateEngagementLetter, generatePOACoverLetter, sendFullPackage, generateCreditCardAuthForm, generateCancellationNotice } from '../lib/docUtils'

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

const IRS_STATUS_OPTIONS = ['ACS','Notice Status','Queue for ACS','Currently Not Collectible','Installment Agreement','Garnishment','Levy Issued','Levied','Lien Filed','Appeals','Litigation','Released','Other']

const BLANK_DEP = { name:'', ssn:'', dob:'', relationship:'Child' }
const BLANK = {
  clientType:'Individual', name:'', phone:'', phone2:'', email:'',
  street:'', city:'', state:'', zip:'', county:'',
  ssn:'', ein:'', dobM:'', dobD:'', dobY:'',
  spouseName:'', spouseSsn:'', spouseDob:'', filingStatus:'Single',
  irsBalance:'', issueType:'OIC', irsOrState:'IRS Federal', taxYears:'',
  filingRequirements:[],
  irsStatus:'', irsStatusOther:'', irsDeadline:'',
  stateStatus:'', stateStatusOther:'', stateDeadline:'',
  clientSince:'', status:'Active', notes:'', assignedTo:'',
  pipelineStage:'investigation', dependents:[]
}

function Bdg({s,c}) { return <span className={`bdg ${c||'bn'}`}>{s}</span> }
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
        style={{color:'var(--blue)',textDecoration:'none',fontWeight:600,display:'inline-flex',alignItems:'center',gap:5,cursor:'pointer'}}
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
const menuBtnStyle = {
  display:'block', width:'100%', textAlign:'left', padding:'9px 14px', fontSize:12.5,
  background:'none', border:'none', color:'var(--tx)', cursor:'pointer'
}
function DR({label,val,name,entityId,onLogged,showToast}) {
  const isPhone = label==='Phone'||label==='Phone 2'||label==='Phone2'
  const renderVal = () => {
    if (!val) return <span style={{color:'var(--t3)'}}>—</span>
    if (isPhone) return (
      <InPlaceCaller phone={val} name={name} entityType="client" entityId={entityId} supabase={supabase} showToast={showToast} onLogged={onLogged}/>
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
const CSED_FORM_LABELS = {
  '1040':'Personal Federal (1040)', 'STATE':'Personal State', 'CP':'Business CP (Federal)',
  '940':'Business 940 (FUTA)', '941':'Business 941 (Payroll)', '1120S':'Business 1120-S'
}
function CsedSummaryCard({clientName}) {
  const [recs, setRecs] = useState(null)
  useEffect(() => {
    if (!clientName) return
    supabase.from('client_compliance_records').select('form_type,tax_year,quarter,csed')
      .eq('client_name', clientName).not('csed','is',null)
      .then(({data}) => setRecs(data||[]))
  }, [clientName])
  if (!recs || recs.length===0) return null
  const sorted = [...recs].sort((a,b)=>new Date(a.csed)-new Date(b.csed))
  const first = sorted[0]
  const last = sorted[sorted.length-1]
  const fmt = r => `${CSED_FORM_LABELS[r.form_type]||r.form_type} ${r.tax_year}${r.quarter?` Q${r.quarter}`:''} — ${r.csed}`
  return (
    <div className="card">
      <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)',marginBottom:10}}>CSED Summary</div>
      <DR label="1st to Expire" val={fmt(first)}/>
      <DR label="Last to be Removed" val={fmt(last)}/>
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
    const { data:s } = await supabase.from('settings').select('signalwire_backend,sw_inbound_did').limit(1).maybeSingle()
    let fileUrl = null
    if (file) {
      const path = 'fax/'+Date.now()+'_'+file.name
      await supabase.storage.from('documents').upload(path, file, {upsert:true})
      const { data:u } = supabase.storage.from('documents').getPublicUrl(path)
      fileUrl = u?.publicUrl
    }
    const toFull = '+1'+toNum.slice(-10)
    const fromNum = s?.sw_inbound_did || ''
    let sent = false
    if (s?.signalwire_backend) {
      try {
        const res = await fetch(s.signalwire_backend+'/fax/send', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({to:toFull,from:fromNum,...(fileUrl?{media_url:fileUrl}:{})})
        })
        const d = await res.json()
        sent = res.ok && d?.success
      } catch(e) {}
    }
    await supabase.from('fax_logs').insert([{
      to_number:toFull, from_number:fromNum, client_name:client?.name,
      subject, notes, file_name:file?.name||null, file_url:fileUrl,
      status: sent ? 'Sent' : (s?.signalwire_backend ? 'Failed' : 'Logged'),
      sent_by:'CRM', sent_at:new Date().toISOString(), created_at:new Date().toISOString()
    }])
    setSending(false)
    showToast('📠 Fax '+(sent?'sent':'logged')+'!')
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
const DOC_TYPES_INLINE = ['Tax Service Agreement','Engagement Letter','Form 2848 — Power of Attorney','Form 8821 — Tax Info Auth',
  'Fee Agreement Addendum','9465 Installment Agreement','OIC Application (656)','Custom Document']

function InlineEsignForm({ client, onClose, showToast }) {
  const [docType,  setDocType]  = useState('Tax Service Agreement')
  const [message,  setMessage]  = useState('Please review and sign the attached document at your earliest convenience.')
  const [priority, setPriority] = useState('Normal')
  const [saving,   setSaving]   = useState(false)
  const [link,     setLink]     = useState('')

  async function create() {
    setSaving(true)
    const { data, error } = await supabase.from('esigns').insert([{
      doc_type: docType, client_name: client?.name, client_email: client?.email||'', client_phone: client?.phone||'',
      message, priority, status:'Awaiting', sent_at: new Date().toISOString(), created_at: new Date().toISOString()
    }]).select().single()
    setSaving(false)
    if (error) { showToast('Error: '+error.message,'err'); return }
    const url = window.location.origin+'/taxcasereview-CRM/sign/'+data.id
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


function InlinePortalForm({ client, onClose, showToast }) {
  const [sendVia, setSendVia] = useState(client?.email ? 'email' : 'sms')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(null)

  const url = window.location.origin + '/taxcasereview-CRM/portal/' + client?.id
  const last4 = (client?.ssn || '').replace(/\D/g, '').slice(-4)

  async function send() {
    setSending(true)
    await navigator.clipboard.writeText(url).catch(() => {})
    let emailSent = false, smsSent = false
    const { data: cfg } = await supabase.from('settings').select('signalwire_backend').limit(1).maybeSingle()

    if ((sendVia === 'email' || sendVia === 'both') && client?.email) {
      try {
        const { error } = await supabase.functions.invoke('send-email', {
          body: {
            to: client.email,
            subject: `Your Tax Compliance Information — Tax Case Review`,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px"><div style="font-size:18px;font-weight:800;color:#1d4ed8;margin-bottom:16px">Tax Case Review</div><p>Dear <strong>${client.name}</strong>,</p><p>You can now view your tax compliance information online — filing status, balances, and key dates for each tax year on file.</p><p style="text-align:center;margin:24px 0"><a href="${url}" style="background:#3b82f6;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">View My Information</a></p><p style="font-size:12px;color:#64748b">You'll be asked to confirm your email and the last 4 digits of your SSN to access your information. Link: ${url}</p><p style="font-size:11px;color:#94a3b8;margin-top:24px">Tax Case Review · 631 US Highway One Ste 304, North Palm Beach, FL 33408</p></div>`
          }
        })
        if (!error) emailSent = true
      } catch (e) { console.error('Email error:', e) }
    }
    if ((sendVia === 'sms' || sendVia === 'both') && client?.phone && cfg?.signalwire_backend) {
      try {
        const r = await fetch(cfg.signalwire_backend + '/sms/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: client.phone, body: `Hi ${client.name}, view your tax compliance info here: ${url} (you'll need the last 4 of your SSN to access it)` })
        })
        const d = await r.json()
        if (d.success) smsSent = true
      } catch (e) { console.error('SMS error:', e) }
    }
    setSending(false)
    const sent = [emailSent && 'email', smsSent && 'SMS'].filter(Boolean)
    setDone({ sent })
  }

  if (done) return (
    <div style={{padding:'0 4px 4px'}}>
      <div style={{background:'rgba(34,197,94,.08)',border:'1px solid rgba(34,197,94,.3)',borderRadius:8,padding:'12px 14px',marginBottom:14}}>
        <div style={{fontSize:12,fontWeight:700,color:'var(--ok)',marginBottom:6}}>
          {done.sent.length ? `✅ Portal link sent via ${done.sent.join(' & ')}!` : '📋 Link copied to clipboard'}
        </div>
        {!done.sent.length && <div style={{fontSize:11,color:'var(--warn)',marginBottom:6}}>Email/SMS not configured — share the link manually.</div>}
        <div style={{fontSize:11,color:'var(--t3)',wordBreak:'break-all'}}>{url}</div>
      </div>
      <button className="btn sec" style={{width:'100%',justifyContent:'center'}} onClick={onClose}>Done</button>
    </div>
  )

  return (
    <div style={{padding:'0 4px 4px'}}>
      <div style={{fontSize:12,color:'var(--t2)',marginBottom:14,lineHeight:1.6}}>
        {client?.name} can view their tax compliance findings (filing status, balances, liens, CSED dates) and download their own Excel copy — without logging into the CRM.
      </div>
      <div style={{background:'var(--s2)',borderRadius:6,padding:'9px 12px',marginBottom:12,fontSize:12,color:'var(--t3)',lineHeight:1.7}}>
        <div>📧 {client?.email || <span style={{color:'var(--warn)'}}>No email on file</span>}</div>
        <div>📱 {client?.phone || <span style={{color:'var(--warn)'}}>No phone on file</span>}</div>
        <div style={{marginTop:6}}>
          🔒 Access requires email + last 4 of SSN: {last4 && client?.email ? <strong style={{color:'var(--tx)'}}>{client.email} / ***{last4}</strong> : <span style={{color:'var(--bad)'}}>{!last4 && !client?.email ? 'No SSN or email on file' : !last4 ? 'No SSN on file' : 'No email on file'} — client won't be able to unlock the portal</span>}
        </div>
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
      <div style={{display:'flex',gap:8,marginTop:14}}>
        <button className="btn sec" style={{flex:1,justifyContent:'center'}} onClick={onClose}>Cancel</button>
        <button className="btn sm" style={{flex:1,justifyContent:'center',background:'#0ea5e9',color:'#fff',borderColor:'#0ea5e9'}} onClick={send} disabled={sending || !last4 || !client?.email}>
          {sending?'Sending…':'🔓 Send Portal Link'}
        </button>
      </div>
    </div>
  )
}

// ── Tax Organizer Quick Action — picks a year, creates the record, sends link ──
function InlineOrganizerForm({ client, onClose, showToast }) {
  const [year, setYear] = useState(String(new Date().getFullYear() + 1))
  const [sendVia, setSendVia] = useState(client?.email ? 'email' : 'sms')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(null)

  async function send() {
    if (!/^\d{4}$/.test(year.trim())) { showToast('Enter a valid 4-digit tax year'); return }
    setSending(true)
    let orgId
    const { data: existing } = await supabase.from('tax_organizer_responses')
      .select('id').eq('client_name', client.name).eq('tax_year', year.trim()).maybeSingle()
    if (existing) {
      orgId = existing.id
    } else {
      const { data: created, error: createErr } = await supabase.from('tax_organizer_responses').insert([{
        client_name: client.name, client_email: client.email || '', tax_year: year.trim(),
        answers: {}, status: 'In Progress', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }]).select().single()
      if (createErr) { setSending(false); showToast('Error: ' + createErr.message); return }
      orgId = created.id
    }

    const url = window.location.origin + '/taxcasereview-CRM/organizer/' + orgId
    await navigator.clipboard.writeText(url).catch(() => {})
    let emailSent = false, smsSent = false
    const { data: cfg } = await supabase.from('settings').select('signalwire_backend').limit(1).maybeSingle()

    if ((sendVia === 'email' || sendVia === 'both') && client?.email) {
      try {
        const { error } = await supabase.functions.invoke('send-email', {
          body: {
            to: client.email,
            subject: `Your ${year.trim()} Tax Organizer — Tax Case Review`,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px"><div style="font-size:18px;font-weight:800;color:#1d4ed8;margin-bottom:16px">Tax Case Review</div><p>Dear <strong>${client.name}</strong>,</p><p>Please complete your ${year.trim()} tax organizer so we can begin preparing your return. It only takes a few minutes, and you can save your progress and come back anytime.</p><p style="text-align:center;margin:24px 0"><a href="${url}" style="background:#9333ea;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">Start My Tax Organizer</a></p><p style="font-size:12px;color:#64748b">Link: ${url}</p><p style="font-size:11px;color:#94a3b8;margin-top:24px">Tax Case Review · 631 US Highway One Ste 304, North Palm Beach, FL 33408</p></div>`
          }
        })
        if (!error) emailSent = true
      } catch (e) { console.error('Email error:', e) }
    }
    if ((sendVia === 'sms' || sendVia === 'both') && client?.phone && cfg?.signalwire_backend) {
      try {
        const r = await fetch(cfg.signalwire_backend + '/sms/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: client.phone, body: `Hi ${client.name}, please complete your ${year.trim()} tax organizer here: ${url}` })
        })
        const d = await r.json()
        if (d.success) smsSent = true
      } catch (e) { console.error('SMS error:', e) }
    }
    setSending(false)
    const sent = [emailSent && 'email', smsSent && 'SMS'].filter(Boolean)
    setDone({ sent, url })
  }

  if (done) return (
    <div style={{padding:'0 4px 4px'}}>
      <div style={{background:'rgba(34,197,94,.08)',border:'1px solid rgba(34,197,94,.3)',borderRadius:8,padding:'12px 14px',marginBottom:14}}>
        <div style={{fontSize:12,fontWeight:700,color:'var(--ok)',marginBottom:6}}>
          {done.sent.length ? `✅ Organizer link sent via ${done.sent.join(' & ')}!` : '📋 Link copied to clipboard'}
        </div>
        {!done.sent.length && <div style={{fontSize:11,color:'var(--warn)',marginBottom:6}}>Email/SMS not configured — share the link manually.</div>}
        <div style={{fontSize:11,color:'var(--t3)',wordBreak:'break-all'}}>{done.url}</div>
      </div>
      <button className="btn sec" style={{width:'100%',justifyContent:'center'}} onClick={onClose}>Done</button>
    </div>
  )

  return (
    <div style={{padding:'0 4px 4px'}}>
      <div style={{fontSize:12,color:'var(--t2)',marginBottom:14,lineHeight:1.6}}>
        Send {client?.name} a multi-step tax organizer to fill out for a specific filing year. Their answers sync straight into the CRM, and the same organizer is also available inside their Client Portal.
      </div>
      <div className="field"><label>Tax Year</label>
        <input value={year} onChange={e=>setYear(e.target.value)} maxLength={4} style={{maxWidth:120}}/>
      </div>
      <div style={{background:'var(--s2)',borderRadius:6,padding:'9px 12px',marginTop:10,marginBottom:12,fontSize:12,color:'var(--t3)',lineHeight:1.7}}>
        <div>📧 {client?.email || <span style={{color:'var(--warn)'}}>No email on file</span>}</div>
        <div>📱 {client?.phone || <span style={{color:'var(--warn)'}}>No phone on file</span>}</div>
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
      <div style={{display:'flex',gap:8,marginTop:14}}>
        <button className="btn sec" style={{flex:1,justifyContent:'center'}} onClick={onClose}>Cancel</button>
        <button className="btn sm" style={{flex:1,justifyContent:'center',background:'#9333ea',color:'#fff',borderColor:'#9333ea'}} onClick={send} disabled={sending || !year.trim()}>
          {sending?'Sending…':'🧾 Send Tax Organizer'}
        </button>
      </div>
    </div>
  )
}

// ── Canopy-style Document Manager for a specific client ──────────────────────
export const DOC_FOLDERS = ['IRS Docs','Tax Returns','Agreements','POA & Forms','Transcripts','Correspondence','Financial Statements','E-Signatures','Other']
const FILE_EXT_ICON = n => { const e=(n||'').split('.').pop().toLowerCase(); return {pdf:'📄',doc:'📝',docx:'📝',xls:'📊',xlsx:'📊',jpg:'🖼️',jpeg:'🖼️',png:'🖼️',tiff:'🖼️'}[e]||'📎' }
const fmt = b => b<1024?b+'B':b<1048576?(b/1024).toFixed(1)+'KB':(b/1048576).toFixed(1)+'MB'

export function ClientDocs({ clientName, supabase, showToast }) {
  const [docs,       setDocs]       = useState([])
  const [folder,     setFolder]     = useState('All')
  const [uploading,  setUploading]  = useState(false)
  const [form,       setForm]       = useState({ name:'', docType:'IRS Docs', notes:'' })
  const [file,       setFile]       = useState(null)
  const [saving,     setSaving]     = useState(false)
  const [preview,    setPreview]    = useState(null)
  const fileRef = useRef(null)

  useEffect(() => { loadDocs() }, [clientName])

  async function loadDocs() {
    const { data } = await supabase.from('documents').select('*')
      .eq('client', clientName).order('created_at', { ascending: false })
    setDocs(data || [])
  }

  async function upload() {
    if (!form.name.trim()) { showToast('Document name required'); return }
    setSaving(true)
    let fileUrl = null, fileName = null, fileSize = null
    if (file) {
      const path = `docs/${clientName.replace(/\s+/g,'-')}/${Date.now()}_${file.name}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
      if (upErr) { showToast('Upload error: '+upErr.message); setSaving(false); return }
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
      fileUrl = urlData.publicUrl; fileName = file.name; fileSize = file.size
    }
    const { error } = await supabase.from('documents').insert([{
      name: form.name, client: clientName, docType: form.docType,
      notes: form.notes, file_url: fileUrl, file_name: fileName,
      file_size: fileSize, created_at: new Date().toISOString()
    }])
    setSaving(false)
    if (error) { showToast('Error: '+error.message); return }
    showToast('✅ Document saved!')
    setForm({ name:'', docType:'IRS Docs', notes:'' }); setFile(null); setUploading(false); loadDocs()
  }

  async function delDoc(doc) {
    if (doc.file_name) {
      const path = doc.file_url?.split('/documents/')[1]
      if (path) await supabase.storage.from('documents').remove([path]).catch(()=>{})
    }
    await supabase.from('documents').delete().eq('id', doc.id)
    showToast('Deleted'); loadDocs()
  }

  // Group by folder
  const byFolder = {}
  DOC_FOLDERS.forEach(f => { byFolder[f] = [] })
  docs.forEach(d => {
    const f = d.docType || 'Other'
    if (!byFolder[f]) byFolder[f] = []
    byFolder[f].push(d)
  })

  const visible = folder === 'All' ? docs : (byFolder[folder] || [])

  return (
    <div className="card" style={{padding:0,overflow:'hidden'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',borderBottom:'1px solid var(--br)'}}>
        <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)'}}>
          📁 Documents ({docs.length})
        </div>
        <button className="btn pri" style={{fontSize:11,padding:'3px 10px'}} onClick={()=>setUploading(v=>!v)}>
          {uploading ? '✕ Cancel' : '+ Add Doc'}
        </button>
      </div>

      {/* Upload form */}
      {uploading && (
        <div style={{padding:'10px 14px',background:'var(--s2)',borderBottom:'1px solid var(--br)'}}>
          <div className="fg2">
            <div className="field"><label>Name *</label>
              <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. 2023 Tax Return"/>
            </div>
            <div className="field"><label>Folder</label>
              <select value={form.docType} onChange={e=>setForm(f=>({...f,docType:e.target.value}))}>
                {DOC_FOLDERS.map(f=><option key={f}>{f}</option>)}
              </select>
            </div>
          </div>
          <div style={{border:'2px dashed var(--br)',borderRadius:7,padding:'10px',textAlign:'center',cursor:'pointer',background:file?'rgba(34,197,94,.05)':'transparent',marginBottom:8}}
            onClick={()=>fileRef.current?.click()}
            onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor='var(--blue)'}}
            onDragLeave={e=>e.currentTarget.style.borderColor='var(--br)'}
            onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)setFile(f);e.currentTarget.style.borderColor='var(--br)'}}>
            {file
              ? <span style={{fontSize:12,color:'var(--ok)',fontWeight:600}}>{FILE_EXT_ICON(file.name)} {file.name} ({fmt(file.size)})</span>
              : <span style={{fontSize:11,color:'var(--t3)'}}>📎 Drop file here or click to browse</span>
            }
            <input ref={fileRef} type="file" style={{display:'none'}} onChange={e=>setFile(e.target.files[0])}/>
          </div>
          <input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Notes (optional)"
            style={{width:'100%',padding:'6px 10px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',fontSize:12,marginBottom:8}}/>
          <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:7}} onClick={upload} disabled={saving}>
            {saving?'Saving…':'💾 Save Document'}
          </button>
        </div>
      )}

      {/* 2-pane layout */}
      <div style={{display:'flex',minHeight:docs.length>0?200:80}}>
        {/* Left: folder tree */}
        <div style={{width:180,flexShrink:0,borderRight:'1px solid var(--br)',padding:'8px 0',background:'var(--s2)'}}>
          <div onClick={()=>setFolder('All')}
            style={{padding:'5px 12px',cursor:'pointer',fontSize:12,fontWeight:folder==='All'?700:400,
              background:folder==='All'?'var(--blt)':'transparent',color:folder==='All'?'var(--b2)':'var(--tx)',
              display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span>🗂️ All</span>
            <span style={{fontSize:10,background:'var(--s3)',borderRadius:10,padding:'0 5px'}}>{docs.length}</span>
          </div>
          {DOC_FOLDERS.map(f=>(
            <div key={f} onClick={()=>setFolder(f)}
              style={{padding:'7px 14px',cursor:'pointer',fontSize:12.5,fontWeight:folder===f?700:400,
                background:folder===f?'var(--blt)':'transparent',color:folder===f?'var(--b2)':(byFolder[f]?.length?'var(--tx)':'var(--t3)'),
                display:'flex',justifyContent:'space-between',alignItems:'center',transition:'background .12s'}}
              onMouseEnter={e=>{if(folder!==f)e.currentTarget.style.background='var(--s3)'}}
              onMouseLeave={e=>{if(folder!==f)e.currentTarget.style.background='transparent'}}>
              <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>📂 {f}</span>
              <span style={{fontSize:10,background:'var(--s3)',borderRadius:10,padding:'0 5px',flexShrink:0,minWidth:16,textAlign:'center'}}>{byFolder[f]?.length||0}</span>
            </div>
          ))}
        </div>

        {/* Right: file grid */}
        <div style={{flex:1,padding:10,overflowY:'auto',maxHeight:400}}>
          {visible.length===0 ? (
            <div style={{color:'var(--t3)',fontSize:13,padding:'40px 20px',textAlign:'center'}}>
              <div style={{fontSize:36,marginBottom:8}}>📁</div>
              No documents in {folder==='All'?'this client file':folder} yet.
            </div>
          ) : (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:10}}>
              {visible.map(d=>(
                <div key={d.id}
                  style={{border:'1px solid var(--br)',borderRadius:10,padding:'12px 12px',background:'var(--sf)',
                    cursor:'pointer',transition:'all .15s ease',position:'relative',boxShadow:'0 1px 2px rgba(0,0,0,.08)'}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--blue)';e.currentTarget.style.transform='translateY(-3px)';e.currentTarget.style.boxShadow='0 8px 16px rgba(0,0,0,.18)'}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--br)';e.currentTarget.style.transform='';e.currentTarget.style.boxShadow='0 1px 2px rgba(0,0,0,.08)'}}>
                  <div style={{fontSize:34,textAlign:'center',marginBottom:7}}>{FILE_EXT_ICON(d.file_name||d.name)}</div>
                  <div style={{fontSize:12,fontWeight:600,lineHeight:1.3,marginBottom:5,overflow:'hidden',textOverflow:'ellipsis',
                    display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>
                    {d.name}
                  </div>
                  <div style={{fontSize:10,color:'var(--t3)',marginBottom:8}}>
                    {d.created_at?.slice(0,10)}{d.file_size?` · ${fmt(d.file_size)}`:''}
                  </div>
                  <div style={{display:'flex',gap:4}}>
                    {d.file_url && (
                      <a href={d.file_url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}
                        style={{flex:1,padding:'3px 0',background:'var(--blue)',color:'#fff',borderRadius:5,
                          fontSize:9,fontWeight:700,textAlign:'center',textDecoration:'none'}}>
                        View
                      </a>
                    )}
                    <button onClick={e=>{e.stopPropagation();delDoc(d)}}
                      style={{padding:'3px 6px',background:'var(--bad)',color:'#fff',border:'none',
                        borderRadius:5,cursor:'pointer',fontSize:9,fontWeight:700}}>
                      Del
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Clients() {
  const navigate = useNavigate()
  const { id: urlId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useApp()

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setForm(BLANK)
      setModal(true)
    }
  }, [searchParams])
  const [clients,   setClients]   = useState([])
  const [employees, setEmployees] = useState([])
  const [filter,    setFilter]    = useState('All')
  const [showArchived, setShowArchived] = useState(false)
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
  const [noteVisibleToClient, setNoteVisibleToClient] = useState(false)
  const [addingNote,  setAddingNote]  = useState(false)
  const [relTasks,    setRelTasks]    = useState([])
  const [relInvoices, setRelInvoices] = useState([])
  const [relPayments, setRelPayments] = useState([])
  const [loadingRel,  setLoadingRel]  = useState(false)
  const [detailTab,   setDetailTabRaw] = useState(() => searchParams.get('tab') || 'overview')
  function setDetailTab(tab) {
    setDetailTabRaw(tab)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('tab', tab)
      return next
    }, { replace: true })
  }
  const [fillerClient, setFillerClient] = useState(null)
  const [pkgSending, setPkgSending] = useState(false)
  const [bookingClient, setBookingClient] = useState(null)
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
  const [portalModal, setPortalModal] = useState(false)
  const [portalClient, setPortalClient] = useState(null)
  const [orgModal, setOrgModal] = useState(false)
  const [orgClient, setOrgClient] = useState(null)
  const [payForm,     setPayForm]     = useState({ amount:'', method:'Credit Card', date:'', notes:'' })
  const [savingPay,   setSavingPay]   = useState(false)

  useEffect(() => { load() }, [])

  // Save scroll position before refresh/navigation away, restore after detail (+ related data) loads
  useEffect(() => {
    if (!detail) return
    const key = `clientScroll_${detail.id}`
    const saveScroll = () => sessionStorage.setItem(key, String(window.scrollY))
    window.addEventListener('beforeunload', saveScroll)
    window.addEventListener('pagehide', saveScroll)
    return () => {
      saveScroll()
      window.removeEventListener('beforeunload', saveScroll)
      window.removeEventListener('pagehide', saveScroll)
    }
  }, [detail?.id])

  // Restore scroll position once related data has finished loading (page height stable)
  useEffect(() => {
    if (!detail || loadingRel) return
    const key = `clientScroll_${detail.id}`
    const saved = sessionStorage.getItem(key)
    if (saved) {
      requestAnimationFrame(() => window.scrollTo(0, parseInt(saved, 10) || 0))
    }
  }, [detail?.id, loadingRel])
  // Fast path: arriving directly at /clients/:id (e.g. clicking a record,
  // a deep link, or a page refresh) shouldn't wait on the entire client
  // list to download first just to find one row client-side. Fetch that
  // single record immediately; the full list still loads in the
  // background for the table view, but it no longer blocks opening
  // a record you already know the id of.
  useEffect(() => {
    if (!urlId || detail) return
    let cancelled = false
    supabase.from('clients').select('*').eq('id', urlId).single().then(({ data }) => {
      if (!cancelled && data) openDetail(data, { preserveTab: true })
    })
    return () => { cancelled = true }
  }, [urlId])
  useEffect(() => {
    if (urlId && clients.length > 0 && !detail) {
      const found = clients.find(c => String(c.id) === String(urlId))
      if (found) openDetail(found, { preserveTab: true })
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
  const filtered = clients
    .filter(c => showArchived ? !!c.archived : !c.archived)
    .filter(c => filter==='All' || c.clientType===filter)

  function buildPayload(f) {
    const {dobM,dobD,dobY,id,created_at,pipelineStage,...rest}=f
    const dob=dobM&&dobD&&dobY?`${dobM}/${dobD}/${dobY}`:f.dob||''
    // pipelineStage excluded from main payload — updated separately
    const safe={...rest,dob,dependents:JSON.stringify(f.dependents||[]),filingRequirements:JSON.stringify(f.filingRequirements||[])}
    // Empty-string values blow up non-text columns (date, numeric) with
    // "invalid input syntax" — Postgres wants null for "no value", not ''.
    Object.keys(safe).forEach(k => { if (safe[k] === '') safe[k] = null })
    return safe
  }

  async function save() {
    if (!form.name.trim()){showToast('Name is required');return}
    setSaving(true)
    let payload = {...buildPayload(form),created_at:new Date().toISOString()}
    let error
    const skipped = []
    for (let attempt = 0; attempt < 12; attempt++) {
      ;({error} = await supabase.from('clients').insert([payload]))
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
    if (error){showToast('Error: '+error.message);return}
    showToast(skipped.length ? `✅ Client added — but skipped fields not in the database yet: ${skipped.join(', ')}` : '✅ Client added!')
    setModal(false);setForm(BLANK);load()
  }

  async function saveEdit() {
    setSaving(true)
    let payload = buildPayload(form)
    let error
    const skipped = []
    for (let attempt = 0; attempt < 12; attempt++) {
      ;({error} = await supabase.from('clients').update(payload).eq('id',form.id))
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
    if (error){showToast('Error: '+error.message);return}
    showToast(skipped.length ? `✅ Saved — but skipped fields not in the database yet: ${skipped.join(', ')}` : '✅ Saved!')
    setEditModal(false)
    const {data}=await supabase.from('clients').select('*').eq('id',form.id).single()
    if (data){setDetail(data);loadRelated(data.name)}
    load()
  }

  // Clients are archived, never permanently deleted — this hides them from
  // the active roster but keeps every field, note, document, and payment intact.
  async function archiveClient(id,name) {
    if (!window.confirm(`Archive ${name}? This hides it from the active roster — nothing is deleted, and you can restore it anytime from the Archived view.`)) return
    const { error } = await supabase.from('clients').update({ archived: true }).eq('id',id)
    if (error) { showToast('Error: '+error.message); return }
    showToast('Client archived');setDetail(null);load()
  }

  async function restoreClient(id) {
    const { error } = await supabase.from('clients').update({ archived: false }).eq('id',id)
    if (error) { showToast('Error: '+error.message); return }
    showToast('Client restored');load()
  }

  async function handleSendFullPackage(c) {
    setPkgSending(true)
    const res = await sendFullPackage({...c, address:c.street, business_name:c.name}, supabase)
    setPkgSending(false)
    if (res.error) { showToast('Error: '+res.error); return }
    await navigator.clipboard.writeText(res.url).catch(()=>{})
    showToast('✅ Full package created — signing link copied to clipboard!')
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

  async function addClientNote(visibleToClient = false) {
    if (!newNote.trim()||!detail) return
    setAddingNote(true)
    const {error}=await supabase.from('client_notes').insert([{
      client_name:detail.name, content:newNote.trim(),
      created_by:user?.email||'Staff', visible_to_client: visibleToClient,
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
    const filingReqs=parseDependents(c.filingRequirements)
    let dobM='',dobD='',dobY=''
    if (c.dob){const p=c.dob.split('/');if(p.length===3){dobM=p[0];dobD=p[1];dobY=p[2]}}
    setForm({...BLANK,...c,dobM,dobD,dobY,dependents:deps,filingRequirements:filingReqs})
    setEditModal(true)
  }

  function openDetail(c, opts = {}) {
    if (!opts.preserveTab) setDetailTab('overview')
    setDetail(c)
    setRelCases([]);setRelTasks([]);setRelInvoices([])
    loadRelated(c.name)
    const qs = opts.preserveTab ? searchParams.toString() : ''
    navigate(`/clients/${c.id}${qs ? `?${qs}` : ''}`, { replace: true })
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
          {c.archived ? (
            <button className="btn" style={{padding:'8px 18px',fontSize:13,fontWeight:700}} onClick={()=>restoreClient(c.id)}>↩ Restore</button>
          ) : (
            <button className="btn del" style={{padding:'8px 18px',fontSize:13,fontWeight:700}} onClick={()=>archiveClient(c.id,c.name)}>🗑 Archive</button>
          )}
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
                      if (s.key === c.pipelineStage) return // no-op if clicking current stage
                      const prevStage = PIPELINE_STAGES.find(p=>p.key===(c.pipelineStage||'investigation'))
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
                      // Log the stage change as a note
                      const actor = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Staff'
                      const noteContent = `📊 Pipeline stage changed: ${prevStage?.label||'—'} → ${s.label}`
                      const {error:noteErr} = await supabase.from('client_notes').insert({client_name:c.name,content:noteContent,created_by:actor})
                      if(!noteErr && detail?.id===c.id){
                        const{data:notesData}=await supabase.from('client_notes').select('*').eq('client_name',c.name).order('created_at',{ascending:false})
                        if(notesData)setRelNotes(notesData)
                      }
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
            <ActionBtn color="#0891b2" icon="📅" label="Schedule" sub="Book Appointment" onClick={()=>setBookingClient(c)}/>
            <ActionBtn color="#7c3aed" icon="✅" label="Add Task" sub="Assign Work" onClick={()=>{setTaskTitle('');setTaskPriority('Normal');setTaskDueDate('');setTaskModal(true)}}/>
            <ActionBtn color="#0891b2" icon="📁" label="New Case" sub="Open Case" onClick={()=>navigate('/cases')}/>
            <ActionBtn color="#0369a1" icon="📋" label="Pre-Fill 8821/2848" sub="IRS PDF Forms" onClick={()=>{
              try {
                if (!c) { showToast('Error: no client data found'); return }
                setFillerClient({...c, address:c.street, business_name:c.name})
              } catch (err) { showToast('Error opening form: ' + err.message) }
            }}/>
            <ActionBtn color="#6c5ce7" icon="🔐" label="POA Cover Letter" sub="Form 2848" onClick={()=>generatePOACoverLetter(c)}/>
            <ActionBtn color="#1A7FD4" icon="✉️" label="Engagement Letter" sub="Print" onClick={()=>generateEngagementLetter(c)}/>
            <ActionBtn color="#16a34a" icon="📦" label={pkgSending?'Building…':'Full Package'} sub="2848/8821 + Agreement" onClick={()=>!pkgSending&&handleSendFullPackage(c)}/>
            <ActionBtn color="#22863a" icon="📄" label="Service Agreement" sub="Print/Sign" onClick={()=>generateServiceAgreement(c)}/>
            <ActionBtn color="#16a34a" icon="💳" label="Credit Card Auth" sub="Print" onClick={()=>generateCreditCardAuthForm(c)}/>
            <ActionBtn color="#64748b" icon="📋" label="Cancellation Notice" sub="Print" onClick={()=>generateCancellationNotice(c)}/>
            <ActionBtn color="#d97706" icon="📋" label="Addendum" sub="Add Services" onClick={()=>{setAddForm({resolutionFee:'',paymentPlan:'',startDate:'',notes:''});setAddModal(true)}}/>
            <ActionBtn color="#dc2626" icon="📠" label="Send Fax" sub="SignalWire Fax" onClick={()=>{setFaxClient(c);setFaxModal(true)}}/>
            <ActionBtn color="#7c3aed" icon="✍️" label="E-Signature" sub="Request Sign" onClick={()=>{setEsignClient(c);setEsignModal(true)}}/>
            <ActionBtn color="#059669" icon="💳" label="Add Payment" sub="Record Payment" onClick={()=>{setPayForm({amount:'',method:'Credit Card',date:'',notes:''});setPayModal(true)}}/>
            <ActionBtn color="#be185d" icon="🧾" label="New Invoice" sub="Bill Client" onClick={()=>navigate('/invoices')}/>
            <ActionBtn color="#0f766e" icon="📊" label="P&amp;L" sub="Books &amp; Ledger" onClick={()=>navigate('/books?client='+encodeURIComponent(c.name))}/>
            <ActionBtn color="#0ea5e9" icon="🔓" label="Client Portal" sub="Compliance Access" onClick={()=>{setPortalClient(c);setPortalModal(true)}}/>
            <ActionBtn color="#9333ea" icon="🧾" label="Tax Organizer" sub="Send for Filing" onClick={()=>{setOrgClient(c);setOrgModal(true)}}/>
          </div>
        </div>


        {/* ── Overview / Docs / Notes / Payments ─────────────── */}
                {/* ── Tabbed Detail Section ─────────────────────────── */}
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          {/* Tab Bar */}
          <div style={{display:'flex',borderBottom:'1px solid var(--br)',background:'var(--s2)'}}>
            {[
              {key:'overview', label:'📋 Overview'},
              {key:'notes',    label:'📝 Notes'},
              {key:'tasks',    label:'✅ Tasks'},
              {key:'docs',     label:'📁 Docs'},
              {key:'invoices', label:'🧾 Invoices'},
              {key:'payments', label:'💳 Payments'},
              {key:'cases',    label:'📁 Cases'},
              {key:'finprofile', label:'🧮 Financial Profile'},
            ].map(t=>(
              <button key={t.key} onClick={()=>setDetailTab(t.key)}
                style={{padding:'10px 16px',border:'none',borderBottom:detailTab===t.key?'2px solid var(--blue)':'2px solid transparent',
                  background:'none',cursor:'pointer',fontSize:12,fontWeight:detailTab===t.key?700:500,
                  color:detailTab===t.key?'var(--blue)':'var(--t2)',whiteSpace:'nowrap',transition:'all .15s'}}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {detailTab==='overview'&&(
            <div style={{padding:16}}>
              {c.notes&&(
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)',marginBottom:6}}>Case Notes</div>
                  <div style={{fontSize:13,color:'var(--t2)',lineHeight:1.7,whiteSpace:'pre-wrap'}}>{c.notes}</div>
                </div>
              )}
              <div style={{display:'flex',gap:24,flexWrap:'wrap'}}>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em'}}>Documents</div>
                  <div style={{fontSize:22,fontWeight:800,color:'var(--blue)'}}>{relDocs.length}</div>
                </div>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em'}}>Notes</div>
                  <div style={{fontSize:22,fontWeight:800,color:'var(--blue)'}}>{relNotes.length}</div>
                </div>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em'}}>Payments</div>
                  <div style={{fontSize:22,fontWeight:800,color:'var(--ok)'}}>{relPayments.length}</div>
                </div>
              </div>
            </div>
          )}

          {/* Financial Profile Tab */}
          {detailTab==='finprofile'&&(
            <div style={{padding:16}}>
              <ErrorBoundary>
                <FinancialProfile clientName={c.name} client={c}/>
              </ErrorBoundary>
            </div>
          )}

          {/* Docs Tab */}
          {detailTab==='docs'&&(
            <div style={{padding:0}}>
              <ClientDocs clientName={c.name} supabase={supabase} showToast={showToast}/>
            </div>
          )}

          {/* Notes Tab */}
          {detailTab==='notes'&&(
            <div style={{padding:16}}>
              {/* Add note */}
              <div style={{display:'flex',gap:8,marginBottom:14}}>
                <textarea
                  value={newNote} onChange={e=>setNewNote(e.target.value)}
                  placeholder="Add a note…"
                  style={{flex:1,padding:'8px 10px',borderRadius:8,border:'1px solid var(--br)',resize:'vertical',minHeight:60,fontSize:13,fontFamily:'inherit',background:'var(--s2)',color:'var(--tx)'}}
                />
                <div style={{display:'flex',flexDirection:'column',gap:6,alignItems:'flex-start'}}>
                  <label style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'var(--t3)',cursor:'pointer',whiteSpace:'nowrap'}}>
                    <input type="checkbox" checked={noteVisibleToClient} onChange={e=>setNoteVisibleToClient(e.target.checked)}/>
                    Visible to client
                  </label>
                  <button className="btn pri" style={{padding:'8px 14px',fontSize:12}}
                    disabled={!newNote.trim()||addingNote}
                    onClick={async()=>{
                      setAddingNote(true)
                      const {error}=await supabase.from('client_notes').insert({client_name:c.name,content:newNote.trim(),created_by:user?.email||'Staff',visible_to_client:noteVisibleToClient})
                      if(!error){setNewNote('');setNoteVisibleToClient(false);const{data}=await supabase.from('client_notes').select('*').eq('client_name',c.name).order('created_at',{ascending:false});if(data)setRelNotes(data)}
                      setAddingNote(false)
                    }}>
                    {addingNote?'…':'+ Add'}
                  </button>
                </div>
              </div>
              {relNotes.length===0&&<div style={{color:'var(--t3)',fontSize:13,textAlign:'center',padding:'20px 0'}}>No notes yet.</div>}
              {relNotes.map((n,i)=>(
                <div key={n.id||i} style={{padding:'10px 0',borderBottom:'1px solid var(--br)'}}>
                  <div style={{fontSize:13,lineHeight:1.6,color:'var(--tx)',whiteSpace:'pre-wrap'}}>{n.content}</div>
                  <div style={{fontSize:11,color:'var(--t3)',marginTop:4,display:'flex',alignItems:'center',gap:8}}>
                    <span>{n.created_by||'Staff'} · {n.created_at?new Date(n.created_at).toLocaleDateString():''}</span>
                    {n.visible_to_client && <span style={{fontSize:10,fontWeight:700,color:'var(--ok)',background:'rgba(34,197,94,.12)',padding:'1px 7px',borderRadius:99}}>👁 Client can see this</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Payments Tab */}
          {detailTab==='payments'&&(
            <div style={{padding:16}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em'}}>
                  💳 Payments ({relPayments.length})
                </div>
                <button className="btn pri" style={{fontSize:11,padding:'5px 12px'}} onClick={()=>setPayModal(true)}>+ Add Payment</button>
              </div>
              {loadingRel&&<div style={{color:'var(--t3)',fontSize:12}}>Loading…</div>}
              {!loadingRel&&relPayments.length===0&&(
                <div style={{color:'var(--t3)',fontSize:13,textAlign:'center',padding:'20px 0'}}>No payments recorded yet.</div>
              )}
              {relPayments.map(p=>(
                <div key={p.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--br)'}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:'var(--ok)'}}>+${Number(p.amount||0).toLocaleString()}</div>
                    <div style={{fontSize:11,color:'var(--t3)'}}>{p.method||'Payment'} · {p.date||''}</div>
                    {p.notes&&<div style={{fontSize:11,color:'var(--t2)',marginTop:2}}>{p.notes}</div>}
                  </div>
                </div>
              ))}
              {relPayments.length>0&&(
                <div style={{marginTop:12,paddingTop:12,borderTop:'2px solid var(--br)',display:'flex',justifyContent:'space-between'}}>
                  <div style={{fontSize:12,fontWeight:700,color:'var(--t3)'}}>Total Collected</div>
                  <div style={{fontSize:16,fontWeight:800,color:'var(--ok)'}}>
                    ${relPayments.reduce((s,p)=>s+Number(p.amount||0),0).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tasks Tab */}
          {detailTab==='tasks'&&(
            <div style={{padding:16}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em'}}>
                  ✅ Tasks ({relTasks.length})
                </div>
              </div>
              {loadingRel&&<div style={{color:'var(--t3)',fontSize:12}}>Loading…</div>}
              {!loadingRel&&relTasks.length===0&&(
                <div style={{color:'var(--t3)',fontSize:13,textAlign:'center',padding:'20px 0'}}>No tasks yet for this client.</div>
              )}
              {relTasks.map(t=>(
                <div key={t.id} style={{display:'flex',gap:10,alignItems:'flex-start',padding:'8px 0',borderBottom:'1px solid var(--br)'}}>
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
              <div style={{display:'flex',gap:6,marginTop:12}}>
                <input
                  value={quickTask}
                  onChange={e=>setQuickTask(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&addQuickTask()}
                  placeholder="Add a task…"
                  style={{flex:1,padding:'8px 10px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',fontSize:12}}
                />
                <button className="btn pri" style={{fontSize:11,padding:'7px 14px'}} onClick={addQuickTask} disabled={addingTask}>
                  {addingTask?'…':'+ Add'}
                </button>
              </div>
            </div>
          )}

          {/* Cases Tab */}
          {detailTab==='cases'&&(
            <div style={{padding:16}}>
              <div style={{fontSize:12,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:12}}>
                📁 Cases ({relCases.length})
              </div>
              {loadingRel&&<div style={{color:'var(--t3)',fontSize:12}}>Loading…</div>}
              {!loadingRel&&relCases.length===0&&(
                <div style={{color:'var(--t3)',fontSize:13,textAlign:'center',padding:'20px 0'}}>No cases linked to this client.</div>
              )}
              {relCases.map(cas=>(
                <div key={cas.id} style={{borderBottom:'1px solid var(--br)',padding:'10px 0'}}>
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
          )}

          {/* Invoices Tab */}
          {detailTab==='invoices'&&(
            <div style={{padding:16}}>
              <div style={{fontSize:12,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:12}}>
                🧾 Invoices ({relInvoices.length})
              </div>
              {loadingRel&&<div style={{color:'var(--t3)',fontSize:12}}>Loading…</div>}
              {!loadingRel&&relInvoices.length===0&&(
                <div style={{color:'var(--t3)',fontSize:13,textAlign:'center',padding:'20px 0'}}>No invoices for this client.</div>
              )}
              {relInvoices.map(inv=>(
                <div key={inv.id} style={{borderBottom:'1px solid var(--br)',padding:'10px 0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
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
          )}
        </div>

        {detailTab==='overview' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,alignItems:'start'}}>
          {/* LEFT COLUMN */}
          <div style={{display:'flex',flexDirection:'column',gap:12}}>

            {/* Contact Info */}
            <div className="card">
              <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)',marginBottom:10}}>Contact Info</div>
              <DR label="Phone"   val={c.phone} name={c.name} entityId={c.id} showToast={showToast} onLogged={()=>{ loadRelated(c.name) }}/>
              <DR label="Phone 2" val={c.phone2} name={c.name} entityId={c.id} showToast={showToast} onLogged={()=>{ loadRelated(c.name) }}/>
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
              <DR label="Spouse DOB"    val={c.spouseDob}/>
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
              <DR label="Filing Reqs"  val={parseDependents(c.filingRequirements).join(', ')}/>
              {(c.irsOrState||'IRS Federal')!=='State' && (
                <>
                  <DR label="IRS Status"   val={c.irsStatus==='Other'?c.irsStatusOther:c.irsStatus}/>
                  <DR label="IRS Deadline" val={c.irsDeadline}/>
                </>
              )}
              {(c.irsOrState||'IRS Federal')!=='IRS Federal' && (
                <>
                  <DR label="State Status"   val={c.stateStatus==='Other'?c.stateStatusOther:c.stateStatus}/>
                  <DR label="State Deadline" val={c.stateDeadline}/>
                </>
              )}
              <DR label="Assigned Rep" val={c.assignedTo}/>
              <DR label="Client Since" val={c.clientSince}/>
            </div>

            {/* CSED Summary */}
            <CsedSummaryCard clientName={c.name}/>

          </div>
        </div>
        )}

        {editModal&&<ClientFormModal form={form} fld={fld} reps={reps} saving={saving} onSave={saveEdit} onClose={()=>setEditModal(false)} title="Edit Client"/>}

        {fillerClient && (
          <ErrorBoundary onClose={()=>setFillerClient(null)}>
            <IRSFormFiller client={fillerClient} onClose={()=>setFillerClient(null)}/>
          </ErrorBoundary>
        )}

        {bookingClient && (
          <BookingWidget contact={{name:bookingClient.name, email:bookingClient.email, phone:bookingClient.phone}} onClose={()=>setBookingClient(null)} mode="client"/>
        )}

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

      {portalModal && portalClient && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setPortalModal(false)}>
          <div className="modal" style={{width:500}}>
            <div className="mh"><span className="mt">🔓 Client Portal — {portalClient.name}</span><button className="xbtn" onClick={()=>setPortalModal(false)}>&times;</button></div>
            <InlinePortalForm client={portalClient} onClose={()=>setPortalModal(false)} showToast={showToast}/>
          </div>
        </div>
      )}

      {orgModal && orgClient && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setOrgModal(false)}>
          <div className="modal" style={{width:500}}>
            <div className="mh"><span className="mt">🧾 Tax Organizer — {orgClient.name}</span><button className="xbtn" onClick={()=>setOrgModal(false)}>&times;</button></div>
            <InlineOrganizerForm client={orgClient} onClose={()=>setOrgModal(false)} showToast={showToast}/>
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
            <span className={`chip${showArchived?' on':''}`} onClick={()=>setShowArchived(a=>!a)}>🗄 Archived</span>
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
                  <td onClick={e=>e.stopPropagation()}><PhoneLink val={c.phone} name={c.name}/></td>
                  <td style={{color:'var(--t2)',fontSize:12}}>{c.email||'—'}</td>
                  <td>{formatBalance(c.irsBalance)}</td>
                  <td>{c.issueType||'—'}</td>
                  <td style={{color:'var(--t2)',fontSize:12}}>{c.assignedTo||'—'}</td>
                  <td><span className={`bdg ${c.status==='Active'?'bg':'bn'}`}>{c.status||'Active'}</span></td>
                  <td style={{color:'var(--t2)',fontSize:12}}>{c.clientSince||'—'}</td>
                  <td onClick={e=>e.stopPropagation()}>
                    {c.archived
                      ? <button className="btn" onClick={()=>restoreClient(c.id)}>↩</button>
                      : <button className="btn del" onClick={()=>archiveClient(c.id,c.name)}>Del</button>}
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

      {portalModal && portalClient && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setPortalModal(false)}>
          <div className="modal" style={{width:500}}>
            <div className="mh"><span className="mt">🔓 Client Portal — {portalClient.name}</span><button className="xbtn" onClick={()=>setPortalModal(false)}>&times;</button></div>
            <InlinePortalForm client={portalClient} onClose={()=>setPortalModal(false)} showToast={showToast}/>
          </div>
        </div>
      )}

      {orgModal && orgClient && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setOrgModal(false)}>
          <div className="modal" style={{width:500}}>
            <div className="mh"><span className="mt">🧾 Tax Organizer — {orgClient.name}</span><button className="xbtn" onClick={()=>setOrgModal(false)}>&times;</button></div>
            <InlineOrganizerForm client={orgClient} onClose={()=>setOrgModal(false)} showToast={showToast}/>
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
          <div className="fg2">
            <div className="field"><label>Spouse Date of Birth</label><input type="date" value={form.spouseDob||''} onChange={e=>fld('spouseDob',e.target.value)}/></div>
            <div className="field"><label>Filing Status</label>
              <select value={form.filingStatus||'Single'} onChange={e=>fld('filingStatus',e.target.value)}>
                {['Single','Married Filing Jointly','Married Filing Separately','Head of Household','Qualifying Widow(er)'].map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
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
              {['OIC','Installment Agreement','CNC','Penalty Abatement','Lien Withdrawal','TFRP','Payroll Tax','Unfiled Returns','Appeals','Audit','Liens/Levies','Tax Investigation','ACS','Notice Status','Other'].map(o=><option key={o}>{o}</option>)}
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


