import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import OrganizerWizard from '../components/OrganizerWizard'

const FORM_TABS = [
  { key: '1040',  label: 'Personal Federal (1040)', quarterly: false },
  { key: 'STATE', label: 'Personal State',           quarterly: false },
  { key: 'CP',    label: 'Business CP (Federal)',    quarterly: true  },
  { key: '940',   label: 'Business 940 (FUTA)',      quarterly: false },
  { key: '941',   label: 'Business 941 (Payroll)',   quarterly: true  },
  { key: '1120S', label: 'Business 1120-S',          quarterly: false },
]

const DOC_FOLDERS = ['IRS Docs','Tax Returns','Agreements','POA & Forms','Transcripts','Correspondence','Financial Statements','Other']

const SECTIONS = [
  { key: 'compliance', label: '📋 Compliance' },
  { key: 'organizer',  label: '🧾 Tax Organizer' },
  { key: 'docs',       label: '📁 Documents' },
  { key: 'pnl',        label: '📊 P&L' },
  { key: 'payments',   label: '💳 Payments' },
  { key: 'notes',      label: '💬 Notes' },
]

function fmt(v) {
  const n = parseFloat(v)
  if (isNaN(n)) return '—'
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ClientPortal() {
  const { id } = useParams()
  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [pin, setPin] = useState('')
  const [authError, setAuthError] = useState('')

  const [section, setSection] = useState('compliance')

  // Tax Organizer
  const [organizers, setOrganizers] = useState([])
  const [activeOrganizerId, setActiveOrganizerId] = useState(null)
  const [newOrgYear, setNewOrgYear] = useState('')
  const [creatingOrg, setCreatingOrg] = useState(false)

  // Compliance
  const [records, setRecords] = useState([])
  const [activeForm, setActiveForm] = useState(null)
  // Docs
  const [docs, setDocs] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadFolder, setUploadFolder] = useState('IRS Docs')
  const fileRef = useRef(null)
  // P&L
  const [bookEntries, setBookEntries] = useState([])
  // Payments
  const [payments, setPayments] = useState([])
  // Notes (client-visible only)
  const [notes, setNotes] = useState([])

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    let { data: c } = await supabase.from('clients').select('id,name,ssn,email').eq('id', id).maybeSingle()
    let isLead = false
    if (!c) {
      const { data: l } = await supabase.from('leads').select('id,name,ssn,email').eq('id', id).maybeSingle()
      if (l) { c = l; isLead = true }
    }
    if (!c) { setNotFound(true); setLoading(false); return }
    setClient({ ...c, isLead })
    setLoading(false)
  }

  function checkAuth() {
    const last4 = (client.ssn || '').replace(/\D/g, '').slice(-4)
    const emailOnFile = (client.email || '').trim().toLowerCase()
    if (!last4 || !emailOnFile) { setAuthError("We don't have enough information on file to verify you — contact your representative."); return }
    if (emailInput.trim().toLowerCase() !== emailOnFile) { setAuthError("That email doesn't match what we have on file."); return }
    if (pin.trim() !== last4) { setAuthError("That doesn't match the last 4 of your SSN on file."); return }
    setAuthError('')
    setUnlocked(true)
    loadAllData()
  }

  async function loadAllData() {
    const [{ data: comp }, { data: docsData }, { data: books }, { data: pays }, { data: notesData }, { data: orgs }] = await Promise.all([
      supabase.from('client_compliance_records').select('*').eq('client_name', client.name),
      supabase.from('documents').select('*').eq('client', client.name).order('created_at', { ascending: false }),
      supabase.from('bookkeeping').select('*').eq('client_name', client.name).order('date', { ascending: false }),
      supabase.from('payments').select('*').eq('clientName', client.name).order('created_at', { ascending: false }),
      supabase.from('client_notes').select('*').eq('client_name', client.name).eq('visible_to_client', true).order('created_at', { ascending: false }),
      supabase.from('tax_organizer_responses').select('id,tax_year,status,updated_at').eq('client_name', client.name).order('tax_year', { ascending: false }),
    ])
    setRecords(comp || [])
    setDocs(docsData || [])
    setBookEntries(books || [])
    setPayments(pays || [])
    setNotes(notesData || [])
    setOrganizers(orgs || [])
    const firstWithData = FORM_TABS.find(t => (comp || []).some(r => r.form_type === t.key))
    setActiveForm(firstWithData?.key || '1040')
  }

  async function createOrganizer() {
    const year = newOrgYear.trim()
    if (!year || !/^\d{4}$/.test(year)) return
    if (organizers.some(o => String(o.tax_year) === year)) {
      setActiveOrganizerId(organizers.find(o => String(o.tax_year) === year).id)
      return
    }
    setCreatingOrg(true)
    const { data, error } = await supabase.from('tax_organizer_responses').insert([{
      client_name: client.name, client_email: client.email || '', tax_year: year,
      answers: {}, status: 'In Progress', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }]).select().single()
    setCreatingOrg(false)
    if (error) return
    setOrganizers(prev => [data, ...prev])
    setActiveOrganizerId(data.id)
    setNewOrgYear('')
  }

  async function handleUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const path = `docs/${client.name.replace(/\s+/g, '-')}/${Date.now()}_${file.name}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
      const { error } = await supabase.from('documents').insert([{
        name: file.name, client: client.name, docType: uploadFolder,
        notes: 'Uploaded by client via portal',
        file_url: urlData.publicUrl, file_name: file.name, file_size: file.size,
        created_at: new Date().toISOString(),
      }])
      if (error) throw error
      const { data: docsData } = await supabase.from('documents').select('*').eq('client', client.name).order('created_at', { ascending: false })
      setDocs(docsData || [])
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) {
      alert('Upload failed: ' + e.message)
    } finally {
      setUploading(false)
    }
  }

  async function downloadExcel() {
    const { exportComplianceToExcel } = await import('../lib/complianceExport')
    exportComplianceToExcel(client.name, records)
  }

  if (loading) return <div style={styles.page}><div style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</div></div>

  if (notFound) return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>Link not found</div>
          <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>This portal link may have expired or is incorrect. Contact your representative for a new one.</div>
        </div>
      </div>
    </div>
  )

  if (!unlocked) return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#60a5fa', letterSpacing: '.1em', textTransform: 'uppercase' }}>Tax Case Review</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: '#fff', marginTop: 6 }}>Client Portal</div>
        </div>
        <div style={{ fontSize: 13, color: '#cbd5e1', textAlign: 'center', marginBottom: 18, lineHeight: 1.6 }}>
          Hi {client?.name}, please verify your identity to view your information.
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={styles.label}>Email Address</label>
          <input
            value={emailInput}
            onChange={e => { setEmailInput(e.target.value); setAuthError('') }}
            placeholder="you@email.com"
            type="email"
            style={styles.textInput}
          />
        </div>
        <div style={{ marginBottom: 4 }}>
          <label style={styles.label}>Last 4 Digits of SSN</label>
          <input
            value={pin}
            onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setAuthError('') }}
            onKeyDown={e => e.key === 'Enter' && checkAuth()}
            placeholder="••••"
            maxLength={4}
            inputMode="numeric"
            style={{ ...styles.textInput, fontSize: 20, letterSpacing: 6, textAlign: 'center' }}
          />
        </div>
        {authError && <div style={{ color: '#f87171', fontSize: 12, textAlign: 'center', marginTop: 10 }}>{authError}</div>}
        <button onClick={checkAuth} disabled={pin.length !== 4 || !emailInput.trim()} style={{ ...styles.bigBtn, opacity: pin.length === 4 && emailInput.trim() ? 1 : 0.5 }}>
          View My Information
        </button>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', textAlign: 'center', marginTop: 16 }}>
          Your information is private and only visible with this verification.
        </div>
      </div>
    </div>
  )

  const recordsForTab = records.filter(r => r.form_type === activeForm)
  const tabsWithData = FORM_TABS.filter(t => records.some(r => r.form_type === t.key))
  const activeMeta = FORM_TABS.find(t => t.key === activeForm)
  const docsByFolder = {}
  DOC_FOLDERS.forEach(f => { docsByFolder[f] = [] })
  docs.forEach(d => { const f = d.docType || 'Other'; if (!docsByFolder[f]) docsByFolder[f] = []; docsByFolder[f].push(d) })
  const totalIn = bookEntries.filter(e => parseFloat(e.amount || 0) > 0).reduce((s, e) => s + parseFloat(e.amount || 0), 0)
  const totalOut = Math.abs(bookEntries.filter(e => parseFloat(e.amount || 0) < 0).reduce((s, e) => s + parseFloat(e.amount || 0), 0))

  return (
    <div style={styles.page}>
      <div style={{ ...styles.card, maxWidth: 880 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#60a5fa', letterSpacing: '.1em', textTransform: 'uppercase' }}>Tax Case Review</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#fff', marginTop: 4 }}>{client?.name}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Client Portal</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,.1)', paddingBottom: 14 }}>
          {SECTIONS.map(s => (
            <button key={s.key} onClick={() => setSection(s.key)} style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              border: '1px solid ' + (section === s.key ? '#3b82f6' : 'rgba(255,255,255,.15)'),
              background: section === s.key ? 'rgba(59,130,246,.2)' : 'rgba(255,255,255,.05)',
              color: section === s.key ? '#93c5fd' : '#94a3b8',
            }}>{s.label}</button>
          ))}
        </div>

        {/* ── COMPLIANCE ── */}
        {section === 'compliance' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <button onClick={downloadExcel} disabled={records.length === 0} style={styles.downloadBtn}>⬇ Download as Excel</button>
            </div>
            {records.length === 0 ? (
              <Empty msg="No compliance information has been entered yet." />
            ) : (
              <>
                <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                  {tabsWithData.map(t => (
                    <button key={t.key} onClick={() => setActiveForm(t.key)} style={{
                      padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: '1px solid ' + (activeForm === t.key ? '#3b82f6' : 'rgba(255,255,255,.15)'),
                      background: activeForm === t.key ? 'rgba(59,130,246,.2)' : 'rgba(255,255,255,.05)',
                      color: activeForm === t.key ? '#93c5fd' : '#94a3b8',
                    }}>{t.label}</button>
                  ))}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={styles.table}>
                    <thead>
                      <tr style={styles.tr}>
                        {['Tax Year', activeMeta?.quarterly ? 'Quarter' : null, 'Filed Status', 'Amount', 'Credits', activeMeta?.quarterly ? 'Deposits' : null, 'Lien', 'CSED'].filter(Boolean).map(h => (
                          <th key={h} style={styles.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...recordsForTab].sort((a, b) => (b.tax_year - a.tax_year) || ((b.quarter || 0) - (a.quarter || 0))).map(r => (
                        <tr key={r.id} style={styles.tr}>
                          <td style={{ ...styles.td, fontWeight: 700, color: '#f1f5f9' }}>{r.tax_year}</td>
                          {activeMeta?.quarterly && <td style={styles.td}>Q{r.quarter || '—'}</td>}
                          <td style={styles.td}>{r.filed_status || '—'}</td>
                          <td style={styles.td}>{fmt(r.amount)}</td>
                          <td style={styles.td}>{fmt(r.credits)}</td>
                          {activeMeta?.quarterly && <td style={styles.td}>{fmt(r.deposit)}</td>}
                          <td style={styles.td}>{r.lien === 'Yes' ? <span style={{ color: '#f87171', fontWeight: 700 }}>Yes</span> : <span style={{ color: '#64748b' }}>{r.lien || '—'}</span>}</td>
                          <td style={styles.td}>{r.csed || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── TAX ORGANIZER ── */}
        {section === 'organizer' && (
          <div>
            {activeOrganizerId ? (
              <div>
                <button onClick={()=>setActiveOrganizerId(null)} style={{...styles.downloadBtn, marginBottom:14}}>← Back to Organizer List</button>
                <OrganizerWizard organizerId={activeOrganizerId} embedded={true} onComplete={loadAllData}/>
              </div>
            ) : (
              <div>
                <div style={{ fontSize:12.5, color:'#94a3b8', marginBottom:16, lineHeight:1.6 }}>
                  Fill out your tax organizer for any year you need filed. Your progress is saved automatically as you go.
                </div>
                <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
                  <input type="text" placeholder="e.g. 2026" value={newOrgYear} onChange={e=>setNewOrgYear(e.target.value)}
                    style={{ width:120, padding:'9px 12px', background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.15)', borderRadius:8, color:'#fff', fontSize:13 }} maxLength={4}/>
                  <button onClick={createOrganizer} disabled={creatingOrg || !newOrgYear.trim()} style={styles.downloadBtn}>
                    {creatingOrg ? 'Starting…' : '+ Start New Tax Year'}
                  </button>
                </div>
                {organizers.length === 0 ? (
                  <Empty msg="You haven't started a tax organizer yet." />
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {organizers.map(o => (
                      <button key={o.id} onClick={()=>setActiveOrganizerId(o.id)} style={{
                        display:'flex', justifyContent:'space-between', alignItems:'center',
                        padding:'12px 16px', borderRadius:9, cursor:'pointer', textAlign:'left',
                        border:'1px solid rgba(255,255,255,.12)', background:'rgba(255,255,255,.04)', color:'#e2e8f0'
                      }}>
                        <span style={{ fontWeight:700, fontSize:13.5 }}>Tax Year {o.tax_year}</span>
                        <span style={{
                          fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20,
                          background: o.status === 'Submitted' ? 'rgba(34,197,94,.18)' : 'rgba(251,191,36,.18)',
                          color: o.status === 'Submitted' ? '#4ade80' : '#fbbf24'
                        }}>{o.status === 'Submitted' ? '✅ Submitted' : '🕓 In Progress'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── DOCUMENTS ── */}
        {section === 'docs' && (
          <div>
            <div style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, padding: 14, marginBottom: 18 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#f1f5f9', marginBottom: 10 }}>📤 Upload a Document</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={uploadFolder} onChange={e => setUploadFolder(e.target.value)} style={styles.select}>
                  {DOC_FOLDERS.map(f => <option key={f}>{f}</option>)}
                </select>
                <input ref={fileRef} type="file" style={{ fontSize: 12, color: '#cbd5e1' }} />
                <button onClick={handleUpload} disabled={uploading} style={styles.downloadBtn}>{uploading ? 'Uploading…' : '⬆ Upload'}</button>
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>Files you upload here go straight to your file with your representative.</div>
            </div>
            {docs.length === 0 ? <Empty msg="No documents yet." /> : (
              DOC_FOLDERS.filter(f => docsByFolder[f]?.length).map(folder => (
                <div key={folder} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>{folder}</div>
                  {docsByFolder[folder].map(d => (
                    <a key={d.id} href={d.file_url} target="_blank" rel="noreferrer" style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', marginBottom: 6,
                      background: 'rgba(255,255,255,.04)', borderRadius: 8, textDecoration: 'none',
                      border: '1px solid rgba(255,255,255,.08)',
                    }}>
                      <span style={{ fontSize: 16 }}>📄</span>
                      <span style={{ fontSize: 13, color: '#f1f5f9', flex: 1 }}>{d.name || d.file_name}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>{d.created_at ? new Date(d.created_at).toLocaleDateString() : ''}</span>
                    </a>
                  ))}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── P&L ── */}
        {section === 'pnl' && (
          <div>
            {bookEntries.length === 0 ? <Empty msg="No bookkeeping entries yet." /> : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 18 }}>
                  <StatBox label="Income" value={fmt(totalIn)} color="#4ade80" />
                  <StatBox label="Expenses" value={fmt(totalOut)} color="#f87171" />
                  <StatBox label="Net" value={fmt(totalIn - totalOut)} color={totalIn - totalOut >= 0 ? '#4ade80' : '#f87171'} />
                </div>
                <table style={styles.table}>
                  <thead><tr style={styles.tr}>{['Date', 'Description', 'Category', 'Amount'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {bookEntries.map(e => (
                      <tr key={e.id} style={styles.tr}>
                        <td style={{ ...styles.td, color: '#94a3b8', fontSize: 11.5 }}>{e.date || '—'}</td>
                        <td style={{ ...styles.td, fontWeight: 600, color: '#f1f5f9' }}>{e.description || '—'}</td>
                        <td style={styles.td}>{e.category || '—'}</td>
                        <td style={{ ...styles.td, fontWeight: 700, color: parseFloat(e.amount || 0) >= 0 ? '#4ade80' : '#f87171' }}>{fmt(Math.abs(parseFloat(e.amount || 0)))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}

        {/* ── PAYMENTS ── */}
        {section === 'payments' && (
          <div>
            {payments.length === 0 ? <Empty msg="No payments on file yet." /> : (
              <table style={styles.table}>
                <thead><tr style={styles.tr}>{['Date', 'Amount', 'Method', 'Status'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id} style={styles.tr}>
                      <td style={{ ...styles.td, color: '#94a3b8', fontSize: 11.5 }}>{p.date || '—'}</td>
                      <td style={{ ...styles.td, fontWeight: 700, color: '#4ade80' }}>{fmt(p.amount)}</td>
                      <td style={styles.td}>{p.method || '—'}</td>
                      <td style={styles.td}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: p.status === 'Cleared' ? 'rgba(74,222,128,.15)' : 'rgba(250,204,21,.15)', color: p.status === 'Cleared' ? '#4ade80' : '#facc15' }}>
                          {p.status || 'Pending'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── NOTES ── */}
        {section === 'notes' && (
          <div>
            {notes.length === 0 ? <Empty msg="No updates yet — your representative will post updates here." /> : (
              notes.map(n => (
                <div key={n.id} style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
                  <div style={{ fontSize: 13.5, lineHeight: 1.6, color: '#f1f5f9', whiteSpace: 'pre-wrap' }}>{n.content}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 5 }}>{n.created_at ? new Date(n.created_at).toLocaleDateString() : ''}</div>
                </div>
              ))
            )}
          </div>
        )}

        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', textAlign: 'center', marginTop: 28 }}>
          Questions about this information? Contact your Tax Case Review representative.
        </div>
      </div>
    </div>
  )
}

function Empty({ msg }) {
  return <div style={{ textAlign: 'center', padding: '32px 0', color: '#64748b', fontSize: 13 }}>{msg}</div>
}

function StatBox({ label, value, color }) {
  return (
    <div style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(160deg,#071c30 0%,#0a2f4e 55%,#0a3f60 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '32px 16px',
    fontFamily: '"DM Sans", system-ui, sans-serif',
  },
  card: {
    background: 'rgba(255,255,255,.06)',
    border: '1px solid rgba(255,255,255,.12)',
    borderRadius: 18,
    padding: '28px 26px',
    width: '100%',
    maxWidth: 420,
  },
  label: { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6, display: 'block' },
  textInput: {
    width: '100%', padding: '11px 14px', fontSize: 14,
    background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: 10,
    color: '#f1f5f9', outline: 'none', boxSizing: 'border-box',
  },
  bigBtn: {
    marginTop: 16, width: '100%', padding: 13,
    background: '#3b82f6', border: 'none',
    borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  downloadBtn: {
    padding: '7px 14px', fontSize: 12, fontWeight: 700, borderRadius: 8, cursor: 'pointer',
    background: 'rgba(34,197,94,.15)', border: '1px solid rgba(34,197,94,.3)', color: '#4ade80',
    whiteSpace: 'nowrap',
  },
  select: {
    padding: '7px 10px', fontSize: 12, borderRadius: 7, background: '#0a1628',
    border: '1px solid #1e3a5f', color: '#f1f5f9',
  },
  table: { width: '100%', fontSize: 12.5, borderCollapse: 'collapse' },
  tr: { borderBottom: '1px solid rgba(255,255,255,.08)' },
  th: { padding: '7px 8px', textAlign: 'left', color: '#64748b', fontSize: 10, textTransform: 'uppercase', fontWeight: 700 },
  td: { padding: '8px 8px', color: '#cbd5e1' },
}
