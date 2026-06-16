import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const FORM_TABS = [
  { key: '1040',  label: 'Personal Federal (1040)', quarterly: false },
  { key: 'STATE', label: 'Personal State',           quarterly: false },
  { key: 'CP',    label: 'Business CP (Federal)',    quarterly: true  },
  { key: '940',   label: 'Business 940 (FUTA)',      quarterly: false },
  { key: '941',   label: 'Business 941 (Payroll)',   quarterly: true  },
  { key: '1120S', label: 'Business 1120-S',          quarterly: false },
]

function fmt(v) {
  const n = parseFloat(v)
  if (isNaN(n)) return '—'
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ClientPortal() {
  const { id } = useParams()
  const [client, setClient] = useState(null)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [unlocked, setUnlocked] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [activeTab, setActiveTab] = useState(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    let { data: c } = await supabase.from('clients').select('id,name,ssn').eq('id', id).maybeSingle()
    let isLead = false
    if (!c) {
      const { data: l } = await supabase.from('leads').select('id,name,ssn').eq('id', id).maybeSingle()
      if (l) { c = l; isLead = true }
    }
    if (!c) { setNotFound(true); setLoading(false); return }
    setClient({ ...c, isLead })
    setLoading(false)
  }

  async function checkPin() {
    const last4 = (client.ssn || '').replace(/\D/g, '').slice(-4)
    if (!last4) { setPinError("No SSN on file to verify against — contact your representative."); return }
    if (pin.trim() !== last4) { setPinError("That doesn't match what we have on file. Please try again."); return }
    setPinError('')
    setUnlocked(true)
    const { data } = await supabase.from('client_compliance_records').select('*').eq('client_name', client.name)
    setRecords(data || [])
    const firstWithData = FORM_TABS.find(t => (data || []).some(r => r.form_type === t.key))
    setActiveTab(firstWithData?.key || '1040')
  }

  async function downloadExcel() {
    const { exportComplianceToExcel } = await import('../lib/complianceExport')
    exportComplianceToExcel(client.name, records)
  }

  if (loading) return (
    <div style={styles.page}><div style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</div></div>
  )

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
          Hi {client?.name}, to view your tax compliance information, please confirm the <strong>last 4 digits of your SSN</strong>.
        </div>
        <input
          value={pin}
          onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError('') }}
          onKeyDown={e => e.key === 'Enter' && checkPin()}
          placeholder="••••"
          maxLength={4}
          inputMode="numeric"
          style={styles.pinInput}
          autoFocus
        />
        {pinError && <div style={{ color: '#f87171', fontSize: 12, textAlign: 'center', marginTop: 10 }}>{pinError}</div>}
        <button onClick={checkPin} disabled={pin.length !== 4} style={{ ...styles.bigBtn, opacity: pin.length === 4 ? 1 : 0.5 }}>
          View My Information
        </button>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', textAlign: 'center', marginTop: 16 }}>
          Your information is private and only visible with this verification.
        </div>
      </div>
    </div>
  )

  const recordsForTab = records.filter(r => r.form_type === activeTab)
  const tabsWithData = FORM_TABS.filter(t => records.some(r => r.form_type === t.key))
  const activeMeta = FORM_TABS.find(t => t.key === activeTab)

  return (
    <div style={styles.page}>
      <div style={{ ...styles.card, maxWidth: 760 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#60a5fa', letterSpacing: '.1em', textTransform: 'uppercase' }}>Tax Case Review</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#fff', marginTop: 4 }}>{client?.name}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Tax Compliance Overview</div>
          </div>
          <button onClick={downloadExcel} disabled={records.length === 0} style={styles.downloadBtn}>
            ⬇ Download as Excel
          </button>
        </div>

        {records.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#64748b', fontSize: 13 }}>
            No compliance information has been entered yet. Check back after your investigation findings are recorded.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
              {tabsWithData.map(t => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  style={{
                    padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: '1px solid ' + (activeTab === t.key ? '#3b82f6' : 'rgba(255,255,255,.15)'),
                    background: activeTab === t.key ? 'rgba(59,130,246,.2)' : 'rgba(255,255,255,.05)',
                    color: activeTab === t.key ? '#93c5fd' : '#94a3b8',
                  }}
                >{t.label}</button>
              ))}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,.15)' }}>
                    {['Tax Year', activeMeta?.quarterly ? 'Quarter' : null, 'Filed Status', 'Amount', 'Credits', activeMeta?.quarterly ? 'Deposits' : null, 'Lien', 'CSED'].filter(Boolean).map(h => (
                      <th key={h} style={{ padding: '7px 8px', textAlign: 'left', color: '#64748b', fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...recordsForTab].sort((a, b) => (b.tax_year - a.tax_year) || ((b.quarter || 0) - (a.quarter || 0))).map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,.08)' }}>
                      <td style={{ padding: '8px 8px', fontWeight: 700, color: '#f1f5f9' }}>{r.tax_year}</td>
                      {activeMeta?.quarterly && <td style={{ padding: '8px 8px', color: '#cbd5e1' }}>Q{r.quarter || '—'}</td>}
                      <td style={{ padding: '8px 8px', color: '#cbd5e1' }}>{r.filed_status || '—'}</td>
                      <td style={{ padding: '8px 8px', color: '#cbd5e1' }}>{fmt(r.amount)}</td>
                      <td style={{ padding: '8px 8px', color: '#cbd5e1' }}>{fmt(r.credits)}</td>
                      {activeMeta?.quarterly && <td style={{ padding: '8px 8px', color: '#cbd5e1' }}>{fmt(r.deposit)}</td>}
                      <td style={{ padding: '8px 8px' }}>
                        {r.lien === 'Yes'
                          ? <span style={{ color: '#f87171', fontWeight: 700 }}>Yes</span>
                          : <span style={{ color: '#64748b' }}>{r.lien || '—'}</span>}
                      </td>
                      <td style={{ padding: '8px 8px', color: '#cbd5e1' }}>{r.csed || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', textAlign: 'center', marginTop: 24 }}>
          Questions about this information? Contact your Tax Case Review representative.
        </div>
      </div>
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
  pinInput: {
    width: '100%', padding: '14px 16px', fontSize: 24, letterSpacing: 8, textAlign: 'center',
    background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: 10,
    color: '#f1f5f9', outline: 'none', boxSizing: 'border-box', fontWeight: 700,
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
}
