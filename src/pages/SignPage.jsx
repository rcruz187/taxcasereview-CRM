import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { stampSignature } from '../lib/irsFormUtils'

export default function SignPage() {
  const { id } = useParams()
  const [doc,      setDoc]      = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [fullname, setFullname] = useState('')
  const [typedSig, setTypedSig] = useState('')
  const [mode,     setMode]     = useState('type') // 'type' | 'draw'
  const [signing,  setSigning]  = useState(false)
  const [done,     setDone]     = useState(false)
  const [ip,       setIp]       = useState('')
  const [hasDrawn, setHasDrawn] = useState(false)
  const canvasRef  = useRef(null)
  const drawingRef = useRef(false)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.from('esigns').select('*').eq('id', id).maybeSingle()
      if (error || !data) { setError('Signing request not found or expired.'); setLoading(false); return }
      if (data.status === 'Signed') { setDone(true); setDoc(data); setLoading(false); return }
      setDoc(data); setLoading(false)
    }
    load()
    fetch('https://api.ipify.org?format=json').then(r=>r.json()).then(d=>setIp(d.ip)).catch(()=>{})
  }, [id])

  // Canvas drawing setup
  useEffect(() => {
    if (mode !== 'draw' || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const ratio = window.devicePixelRatio || 1
    canvas.width  = canvas.offsetWidth  * ratio
    canvas.height = canvas.offsetHeight * ratio
    ctx.scale(ratio, ratio)
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth   = 2.5
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'

    function pos(e) {
      const r = canvas.getBoundingClientRect()
      const src = e.touches ? e.touches[0] : e
      return { x: (src.clientX - r.left), y: (src.clientY - r.top) }
    }
    const start = e => { e.preventDefault(); drawingRef.current = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y) }
    const move  = e => { e.preventDefault(); if (!drawingRef.current) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); setHasDrawn(true) }
    const end   = e => { e.preventDefault(); drawingRef.current = false }

    canvas.addEventListener('mousedown', start)
    canvas.addEventListener('mousemove', move)
    canvas.addEventListener('mouseup',   end)
    canvas.addEventListener('mouseleave',end)
    canvas.addEventListener('touchstart', start, { passive: false })
    canvas.addEventListener('touchmove',  move,  { passive: false })
    canvas.addEventListener('touchend',   end)

    return () => {
      canvas.removeEventListener('mousedown', start)
      canvas.removeEventListener('mousemove', move)
      canvas.removeEventListener('mouseup',   end)
      canvas.removeEventListener('mouseleave',end)
      canvas.removeEventListener('touchstart', start)
      canvas.removeEventListener('touchmove',  move)
      canvas.removeEventListener('touchend',   end)
    }
  }, [mode])

  function clearCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
  }

  const canSign = fullname.trim().length > 1 && (mode === 'type' ? typedSig.trim().length > 1 : hasDrawn)

  async function sign() {
    if (!canSign) return
    setSigning(true)
    const signedAt  = new Date().toISOString()
    const signedDate = new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })

    let sigImage = null
    if (mode === 'draw' && canvasRef.current) {
      sigImage = canvasRef.current.toDataURL('image/png')
    }

    const { error } = await supabase.from('esigns').update({
      status:            'Signed',
      signed_at:         signedAt,
      signed_name:       mode === 'type' ? typedSig.trim() : fullname.trim(),
      signer_full_name:  fullname.trim(),
      signer_ip:         ip,
      signed_timestamp:  signedAt,
      signed_user_agent: navigator.userAgent.slice(0, 200),
    }).eq('id', id)

    if (error) { setSigning(false); setError('Error saving signature: ' + error.message); return }

    // Save to documents table so it appears in client file
    await supabase.from('documents').insert([{
      client:     doc.client_name,
      name:       'SIGNED — ' + doc.doc_type + ' — ' + signedDate,
      docType:    'E-Signature',
      notes:      `Signed by: ${fullname}\nIP: ${ip}\nDate: ${signedAt}`,
      created_at: signedAt,
    }]).catch(() => {})

    // Stamp signature onto each pre-filled IRS PDF attached to this package
    const pdfAttachments = Array.isArray(doc.pdf_attachments) ? doc.pdf_attachments : []
    const signatureText = (mode === 'type' ? typedSig.trim() : fullname.trim())
    const safeName = (doc.client_name || 'client').replace(/[^a-zA-Z0-9]+/g, '-')
    const signedAttachments = []

    for (const att of pdfAttachments) {
      try {
        const bytes = await fetch(att.url).then(r => r.arrayBuffer())
        const signedBytes = await stampSignature(
          bytes,
          att.formType,
          signatureText,
          signedDate,
          mode === 'draw' ? sigImage : null
        )
        const path = `docs/${safeName}/signed/${att.formType}_signed.pdf`
        await supabase.storage.from('documents')
          .upload(path, new Blob([signedBytes], { type: 'application/pdf' }), { upsert: true, contentType: 'application/pdf' })
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
        signedAttachments.push({ formType: att.formType, label: att.label, url: urlData.publicUrl })
        await supabase.from('documents').insert([{
          client:     doc.client_name,
          name:       'SIGNED — ' + att.label,
          docType:    'E-Signature',
          file_url:   urlData.publicUrl,
          file_name:  `${att.formType}_signed.pdf`,
          notes:      `Signed by: ${fullname}\nIP: ${ip}\nDate: ${signedAt}`,
          created_at: signedAt,
        }]).catch(() => {})
      } catch (e) {
        console.error('Failed to stamp', att.formType, e)
      }
    }

    if (signedAttachments.length) {
      await supabase.from('esigns').update({ signed_attachments: signedAttachments }).eq('id', id).catch(() => {})
    }

    setDone(true); setSigning(false)
  }

  if (loading) return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ textAlign:'center', padding:40, color:'#64748b' }}>Loading document…</div>
      </div>
    </div>
  )

  if (error) return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ textAlign:'center', padding:40 }}>
          <div style={{ fontSize:48, marginBottom:16 }}>⚠️</div>
          <div style={{ fontSize:18, fontWeight:700, marginBottom:8, color:'#f1f5f9' }}>Link Not Found</div>
          <div style={{ color:'#64748b', fontSize:14 }}>{error}</div>
        </div>
      </div>
    </div>
  )

  if (done) return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ textAlign:'center', padding:'32px 20px' }}>
          <div style={{ fontSize:56, marginBottom:16 }}>✅</div>
          <div style={{ fontSize:22, fontWeight:800, color:'#4ade80', marginBottom:8 }}>Agreement Signed!</div>
          <div style={{ color:'#94a3b8', fontSize:14, lineHeight:1.7, marginBottom:20 }}>
            Thank you, <strong style={{color:'#f1f5f9'}}>{doc?.signer_full_name || doc?.client_name}</strong>.<br/>
            Your signature has been recorded and saved.<br/>
            Tax Case Review has been notified.
          </div>
          <div style={{ background:'#0a2540', border:'1px solid #166534', borderRadius:10, padding:'14px 16px', fontSize:12, color:'#86efac', textAlign:'left', lineHeight:2, fontFamily:'monospace' }}>
            <strong>CERTIFICATE OF COMPLETION</strong><br/>
            Document: {doc?.doc_type}<br/>
            Client: {doc?.client_name}<br/>
            Signed By: {doc?.signed_name}<br/>
            IP Address: {doc?.signer_ip || 'Recorded'}<br/>
            Timestamp: {doc?.signed_at ? new Date(doc.signed_at).toLocaleString() : new Date().toLocaleString()}
          </div>
          <div style={{ marginTop:16, fontSize:11, color:'#475569' }}>A copy has been saved to your file. You may close this window.</div>
        </div>
      </div>
    </div>
  )

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={{ textAlign:'center', marginBottom:24, paddingBottom:18, borderBottom:'1px solid #1e3a5f', width:'100%', maxWidth:660 }}>
        <div style={{ fontSize:12, fontWeight:800, color:'#60a5fa', letterSpacing:'.12em', textTransform:'uppercase', marginBottom:4 }}>Tax Case Review</div>
        <div style={{ fontSize:11, color:'#475569' }}>Secure Document Signing Portal</div>
      </div>

      <div style={styles.card}>
        <h1 style={styles.h1}>{doc.doc_type === 'Tax Service Agreement' ? 'Tax Service Agreement' : doc.doc_type}</h1>
        <div style={styles.sub}>Prepared for: <strong style={{color:'#93c5fd'}}>{doc.client_name}</strong></div>

        {/* Tax Service Agreement full content */}
        {doc.doc_type === 'Tax Service Agreement' ? (
          <div>
            <div style={styles.section}>
              <div style={styles.secTitle}>Tax Investigation Service Agreement</div>
              <div style={styles.docBody}>{`Dear ${doc.client_name},

Thank you for choosing Tax Case Review. This document confirms our engagement to assist you with your tax matter for tax year(s): ${doc.tax_years || '_______________'}.`}</div>
            </div>

            <div style={styles.section}>
              <div style={styles.secTitle}>1. Scope of Services</div>
              <div style={styles.docBody}>{`- Review of IRS and/or state tax transcripts
- Identification of outstanding tax liabilities and unfiled returns
- Evaluation of eligibility for IRS resolution programs (OIC, CNC, IA, Penalty Abatement)
- Preparation of a written resolution strategy within 21 business days
- Full IRS/state representation — Case Rep: ${doc.rep_name || 'Tax Case Review'}`}</div>
            </div>

            <div style={styles.section}>
              <div style={styles.secTitle}>2. Authorization</div>
              <div style={styles.docBody}>{`By signing below, you authorize Tax Case Review to obtain IRS transcripts via Form 2848/8821 and represent you before the IRS and/or applicable state tax authority.`}</div>
            </div>

            <div style={styles.section}>
              <div style={styles.secTitle}>3. Investigation Fee</div>
              <div style={styles.feeBox}>💰 Investigation Fee: <strong style={{color:'#fff',fontSize:16}}>{doc.investigation_fee ? `$${doc.investigation_fee}` : '_____________'}</strong></div>
              <div style={{...styles.docBody, marginBottom:0}}>Non-refundable once transcript review has commenced. Full payment due prior to commencement.</div>
            </div>

            <div style={styles.section}>
              <div style={styles.secTitle}>4. Client Responsibilities</div>
              <div style={styles.docBody}>{`- Provide accurate and complete financial and tax information
- Respond to document requests within 5 business days
- Notify Tax Case Review of any IRS communications received
- Make timely payment of agreed fees`}</div>
            </div>

            <div style={styles.section}>
              <div style={styles.secTitle}>5. Terms & Conditions</div>
              <div style={{...styles.docBody, marginBottom:0}}>This agreement does not guarantee a specific resolution outcome. Tax Case Review will act diligently and professionally on your behalf. This agreement is governed by the laws of the State of Florida.</div>
            </div>
          </div>
        ) : (
          /* Generic document body for non-TSA doc types */
          <div style={styles.docBody}>{doc.message || 'Please review and sign this document.'}</div>
        )}

        {/* Attached IRS forms (pre-filled, signature pending) */}
        {Array.isArray(doc.pdf_attachments) && doc.pdf_attachments.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={styles.label}>Included IRS Forms</div>
            <div style={{ fontSize:12, color:'#64748b', marginBottom:10, lineHeight:1.6 }}>
              Please review the form(s) below. Your signature and today's date will be added to each one in the signature line when you sign below.
            </div>
            {doc.pdf_attachments.map(att => (
              <div key={att.formType} style={{ marginBottom: 14 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#0f172a', marginBottom:6 }}>{att.label}</div>
                <iframe src={att.url} title={att.label} style={{ width:'100%', height:380, border:'1px solid #e2e8f0', borderRadius:8 }}/>
              </div>
            ))}
          </div>
        )}

        {/* Full legal name */}
        <div style={styles.field}>
          <label style={styles.label}>Full Legal Name</label>
          <input style={styles.input} value={fullname} onChange={e=>setFullname(e.target.value)}
            placeholder="Type your full legal name as it appears on the document"/>
        </div>

        {/* Signature */}
        <div style={styles.field}>
          <label style={styles.label}>Electronic Signature</label>

          {/* Mode toggle */}
          <div style={{ display:'flex', gap:8, marginBottom:10 }}>
            {['type','draw'].map(m => (
              <button key={m} onClick={()=>setMode(m)} style={{
                padding:'6px 18px', borderRadius:7, border:'1px solid #cbd5e1',
                background: mode===m ? '#0f172a' : '#f8fafc',
                color: mode===m ? '#fff' : '#64748b',
                fontWeight:600, fontSize:13, cursor:'pointer'
              }}>{m === 'type' ? 'Type' : 'Draw'}</button>
            ))}
          </div>

          {mode === 'type' && (
            <div style={styles.sigPad}>
              <input style={{ ...styles.sigInput, fontFamily:'Georgia,serif', fontSize:28, textAlign:'center' }}
                value={typedSig} onChange={e=>setTypedSig(e.target.value)}
                placeholder="Type your name here to sign"/>
            </div>
          )}

          {mode === 'draw' && (
            <div>
              <canvas ref={canvasRef} style={styles.canvas}/>
              <button onClick={clearCanvas} style={styles.clearBtn}>Clear</button>
            </div>
          )}

          <div style={styles.legal}>By signing above, you agree this constitutes a legally binding electronic signature under ESIGN and UETA.</div>
        </div>

        {/* IP / timestamp info */}
        {ip && <div style={styles.meta}>Your IP: {ip} · {new Date().toLocaleString()}</div>}

        {/* Sign button */}
        <button onClick={sign} disabled={!canSign || signing} style={{
          width:'100%', padding:16, background: canSign ? '#16a34a' : '#94a3b8',
          color:'#fff', border:'none', borderRadius:10, fontSize:15,
          fontWeight:700, cursor: canSign ? 'pointer' : 'default', transition:'background .2s'
        }}>
          {signing ? 'Processing…' : 'Sign Document'}
        </button>

        <div style={styles.disclaimer}>
          This electronic signature is legally binding under the Electronic Signatures in Global and National Commerce Act (ESIGN) and Uniform Electronic Transactions Act (UETA).
          Your IP address, signature, and timestamp will be recorded and stored as proof of signing.
        </div>
      </div>
    </div>
  )
}

const styles = {
  page:       { minHeight:'100vh', background:'#0a1628', display:'flex', flexDirection:'column', alignItems:'center', padding:'24px 16px 48px', fontFamily:'"Segoe UI",Arial,sans-serif' },
  card:       { background:'#0f1e35', border:'1px solid #1e3a5f', borderRadius:14, padding:'28px 32px', maxWidth:660, width:'100%' },
  h1:         { fontSize:20, fontWeight:800, marginBottom:4, color:'#f1f5f9', textAlign:'center' },
  sub:        { fontSize:13, color:'#64748b', marginBottom:20, textAlign:'center' },
  docBody:    { background:'#0a1628', border:'1px solid #1e3a5f', borderRadius:9, padding:18, marginBottom:20, fontSize:13.5, lineHeight:1.8, color:'#cbd5e1', whiteSpace:'pre-wrap' },
  field:      { marginBottom:18 },
  label:      { display:'block', fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 },
  input:      { width:'100%', padding:'11px 14px', border:'1px solid #1e3a5f', borderRadius:8, fontSize:14, outline:'none', boxSizing:'border-box', background:'#0a1628', color:'#f1f5f9' },
  sigPad:     { border:'2px dashed #1e3a5f', borderRadius:9, padding:'8px 0', background:'#0a1628' },
  sigInput:   { width:'100%', border:'none', background:'none', outline:'none', padding:'8px 14px', boxSizing:'border-box', fontSize:28, fontFamily:'"Brush Script MT",cursive,Georgia,serif', color:'#60a5fa' },
  canvas:     { width:'100%', height:130, border:'2px dashed #1e3a5f', borderRadius:9, background:'#0a1628', cursor:'crosshair', display:'block', touchAction:'none' },
  clearBtn:   { background:'none', border:'none', color:'#475569', fontSize:11, cursor:'pointer', textDecoration:'underline', marginTop:4 },
  legal:      { fontSize:11, color:'#475569', marginTop:8 },
  meta:       { fontSize:11, color:'#475569', marginBottom:14, background:'#0a1628', border:'1px solid #1e3a5f', borderRadius:6, padding:'7px 12px', lineHeight:1.6 },
  disclaimer: { fontSize:11, color:'#475569', textAlign:'center', marginTop:18, lineHeight:1.6 },
  section:    { marginBottom:18 },
  secTitle:   { fontSize:11, fontWeight:800, color:'#3b82f6', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6, paddingBottom:4, borderBottom:'1px solid #1e3a5f' },
  feeBox:     { background:'#0a2540', border:'1px solid #1e40af', borderRadius:8, padding:'10px 14px', marginBottom:10, fontSize:14, color:'#93c5fd', fontWeight:600 },
}
