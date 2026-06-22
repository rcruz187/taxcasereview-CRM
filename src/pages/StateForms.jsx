import { useState } from 'react'

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
  const [search, setSearch] = useState('')

  const filtered = STATE_FORMS.filter(f => {
    const q = search.toLowerCase()
    return !q || f.state.toLowerCase().includes(q) || f.num.toLowerCase().includes(q) || f.label.toLowerCase().includes(q)
  })

  return (
    <div>
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

      {/* ── Section 2: State Form Tracker ───────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="ch">
          <span className="ct">💡 More State Forms</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.7 }}>
          Additional state POA forms, installment agreement templates, and penalty abatement requests can be added at any time.
          Send the PDFs and they'll be uploaded here automatically.
        </div>
      </div>
    </div>
  )
}
