import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'

const DOC_TYPES = [
  'Tax Service Agreement',
  'Form 2848 — Power of Attorney',
  'Form 8821 — Tax Info Auth',
  '9465 Installment Agreement Consent',
  'OIC Application (656)',
  'Form 433-A Collection Info',
  'Form 433-B Business Collection Info',
  'CDP Hearing Request',
  'Fee Agreement Addendum',
  'Custom Document'
]

const BLANK = {
  docType: 'Tax Service Agreement',
  clientName: '', clientEmail: '', clientPhone: '',
  investigationFee: '',
  taxYears: '',
  repName: '',
  message: '',
  sendVia: 'both', // 'email' | 'sms' | 'both'
  priority: 'Normal', dueDate: ''
}

function signingUrl(id) {
  return `${window.location.origin}/taxcasereview-CRM/sign/${id}`
}

function buildDocHtml(item, firmLogoUrl) {
  const feeDisplay = item.investigation_fee ? `$${item.investigation_fee}` : '_____________'
  const yearsDisplay = item.tax_years || '_______________'
  const repDisplay = item.rep_name || 'Tax Case Review'
  const now = new Date().toLocaleString()

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Tax Service Agreement — ${item.client_name}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    background: #0a1628;
    min-height: 100vh;
    padding: 24px 16px 48px;
    color: #e2e8f0;
  }
  .shell {
    max-width: 700px;
    margin: 0 auto;
  }
  .header {
    text-align: center;
    margin-bottom: 28px;
    padding-bottom: 20px;
    border-bottom: 1px solid #1e3a5f;
  }
  .header img { height: 48px; margin-bottom: 10px; }
  .header-firm {
    font-size: 13px;
    font-weight: 800;
    letter-spacing: .12em;
    color: #60a5fa;
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .header-sub { font-size: 12px; color: #64748b; }
  .card {
    background: #0f1e35;
    border: 1px solid #1e3a5f;
    border-radius: 12px;
    padding: 28px 32px;
    margin-bottom: 20px;
  }
  .doc-title {
    font-size: 20px;
    font-weight: 800;
    color: #f1f5f9;
    text-align: center;
    margin-bottom: 4px;
    letter-spacing: .02em;
  }
  .doc-sub {
    text-align: center;
    font-size: 13px;
    color: #64748b;
    margin-bottom: 24px;
  }
  .agreement-body {
    font-size: 13.5px;
    line-height: 1.8;
    color: #cbd5e1;
    white-space: pre-wrap;
  }
  .agreement-body strong { color: #f1f5f9; font-weight: 700; }
  .section { margin-bottom: 18px; }
  .section-title {
    font-size: 12px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: #60a5fa;
    margin-bottom: 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid #1e3a5f;
  }
  .fee-highlight {
    background: #0a2540;
    border: 1px solid #1e40af;
    border-radius: 8px;
    padding: 12px 16px;
    margin: 12px 0;
    font-size: 14px;
    color: #93c5fd;
    font-weight: 600;
  }
  /* Sign section */
  .sign-card {
    background: #0f1e35;
    border: 1px solid #1e3a5f;
    border-radius: 12px;
    padding: 28px 32px;
  }
  .sign-title {
    font-size: 15px;
    font-weight: 700;
    color: #f1f5f9;
    margin-bottom: 20px;
  }
  .field { margin-bottom: 16px; }
  label {
    display: block;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: #64748b;
    margin-bottom: 6px;
  }
  input[type=text] {
    width: 100%;
    padding: 10px 14px;
    background: #0a1628;
    border: 1px solid #1e3a5f;
    border-radius: 8px;
    font-size: 14px;
    color: #f1f5f9;
    outline: none;
    transition: border-color .15s;
  }
  input[type=text]:focus { border-color: #3b82f6; }
  .sig-tabs { display: flex; gap: 6px; margin-bottom: 10px; }
  .sig-tab {
    padding: 6px 16px;
    border-radius: 6px;
    border: 1px solid #1e3a5f;
    background: #0a1628;
    color: #64748b;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: all .15s;
  }
  .sig-tab.active { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
  .type-sig-wrap {
    background: #0a1628;
    border: 1.5px dashed #1e3a5f;
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 6px;
  }
  .type-sig-input {
    width: 100%;
    border: none;
    background: none;
    font-size: 28px;
    font-family: 'Dancing Script', 'Brush Script MT', cursive, Georgia, serif;
    color: #60a5fa;
    outline: none;
    cursor: text;
    min-height: 48px;
  }
  canvas {
    width: 100%;
    height: 130px;
    display: block;
    background: #0a1628;
    border: 1.5px dashed #1e3a5f;
    border-radius: 8px;
    cursor: crosshair;
    touch-action: none;
  }
  .clear-btn {
    font-size: 11px;
    color: #64748b;
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: underline;
    margin-top: 4px;
  }
  .meta-box {
    background: #0a1628;
    border: 1px solid #1e3a5f;
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 11px;
    color: #64748b;
    margin-bottom: 16px;
    line-height: 1.6;
  }
  .btn-sign {
    width: 100%;
    padding: 14px;
    background: #16a34a;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    transition: background .15s;
    letter-spacing: .02em;
  }
  .btn-sign:hover:not(:disabled) { background: #15803d; }
  .btn-sign:disabled { background: #374151; color: #6b7280; cursor: default; }
  .esign-note {
    font-size: 11px;
    color: #475569;
    text-align: center;
    margin-top: 14px;
    line-height: 1.7;
  }
  .success-card {
    text-align: center;
    padding: 48px 32px;
    background: #0f1e35;
    border: 1px solid #166534;
    border-radius: 12px;
  }
  .success-icon { font-size: 56px; margin-bottom: 16px; }
  .success-h { font-size: 22px; font-weight: 800; color: #4ade80; margin-bottom: 8px; }
  .success-p { font-size: 14px; color: #94a3b8; line-height: 1.7; }
  .cert-box {
    background: #0a1628;
    border: 1px solid #166534;
    border-radius: 8px;
    padding: 14px 18px;
    margin: 20px 0;
    font-size: 12px;
    color: #86efac;
    text-align: left;
    line-height: 2;
    font-family: monospace;
  }
</style>
</head>
<body>
<div class="shell">
  <div class="header">
    ${firmLogoUrl ? `<img src="${firmLogoUrl}" alt="Tax Case Review"/>` : ''}
    <div class="header-firm">Tax Case Review</div>
    <div class="header-sub">Document Signing Portal</div>
  </div>

  <div class="card" id="docCard">
    <div class="doc-title">Tax Service Agreement</div>
    <div class="doc-sub">Prepared for: <strong style="color:#93c5fd">${item.client_name}</strong></div>

    <div class="section">
      <div class="section-title">Tax Investigation Service Agreement</div>
      <div class="agreement-body">Dear ${item.client_name},

Thank you for choosing Tax Case Review. This document serves as your Tax Investigation Service Agreement confirming our engagement to assist you with your tax matter for tax year(s) <strong>${yearsDisplay}</strong>.
</div>
    </div>

    <div class="section">
      <div class="section-title">1. Scope of Services</div>
      <div class="agreement-body">- Review of IRS and/or state tax transcripts
- Identification of outstanding tax liabilities and unfiled returns
- Evaluation of eligibility for IRS resolution programs (OIC, CNC, IA, Penalty Abatement)
- Preparation of a written resolution strategy within 21 business days
- Full IRS/state representation — Case Rep: <strong>${repDisplay}</strong></div>
    </div>

    <div class="section">
      <div class="section-title">2. Authorization</div>
      <div class="agreement-body">By signing below, you authorize Tax Case Review to obtain IRS transcripts via Form 2848/8821 and represent you before the IRS and/or applicable state tax authority. The Form 2848 (Power of Attorney) and Form 8821 (Tax Information Authorization) included with this package are part of this authorization — please review and sign each.</div>
    </div>

    <div class="section">
      <div class="section-title">3. Investigation Fee</div>
      <div class="fee-highlight">💰 Investigation Fee: <strong style="color:#fff;font-size:16px">${feeDisplay}</strong></div>
      <div class="agreement-body">Non-refundable once transcript review has commenced. Full payment due prior to commencement.</div>
    </div>

    <div class="section">
      <div class="section-title">4. Client Responsibilities</div>
      <div class="agreement-body">- Provide accurate and complete financial and tax information
- Respond to document requests within 5 business days
- Notify Tax Case Review of any IRS communications received
- Make timely payment of agreed fees</div>
    </div>

    <div class="section">
      <div class="section-title">5. Terms & Conditions</div>
      <div class="agreement-body">This agreement does not guarantee a specific resolution outcome. Tax Case Review will act diligently and professionally on your behalf. This agreement is governed by the laws of the State of Florida.</div>
    </div>
  </div>

  <!-- SIGN SECTION -->
  <div class="sign-card" id="signSection">
    <div class="sign-title">✍️ Sign This Agreement</div>

    <div class="field">
      <label>Full Legal Name</label>
      <input type="text" id="fullname" placeholder="Type your full legal name" oninput="checkReady()"/>
    </div>

    <div class="field">
      <label>Electronic Signature</label>
      <div class="sig-tabs">
        <button class="sig-tab active" onclick="setMode('type',this)">✏️ Type</button>
        <button class="sig-tab" onclick="setMode('draw',this)">🖊 Draw</button>
      </div>
      <div id="type-mode">
        <div class="type-sig-wrap">
          <input type="text" id="sig" class="type-sig-input" placeholder="Sign here…" oninput="checkReady()"/>
        </div>
        <div style="font-size:11px;color:#475569;margin-top:2px">Your typed name constitutes your legal signature.</div>
      </div>
      <div id="draw-mode" style="display:none">
        <canvas id="sigCanvas" height="130"></canvas>
        <button class="clear-btn" onclick="clearCanvas()">Clear</button>
      </div>
    </div>

    <div class="meta-box" id="metaBox">
      Capturing your IP address and timestamp…
    </div>

    <button class="btn-sign" id="signBtn" onclick="doSign()" disabled>
      ✅ Sign &amp; Submit Agreement
    </button>
    <div class="esign-note">
      By clicking Sign &amp; Submit, you agree this constitutes a legally binding electronic signature under the ESIGN Act and UETA.<br/>
      Your IP address, device, and timestamp are recorded as proof of signature.
    </div>
  </div>
</div>

<script>
  const docId = '${item.id}'
  const clientName = '${item.client_name}'
  const docType = 'Tax Service Agreement'
  const supaUrl = 'https://mpxgxfqdbquzkrvvejkh.supabase.co'
  const supaKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1weGd4ZnFkYnF1emtydnZlamtoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyOTk5MzksImV4cCI6MjA5NDg3NTkzOX0.puvhU1MV5nGOykizeTkwCpRR7NKKaGsVpA8oqjVjmu4'

  let clientIp = 'Unknown'
  let sigMode = 'type'
  let drawing = false
  let canvasHasData = false

  fetch('https://api.ipify.org?format=json')
    .then(r => r.json())
    .then(d => {
      clientIp = d.ip
      document.getElementById('metaBox').innerHTML =
        '<strong style="color:#93c5fd">Your IP:</strong> ' + d.ip +
        ' &nbsp;|&nbsp; <strong style="color:#93c5fd">Time:</strong> ' + new Date().toLocaleString()
    })
    .catch(() => {
      document.getElementById('metaBox').textContent = 'Timestamp: ' + new Date().toLocaleString()
    })

  window.addEventListener('load', function() {
    const canvas = document.getElementById('sigCanvas')
    if (!canvas) return
    canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1)
    canvas.height = 130 * (window.devicePixelRatio || 1)
    canvas.style.width = '100%'
    canvas.style.height = '130px'
    const ctx = canvas.getContext('2d')
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1)
    ctx.strokeStyle = '#60a5fa'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    function getPos(e) {
      const rect = canvas.getBoundingClientRect()
      const src = e.touches ? e.touches[0] : e
      return { x: (src.clientX - rect.left), y: (src.clientY - rect.top) }
    }
    function start(e) { e.preventDefault(); drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y) }
    function move(e)  { e.preventDefault(); if (!drawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); canvasHasData = true; checkReady() }
    function end(e)   { e.preventDefault(); drawing = false }

    canvas.addEventListener('mousedown', start)
    canvas.addEventListener('mousemove', move)
    canvas.addEventListener('mouseup', end)
    canvas.addEventListener('mouseleave', end)
    canvas.addEventListener('touchstart', start, { passive: false })
    canvas.addEventListener('touchmove', move, { passive: false })
    canvas.addEventListener('touchend', end)
  })

  function setMode(mode, btn) {
    sigMode = mode
    document.querySelectorAll('.sig-tab').forEach(t => t.classList.remove('active'))
    btn.classList.add('active')
    document.getElementById('type-mode').style.display = mode === 'type' ? '' : 'none'
    document.getElementById('draw-mode').style.display = mode === 'draw' ? '' : 'none'
    checkReady()
  }

  function clearCanvas() {
    const canvas = document.getElementById('sigCanvas')
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    canvasHasData = false
    checkReady()
  }

  function checkReady() {
    const name = (document.getElementById('fullname').value || '').trim()
    const typeSig = (document.getElementById('sig') ? document.getElementById('sig').value : '').trim()
    const ok = name.length > 1 && (sigMode === 'draw' ? canvasHasData : typeSig.length > 1)
    document.getElementById('signBtn').disabled = !ok
  }

  async function doSign() {
    const btn = document.getElementById('signBtn')
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
    btn.disabled = true
    btn.textContent = 'Saving signature…'

    const signedAt = new Date().toISOString()
    const payload = {
      status: 'Signed',
      signed_at: signedAt,
      signed_name: sig,
      signer_full_name: fullname,
      signer_ip: clientIp,
      signed_timestamp: signedAt,
      signed_user_agent: navigator.userAgent.slice(0, 200)
    }

    const res = await fetch(supaUrl + '/rest/v1/esigns?id=eq.' + docId, {
      method: 'PATCH',
      headers: {
        apikey: supaKey,
        Authorization: 'Bearer ' + supaKey,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(payload)
    })

    if (res.ok) {
      const certText = [
        'SIGNATURE CERTIFICATE',
        'Document: ' + docType,
        'Client: ' + clientName,
        'Signed By: ' + sig,
        'IP Address: ' + clientIp,
        'Timestamp: ' + new Date(signedAt).toLocaleString(),
        'Device: ' + navigator.userAgent.slice(0, 120)
      ].join('\\n')

      await fetch(supaUrl + '/rest/v1/documents', {
        method: 'POST',
        headers: { apikey: supaKey, Authorization: 'Bearer ' + supaKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          client: clientName,
          name: 'SIGNED — ' + docType,
          docType: 'E-Signature',
          notes: certText,
          created_at: signedAt
        })
      }).catch(() => {})

      document.getElementById('signSection').innerHTML = \`
        <div class="success-card">
          <div class="success-icon">✅</div>
          <div class="success-h">Agreement Signed!</div>
          <div class="success-p">
            Thank you, <strong style="color:#4ade80">\${sig}</strong>.<br/>
            Signed on \${new Date(signedAt).toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}
            at \${new Date(signedAt).toLocaleTimeString()}.
          </div>
          <div class="cert-box">
            CERTIFICATE OF COMPLETION\\n
            Document: \${docType}\\n
            Client: \${clientName}\\n
            Signed By: \${sig}\\n
            IP Address: \${clientIp}\\n
            Timestamp: \${new Date(signedAt).toLocaleString()}
          </div>
          <div class="success-p" style="font-size:12px">
            A copy has been saved to your client file.<br/>
            You may close this window.
          </div>
        </div>
      \`
    } else {
      const errText = await res.text().catch(() => '')
      btn.disabled = false
      btn.textContent = '✅ Sign & Submit Agreement'
      const errDiv = document.createElement('p')
      errDiv.style = 'color:#f87171;font-size:12px;margin-top:8px;text-align:center'
      errDiv.textContent = 'Error saving signature (' + res.status + '). Please try again.'
      btn.insertAdjacentElement('afterend', errDiv)
    }
  }
</script>
</body>
</html>`
}

export default function Esign() {
  const { showToast } = useApp()
  const [items, setItems] = useState([])
  const [clients, setClients] = useState([])
  const location = useLocation()
  const [modal, setModal] = useState(false)
  const qp2 = new URLSearchParams(location.search)
  const [form, setForm] = useState({
    ...BLANK,
    clientName: qp2.get('client') || '',
    clientEmail: qp2.get('email') || '',
    clientPhone: qp2.get('phone') || '',
    investigationFee: qp2.get('fee') || '',
    taxYears: qp2.get('years') || '',
    repName: qp2.get('rep') || ''
  })
  useEffect(() => { if (qp2.get('client')) setModal(true) }, [])
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('All')
  const [suggestions, setSug] = useState([])
  const [showSug, setShowSug] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [viewCert, setViewCert] = useState(null)
  const [firmLogoUrl, setFirmLogoUrl] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: e }, { data: c }] = await Promise.all([
      supabase.from('esigns').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('id,name,email,phone'),
    ])
    if (e) setItems(e)
    if (c) setClients(c)
    // load firm logo for signing page
    const { data: ld } = await supabase.storage.from('firm-assets').getPublicUrl('logo')
    if (ld?.publicUrl) setFirmLogoUrl(ld.publicUrl)
  }

  function fld(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function searchClient(val) {
    fld('clientName', val)
    if (val.length < 2) { setSug([]); setShowSug(false); return }
    const matches = clients.filter(c => c.name.toLowerCase().includes(val.toLowerCase())).slice(0, 6)
    setSug(matches); setShowSug(matches.length > 0)
  }

  function selectClient(c) {
    setForm(f => ({
      ...f,
      clientName: c.name,
      clientEmail: c.email || f.clientEmail,
      clientPhone: c.phone || f.clientPhone
    }))
    setSug([]); setShowSug(false)
  }

  async function sendLink(url, item) {
    const { sendVia, clientEmail, clientPhone, clientName } = item || form
    const msg = `Hi ${clientName}, Tax Case Review sent you a Tax Service Agreement to sign. Please review and sign here: ${url}`
    let smsSent = false, emailSent = false

    const { data: cfg } = await supabase.from('settings').select('signalwire_backend,smtp_host,smtp_email').limit(1).maybeSingle()

    // SMS
    if ((sendVia === 'sms' || sendVia === 'both') && clientPhone) {
      try {
        const res = await fetch((cfg?.signalwire_backend || '') + '/sms/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: clientPhone, body: msg })
        })
        const d = await res.json()
        if (d.success) smsSent = true
      } catch (e) { console.error('SMS error:', e) }
    }

    // Email (placeholder — real SMTP via edge function)
    if ((sendVia === 'email' || sendVia === 'both') && clientEmail) {
      try {
        const { error } = await supabase.functions.invoke('send-email', {
          body: {
            to: clientEmail,
            subject: `Tax Service Agreement — Please Sign`,
            html: `<p>Dear ${clientName},</p><p>Please review and sign your Tax Service Agreement:</p><p><a href="${url}" style="background:#1d4ed8;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Sign Agreement</a></p><p>This link is unique to you. Tax Case Review</p>`
          }
        })
        if (!error) emailSent = true
      } catch (e) { console.error('Email error:', e) }
    }

    return { smsSent, emailSent }
  }

  async function save() {
    if (!form.clientName) { showToast('Client name required'); return }
    setSaving(true)
    const { data, error } = await supabase.from('esigns').insert([{
      doc_type: form.docType,
      client_name: form.clientName,
      client_email: form.clientEmail,
      client_phone: form.clientPhone,
      investigation_fee: form.investigationFee || null,
      tax_years: form.taxYears || null,
      rep_name: form.repName || null,
      send_via: form.sendVia,
      message: form.message,
      priority: form.priority,
      due_date: form.dueDate || null,
      status: 'Awaiting',
      sent_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    }]).select().single()
    setSaving(false)
    if (error) { showToast('Error: ' + error.message); return }

    const url = signingUrl(data.id)
    await navigator.clipboard.writeText(url).catch(() => {})
    const { smsSent, emailSent } = await sendLink(url, { ...form, sendVia: form.sendVia })
    const sent = [smsSent && 'SMS', emailSent && 'Email'].filter(Boolean)
    showToast(sent.length ? `✅ Agreement sent via ${sent.join(' & ')}!` : '✅ Created — signing link copied to clipboard.')
    setModal(false); setForm(BLANK); load()
  }

  async function resendLink(item) {
    const url = signingUrl(item.id)
    await navigator.clipboard.writeText(url).catch(() => {})
    await supabase.from('esigns').update({ status: 'Awaiting', sent_at: new Date().toISOString() }).eq('id', item.id)
    const { smsSent, emailSent } = await sendLink(url, { ...item, sendVia: item.send_via || 'both' })
    const sent = [smsSent && 'SMS', emailSent && 'Email'].filter(Boolean)
    showToast(sent.length ? `✅ Resent via ${sent.join(' & ')}` : '✅ Link copied to clipboard')
    load()
  }

  async function updateStatus(id, status) {
    await supabase.from('esigns').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    showToast(`✅ Marked as ${status}`)
    load()
  }

  async function del(id) {
    await supabase.from('esigns').delete().eq('id', id)
    setConfirmDel(null); showToast('Deleted'); load()
  }

  function openSigningPage(item) {
    window.open(signingUrl(item.id), '_blank')
  }

  // Reminder helper: days pending
  function daysPending(item) {
    if (!item.sent_at) return 0
    return Math.floor((Date.now() - new Date(item.sent_at)) / (1000 * 60 * 60 * 24))
  }

  const filtered = items.filter(i => {
    const q = search.toLowerCase()
    const ms = !q || i.client_name?.toLowerCase().includes(q) || i.doc_type?.toLowerCase().includes(q)
    const mst = filterStatus === 'All' || i.status === filterStatus
    return ms && mst
  })

  const awaiting = items.filter(i => i.status === 'Awaiting').length
  const signed = items.filter(i => i.status === 'Signed').length

  return (
    <div style={{ maxWidth: 1000 }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>✍️ E-Signatures</h2>
        <button className="btn pri" onClick={() => { setForm(BLANK); setModal(true) }}>+ New Signing Request</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: 8, marginBottom: 14 }}>
        {[
          ['Total Sent', items.length, 'var(--tx)'],
          ['Awaiting', awaiting, 'var(--warn)'],
          ['Signed', signed, 'var(--ok)'],
          ['Declined', items.filter(i => i.status === 'Declined').length, 'var(--bad)'],
          ['Sign Rate', items.length ? Math.round((signed / items.length) * 100) + '%' : '—', 'var(--b2)'],
        ].map(([label, val, color]) => (
          <div key={label} className="card" style={{ padding: '10px 12px', textAlign: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: 18, color, lineHeight: 1 }}>{val}</div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 3 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Reminder callout */}
      {items.some(i => i.status === 'Awaiting' && daysPending(i) >= 1) && (
        <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: 'var(--warn)' }}>
          ⏰ <strong>Reminder needed:</strong> {items.filter(i => i.status === 'Awaiting' && daysPending(i) >= 1).length} agreement(s) unsigned for 1+ days — use <strong>Resend</strong> to send a reminder.
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search client or document…"
          style={{ flex: 1, minWidth: 160, padding: '7px 12px', background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }} />
        {['All', 'Awaiting', 'Signed', 'Declined', 'Expired'].map(s => (
          <button key={s} className={`btn ${filterStatus === s ? 'pri' : 'sec'}`} style={{ fontSize: 10, padding: '4px 10px' }} onClick={() => setFilterStatus(s)}>{s}</button>
        ))}
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>
          {items.length === 0 ? 'No e-signature requests yet. Create one to send a signing link to a client.' : 'No requests match your filters.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(310px,1fr))', gap: 10 }}>
          {filtered.map(item => {
            const isSigned = item.status === 'Signed'
            const dp = daysPending(item)
            const needsReminder = item.status === 'Awaiting' && [1, 3, 5].some(d => dp >= d)
            return (
              <div key={item.id} className="card" style={{
                border: needsReminder ? '1px solid var(--warn)' : isSigned ? '1px solid var(--ok)44' : '1px solid var(--br)',
                padding: '14px 16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>✍️ {item.doc_type}</div>
                    <div style={{ fontSize: 12, color: 'var(--b2)', fontWeight: 600 }}>{item.client_name}</div>
                    {item.client_email && <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 1 }}>{item.client_email}</div>}
                    {item.investigation_fee && <div style={{ fontSize: 10, color: 'var(--ok)', marginTop: 2, fontWeight: 700 }}>Fee: ${item.investigation_fee}</div>}
                  </div>
                  <span className={`bdg ${isSigned ? 'bg' : item.status === 'Declined' ? 'br' : item.status === 'Expired' ? 'bw' : 'ba'}`}>{item.status}</span>
                </div>

                {needsReminder && (
                  <div style={{ background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 5, padding: '5px 9px', fontSize: 11, color: 'var(--warn)', marginBottom: 8 }}>
                    ⏰ {dp}d unsigned — reminder recommended
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--t3)', marginBottom: 10, flexWrap: 'wrap' }}>
                  {item.sent_at && <span>Sent {new Date(item.sent_at).toLocaleDateString()}</span>}
                  {item.status === 'Awaiting' && dp > 0 && <span style={{ color: dp > 5 ? 'var(--bad)' : dp > 2 ? 'var(--warn)' : 'var(--t3)' }}>⏱ {dp}d pending</span>}
                  {item.signed_at && <span style={{ color: 'var(--ok)' }}>✓ Signed {new Date(item.signed_at).toLocaleDateString()}</span>}
                  {item.signer_ip && <span>IP: {item.signer_ip}</span>}
                </div>

                {isSigned && item.signed_name && (
                  <div style={{ background: 'var(--ok)11', border: '1px solid var(--ok)33', borderRadius: 6, padding: '6px 10px', marginBottom: 8, fontSize: 11 }}>
                    <span style={{ color: 'var(--t3)' }}>Signed by: </span>
                    <span style={{ fontFamily: 'Georgia,serif', fontSize: 15, color: 'var(--ok)', fontWeight: 600 }}>{item.signed_name}</span>
                    {item.signer_ip && <div style={{ color: 'var(--t3)', fontSize: 10, marginTop: 2 }}>IP: {item.signer_ip} · {item.signed_at ? new Date(item.signed_at).toLocaleString() : ''}</div>}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {item.status === 'Awaiting' && (
                    <>
                      <button className="btn sec" style={{ fontSize: 10, padding: '4px 9px' }} onClick={() => resendLink(item)}>📨 Resend</button>
                      <button className="btn sec" style={{ fontSize: 10, padding: '4px 9px' }} onClick={() => openSigningPage(item)}>👁 Preview</button>
                      <button className="btn" style={{ fontSize: 10, padding: '4px 9px', background: 'var(--ok)', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer' }} onClick={() => updateStatus(item.id, 'Signed')}>✓ Manual</button>
                      <button className="btn sec" style={{ fontSize: 10, padding: '4px 9px' }} onClick={() => updateStatus(item.id, 'Declined')}>✗ Declined</button>
                    </>
                  )}
                  {isSigned && (
                    <button className="btn sec" style={{ fontSize: 10, padding: '4px 9px' }} onClick={() => setViewCert(item)}>🔐 Certificate</button>
                  )}
                  {!isSigned && item.status !== 'Awaiting' && (
                    <button className="btn sec" style={{ fontSize: 10, padding: '4px 9px' }} onClick={() => resendLink(item)}>↻ Reopen</button>
                  )}
                  <button className="btn del" style={{ fontSize: 10, padding: '4px 9px', marginLeft: 'auto' }} onClick={() => setConfirmDel(item.id)}>Del</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Certificate Modal */}
      {viewCert && (
        <div className="modal-bg open" onClick={e => e.target === e.currentTarget && setViewCert(null)}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="mh"><span className="mt">🔐 Signature Certificate</span><button className="xbtn" onClick={() => setViewCert(null)}>&times;</button></div>
            <div style={{ background: 'var(--s2)', borderRadius: 8, padding: 16, fontSize: 13, lineHeight: 1.9 }}>
              <div style={{ textAlign: 'center', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--br)' }}>
                <div style={{ fontSize: 32, marginBottom: 4 }}>✅</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Legally Signed Document</div>
              </div>
              {[
                ['Document', viewCert.doc_type],
                ['Client', viewCert.client_name],
                ['Email', viewCert.client_email || '—'],
                ['Fee', viewCert.investigation_fee ? `$${viewCert.investigation_fee}` : '—'],
                ['Signed Name', <span style={{ fontFamily: 'Georgia,serif', fontSize: 16, color: 'var(--ok)' }}>{viewCert.signed_name || '—'}</span>],
                ['Full Name Entered', viewCert.signer_full_name || '—'],
                ['IP Address', viewCert.signer_ip || 'Not captured'],
                ['Signed At', viewCert.signed_at ? new Date(viewCert.signed_at).toLocaleString() : '—'],
                ['Sent At', viewCert.sent_at ? new Date(viewCert.sent_at).toLocaleString() : '—'],
                ['Device', viewCert.signed_user_agent ? viewCert.signed_user_agent.slice(0, 60) + '…' : '—'],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', borderBottom: '1px solid var(--br)', padding: '5px 0', gap: 12 }}>
                  <span style={{ color: 'var(--t3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', minWidth: 130, paddingTop: 2 }}>{l}</span>
                  <span style={{ flex: 1, fontSize: 13 }}>{v}</span>
                </div>
              ))}
            </div>
            <button className="btn sec" style={{ width: '100%', marginTop: 12, justifyContent: 'center' }} onClick={() => {
              const text = `SIGNATURE CERTIFICATE\nDocument: ${viewCert.doc_type}\nClient: ${viewCert.client_name}\nFee: ${viewCert.investigation_fee ? '$' + viewCert.investigation_fee : '—'}\nSigned Name: ${viewCert.signed_name}\nIP Address: ${viewCert.signer_ip}\nSigned At: ${new Date(viewCert.signed_at).toLocaleString()}`
              navigator.clipboard.writeText(text)
              showToast('Certificate copied!')
            }}>📋 Copy Certificate</button>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {confirmDel && (
        <div className="modal-bg open" onClick={e => e.target === e.currentTarget && setConfirmDel(null)}>
          <div className="modal" style={{ maxWidth: 380, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🗑</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Delete this request?</div>
            <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 20 }}>This permanently removes the signing request and all signature data. Cannot be undone.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn sec" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className="btn del" style={{ flex: 1, justifyContent: 'center' }} onClick={() => del(confirmDel)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* New Request Modal */}
      {modal && (
        <div className="modal-bg open" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal" style={{ width: 580 }}>
            <div className="mh">
              <span className="mt">New Signing Request</span>
              <button className="xbtn" onClick={() => setModal(false)}>&times;</button>
            </div>

            <div className="field"><label>Document Type</label>
              <select value={form.docType} onChange={e => fld('docType', e.target.value)}>
                {DOC_TYPES.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>

            <div style={{ position: 'relative' }} className="field"><label>Client *</label>
              <input value={form.clientName} onChange={e => searchClient(e.target.value)} placeholder="Search client…" />
              {showSug && suggestions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--sf)', border: '1px solid var(--br)', borderRadius: 6, zIndex: 50, maxHeight: 180, overflowY: 'auto' }}>
                  {suggestions.map(c => (
                    <div key={c.id} onClick={() => selectClient(c)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13 }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      {c.name} {c.email && <span style={{ color: 'var(--t3)', fontSize: 11 }}>· {c.email}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="fg2">
              <div className="field"><label>Client Email</label>
                <input type="email" value={form.clientEmail} onChange={e => fld('clientEmail', e.target.value)} placeholder="client@email.com" />
              </div>
              <div className="field"><label>Client Phone</label>
                <input type="tel" value={form.clientPhone} onChange={e => fld('clientPhone', e.target.value)} placeholder="(305) 555-0000" />
              </div>
            </div>

            <div className="fg2">
              <div className="field"><label>Investigation Fee ($)</label>
                <input type="number" value={form.investigationFee} onChange={e => fld('investigationFee', e.target.value)} placeholder="399" min="399" max="599" />
              </div>
              <div className="field"><label>Tax Years</label>
                <input value={form.taxYears} onChange={e => fld('taxYears', e.target.value)} placeholder="2022, 2023, 2024" />
              </div>
            </div>

            <div className="field"><label>Case Rep Name</label>
              <input value={form.repName} onChange={e => fld('repName', e.target.value)} placeholder="Dana Richard" />
            </div>

            <div className="field"><label>Send Agreement Via</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['email', '📧 Email Only'], ['sms', '💬 SMS Only'], ['both', '📧💬 Both']].map(([v, l]) => (
                  <button key={v} type="button"
                    style={{ flex: 1, padding: '8px 6px', borderRadius: 7, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
                      borderColor: form.sendVia === v ? 'var(--blue)' : 'var(--br)',
                      background: form.sendVia === v ? 'var(--blue)22' : 'var(--s2)',
                      color: form.sendVia === v ? 'var(--blue)' : 'var(--t2)' }}
                    onClick={() => fld('sendVia', v)}>{l}</button>
                ))}
              </div>
            </div>

            <div className="fg2">
              <div className="field"><label>Priority</label>
                <select value={form.priority} onChange={e => fld('priority', e.target.value)}>
                  {['Normal', 'High', 'Urgent'].map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div className="field"><label>Due Date</label>
                <input type="date" value={form.dueDate} onChange={e => fld('dueDate', e.target.value)} />
              </div>
            </div>

            <div style={{ background: 'var(--s2)', borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: 'var(--t3)', lineHeight: 1.6 }}>
              💡 Reminders show automatically on unsigned agreements at 1, 3, and 5 days. Client receives the agreement via your selected method and a copy is saved to their file when signed.
            </div>
            <button className="btn pri" style={{ width: '100%', justifyContent: 'center', padding: 10 }} onClick={save} disabled={saving}>
              {saving ? 'Sending…' : '✅ Send Signing Request'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
