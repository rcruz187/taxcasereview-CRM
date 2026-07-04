import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { triggerWorkflow } from '../lib/triggerWorkflow'
import { stampSignature, buildCertificatePage, addTearDropStamp, appendPdfPages } from '../lib/irsFormUtils'
import { useFirm } from '../lib/useFirm'
import { advanceLeadStatus } from '../lib/leadStatus'

// IRS forms never get an IP/timestamp stamp — only firm documents (the
// Tax Service Agreement, addenda, etc.) do.
const IRS_DOC_TYPES = [
  'Form 2848 — Power of Attorney',
  'Form 8821 — Tax Info Auth',
  '9465 Installment Agreement',
  '9465 Installment Agreement Consent',
  'OIC Application (656)',
  'Form 433-A Collection Info',
  'Form 433-B Business Collection Info',
  'CDP Hearing Request',
]

function printCancellationNotice(doc) {
  const w = window.open('', '_blank', 'width=700,height=900')
  const signedDate = doc?.signed_at ? new Date(doc.signed_at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : ''
  w.document.write(`<!DOCTYPE html><html><head><title>Notice of Right of Cancellation</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:40px 56px;max-width:700px;margin:0 auto;line-height:1.7}
      h1{font-size:16px;text-align:center;margin-bottom:20px}
      .blank{border-bottom:1.5px solid #333;height:26px;margin-bottom:4px}
      .lbl{font-size:11px;color:#555;margin-bottom:16px}
    </style></head><body>
    <h1>Notice of Right of Cancellation</h1>
    <p>You may cancel the Tax Service Agreement signed on ${signedDate || '_______________'}, without any penalty or obligation, within three (3) business days after the date you signed it.</p>
    <p>If you cancel, any payments made by you will be returned within three (3) days following receipt of your cancellation notice. In the event of a cancellation, payments made will be prorated at a $250 hourly rate for all work product services already performed by Tax Case Review.</p>
    <p>You may also terminate the Tax Service Agreement at any later time as provided therein, but Tax Case Review is not required to refund fees you have paid except as set forth in the Agreement.</p>
    <p>To cancel, mail or deliver a signed and dated copy of this notice to <b>Tax Case Review, 631 US Highway One Ste 304, North Palm Beach, FL 33408</b>, not later than midnight of the third business day after you signed the Tax Service Agreement.</p>
    <h3 style="margin-top:28px">I Hereby Cancel the Tax Service Agreement</h3>
    <div class="blank" style="margin-top:24px"></div><div class="lbl">Full Client Name</div>
    <div style="display:flex;gap:48px">
      <div style="flex:1"><div class="blank"></div><div class="lbl">Signature</div></div>
      <div style="flex:1"><div class="blank"></div><div class="lbl">Date</div></div>
    </div>
    <p style="margin-top:20px;font-size:11px;color:#888"><em>This notice is provided for your protection and should be left blank unless you decide to cancel.</em></p>
  </body></html>`)
  w.document.close()
  setTimeout(() => w.print(), 400)
}

export default function SignPage() {
  const { id } = useParams()
  const { logoUrl } = useFirm()
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
    ctx.strokeStyle = '#ffffff'
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

    // Fire esign_signed workflow trigger
    await triggerWorkflow('esign_signed', doc.lead_id ? 'lead' : 'client', doc.client_name, 'System').catch(()=>{})

    // Everything after the DB write is best-effort — pipeline advance, PDF
    // stamping, document inserts, email/SMS. If any of it hangs or throws the
    // client still sees the confirmation screen; nothing here affects whether
    // the signature is legally captured (that already happened above).
    try {

    // ── Pipeline advance ──────────────────────────────────────────────────
    // Map doc_type to the correct pipeline status. Forward-only — safe no-op
    // once lead is converted or already past that stage.
    const pipelineMap = {
      'Full Investigation Package': 'Tax Inv Agreement Signed',
      'Service Addendum':           'Addendum Signed',
      'Tax Service Agreement':      'Tax Inv Agreement Signed',
      'Service Agreement':          'Tax Inv Agreement Signed',
    }
    // State POA signed — doesn't change pipeline but logs a note
    const targetStatus = pipelineMap[doc.doc_type] || null
    if (targetStatus) {
      await advanceLeadStatus(supabase, doc.client_name, targetStatus).catch(()=>{})
    }

    // ── Fee-already-paid case ───────────────────────────────────────────
    // If the investigation fee was paid BEFORE the agreement got signed
    // (lead already sitting at 'Tax Inv Fee Paid'), this signature is the
    // second half of the combo — auto-advance straight to Tax Investigation
    // Active and create the same call-IRS tasks the manual status change
    // and the Stripe webhook both create. If fee isn't paid yet, this is a
    // no-op; the webhook side handles it when the fee comes in later.
    if (targetStatus === 'Tax Inv Agreement Signed') {
      try {
        const { data: leadRow2 } = await supabase.from('leads').select('id,name,status,assignedTo').eq('name', doc.client_name).maybeSingle()
        if (leadRow2 && leadRow2.status === 'Tax Inv Fee Paid') {
          await supabase.from('leads').update({ status: 'Tax Investigation Active' }).eq('id', leadRow2.id)

          const dueDate2 = new Date(); dueDate2.setDate(dueDate2.getDate() + 1)
          const dueDateStr2 = dueDate2.toISOString().slice(0, 10)
          const assignee2 = leadRow2.assignedTo || 'Unassigned'

          await supabase.from('tasks').insert([
            {
              title: `📞 Call IRS — gather tax investigation info for ${leadRow2.name}`,
              clientName: leadRow2.name, priority: 'High', dueDate: dueDateStr2, done: false,
              assignedTo: assignee2,
              notes: 'Call IRS with POA to pull transcripts, balances, lien info, assessment dates, and filing history. Enter results into the Compliance tab on this lead.',
              created_at: new Date().toISOString(),
            },
            {
              title: `🧾 Review financial intake — build resolution plan for ${leadRow2.name}`,
              clientName: leadRow2.name, priority: 'High', dueDate: dueDateStr2, done: false,
              assignedTo: assignee2,
              notes: "Review the Financial Profile (I&E, Assets & Equity tabs) populated from the client's intake submission. Cross-reference with IRS results to determine the best resolution path (OIC, IA, CNC, etc.).",
              created_at: new Date().toISOString(),
            },
          ])

          await supabase.from('lead_notes').insert([{
            lead_id: leadRow2.id, lead_name: leadRow2.name,
            text: `✍️ Agreement signed — fee already paid, auto-advanced to Tax Investigation Active. 2 tasks created for ${assignee2}.`,
            type: 'System', author: 'System (E-Sign)', created_at: new Date().toISOString(),
          }])
        }
      } catch (e) { /* best-effort, same as everything else in this try block */ }
    }

    // ── Log note on lead/client file ──────────────────────────────────────
    const noteText = `✅ ${doc.doc_type} signed — by: ${fullname} | IP: ${ip} | ${signedAt}`
    // Try lead first, then client
    const { data: leadRow } = await supabase.from('leads').select('id').eq('name', doc.client_name).maybeSingle().catch(()=>({data:null}))
    if (leadRow?.id) {
      await supabase.from('lead_notes').insert({ lead_id: leadRow.id, lead_name: doc.client_name, text: noteText, type: 'E-Sign', author: 'System', created_at: signedAt }).catch(()=>{})
    } else {
      await supabase.from('client_notes').insert({ clientname: doc.client_name, text: noteText, author: 'System', visible_to_client: false, created_at: signedAt }).catch(()=>{})
    }

    // Service Addendum is a contract — files under the Agreements folder
    // like the rest of the firm's signed agreements. Everything else (the
    // Full Investigation Package — 2848/8821/CC Auth/Service Agreement)
    // goes in E-Signatures. Must match DOC_FOLDERS in Clients.jsx exactly
    // ('E-Signatures', plural) or it silently won't show under that folder.
    const savedDocType = doc.doc_type === 'Service Addendum' ? 'Agreements' : 'E-Signatures'

    // Save signature certificate record to documents table
    await supabase.from('documents').insert([{
      client:     doc.client_name,
      name:       `Signed ${doc.doc_type} — ${doc.client_name}`,
      docType:    savedDocType,
      notes:      `Signed by: ${fullname}\nIP: ${ip}\nDate: ${signedAt}`,
      created_at: signedAt,
    }]).catch(() => {})

    // ── Build Certificate of Completion page ─────────────────────────────
    const certBytes = await buildCertificatePage({
      docType: doc.doc_type, clientName: doc.client_name,
      signedBy: fullname, ip, signedAt,
    }).catch(() => null)

    // Stamp signature onto each pre-filled IRS PDF attached to this package
    const pdfAttachments = Array.isArray(doc.pdf_attachments) ? doc.pdf_attachments : []
    const signatureText = (mode === 'type' ? typedSig.trim() : fullname.trim())
    const safeName = (doc.client_name || 'client').replace(/[^a-zA-Z0-9]+/g, '-')
    const signedAttachments = []

    for (const att of pdfAttachments) {
      try {
        const bytes = await fetch(att.url).then(r => r.arrayBuffer())
        let signedBytes = await stampSignature(
          bytes, att.formType, signatureText, signedDate,
          mode === 'draw' ? sigImage : null
        )
        // Internal copy: append certificate as final page
        if (certBytes) signedBytes = await appendPdfPages(signedBytes, certBytes).catch(() => signedBytes)
        // Client copy: teardrop stamp on last page
        const clientBytes = await addTearDropStamp(signedBytes, { signedBy: fullname, signedAt, ip }).catch(() => signedBytes)

        const path = `docs/${safeName}/signed/${att.formType}_signed.pdf`
        await supabase.storage.from('documents')
          .upload(path, new Blob([signedBytes], { type: 'application/pdf' }), { upsert: true, contentType: 'application/pdf' })
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)

        const clientPath = `docs/${safeName}/signed/${att.formType}_client_copy.pdf`
        await supabase.storage.from('documents')
          .upload(clientPath, new Blob([clientBytes], { type: 'application/pdf' }), { upsert: true, contentType: 'application/pdf' })
        const { data: clientUrlData } = supabase.storage.from('documents').getPublicUrl(clientPath)

        signedAttachments.push({ formType: att.formType, label: att.label, url: urlData.publicUrl, clientUrl: clientUrlData?.publicUrl })
        await supabase.from('documents').insert([{
          client: doc.client_name,
          name: `Signed ${att.label.split(' — ')[0]} — ${doc.client_name}`,
          docType: savedDocType, file_url: urlData.publicUrl,
          file_name: `${att.formType}_signed.pdf`, file_size: signedBytes.byteLength,
          notes: `Signed by: ${fullname}\nIP: ${ip}\nDate: ${signedAt}\n✅ Certificate of completion appended`,
          source: 'E-Signature', uploaded_by: 'System', created_at: signedAt,
        }]).catch(() => {})
      } catch (e) {
        console.error('Failed to stamp', att.formType, e)
      }
    }

    // Save certificate as standalone doc record
    if (certBytes) {
      const certPath = `docs/${safeName}/signed/certificate_${Date.now()}.pdf`
      await supabase.storage.from('documents')
        .upload(certPath, new Blob([certBytes], { type: 'application/pdf' }), { upsert: true, contentType: 'application/pdf' })
        .catch(() => {})
      const { data: certUrlData } = supabase.storage.from('documents').getPublicUrl(certPath)
      await supabase.from('documents').insert([{
        client: doc.client_name,
        name: `Certificate of Completion — ${doc.doc_type} — ${doc.client_name}`,
        docType: savedDocType, file_url: certUrlData?.publicUrl,
        file_name: 'certificate_completion.pdf',
        notes: `Signed by: ${fullname} | IP: ${ip} | ${signedAt}`,
        source: 'E-Signature', uploaded_by: 'System', created_at: signedAt,
      }]).catch(() => {})
    }

    if (signedAttachments.length) {
      await supabase.from('esigns').update({ signed_attachments: signedAttachments }).eq('id', id).catch(() => {})
    }

    // Notify the client a signed copy is on file
      const { data: cfg } = await supabase.from('settings').select('signalwire_backend').limit(1).maybeSingle().catch(() => ({ data: null }))
      const attachmentLinks = signedAttachments.map(a =>
        `<li><a href="${a.clientUrl || a.url}" style="color:#3b82f6">${a.label} — Your Signed Copy</a></li>`
      ).join('')
      if (doc.client_email) {
        await supabase.functions.invoke('send-email', { body: {
          to: doc.client_email,
          subject: `Signed Copy: ${doc.doc_type} — Tax Case Review`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px"><div style="text-align:center;margin-bottom:20px"><img src=\"https://mpxgxfqdbquzkrvvejkh.supabase.co/storage/v1/object/public/firm-assets/logo\" alt=\"Tax Case Review\" style=\"max-height:56px;max-width:190px;object-fit:contain;display:block;margin:0 auto 8px\" onerror=\"this.style.display='none'\"/><div style="font-size:12px;font-weight:800;color:#1d4ed8;letter-spacing:.1em;text-transform:uppercase;margin-top:6px">Tax Case Review</div></div><p>Dear <strong>${doc.client_name}</strong>,</p><p>This confirms your signature was received on <strong>${doc.doc_type}</strong> on ${signedDate}. A copy has been saved to your file.</p>${attachmentLinks ? `<p>Signed documents:</p><ul>${attachmentLinks}</ul>` : ''}<p style="font-size:11px;color:#94a3b8;margin-top:24px">Tax Case Review · 631 US Highway One Ste 304, North Palm Beach, FL 33408</p></div>`
        }}).catch(() => {})
      }
      if (doc.client_phone && cfg?.signalwire_backend) {
        await fetch(cfg.signalwire_backend + '/sms/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: doc.client_phone, body: `Tax Case Review: your signature on ${doc.doc_type} was received and a copy has been saved to your file.` })
        }).catch(() => {})
      }
    } catch (e) {
      console.error('Post-sign steps failed (signature already saved):', e)
    } finally {
      setDone(true); setSigning(false)
    }
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
            {!IRS_DOC_TYPES.includes(doc?.doc_type) && <>IP Address: {doc?.signer_ip || 'Recorded'}<br/>Timestamp: {doc?.signed_at ? new Date(doc.signed_at).toLocaleString() : new Date().toLocaleString()}</>}
          </div>
          <div style={{ marginTop:16, fontSize:11, color:'#475569' }}>A copy has been saved to your file. You may close this window.</div>
          {doc?.doc_type === 'Tax Service Agreement' && (
            <button onClick={() => printCancellationNotice(doc)} style={{
              marginTop:18, padding:'10px 20px', background:'transparent', border:'1px solid #334155',
              borderRadius:8, color:'#93c5fd', fontSize:12.5, fontWeight:600, cursor:'pointer'
            }}>📄 Download / Print Your Cancellation Notice</button>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={{ textAlign:'center', marginBottom:24, paddingBottom:18, borderBottom:'1px solid #1e3a5f', width:'100%', maxWidth:660 }}>
        {logoUrl && <img src={logoUrl} alt="Tax Case Review" style={{ height:48, marginBottom:10, objectFit:'contain' }}/>}
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
              <div style={styles.secTitle}>Tax Service Agreement</div>
              <div style={styles.docBody}>{`This Tax Service Agreement (as the same may be amended from time to time by any Addendum, the "Agreement"), dated as of ${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}, by and between Tax Case Review, with its principal offices located at 631 US Highway One Ste 304, North Palm Beach, FL 33408 (together with any successors or assigns, "Company") and ${doc.client_name} ("Client").`}</div>
            </div>

            <div style={styles.section}>
              <div style={styles.secTitle}>1. Company Obligations</div>
              <div style={styles.docBody}>{`Company will provide the following service(s):
- Company will contact the Internal Revenue Service ("IRS") on behalf of Client, to determine the total amount of Client's current tax liability accrued, if any
- Company will obtain a copy of Client's master file from the IRS if necessary
- Company will identify any unfiled tax returns by Client
- Company will identify any outstanding tax liens filed against Client
- Company will identify the collection statute expiration date
- Company will conduct a consultation with Client to determine Client's financial status and ability to pay unpaid taxes
- Company will analyze the information obtained from the IRS in comparison to Client's financial status and ability to pay unpaid taxes, and present Client with a proposed strategy for resolution. Once the analysis is complete, should Client enter into a separate engagement with Company as Client's tax representative, Company will immediately notify the IRS of Client's intentions in order to help prevent any and all collection action(s)
- Company will perform those additional services for additional fees described in any addendum or other modification relating to this instrument (each, an "Addendum") signed, or electronically transmitted to Company, by Client and which is in form and substance acceptable to Company, such acceptance being presumed by the commencement by Company of any additional services set forth in such addendum or modification`}</div>
            </div>

            <div style={styles.section}>
              <div style={styles.secTitle}>2. Client Obligations and Authority</div>
              <div style={styles.docBody}>{`- Client authorizes Company to obtain necessary tax information concerning Client from the IRS and/or state taxing authority
- Client agrees to provide all necessary information and any requested financial statements to Company promptly following the original execution of this Agreement or any Addendum providing for services not originally contemplated in this Agreement
- Client agrees to respond promptly to all Company requests for information or documentation
- Client will promptly notify Company of any changes in Client's financial circumstances, marital status, contact information, or any other information that is material to the rendition of services hereunder
- Client agrees to make timely payments for services rendered by Company and to reimburse Company for costs as agreed upon in this Agreement
- Client agrees to indemnify and hold harmless Company from any and all liability, claims, actions, demands, proceedings, or damages, and all expenses related thereto, incurred as a result of any fraudulence, negligence, or acts or omission of Client or breach of Client's obligations under this Agreement`}</div>
            </div>

            <div style={styles.section}>
              <div style={styles.secTitle}>3. Not Included in Agreement</div>
              <div style={styles.docBody}>{`Client expressly acknowledges that Company is not a law firm and does not provide legal, tax law, or investment advice. Unless otherwise agreed upon by Client in an Addendum, Client has not retained Company for any services other than those identified above or in an Addendum. Without limiting the foregoing, Company's services do not include representation in connection with any litigation in tax, federal, or state court.`}</div>
            </div>

            <div style={styles.section}>
              <div style={styles.secTitle}>4. Client Acknowledgments</div>
              <div style={styles.docBody}>{`Client understands and acknowledges that:
- Unless otherwise agreed upon by Client in an Addendum, Company will not prepare, submit, and negotiate with the IRS a Federal Offer in Compromise, an Installment Agreement, or any other negotiation services
- Company will not prevent any collection action by the IRS
- Company does not provide legal advice. Legal advice or representation must be provided by an attorney at law of the Client's selection, licensed by the state where the Client resides
- At all times, Client's IRS obligations remain those of Client. Company will not assume or pay any IRS obligation of Client
- Company has based qualification for its services on information provided by Client during the Client's initial consultation
- Company makes no warranties or representations as to the time to perform or complete services hereunder or to the outcome of any claim or controversy applicable to Client
- All fees paid to Company are for the limited services, as identified herein, rendered by Company and do not include any amount required to settle any claim by the IRS or state taxing authority`}</div>
            </div>

            <div style={styles.section}>
              <div style={styles.secTitle}>5. Payment of Fees</div>
              <div style={styles.feeBox}>💰 Tax Investigation Fee: <strong style={{color:'#fff',fontSize:16}}>{doc.investigation_fee ? `$${doc.investigation_fee}` : '_____________'}</strong></div>
              <div style={{...styles.docBody, marginBottom:0}}>{`Client agrees to pay the fee above for the limited services rendered by Company as described in this Agreement, it being understood that Client authorizes payment via the agreed method identified at signing. Those additional fees that may be described in any Addendum shall be payable at the times and in the manner set forth in such Addendum. Client understands and agrees that a returned check fee of $25.00 will be charged for each bounced check or draft returned for insufficient funds.`}</div>
            </div>

            <div style={styles.section}>
              <div style={styles.secTitle}>6. Additional Obligations of Company</div>
              <div style={styles.docBody}>{`Company will deal with Client's personal information only as contemplated in the Privacy Policy below. Company will keep Client reasonably informed of progress in the rendition of services hereunder, and will respond promptly to Client's reasonable inquiries and communications.`}</div>
            </div>

            <div style={styles.section}>
              <div style={styles.secTitle}>7. Termination</div>
              <div style={styles.docBody}>{`Either party may terminate this Agreement at any time by written notice, which shall be effective upon the sooner of actual receipt by the intended recipient or the passage of five days after transmittal. Upon any termination, all service fees shall be apportioned or prorated on such reasonable basis as Company shall determine, taking into account the time, money, and effort expended by Company to render services prior to the effectiveness of any such termination.`}</div>
            </div>

            <div style={styles.section}>
              <div style={styles.secTitle}>8. Arbitration of Disputes — No Class Actions</div>
              <div style={styles.docBody}>{`In the event of any controversy, claim, or dispute between the parties arising out of or relating to this Agreement, including its termination, enforcement, interpretation, or validity, the dispute shall be determined by binding arbitration in Palm Beach County, Florida, or in the county in which Client resides, in accordance with the laws of the State of Florida. The arbitration shall be administered by a nationally recognized arbitration service mutually agreed upon by the parties. The arbitrator shall be neutral, independent, and shall comply with the AAA code of ethics. The award rendered shall be final and shall not be subject to vacation or modification. The parties agree that either party may bring claims against the other only in an individual capacity and not as a plaintiff or class member in any purported class or representative proceeding, and the arbitrator may not consolidate proceedings of more than one person's claims. The parties shall share the cost of arbitration, including attorney's fees, equally; provided that if Client's share of the cost is greater than $1,000, Company will pay Client's reasonable share of costs in excess of that amount.`}</div>
            </div>

            <div style={styles.section}>
              <div style={styles.secTitle}>9. No Trial By Jury</div>
              <div style={styles.docBody}>{`Without limiting any other provision of this Agreement, Company and Client each waive any right to trial by jury in any lawsuit or other similar proceeding arising from this Agreement.`}</div>
            </div>

            <div style={styles.section}>
              <div style={styles.secTitle}>10. Limitation of Obligations</div>
              <div style={styles.docBody}>{`Company's obligations hereunder in the event of any breach of this Agreement shall in no event exceed an amount equal to 200% of the fees actually collected by Company. Without limiting the foregoing, in no event shall Company be liable for penalties, interest charges, or consequential damages of any amount whatsoever, irrespective of any matter that may hereafter occur or any omission or act by Company. Client understands that its agreement to this provision was a material inducement to Company to enter this Agreement, and that in the absence of such agreement Company would not have entered into this Agreement.`}</div>
            </div>

            <div style={styles.section}>
              <div style={styles.secTitle}>11. Governing Law &amp; Entire Agreement</div>
              <div style={styles.docBody}>{`This Agreement is made and the services are to be performed in the State of Florida and shall be governed by the laws of the State of Florida, notwithstanding any conflicts of law principles to the contrary. In the event of a dispute not resolved by arbitration as set forth above, venue shall be Palm Beach County, Florida, and in no other location. This Agreement and any Addendums constitute the full and complete agreement between the parties and supersede any prior agreements or understandings, whether written or oral. If any portion is held invalid or unenforceable, the remaining portions shall not be affected. No amendment, change, or modification of this Agreement other than an Addendum shall be valid unless in writing and signed by all parties.`}</div>
            </div>

            <div style={styles.section}>
              <div style={styles.secTitle}>12. Electronic Communication Disclosures</div>
              <div style={styles.docBody}>{`Client agrees, unless specifically requested otherwise, that by entering into transactions with Company, Client affirms consent to receive, in electronic format, all information, copies of agreements, and correspondence from Company, and to send information in electronic format. Client agrees that Company may provide all disclosures, periodic statements, notices, receipts, modifications, amendments, and all other evidence of transactions electronically, and that electronic communications will be given the same legal effect as written and signed paper communications. Client's consent may be withdrawn at any time upon Company's receipt of such withdrawal, which may impair the timing of delivery of services. Client may withdraw consent by emailing info@taxcasereview.com or writing to Tax Case Review, 631 US Highway One Ste 304, North Palm Beach, FL 33408. Client acknowledges that the internet is inherently unsecure and that Client maintains the sole obligation to ensure it can receive and regularly access Company's electronic communications.`}</div>
            </div>

            <div style={styles.section}>
              <div style={styles.secTitle}>13. Right of Cancellation</div>
              <div style={{...styles.docBody, marginBottom:0}}>{`Client may cancel this transaction at any time prior to midnight of the third (3rd) business day after the date of execution of this Agreement, without any penalty or obligation. If Client cancels, any payments made and any negotiable instrument executed by Client will be returned within three (3) days following receipt of Client's cancellation notice. In the event of a cancellation, payments made will be prorated at a $250 hourly rate for all work product services performed by Company. Client may also terminate this Agreement at any later time as provided herein, but Company is not required to refund fees already paid except as set forth in this Agreement. To cancel, Client must mail or deliver a signed and dated copy of the cancellation notice (provided to Client separately as part of this signing package) to Tax Case Review, 631 US Highway One Ste 304, North Palm Beach, FL 33408, not later than midnight of the third business day after execution of this Agreement.`}</div>
            </div>

            <div style={{...styles.section, background:'#1e2a3a', border:'1px solid #334155', borderRadius:10, padding:'14px 16px'}}>
              <div style={styles.secTitle}>Privacy Policy</div>
              <div style={{...styles.docBody, marginBottom:0, fontSize:11.5, color:'#94a3b8'}}>{`Tax Case Review recognizes that your financial information is personal. We use and share information about you to perform our obligations under this Agreement, and for related purposes, or as permitted or required by law. We may also share information with a successor in interest in connection with a merger, acquisition, or sale of assets. Calls between Company and Client may be recorded or monitored to ensure quality of service. We are careful to use only accurate, current, and complete information and will correct erroneous information promptly upon request. This policy is subject to change. Contact info@taxcasereview.com with any privacy concerns or to opt out.`}</div>
            </div>

            {/* Right of Cancellation — blank notice for client to print, fill out, and mail back if they choose to cancel. Intentionally left unfilled. */}
            <div style={{...styles.section, background:'#0a1628', border:'1px dashed #475569', borderRadius:10, padding:'16px 18px'}}>
              <div style={styles.secTitle}>Notice of Right of Cancellation (Keep for Your Records)</div>
              <div style={{...styles.docBody, marginBottom:10, fontSize:12.5}}>{`You may cancel this Tax Service Agreement, without any penalty or obligation, within three (3) business days after the date you sign it below. If you cancel, any payments made by you will be returned within three (3) days following receipt of your cancellation notice. In the event of a cancellation, payments made will be prorated at a $250 hourly rate for work product services already performed by Tax Case Review.

To cancel, complete and sign this notice, then mail or deliver it to: Tax Case Review, 631 US Highway One Ste 304, North Palm Beach, FL 33408 — not later than midnight of the third business day after you sign this Agreement.`}</div>
              <div style={{background:'#fff',color:'#111',borderRadius:6,padding:'16px 18px',fontSize:12.5,lineHeight:1.9}}>
                <div style={{fontWeight:700,marginBottom:10}}>I HEREBY CANCEL THE TAX SERVICE AGREEMENT</div>
                <div style={{borderBottom:'1px solid #333',height:22,marginBottom:4}}></div>
                <div style={{fontSize:10,color:'#666',marginBottom:14}}>Full Client Name</div>
                <div style={{display:'flex',gap:24}}>
                  <div style={{flex:1}}>
                    <div style={{borderBottom:'1px solid #333',height:22,marginBottom:4}}></div>
                    <div style={{fontSize:10,color:'#666'}}>Signature</div>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{borderBottom:'1px solid #333',height:22,marginBottom:4}}></div>
                    <div style={{fontSize:10,color:'#666'}}>Date</div>
                  </div>
                </div>
              </div>
              <div style={{fontSize:11,color:'#64748b',marginTop:8}}>This notice is provided for your protection and is left blank — only fill it out and send it if you decide to cancel.</div>
            </div>
          </div>
        ) : (
          /* Generic document body for non-TSA doc types */
          <div style={styles.docBody}>{doc.message || 'Please review and sign this document.'}</div>
        )}

        {/* Attached IRS forms (pre-filled, signature pending) */}
        {Array.isArray(doc.pdf_attachments) && doc.pdf_attachments.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={styles.label}>Included Documents</div>
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

        {/* IP / timestamp info — never shown on official IRS forms */}
        {ip && !IRS_DOC_TYPES.includes(doc?.doc_type) && <div style={styles.meta}>Your IP: {ip} · {new Date().toLocaleString()}</div>}

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

