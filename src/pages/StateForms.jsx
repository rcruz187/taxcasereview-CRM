import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

const STATE_FORMS = [
  { num: 'AZ-285-I',       state: 'AZ', label: 'Individual Tax Disclosure / POA',                     url: `${BASE}/state-forms/AZ_POA.pdf` },
  { num: 'CA-3520-PIT',    state: 'CA', label: 'Individual or Fiduciary POA Declaration',             url: `${BASE}/state-forms/CA_POA.pdf` },
  { num: 'CA-3520-BE',     state: 'CA', label: 'Business Entity POA Declaration',                     url: `${BASE}/state-forms/CA_POA_Biz.pdf` },
  { num: 'FL-DR-835',      state: 'FL', label: 'Power of Attorney and Declaration of Representative', url: `${BASE}/state-forms/FL_POA.pdf` },
  { num: 'GA-RD-1061',     state: 'GA', label: 'Power of Attorney and Declaration of Representative', url: `${BASE}/state-forms/GA_POA.pdf` },
  { num: 'ID-POA',         state: 'ID', label: 'Power of Attorney',                                   url: `${BASE}/state-forms/ID_POA.pdf` },
  { num: 'IL-2848',        state: 'IL', label: 'Power of Attorney',                                   url: `${BASE}/state-forms/IL_POA.pdf` },
  { num: 'MA-M-2848',      state: 'MA', label: 'Power of Attorney and Declaration of Representative', url: `${BASE}/state-forms/MA_POA.pdf` },
  { num: 'MO-2827',        state: 'MO', label: 'Power of Attorney',                                   url: `${BASE}/state-forms/MO_POA.pdf` },
  { num: 'MO-149',         state: 'MO', label: 'Sales and Use Tax Exemption Certificate',             url: `${BASE}/state-forms/Form_149_MO.pdf` },
  { num: 'OR-150-800-005', state: 'OR', label: 'Tax Information Authorization and POA',               url: `${BASE}/state-forms/OR_POA.pdf` },
  { num: 'TN-RV-F0103801', state: 'TN', label: 'Power of Attorney',                                   url: `${BASE}/state-forms/TN_POA.pdf` },
  { num: 'WA-42-2446',     state: 'WA', label: 'Confidential Tax Information Authorization',          url: `${BASE}/state-forms/Washington_POA.pdf` },
  { num: 'WY-POA',         state: 'WY', label: 'Statutory Form Power of Attorney',                    url: `${BASE}/state-forms/Wyoming.pdf` },
]

export default function StateForms() {
  const [search, setSearch]               = useState('')
  const [clients, setClients]             = useState([])
  const [clientSearch, setClientSearch]   = useState('')
  const [selectedClient, setSelectedClient] = useState(null)
  const [showClientDrop, setShowClientDrop] = useState(false)

  useEffect(() => {
    supabase.from('clients').select('id,name,ssn,ein,street,city,state,zip,dob,phone,email,spouseName,spouseSsn,filingStatus').then(({ data }) => setClients(data || []))
  }, [])

  const filtered = STATE_FORMS.filter(f => {
    const q = search.toLowerCase()
    return !q || f.state.toLowerCase().includes(q) || f.num.toLowerCase().includes(q) || f.label.toLowerCase().includes(q)
  })

  return (
    <div style={{padding:'20px 24px',maxWidth:1000,margin:'0 auto'}}>
      {/* ── Section 1: State Form Downloads ─────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="ch">
          <span className="ct">State Form Downloads</span>
          <span style={{ fontSize: 12, color: 'var(--t2)' }}>Official state PDFs — opens in new tab</span>
        </div>

        {/* Search */}
        <div style={{ marginBottom: 14 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search state, form number, or description…"
            style={{ width: '100%', maxWidth: 360, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--br)', background: 'var(--s2)', color: 'var(--tx)', fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 10,
          padding: '4px 0'
        }}>
          {filtered.length === 0 ? (
            <div style={{ color: 'var(--t3)', fontSize: 13, padding: '12px 0' }}>No forms match your search.</div>
          ) : filtered.map(f => (
            <a
              key={f.num}
              href={f.url}
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: 'none' }}
            >
              <button className="btn sec" style={{ width: '100%', justifyContent: 'flex-start', gap: 8, padding: '9px 14px' }}>
                <span style={{
                  background: 'var(--blue)',
                  color: '#fff',
                  borderRadius: 4,
                  padding: '1px 7px',
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0
                }}>
                  {f.state}
                </span>
                <span style={{ fontSize: 12, textAlign: 'left', lineHeight: 1.3 }}>{f.label}</span>
              </button>
            </a>
          ))}
        </div>
      </div>

      {/* ── Pre-fill Section ─────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="ch">
          <span className="ct">✏️ Pre-fill State Forms</span>
          <span style={{ fontSize: 12, color: 'var(--t2)' }}>Select a client to carry their info into any state form below</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
            <input
              value={clientSearch}
              onChange={e => { setClientSearch(e.target.value); setSelectedClient(null); setShowClientDrop(true) }}
              onFocus={() => setShowClientDrop(true)}
              onBlur={() => setTimeout(() => setShowClientDrop(false), 150)}
              placeholder="Search client name…"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--bd)', fontSize: 13, background: 'var(--s2)', color: 'var(--tx)', boxSizing: 'border-box' }}
            />
            {showClientDrop && clientSearch && (() => {
              const q = clientSearch.toLowerCase()
              const matches = clients.filter(c => (c.name||'').toLowerCase().includes(q)).slice(0, 10)
              return matches.length > 0 ? (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--sf)', border: '1px solid var(--br)', borderRadius: 8, zIndex: 50, maxHeight: 220, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,.25)' }}>
                  {matches.map(c => (
                    <div key={c.id}
                      onMouseDown={() => { setSelectedClient(c); setClientSearch(c.name); setShowClientDrop(false) }}
                      style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 13, color: 'var(--tx)', borderBottom: '1px solid var(--br)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                    >
                      {c.name}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--sf)', border: '1px solid var(--br)', borderRadius: 8, zIndex: 50, padding: '10px 14px', fontSize: 13, color: 'var(--t3)' }}>
                  No clients found
                </div>
              )
            })()}
          </div>
          {selectedClient && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'var(--s2)', borderRadius: 8, border: '1px solid var(--br)', fontSize: 13 }}>
              <span style={{ color: 'var(--ok)', fontWeight: 700 }}>✓</span>
              <span style={{ color: 'var(--tx)' }}>{selectedClient.name}</span>
              {selectedClient.ssn && <span style={{ color: 'var(--t3)' }}>· SSN on file</span>}
              <button onClick={() => { setSelectedClient(null); setClientSearch('') }} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 0 0 4px' }}>×</button>
            </div>
          )}
          {!selectedClient && (
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>Select a client above, then click any state form to open it</span>
          )}
        </div>
      </div>

      {/* ── Section 3: State Form Tracker ──────────────────────── */}
      <div className="card">
        <div className="ch" style={{ justifyContent: 'space-between' }}>
          <span className="ct">📋 More State Forms</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.7, margin: 0 }}>
          Additional state POA forms, installment agreement templates, and penalty abatement requests can be added at any time. Send the PDFs and they'll be uploaded here automatically.
        </p>
      </div>
    </div>
  )
}
