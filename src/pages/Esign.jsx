import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useLocation } from 'react-router-dom'

const DOC_TYPES = ['Engagement Letter','Form 2848 — Power of Attorney','Form 8821 — Tax Info Auth',
  '9465 Installment Agreement Consent','OIC Application (656)','Form 433-A Collection Info',
  'Form 433-B Business Collection Info','CDP Hearing Request','Service Agreement',
  'Fee Agreement Addendum','Custom Document']

const BLANK = {
  docType:'Engagement Letter', clientName:'', clientEmail:'',
  message:'Please review and sign the attached document at your earliest convenience. Contact us with any questions.',
  status:'Awaiting', priority:'Normal', dueDate:''
}

// Build the public signing page URL
function signingUrl(id) {
  return `${window.location.origin}/taxcasereview-CRM/#/sign/${id}`
}

// Generate a simple document preview HTML for the signing page
function buildDocHtml(item) {
  return `
<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Sign: ${item.doc_type}</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;background:#f4f6f9;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:20px}
  .card{background:#fff;border-radius:12px;padding:32px;max-width:640px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,.1)}
  h1{font-size:22px;margin-bottom:4px;color:#0f172a}
  .sub{font-size:13px;color:#64748b;margin-bottom:24px}
  .doc-body{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:24px;font-size:14px;line-height:1.7;color:#1e293b;white-space:pre-wrap}
  .field{margin-bottom:16px}
  label{display:block;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}
  input{width:100%;padding:10px 14px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;outline:none}
  input:focus{border-color:#2563eb}
  .tabs{display:flex;gap:8px;margin-bottom:8px}
  .tab{padding:6px 16px;border-radius:6px;border:1px solid #cbd5e1;background:#f8fafc;cursor:pointer;font-size:12px;font-weight:600;color:#64748b}
  .tab.active{background:#0f172a;color:#fff;border-color:#0f172a}
  .sig-pad{border:2px dashed #cbd5e1;border-radius:8px;height:120px;display:flex;align-items:center;justify-content:center;cursor:text;margin-bottom:8px;position:relative;background:#fafafa}
  .sig-pad input{border:none;background:none;font-size:28px;font-family:Georgia,serif;text-align:center;color:#0f172a;width:100%;cursor:text}
  .sig-pad input:focus{outline:none}
  canvas{border:2px dashed #cbd5e1;border-radius:8px;background:#fafafa;touch-action:none;cursor:crosshair;display:block;width:100%}
  .clear-btn{font-size:11px;color:#94a3b8;background:none;border:none;cursor:pointer;text-decoration:underline;margin-top:4px}
  .meta{font-size:11px;color:#94a3b8;margin-bottom:24px}
  .btn-sign{width:100%;padding:14px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer}
  .btn-sign:disabled{background:#94a3b8;cursor:default}
  .success{text-align:center;padding:40px 20px}
  .success h2{font-size:24px;color:#16a34a;margin-bottom:8px}
  .success p{color:#64748b;font-size:14px;line-height:1.6}
  .logo{font-size:13px;font-weight:700;color:#64748b;margin-bottom:20px;text-align:center}
  .disclaimer{font-size:11px;color:#94a3b8;text-align:center;margin-top:20px;line-height:1.6}
</style></head><body>
<div class="logo">TAX CASE REVIEW — Document Signing Portal</div>
<div class="card" id="main">
  <h1>${item.doc_type}</h1>
  <div class="sub">Prepared for: <strong>${item.client_name}</strong></div>
  <div class="doc-body">${item.message || 'Please review this document and provide your electronic signature below to confirm your agreement and authorization.'}</div>
  <div class="field"><label>Full Legal Name</label><input id="fullname" placeholder="Type your full name as it appears on the document" oninput="checkReady()" /></div>
  <div class="field">
    <label>Electronic Signature</label>
    <div class="tabs">
      <button class="tab active" onclick="setMode('type',this)">Type</button>
      <button class="tab" onclick="setMode('draw',this)">Draw</button>
    </div>
    <div id="type-mode">
      <div class="sig-pad"><input id="sig" placeholder="Type your full name to sign" oninput="checkReady()" /></div>
    </div>
    <div id="draw-mode" style="display:none">
      <canvas id="sigCanvas" height="120"></canvas>
      <button class="clear-btn" onclick="clearCanvas()">Clear</button>
    </div>
    <div class="meta">By signing above, you agree this constitutes a legal electronic signature.</div>
  </div>
  <div id="meta-display" class="meta" style="margin-bottom:16px"></div>
  <button class="btn-sign" id="signBtn" onclick="doSign()" disabled>Sign Document</button>
  <div class="disclaimer">
    This electronic signature is legally binding under the Electronic Signatures in Global and National Commerce Act (ESIGN) and Uniform Electronic Transactions Act (UETA).
    Your IP address, timestamp, and signature will be recorded and stored as proof of signing.
  </div>
</div>

<script>
  const docId = '${item.id}'
  const clientName = '${item.client_name}'
  const docType = '${item.doc_type}'
  const supaUrl = 'https://mpxgxfqdbquzkrvvejkh.supabase.co'
  const supaKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1weGd4ZnFkYnF1emtydnZlamtoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyOTk5MzksImV4cCI6MjA5NDg3NTkzOX0.puvhU1MV5nGOykizeTkwCpRR7NKKaGsVpA8oqjVjmu4'

  let clientIp = 'Unknown'
  let sigMode = 'type'
  let drawing = false
  let canvasHasData = false

  fetch('https://api.ipify.org?format=json').then(r=>r.json())
    .then(d=>{ clientIp=d.ip; document.getElementById('meta-display').textContent='Your IP: '+d.ip+' · '+new Date().toLocaleString() })
    .catch(()=>{})

  // Canvas setup
  window.addEventListener('load', function() {
    const canvas = document.getElementById('sigCanvas')
    if (!canvas) return
    canvas.width = canvas.offsetWidth * window.devicePixelRatio || 580
    canvas.height = 120 * window.devicePixelRatio || 120
    canvas.style.width = '100%'
    canvas.style.height = '120px'
    const ctx = canvas.getContext('2d')
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1)
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    function getPos(e) {
      const rect = canvas.getBoundingClientRect()
      const src = e.touches ? e.touches[0] : e
      return { x: src.clientX - rect.left, y: src.clientY - rect.top }
    }
    function start(e) { e.preventDefault(); drawing=true; const p=getPos(e); ctx.beginPath(); ctx.moveTo(p.x,p.y) }
    function move(e) { e.preventDefault(); if(!drawing) return; const p=getPos(e); ctx.lineTo(p.x,p.y); ctx.stroke(); canvasHasData=true; checkReady() }
    function end(e) { e.preventDefault(); drawing=false }
    canvas.addEventListener('mousedown',start); canvas.addEventListener('mousemove',move); canvas.addEventListener('mouseup',end); canvas.addEventListener('mouseleave',end)
    canvas.addEventListener('touchstart',start,{passive:false}); canvas.addEventListener('touchmove',move,{passive:false}); canvas.addEventListener('touchend',end)
  })

  function setMode(mode, btn) {
    sigMode = mode
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'))
    btn.classList.add('active')
    document.getElementById('type-mode').style.display = mode==='type' ? '' : 'none'
    document.getElementById('draw-mode').style.display = mode==='draw' ? '' : 'none'
    checkReady()
  }

  function clearCanvas() {
    const canvas = document.getElementById('sigCanvas')
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0,0,canvas.width,canvas.height)
    canvasHasData = false
    checkReady()
  }

  function checkReady() {
    const name = document.getElementById('fullname').value.trim()
    const typeSig = document.getElementById('sig') ? document.getElementById('sig').value.trim() : ''
    const ready = name.length > 1 && (sigMode==='draw' ? canvasHasData : typeSig.length > 1)
    document.getElementById('signBtn').disabled = !ready
  }

  async function doSign() {
    const fullname = document.getElementById('fullname').value.trim()
    let sig = ''
    let sigImage = null

    if (sigMode === 'type') {
      sig = document.getElementById('sig').value.trim()
    } else {
      const canvas = document.getElementById('sigCanvas')
      sig = fullname
      sigImage = canvas.toDataURL('image/png')
    }

    if (!sig || sig.length < 2) return
    document.getElementById('signBtn').disabled = true
    document.getElementById('signBtn').textContent = 'Processing…'
    const signedAt = new Date().toISOString()

    // Use snake_case column names to match Supabase schema
    const payload = {
      status: 'Signed',
      signed_at: signedAt,
      signed_name: sig,
      signer_full_name: fullname,
      signer_ip: clientIp,
      signed_timestamp: signedAt,
      signed_user_agent: navigator.userAgent.slice(0,200)
    }

    const res = await fetch(supaUrl+'/rest/v1/esigns?id=eq.'+docId, {
      method: 'PATCH',
      headers: { apikey: supaKey, Authorization: 'Bearer '+supaKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(payload)
    })

    // Also save to documents table so it appears in client file
    if (res.ok) {
      const certText = 'SIGNATURE CERTIFICATE\nDocument: '+docType+'\nClient: '+clientName+'\nSigned By: '+sig+'\nIP Address: '+clientIp+'\nTimestamp: '+signedAt+'\nDevice: '+navigator.userAgent.slice(0,100)
      await fetch(supaUrl+'/rest/v1/documents', {
        method: 'POST',
        headers: { apikey: supaKey, Authorization: 'Bearer '+supaKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          client: clientName,
          name: 'SIGNED — '+docType,
          docType: 'E-Signature',
          notes: certText,
          created_at: signedAt
        })
      }).catch(()=>{})

      document.getElementById('main').innerHTML = \`
        <div class="success">
          <div style="font-size:48px;margin-bottom:16px">✅</div>
          <h2>Document Signed Successfully</h2>
          <p>Thank you, <strong>\${sig}</strong>.<br/>
          Signed on \${new Date(signedAt).toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})} at \${new Date(signedAt).toLocaleTimeString()}.</p>
          <div style="margin-top:20px;padding:14px;background:#f0fdf4;border-radius:8px;font-size:12px;color:#166534;text-align:left;line-height:1.8">
            <strong>Certificate of Completion</strong><br/>
            Document: \${docType}<br/>
            Client: \${clientName}<br/>
            Signed by: \${sig}<br/>
            IP: \${clientIp}<br/>
            Timestamp: \${signedAt}
          </div>
          <p style="margin-top:16px;font-size:12px;color:#94a3b8">A copy has been saved to your file. You may close this window.</p>
        </div>\`
    } else {
      const errText = await res.text().catch(()=>'')
      document.getElementById('signBtn').disabled = false
      document.getElementById('signBtn').textContent = 'Sign Document'
      console.error('Sign error:', res.status, errText)
      document.getElementById('signBtn').insertAdjacentHTML('afterend','<p style="color:#dc2626;font-size:12px;margin-top:8px;text-align:center">Error saving signature ('+res.status+'). Please try again.</p>')
    }
  }
</script>
</body></html>`
}

export default function Esign() {
  const [items,    setItems]    = useState([])
  const [clients,  setClients]  = useState([])
  const location = useLocation()
  const [modal, setModal] = useState(false)
  const qp2 = new URLSearchParams(location.search)
  const [form, setForm] = useState({...BLANK,
    clientName: qp2.get('client') || '',
    clientEmail: qp2.get('email') || ''
  })
  useEffect(() => { if (qp2.get('client')) setModal(true) }, [])
  const [saving,   setSaving]   = useState(false)
  const [toast,    setToast]    = useState('')
  const [search,   setSearch]   = useState('')
  const [filterStatus, setFilterStatus] = useState('All')
  const [suggestions, setSug]   = useState([])
  const [showSug,  setShowSug]  = useState(false)
  const [confirmDel, setConfirmDel] = useState(null) // id to delete
  const [viewCert, setViewCert] = useState(null) // item to show cert

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data:e },{ data:c }] = await Promise.all([
      supabase.from('esigns').select('*').order('created_at',{ascending:false}),
      supabase.from('clients').select('id,name,email'),
    ])
    if (e) setItems(e)
    if (c) setClients(c)
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3500) }
  function fld(k,v) { setForm(f=>({...f,[k]:v})) }

  function searchClient(val) {
    fld('clientName',val)
    if (val.length<2) { setSug([]); setShowSug(false); return }
    const matches = clients.filter(c=>c.name.toLowerCase().includes(val.toLowerCase())).slice(0,6)
    setSug(matches); setShowSug(matches.length>0)
  }

  function selectClient(c) {
    fld('clientName',c.name)
    if (c.email) fld('clientEmail',c.email)
    setSug([]); setShowSug(false)
  }

  async function save() {
    if (!form.clientName) { showToast('Client required'); return }
    setSaving(true)
    const { data, error } = await supabase.from('esigns').insert([{
      doc_type: form.docType,
      client_name: form.clientName,
      client_email: form.clientEmail,
      message: form.message,
      priority: form.priority,
      due_date: form.dueDate,
      status: 'Awaiting',
      sent_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    }]).select().single()
    setSaving(false)
    if (error) { showToast('Error: '+error.message); return }
    // Open the signing link immediately so firm can copy it
    const url = signingUrl(data.id)
    await navigator.clipboard.writeText(url).catch(()=>{})
    // Auto-send via SMS if backend configured and client phone known
    const {data:cfg} = await supabase.from('settings').select('signalwire_backend').limit(1).maybeSingle()
    const {data:cl}  = await supabase.from('clients').select('phone').eq('name', form.clientName).maybeSingle()
    const phone = cl?.phone || leads?.find?.(l=>l.name===form.clientName)?.phone
    let smsSent = false
    if (cfg?.signalwire_backend && phone) {
      try {
        const msg = `Hi ${form.clientName}, Tax Case Review sent you a document to sign: ${url}`
        const res = await fetch(cfg.signalwire_backend+'/sms/send',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({to:phone,body:msg})
        })
        const d = await res.json()
        if (d.success) smsSent = true
      } catch(e){ console.error('SMS error:',e) }
    }
    showToast(smsSent ? '✅ Created & signing link sent via SMS!' : '✅ Signing link copied — send to client via email or SMS.')
    setModal(false); setForm(BLANK); load()
  }

  async function updateStatus(id, status) {
    const update = { status, updated_at:new Date().toISOString() }
    if (status==='Signed') update.signedAt = new Date().toISOString()
    await supabase.from('esigns').update(update).eq('id',id)
    showToast(`✅ Marked as ${status}`)
    load()
  }

  async function resend(item) {
    const url = signingUrl(item.id)
    await navigator.clipboard.writeText(url).catch(()=>{})
    await supabase.from('esigns').update({status:'Awaiting', sent_at:new Date().toISOString()}).eq('id',item.id)
    showToast('✅ Signing link copied to clipboard! Send to client via email or SMS.')
    load()
  }

  async function del(id) {
    await supabase.from('esigns').delete().eq('id',id)
    setConfirmDel(null); showToast('Deleted'); load()
  }

  function openSigningPage(item) {
    const html = buildDocHtml(item)
    const blob = new Blob([html], {type:'text/html'})
    const url = URL.createObjectURL(blob)
    window.open(url,'_blank')
  }

  const filtered = items.filter(i=>{
    const q = search.toLowerCase()
    const ms = !q || i.client_name?.toLowerCase().includes(q) || i.doc_type?.toLowerCase().includes(q)
    const mst = filterStatus==='All' || i.status===filterStatus
    return ms && mst
  })

  const awaiting = items.filter(i=>i.status==='Awaiting').length
  const signed   = items.filter(i=>i.status==='Signed').length

  return (
    <div style={{maxWidth:1000}}>
      {toast&&<div className="toast show">{toast}</div>}

      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
        <h2 style={{fontSize:15,fontWeight:700,margin:0}}>✍️ E-Signatures</h2>
        <button className="btn pri" onClick={()=>{setForm(BLANK);setModal(true)}}>+ New Signing Request</button>
      </div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(110px,1fr))',gap:8,marginBottom:14}}>
        {[
          ['Total Sent',items.length,'var(--tx)'],
          ['Awaiting',awaiting,'var(--warn)'],
          ['Signed',signed,'var(--ok)'],
          ['Declined',items.filter(i=>i.status==='Declined').length,'var(--bad)'],
          ['Sign Rate',items.length?Math.round((signed/items.length)*100)+'%':'—','var(--b2)'],
        ].map(([label,val,color])=>(
          <div key={label} className="card" style={{padding:'10px 12px',textAlign:'center'}}>
            <div style={{fontWeight:800,fontSize:18,color,lineHeight:1}}>{val}</div>
            <div style={{fontSize:10,color:'var(--t3)',marginTop:3}}>{label}</div>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div style={{background:'rgba(26,127,212,.07)',border:'1px solid rgba(26,127,212,.2)',borderRadius:8,padding:'10px 14px',marginBottom:14,fontSize:12,color:'var(--t2)',lineHeight:1.7}}>
        <strong style={{color:'var(--blue)'}}>How it works:</strong> Create a request → copy the signing link → send to client via email/SMS →
        client opens the link, types their name, and signs → their <strong>IP address, timestamp, full name, and device</strong> are recorded.
        Legally binding under ESIGN + UETA — no third party needed. Click <strong>View Certificate</strong> on any signed doc for full audit trail.
      </div>

      {/* Filters */}
      <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search client or document…"
          style={{flex:1,minWidth:160,padding:'7px 12px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',fontSize:12}}/>
        {['All','Awaiting','Signed','Declined','Expired'].map(s=>(
          <button key={s} className={`btn ${filterStatus===s?'pri':'sec'}`} style={{fontSize:10,padding:'4px 10px'}} onClick={()=>setFilterStatus(s)}>{s}</button>
        ))}
      </div>

      {/* Cards */}
      {filtered.length===0 ? (
        <div className="card" style={{padding:24,textAlign:'center',color:'var(--t3)',fontSize:13}}>
          {items.length===0?'No e-signature requests yet. Create one to get a signing link.':'No requests match your filters.'}
        </div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:10}}>
          {filtered.map(item=>{
            const isOverdue = item.dueDate && new Date(item.dueDate)<new Date() && item.status==='Awaiting'
            const daysSince = item.sent_at ? Math.floor((new Date()-new Date(item.sent_at))/(1000*60*60*24)) : 0
            const isSigned  = item.status==='Signed'
            return (
              <div key={item.id} className="card" style={{border:isOverdue?'1px solid var(--bad)':isSigned?'1px solid var(--ok)33':'1px solid var(--br)',padding:'14px 16px'}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:8}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,marginBottom:2}}>✍️ {item.doc_type}</div>
                    <div style={{fontSize:12,color:'var(--b2)',fontWeight:600}}>{item.client_name}</div>
                    {item.client_email&&<div style={{fontSize:10,color:'var(--t3)',marginTop:1}}>{item.client_email}</div>}
                  </div>
                  <span className={`bdg ${isSigned?'bg':item.status==='Declined'?'br':item.status==='Expired'?'bw':'ba'}`}>{item.status}</span>
                </div>

                <div style={{display:'flex',gap:10,fontSize:10,color:'var(--t3)',marginBottom:10,flexWrap:'wrap'}}>
                  {item.sent_at&&<span>Sent {new Date(item.sent_at).toLocaleDateString()}</span>}
                  {item.status==='Awaiting'&&daysSince>0&&<span style={{color:daysSince>7?'var(--bad)':'var(--warn)'}}>⏱ {daysSince}d pending</span>}
                  {item.signed_at&&<span style={{color:'var(--ok)'}}>✓ Signed {new Date(item.signed_at).toLocaleDateString()}</span>}
                  {item.signer_ip&&<span>IP: {item.signer_ip}</span>}
                </div>

                {isSigned && item.signed_name && (
                  <div style={{background:'var(--ok)11',border:'1px solid var(--ok)33',borderRadius:6,padding:'6px 10px',marginBottom:8,fontSize:11}}>
                    <span style={{color:'var(--t3)'}}>Signed by: </span>
                    <span style={{fontFamily:'Georgia,serif',fontSize:15,color:'var(--ok)',fontWeight:600}}>{item.signed_name}</span>
                  </div>
                )}

                <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                  {item.status==='Awaiting'&&(
                    <>
                      <button className="btn sec" style={{fontSize:10,padding:'4px 9px'}} onClick={()=>resend(item)}>📋 Copy Link</button>
                      <button className="btn sec" style={{fontSize:10,padding:'4px 9px'}} onClick={()=>openSigningPage(item)}>👁 Preview</button>
                      <button className="btn" style={{fontSize:10,padding:'4px 9px',background:'var(--ok)',color:'#fff',border:'none',borderRadius:5,cursor:'pointer'}} onClick={()=>updateStatus(item.id,'Signed')}>✓ Manual Sign</button>
                      <button className="btn sec" style={{fontSize:10,padding:'4px 9px'}} onClick={()=>updateStatus(item.id,'Declined')}>✗ Declined</button>
                    </>
                  )}
                  {isSigned&&(
                    <button className="btn sec" style={{fontSize:10,padding:'4px 9px'}} onClick={()=>setViewCert(item)}>🔐 View Certificate</button>
                  )}
                  {!isSigned&&item.status!=='Awaiting'&&(
                    <button className="btn sec" style={{fontSize:10,padding:'4px 9px'}} onClick={()=>resend(item)}>↻ Reopen</button>
                  )}
                  <button className="btn del" style={{fontSize:10,padding:'4px 9px',marginLeft:'auto'}} onClick={()=>setConfirmDel(item.id)}>Del</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Signature Certificate Modal */}
      {viewCert&&(
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setViewCert(null)}>
          <div className="modal" style={{maxWidth:500}}>
            <div className="mh">
              <span className="mt">🔐 Signature Certificate</span>
              <button className="xbtn" onClick={()=>setViewCert(null)}>&times;</button>
            </div>
            <div style={{background:'var(--s2)',borderRadius:8,padding:16,fontSize:13,lineHeight:1.9}}>
              <div style={{textAlign:'center',marginBottom:12,paddingBottom:12,borderBottom:'1px solid var(--br)'}}>
                <div style={{fontSize:32,marginBottom:4}}>✅</div>
                <div style={{fontWeight:700,fontSize:15}}>Legally Signed Document</div>
              </div>
              {[
                ['Document',viewCert.doc_type],
                ['Client',viewCert.client_name],
                ['Email',viewCert.client_email||'—'],
                ['Signed Name',<span style={{fontFamily:'Georgia,serif',fontSize:16,color:'var(--ok)'}}>{viewCert.signed_name||'—'}</span>],
                ['Signer Full Name',viewCert.signer_full_name||'—'],
                ['IP Address',viewCert.signer_ip||'Not captured'],
                ['Signed At',viewCert.signed_at?new Date(viewCert.signed_at).toLocaleString():'—'],
                ['Sent At',viewCert.sent_at?new Date(viewCert.sent_at).toLocaleString():'—'],
                ['Device',viewCert.signed_user_agent?viewCert.signed_user_agent.slice(0,60)+'…':'—'],
              ].map(([l,v])=>(
                <div key={l} style={{display:'flex',borderBottom:'1px solid var(--br)',padding:'5px 0',gap:12}}>
                  <span style={{color:'var(--t3)',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',minWidth:120,paddingTop:2}}>{l}</span>
                  <span style={{flex:1,fontSize:13}}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{fontSize:11,color:'var(--t3)',marginTop:10,lineHeight:1.6,textAlign:'center'}}>
              Legally binding under ESIGN Act & UETA. IP address + timestamp constitute proof of signing.
            </div>
            <button className="btn sec" style={{width:'100%',marginTop:12,justifyContent:'center'}} onClick={()=>{
              const text = `SIGNATURE CERTIFICATE\n\nDocument: ${viewCert.doc_type}\nClient: ${viewCert.client_name}\nSigned Name: ${viewCert.signed_name}\nIP Address: ${viewCert.signer_ip}\nSigned At: ${new Date(viewCert.signed_at).toLocaleString()}\nDevice: ${viewCert.signed_user_agent}`
              navigator.clipboard.writeText(text)
              showToast('Certificate copied to clipboard')
            }}>📋 Copy Certificate</button>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDel&&(
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setConfirmDel(null)}>
          <div className="modal" style={{maxWidth:380,textAlign:'center'}}>
            <div style={{fontSize:36,marginBottom:12}}>🗑</div>
            <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>Delete this request?</div>
            <div style={{fontSize:13,color:'var(--t3)',marginBottom:20}}>This will permanently remove the signing request and all signature data. This cannot be undone.</div>
            <div style={{display:'flex',gap:8}}>
              <button className="btn sec" style={{flex:1,justifyContent:'center'}} onClick={()=>setConfirmDel(null)}>Cancel</button>
              <button className="btn del" style={{flex:1,justifyContent:'center'}} onClick={()=>del(confirmDel)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* New Request Modal */}
      {modal&&(
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal" style={{width:560}}>
            <div className="mh">
              <span className="mt">New Signing Request</span>
              <button className="xbtn" onClick={()=>setModal(false)}>&times;</button>
            </div>
            <div className="field"><label>Document Type</label>
              <select value={form.docType} onChange={e=>fld('docType',e.target.value)}>
                {DOC_TYPES.map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
            <div style={{position:'relative'}} className="field"><label>Client *</label>
              <input value={form.clientName} onChange={e=>searchClient(e.target.value)} placeholder="Search client…"/>
              {showSug&&suggestions.length>0&&(
                <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--sf)',border:'1px solid var(--br)',borderRadius:6,zIndex:50,maxHeight:180,overflowY:'auto'}}>
                  {suggestions.map(c=>(
                    <div key={c.id} onClick={()=>selectClient(c)} style={{padding:'8px 12px',cursor:'pointer',fontSize:13}}
                      onMouseEnter={e=>e.currentTarget.style.background='var(--s2)'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      {c.name} {c.email&&<span style={{color:'var(--t3)',fontSize:11}}>· {c.email}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="field"><label>Client Email</label>
              <input type="email" value={form.clientEmail} onChange={e=>fld('clientEmail',e.target.value)} placeholder="client@email.com"/>
            </div>
            <div className="field"><label>Message to Client</label>
              <textarea value={form.message} onChange={e=>fld('message',e.target.value)} rows={4}
                style={{width:'100%',resize:'vertical',minHeight:80,padding:'8px 12px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',fontSize:13,fontFamily:'inherit'}}/>
            </div>
            <div className="fg2">
              <div className="field"><label>Priority</label>
                <select value={form.priority} onChange={e=>fld('priority',e.target.value)}>
                  {['Normal','High','Urgent'].map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
              <div className="field"><label>Due Date (optional)</label>
                <input type="date" value={form.dueDate} onChange={e=>fld('dueDate',e.target.value)}/>
              </div>
            </div>
            <div style={{background:'var(--s2)',borderRadius:6,padding:'10px 14px',marginBottom:14,fontSize:12,color:'var(--t3)',lineHeight:1.6}}>
              💡 After saving, a unique signing link will be copied to your clipboard. Send it to the client via email or SMS. When they sign, their IP address and timestamp are automatically captured.
            </div>
            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={save} disabled={saving}>
              {saving?'Creating…':'✅ Create & Copy Signing Link'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
