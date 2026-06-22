import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import OrganizerWizard from '../components/OrganizerWizard'
import StripeInvoicePayModal from '../components/StripeInvoicePayModal'

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
  { key: 'invoices',   label: '🧾 Invoices' },
  { key: 'ie',         label: '📊 Income & Expenses' },
  { key: 'messages',   label: '💬 Messages' },
  { key: 'notes',      label: '📝 Notes' },
]

const IE_FIELDS = [
  { section: 'Food & Clothing', fields: [
    { k: 'food_clothing', label: 'Food, Clothing & Misc.' },
  ]},
  { section: 'Housing & Utilities', fields: [
    { k: 'housing',                    label: 'Housing / Rent / Mortgage' },
    { k: 'homeowners_renters_insurance', label: "Homeowner's / Renter's Insurance" },
    { k: 'property_taxes',             label: 'Property Taxes' },
    { k: 'hoa_dues',                   label: 'HOA Dues' },
    { k: 'electricity',                label: 'Electricity' },
    { k: 'water_sewer_trash',          label: 'Water / Sewer / Trash' },
    { k: 'cell_phone',                 label: 'Cell Phone' },
    { k: 'internet',                   label: 'Internet' },
    { k: 'cable',                      label: 'Cable / Satellite TV' },
    { k: 'maintenance',                label: 'Maintenance & Repairs' },
  ]},
  { section: 'Transportation', fields: [
    { k: 'public_transportation', label: 'Public Transportation' },
    { k: 'car_misc',              label: 'Car Operating Expenses' },
  ]},
  { section: 'Health', fields: [
    { k: 'health_insurance',     label: 'Health Insurance Premium' },
    { k: 'health_dental_vision', label: 'Dental / Vision' },
    { k: 'health_oop',           label: 'Out-of-Pocket Medical' },
  ]},
  { section: 'Family', fields: [
    { k: 'child_care',    label: 'Child Care' },
    { k: 'child_support', label: 'Child Support' },
    { k: 'court_judgment', label: 'Court Judgment Payments' },
  ]},
  { section: 'Other', fields: [
    { k: 'life_insurance',   label: 'Life Insurance' },
    { k: 'irs_installment',  label: 'IRS Installment Agreement' },
    { k: 'state_installment', label: 'State Installment Agreement' },
  ]},
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

  const [section, setSection] = useState(() => new URLSearchParams(window.location.search).get('section') || 'compliance')

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
  const [openInvoices, setOpenInvoices] = useState([])
  const [payModalInv, setPayModalInv] = useState(null)
  const [toast, setToast] = useState('')
  // Payment plan slider
  const [planMonths, setPlanMonths] = useState(6)
  const [planLocking, setPlanLocking] = useState(false)
  const [planEditing, setPlanEditing] = useState(false)
  // Notes
  const [notes, setNotes] = useState([])
  // SMS messages
  const [smsMessages, setSmsMessages] = useState([])
  // I&E
  const [financialProfile, setFinancialProfile] = useState(null)
  const [ieEdits, setIeEdits] = useState({})
  const [ieSaving, setIeSaving] = useState(false)

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    let { data: c } = await supabase.from('clients')
      .select('id,name,ssn,email,autopay_enabled,autopay_amount,autopay_frequency,autopay_next_charge,default_payment_method_id,payment_method_brand,payment_method_last4,payment_plan_changes')
      .eq('id', id).maybeSingle()
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
    const [{ data: comp }, { data: docsData }, { data: books }, { data: pays }, { data: notesData }, { data: orgs }, { data: invs }, { data: sms }, { data: fp }] = await Promise.all([
      supabase.from('client_compliance_records').select('*').eq('client_name', client.name),
      supabase.from('documents').select('*').eq('client', client.name).order('created_at', { ascending: false }),
      supabase.from('bookkeeping').select('*').eq('client_name', client.name).order('date', { ascending: false }),
      supabase.from('payments').select('*').eq('clientName', client.name).order('created_at', { ascending: false }),
      supabase.from('client_notes').select('*').eq('client_name', client.name).eq('visible_to_client', true).order('created_at', { ascending: false }),
      supabase.from('tax_organizer_responses').select('id,tax_year,status,updated_at').eq('client_name', client.name).order('tax_year', { ascending: false }),
      supabase.from('invoices').select('*').eq('clientName', client.name).neq('status', 'Paid').order('created_at', { ascending: false }),
      supabase.from('sms_messages').select('*').eq('clientName', client.name).order('created_at', { ascending: true }),
      supabase.from('client_financial_profiles').select('*').eq('client_name', client.name).maybeSingle(),
    ])
    setRecords(comp || [])
    setDocs(docsData || [])
    setBookEntries(books || [])
    setPayments(pays || [])
    setNotes(notesData || [])
    setOrganizers(orgs || [])
    setOpenInvoices(invs || [])
    setSmsMessages(sms || [])
    setFinancialProfile(fp || null)
    setIeEdits(fp?.expenses || {})
    const firstWithData = FORM_TABS.find(t => (comp || []).some(r => r.form_type === t.key))
    setActiveForm(firstWithData?.key || '1040')
  }

  async function refreshPaymentsAndInvoices() {
    const [{ data: pays }, { data: notesData }, { data: invs }] = await Promise.all([
      supabase.from('payments').select('*').eq('clientName', client.name).order('created_at', { ascending: false }),
      supabase.from('client_notes').select('*').eq('client_name', client.name).eq('visible_to_client', true).order('created_at', { ascending: false }),
      supabase.from('invoices').select('*').eq('clientName', client.name).neq('status', 'Paid').order('created_at', { ascending: false }),
    ])
    setPayments(pays || [])
    setNotes(notesData || [])
    setOpenInvoices(invs || [])
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3500) }

  async function refreshClientAutopay() {
    const { data: c } = await supabase.from('clients')
      .select('id,name,ssn,email,autopay_enabled,autopay_amount,autopay_frequency,autopay_next_charge,default_payment_method_id,payment_method_brand,payment_method_last4,payment_plan_changes')
      .eq('id', client.id).maybeSingle()
    if (c) setClient(prev => ({ ...prev, ...c }))
  }

  async function lockInPlan() {
    if (!totalBalance || totalBalance <= 0) { showToast('No outstanding balance to set a plan for.'); return }
    const changes = client.payment_plan_changes || 0
    if (changes >= 2 && client.autopay_enabled) { showToast('You have reached the maximum of 2 plan edits. Contact your representative to make further changes.'); return }
    setPlanLocking(true)
    const monthlyAmount = Math.ceil((totalBalance / planMonths) * 100) / 100
    const nextCharge = new Date(); nextCharge.setDate(nextCharge.getDate() + 1)
    const nextChargeStr = nextCharge.toISOString().split('T')[0]
    const { data, error } = await supabase.functions.invoke('stripe-set-autopay', {
      body: { clientId: client.id, enabled: true, amount: monthlyAmount, frequency: 'monthly', nextCharge: nextChargeStr }
    })
    if (error || data?.error) { showToast('❌ ' + (data?.error || error?.message || 'Error setting plan')); setPlanLocking(false); return }
    // Track the change count
    await supabase.from('clients').update({ payment_plan_changes: changes + 1 }).eq('id', client.id)
    setPlanLocking(false)
    setPlanEditing(false)
    showToast(`✅ Payment plan set — ${fmt(monthlyAmount)}/month for ${planMonths} months`)
    refreshClientAutopay()
  }

  async function cancelAutopay() {
    if (!confirm('Turn off monthly payments?')) return
    const { data, error } = await supabase.functions.invoke('stripe-set-autopay', { body: { clientId: client.id, enabled: false } })
    if (error || data?.error) { showToast('❌ ' + (data?.error || error.message)); return }
    showToast('Monthly payments turned off')
    refreshClientAutopay()
  }

  async function saveIE() {
    setIeSaving(true)
    const profileData = {
      client_name: client.name,
      expenses: ieEdits,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('client_financial_profiles').upsert(profileData, { onConflict: 'client_name', ignoreDuplicates: false })
    setIeSaving(false)
    if (error) { showToast('❌ Error saving: ' + error.message); return }
    showToast('✅ Income & Expenses saved!')
    setFinancialProfile(prev => ({ ...(prev || {}), expenses: ieEdits }))
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
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="https://mpxgxfqdbquzkrvvejkh.supabase.co/storage/v1/object/public/firm-assets/logo" alt="Tax Case Review" style={{ height: 52, marginBottom: 14, objectFit: 'contain' }} onError={e=>{e.currentTarget.style.display="none"}}/>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#60a5fa', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 4 }}>Client Portal</div>
          <div style={{ width: 40, height: 2, background: 'linear-gradient(90deg,transparent,#3b82f6,transparent)', margin: '0 auto' }}></div>
        </div>
        <div style={{ fontSize: 13, color: '#cbd5e1', textAlign: 'center', marginBottom: 18, lineHeight: 1.6 }}>
          Hi {client?.name}, please verify your identity to view your information.
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={styles.label}>Email Address</label>
          <input value={emailInput} onChange={e => { setEmailInput(e.target.value); setAuthError('') }} placeholder="you@email.com" type="email" style={styles.textInput} />
        </div>
        <div style={{ marginBottom: 4 }}>
          <label style={styles.label}>Last 4 Digits of SSN</label>
          <input value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setAuthError('') }}
            onKeyDown={e => e.key === 'Enter' && checkAuth()} placeholder="••••" maxLength={4} inputMode="numeric"
            style={{ ...styles.textInput, fontSize: 20, letterSpacing: 6, textAlign: 'center' }} />
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
  const totalBalance = openInvoices.reduce((s, inv) => {
    const subtotal = parseFloat(inv.total || 0), tax = subtotal * (parseFloat(inv.taxRate || 0) / 100), paidAmt = parseFloat(inv.paid || 0)
    return s + ((subtotal + tax) - paidAmt)
  }, 0)
  const monthlyPayment = totalBalance > 0 ? Math.ceil((totalBalance / planMonths) * 100) / 100 : 0
  const planChanges = client.payment_plan_changes || 0
  const canEditPlan = planChanges < 2

  return (
    <div style={styles.page}>
      {/* Background glow orbs */}
      <div style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:0, overflow:'hidden' }}>
        <div style={{ position:'absolute', top:'-10%', left:'-5%', width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle,rgba(29,78,216,.18) 0%,transparent 70%)' }}/>
        <div style={{ position:'absolute', bottom:'-15%', right:'-10%', width:600, height:600, borderRadius:'50%', background:'radial-gradient(circle,rgba(14,165,233,.12) 0%,transparent 70%)' }}/>
        <div style={{ position:'absolute', top:'40%', right:'20%', width:300, height:300, borderRadius:'50%', background:'radial-gradient(circle,rgba(99,102,241,.08) 0%,transparent 70%)' }}/>
      </div>
      <div style={{ position:'relative', zIndex:1, width:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#0f172a', border: '1px solid rgba(255,255,255,.15)', borderRadius: 8, padding: '10px 18px', color: '#f1f5f9', fontSize: 13, fontWeight: 600, zIndex: 1100, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>{toast}</div>}
      <div style={{ ...styles.card, maxWidth: 880 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img src="https://mpxgxfqdbquzkrvvejkh.supabase.co/storage/v1/object/public/firm-assets/logo" alt="Tax Case Review" style={{ height: 44, objectFit: 'contain' }} onError={e=>{e.currentTarget.style.display="none"}}/>
            <div>
              <div style={{ fontSize: 19, fontWeight: 800, color: '#fff' }}>{client?.name}</div>
              <div style={{ fontSize: 12, color: '#60a5fa', marginTop: 2, fontWeight: 600 }}>Client Portal</div>
            </div>
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
            {/* Total balance banner */}
            {totalBalance > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(59,130,246,.1)', border: '1px solid rgba(59,130,246,.25)', borderRadius: 8, padding: '14px 16px', marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '.05em' }}>Total Balance Due</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              </div>
            )}

            {/* Payment plan slider */}
            {!client.isLead && totalBalance > 0 && (
              <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, padding: '18px 16px', marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 14 }}>📅 Monthly Payment Plan</div>

                {client.autopay_enabled && !planEditing ? (
                  // Active plan view
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#4ade80' }}>
                          ${parseFloat(client.autopay_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}<span style={{ fontSize: 13, fontWeight: 400, color: '#94a3b8' }}> / month</span>
                        </div>
                        <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4 }}>
                          Next charge: {client.autopay_next_charge || '—'}
                          {client.payment_method_brand ? ` · ${client.payment_method_brand} ····${client.payment_method_last4 || ''}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {canEditPlan && (
                          <button onClick={() => setPlanEditing(true)} style={{ padding: '7px 14px', background: 'rgba(59,130,246,.2)', border: '1px solid rgba(59,130,246,.4)', borderRadius: 6, color: '#93c5fd', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                            ✏️ Edit Plan ({2 - planChanges} edit{2 - planChanges !== 1 ? 's' : ''} left)
                          </button>
                        )}
                        <button onClick={cancelAutopay} style={{ padding: '7px 14px', background: 'transparent', border: '1px solid rgba(248,113,113,.4)', borderRadius: 6, color: '#f87171', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Turn Off</button>
                      </div>
                    </div>
                    {!canEditPlan && (
                      <div style={{ fontSize: 11, color: '#f59e0b', background: 'rgba(245,158,11,.1)', borderRadius: 6, padding: '7px 10px' }}>
                        You've used both plan edits. Contact your representative to make further changes.
                      </div>
                    )}
                  </div>
                ) : (
                  // Slider to pick plan
                  <div>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>1 month</span>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>10 months</span>
                      </div>
                      <input type="range" min={1} max={10} step={1} value={planMonths}
                        onChange={e => setPlanMonths(Number(e.target.value))}
                        style={{ width: '100%', accentColor: '#3b82f6', cursor: 'pointer' }} />
                      <div style={{ textAlign: 'center', marginTop: 14 }}>
                        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>{planMonths} month{planMonths !== 1 ? 's' : ''}</div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: '#fff' }}>
                          ${monthlyPayment.toLocaleString('en-US', { minimumFractionDigits: 2 })}<span style={{ fontSize: 14, fontWeight: 400, color: '#94a3b8' }}>/mo</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                          {planMonths} × ${monthlyPayment.toLocaleString('en-US', { minimumFractionDigits: 2 })} toward ${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} balance
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      {planEditing && (
                        <button onClick={() => setPlanEditing(false)} style={{ padding: '9px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,.2)', borderRadius: 7, color: '#94a3b8', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                      )}
                      <button onClick={lockInPlan} disabled={planLocking} style={{ padding: '9px 20px', background: '#1A7FD4', border: 'none', borderRadius: 7, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: planLocking ? 0.7 : 1 }}>
                        {planLocking ? 'Locking in…' : `Lock In — ${fmt(monthlyPayment)}/mo`}
                      </button>
                    </div>
                    {planEditing && canEditPlan && (
                      <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 10 }}>
                        You have {2 - planChanges} plan edit{2 - planChanges !== 1 ? 's' : ''} remaining after this change.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Payment history */}
            {payments.length === 0 ? <Empty msg="No payments on file yet." /> : (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Payment History</div>
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
              </>
            )}
            {payModalInv && (
              <StripeInvoicePayModal invoice={payModalInv} onClose={() => setPayModalInv(null)} onPaid={() => refreshPaymentsAndInvoices()} />
            )}
          </div>
        )}

        {/* ── INVOICES ── */}
        {section === 'invoices' && (
          <div>
            {totalBalance > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(59,130,246,.1)', border: '1px solid rgba(59,130,246,.25)', borderRadius: 8, padding: '14px 16px', marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '.05em' }}>Total Outstanding</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              </div>
            )}
            {openInvoices.length === 0 ? <Empty msg="No outstanding invoices — you're all caught up! 🎉" /> : (
              openInvoices.map(inv => {
                const subtotal = parseFloat(inv.total||0), tax = subtotal*(parseFloat(inv.taxRate||0)/100), paidAmt = parseFloat(inv.paid||0)
                const balance = (subtotal+tax) - paidAmt
                return (
                  <div key={inv.id} style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '16px', marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 14 }}>Invoice #{inv.invNum || '—'}</div>
                        <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4 }}>Due: {inv.dueDate || 'Upon receipt'}</div>
                        {inv.description && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{inv.description}</div>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#f87171' }}>${balance.toLocaleString('en-US',{minimumFractionDigits:2})}</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Balance due</div>
                      </div>
                    </div>
                    {subtotal !== balance && (
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
                        Invoice total: ${(subtotal+tax).toLocaleString('en-US',{minimumFractionDigits:2})} · Paid: ${paidAmt.toLocaleString('en-US',{minimumFractionDigits:2})}
                      </div>
                    )}
                    <div style={{ marginTop: 12, textAlign: 'right' }}>
                      <button onClick={() => setPayModalInv(inv)} style={{ padding: '9px 20px', background: '#1A7FD4', border: 'none', borderRadius: 7, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Pay Now</button>
                    </div>
                  </div>
                )
              })
            )}
            {payModalInv && (
              <StripeInvoicePayModal invoice={payModalInv} onClose={() => setPayModalInv(null)} onPaid={() => refreshPaymentsAndInvoices()} />
            )}
          </div>
        )}

        {/* ── INCOME & EXPENSES ── */}
        {section === 'ie' && (
          <div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16, lineHeight: 1.6 }}>
              Update your monthly income and expenses below. Your advisor uses this information to build the best resolution plan for your case. Changes sync directly to your file.
            </div>
            {IE_FIELDS.map(group => (
              <div key={group.section} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,.08)' }}>{group.section}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                  {group.fields.map(f => (
                    <div key={f.k}>
                      <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>{f.label}</label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: 13 }}>$</span>
                        <input
                          type="number" min="0" step="0.01"
                          value={ieEdits[f.k] ?? ''}
                          onChange={e => setIeEdits(prev => ({ ...prev, [f.k]: e.target.value }))}
                          placeholder="0.00"
                          style={{ width: '100%', padding: '9px 10px 9px 22px', background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: 8, color: '#f1f5f9', fontSize: 13, boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button onClick={saveIE} disabled={ieSaving} style={{ padding: '10px 24px', background: '#16a34a', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: ieSaving ? 0.7 : 1 }}>
                {ieSaving ? 'Saving…' : '💾 Save Changes'}
              </button>
            </div>
          </div>
        )}

        {/* ── MESSAGES ── */}
        {section === 'messages' && (
          <div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>All text messages between you and your Tax Case Review team.</div>
            {smsMessages.length === 0 ? <Empty msg="No text messages on file yet." /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {smsMessages.map(msg => {
                  const isFromClient = msg.direction === 'inbound'
                  return (
                    <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isFromClient ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth: '80%', padding: '10px 14px', borderRadius: isFromClient ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        background: isFromClient ? 'rgba(59,130,246,.25)' : 'rgba(255,255,255,.07)',
                        border: '1px solid ' + (isFromClient ? 'rgba(59,130,246,.4)' : 'rgba(255,255,255,.1)'),
                      }}>
                        <div style={{ fontSize: 13, color: '#f1f5f9', lineHeight: 1.5 }}>{msg.body}</div>
                        <div style={{ fontSize: 10, color: '#64748b', marginTop: 5 }}>
                          {isFromClient ? 'You' : (msg.author || msg.from_name || 'Your Rep')} · {msg.created_at ? new Date(msg.created_at).toLocaleString() : ''}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
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
    background: 'linear-gradient(160deg,#040e1c 0%,#071a30 40%,#0a2a48 70%,#0a3558 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '32px 16px',
    fontFamily: '"DM Sans", system-ui, sans-serif',
    position: 'relative',
    overflow: 'hidden',
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
