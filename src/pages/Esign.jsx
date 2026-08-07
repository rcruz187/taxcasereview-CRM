import DeleteConfirmModal from '../components/DeleteConfirmModal'
import { formatMoneyInput, parseMoney } from '../lib/money'
import { logActivity, getActor } from '../lib/activityLog'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { triggerWorkflow } from '../lib/triggerWorkflow'
import { useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import ClientLink from '../components/ClientLink'
import { FIRM } from '../lib/firmBranding'

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
  sendVia: 'both',
  priority: 'Normal', dueDate: ''
}

function signingUrl(id) {
  return `${window.location.origin}/taxcasereview-CRM/sign/${id}`
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
  const [expandedRow, setExpandedRow] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: e }, { data: c }] = await Promise.all([
      supabase.from('esigns').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('id,name,email,phone'),
    ])
    if (e) setItems(e)
    if (c) setClients(c)
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
    const msg = `Hi ${clientName}, ${FIRM.name || 'Tax Case Review'} sent you a Tax Service Agreement to sign. Please review and sign here: ${url}`
    let smsSent = false, emailSent = false
    const { data: cfg } = await supabase.from('settings').select('signalwire_backend,smtp_host,smtp_email').limit(1).maybeSingle()
    if ((sendVia === 'sms' || sendVia === 'both') && clientPhone) {
      try {
        const res = await fetch((cfg?.signalwire_backend || '') + '/sms/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: clientPhone, body: msg })
        })
        const d = await res.json()
        if (d.success) smsSent = true
      } catch (e) { console.error('SMS error:', e) }
    }
    if ((sendVia === 'email' || sendVia === 'both') && clientEmail) {
      try {
        const { error } = await supabase.functions.invoke('send-email', {
          body: {
            to: clientEmail,
            subject: `Tax Service Agreement — Please Sign`,
            html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden"><tr><td style="background:linear-gradient(135deg,#1e3a8a,#1d4ed8);padding:28px 40px;text-align:center"><img src="${FIRM.logoUrl}" alt="${FIRM.name}" style="max-height:56px;max-width:190px;object-fit:contain;display:block;margin:0 auto 8px" onerror="this.style.display='none'"/><div style="font-size:13px;font-weight:800;color:#93c5fd;letter-spacing:.12em;text-transform:uppercase">${FIRM.name}</div></td></tr><tr><td style="padding:36px 40px"><p style="margin:0 0 16px;font-size:15px;color:#0f172a">Dear <strong>${clientName}</strong>,</p><p style="margin:0 0 24px;font-size:14px;color:#334155;line-height:1.7">Please review and sign your <strong>Tax Service Agreement</strong>. This link is unique to you.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 20px"><a href="${url}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px">Sign Agreement →</a></td></tr></table><p style="margin:0;font-size:11px;color:#94a3b8;text-align:center">Can't click? <a href="${url}" style="color:#3b82f6">Click here to sign</a></p></td></tr><tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 40px;text-align:center"><p style="margin:0;font-size:11px;color:#94a3b8">Tax Case Review &nbsp;·&nbsp; ${FIRM.address} &nbsp;·&nbsp; ${FIRM.phone}</p></td></tr></table></td></tr></table></body></html>`
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
    const actorE = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Staff'
    await triggerWorkflow('esign_sent', form.entityType || 'lead', form.clientName || '', actorE).catch(()=>{})
    await logActivity(supabase,{employeeName:actorE,action:'esign_sent',category:'esign',description:`Sent e-sign: ${form.docType} → ${form.clientName}`,entityName:form.clientName,meta:{docType:form.docType}}).catch(()=>{})
    setModal(false); setForm(BLANK); load()
  }

  async function resendLink(item) {
    const url = signingUrl(item.id)
    await navigator.clipboard.writeText(url).catch(() => {})
    const { error: updErr } = await supabase.from('esigns').update({ status: 'Awaiting', sent_at: new Date().toISOString() }).eq('id', item.id)
    if (updErr) { showToast('Error: ' + updErr.message); return }
    // esigns rows come back snake_case (client_email/client_phone/client_name) —
    // sendLink expects camelCase, same shape as the New Signing Request form.
    const { smsSent, emailSent } = await sendLink(url, {
      sendVia: item.send_via || 'both',
      clientEmail: item.client_email,
      clientPhone: item.client_phone,
      clientName: item.client_name,
    })
    const sent = [smsSent && 'SMS', emailSent && 'Email'].filter(Boolean)
    showToast(sent.length ? `✅ Resent via ${sent.join(' & ')}` : '⚠️ No email/phone on file to resend to — link copied to clipboard')
    load()
  }

  async function updateStatus(id, status) {
    const { error } = await supabase.from('esigns').update({ status }).eq('id', id)
    if (error) { showToast('Error: ' + error.message); return }
    showToast(`✅ Marked as ${status}`); load()
  }

  async function del(id) {
    const { error } = await supabase.from('esigns').delete().eq('id', id)
    if (error) { showToast('Error: ' + error.message); setConfirmDel(null); return }
    setItems(prev => prev.filter(i => i.id !== id)); setConfirmDel(null); showToast('Deleted')
  }

  function openSigningPage(item) { window.open(signingUrl(item.id), '_blank') }

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
  const signed   = items.filter(i => i.status === 'Signed').length

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>✍️ E-Signatures</h2>
        <button className="btn pri" style={{ fontSize: 14, padding: '9px 20px', fontWeight: 700 }} onClick={() => { setForm(BLANK); setModal(true) }}>+ New Signing Request</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10, marginBottom: 20 }}>
        {[
          ['Total Sent',  items.length,                                              'var(--tx)'],
          ['Awaiting',    awaiting,                                                  'var(--warn)'],
          ['Signed',      signed,                                                    'var(--ok)'],
          ['Declined',    items.filter(i => i.status === 'Declined').length,         'var(--bad)'],
          ['Sign Rate',   items.length ? Math.round((signed/items.length)*100)+'%' : '—', 'var(--b2)'],
        ].map(([label, val, color]) => (
          <div key={label} className="card" style={{ padding: '16px 18px', textAlign: 'center' }}>
            <div style={{ fontWeight: 900, fontSize: 28, color, lineHeight: 1 }}>{val}</div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 6, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Reminder callout */}
      {items.some(i => i.status === 'Awaiting' && daysPending(i) >= 1) && (
        <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: 'var(--warn)' }}>
          ⏰ <strong>Reminder needed:</strong> {items.filter(i => i.status === 'Awaiting' && daysPending(i) >= 1).length} agreement(s) unsigned for 1+ days — use <strong>Resend</strong> to follow up.
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search client or document…"
          style={{ flex: 1, minWidth: 200, padding: '9px 14px', background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 8, color: 'var(--tx)', fontSize: 14 }} />
        {['All', 'Awaiting', 'Signed', 'Declined', 'Expired'].map(s => (
          <button key={s} className={`btn ${filterStatus === s ? 'pri' : 'sec'}`} style={{ fontSize: 12, padding: '6px 14px', fontWeight: 600 }} onClick={() => setFilterStatus(s)}>{s}</button>
        ))}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--t3)', fontSize: 15 }}>
            {items.length === 0 ? 'No e-signature requests yet. Create one to send a signing link to a client.' : 'No requests match your filters.'}
          </div>
        ) : (
          <div className="ovx">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--br)', background: 'var(--s2)' }}>
                  {['Client', 'Document', 'Sent', 'Pending', 'Status', 'Signed By', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => {
                  const isSigned = item.status === 'Signed'
                  const dp = daysPending(item)
                  const needsReminder = item.status === 'Awaiting' && dp >= 1
                  const isExpanded = expandedRow === item.id

                  return (
                    <>
                      <tr key={item.id}
                        style={{ borderBottom: '1px solid var(--br)', background: needsReminder ? 'rgba(245,158,11,.04)' : '' }}
                        onMouseEnter={e => e.currentTarget.style.background = needsReminder ? 'rgba(245,158,11,.08)' : 'var(--s2)'}
                        onMouseLeave={e => e.currentTarget.style.background = needsReminder ? 'rgba(245,158,11,.04)' : ''}>

                        {/* Client */}
                        <td style={{ padding: '13px 14px' }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}><ClientLink name={item.client_name} /></div>
                          {item.client_email && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{item.client_email}</div>}
                          {item.investigation_fee && <div style={{ fontSize: 11, color: 'var(--ok)', fontWeight: 700, marginTop: 2 }}>Fee: ${item.investigation_fee}</div>}
                        </td>

                        {/* Document */}
                        <td style={{ padding: '13px 14px', fontSize: 13, color: 'var(--t2)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.doc_type}
                        </td>

                        {/* Sent */}
                        <td style={{ padding: '13px 14px', fontSize: 12, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
                          {item.sent_at ? new Date(item.sent_at).toLocaleDateString() : '—'}
                        </td>

                        {/* Pending */}
                        <td style={{ padding: '13px 14px', whiteSpace: 'nowrap' }}>
                          {item.status === 'Awaiting' ? (
                            <span style={{ fontSize: 12, fontWeight: 700, color: dp > 5 ? 'var(--bad)' : dp > 2 ? 'var(--warn)' : 'var(--t3)' }}>
                              {dp > 0 ? `${dp}d` : 'Today'}
                            </span>
                          ) : <span style={{ color: 'var(--t3)', fontSize: 12 }}>—</span>}
                        </td>

                        {/* Status */}
                        <td style={{ padding: '13px 14px' }}>
                          <span className={`bdg ${isSigned ? 'bg' : item.status === 'Declined' ? 'br' : item.status === 'Expired' ? 'bw' : 'ba'}`}
                            style={{ fontSize: 12, padding: '3px 10px', fontWeight: 700 }}>
                            {item.status}
                          </span>
                        </td>

                        {/* Signed By */}
                        <td style={{ padding: '13px 14px' }}>
                          {isSigned && item.signed_name ? (
                            <span style={{ fontFamily: 'Georgia,serif', fontSize: 14, color: 'var(--ok)', fontWeight: 600 }}>{item.signed_name}</span>
                          ) : <span style={{ color: 'var(--t3)', fontSize: 12 }}>—</span>}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '13px 14px' }}>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'nowrap', alignItems: 'center' }}>
                            {item.status === 'Awaiting' && (
                              <>
                                <button className="btn sec" style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap' }} onClick={() => resendLink(item)}>📨 Resend</button>
                                <button className="btn sec" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => openSigningPage(item)}>👁</button>
                                <button className="btn" style={{ fontSize: 11, padding: '4px 10px', background: 'var(--ok)', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => updateStatus(item.id, 'Signed')}>✓</button>
                              </>
                            )}
                            {isSigned && (
                              <button className="btn sec" style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap' }} onClick={() => setViewCert(item)}>🔐 Cert</button>
                            )}
                            {!isSigned && item.status !== 'Awaiting' && (
                              <button className="btn sec" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => resendLink(item)}>↻</button>
                            )}
                            <button className="btn del" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setConfirmDel(item.id)}>Del</button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded row for signed details */}
                      {isSigned && isExpanded && (
                        <tr key={item.id + '-exp'} style={{ background: 'var(--s2)', borderBottom: '1px solid var(--br)' }}>
                          <td colSpan={7} style={{ padding: '10px 14px' }}>
                            <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                              IP: {item.signer_ip || '—'} · Signed: {item.signed_at ? new Date(item.signed_at).toLocaleString() : '—'}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
                ['Document',         viewCert.doc_type],
                ['Client',           viewCert.client_name],
                ['Email',            viewCert.client_email || '—'],
                ['Fee',              viewCert.investigation_fee ? `$${viewCert.investigation_fee}` : '—'],
                ['Signed Name',      <span style={{ fontFamily: 'Georgia,serif', fontSize: 16, color: 'var(--ok)' }}>{viewCert.signed_name || '—'}</span>],
                ['Full Name Entered',viewCert.signer_full_name || '—'],
                ['IP Address',       viewCert.signer_ip || 'Not captured'],
                ['Signed At',        viewCert.signed_at ? new Date(viewCert.signed_at).toLocaleString() : '—'],
                ['Sent At',          viewCert.sent_at ? new Date(viewCert.sent_at).toLocaleString() : '—'],
                ['Device',           viewCert.signed_user_agent ? viewCert.signed_user_agent.slice(0, 60) + '…' : '—'],
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

      <DeleteConfirmModal open={!!confirmDel} label="signing request" onConfirm={() => del(confirmDel)} onCancel={() => setConfirmDel(null)} />

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
                <input type="text" inputMode="decimal" value={formatMoneyInput(form.investigationFee)} onChange={e => fld('investigationFee', parseMoney(e.target.value))} placeholder="399" min="399" max="599" />
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

            <div style={{ background: 'var(--s2)', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 12, color: 'var(--t3)', lineHeight: 1.6 }}>
              💡 Reminders show automatically on unsigned agreements at 1, 3, and 5 days.
            </div>
            <button className="btn pri" style={{ width: '100%', justifyContent: 'center', padding: 12, fontSize: 15, fontWeight: 700 }} onClick={save} disabled={saving}>
              {saving ? 'Sending…' : '✅ Send Signing Request'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

