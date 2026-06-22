import { useState } from 'react'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

const STATE_FORMS = [
  {
    state: 'Arizona', abbr: 'AZ',
    forms: [
      { num: '285-I', label: 'Individual Income Tax Disclosure / Representation Authorization', type: 'POA', url: `${BASE}/state-forms/AZ_POA.pdf` },
    ]
  },
  {
    state: 'California', abbr: 'CA',
    forms: [
      { num: '3520-PIT', label: 'Individual or Fiduciary Power of Attorney Declaration', type: 'POA', url: `${BASE}/state-forms/CA_POA.pdf` },
      { num: '3520-BE',  label: 'Business Entity or Group Nonresident Power of Attorney Declaration', type: 'POA', url: `${BASE}/state-forms/CA_POA_Biz.pdf` },
    ]
  },
  {
    state: 'Florida', abbr: 'FL',
    forms: [
      { num: 'DR-835', label: 'Power of Attorney and Declaration of Representative', type: 'POA', url: `${BASE}/state-forms/FL_POA.pdf` },
    ]
  },
  {
    state: 'Georgia', abbr: 'GA',
    forms: [
      { num: 'RD-1061', label: 'Power of Attorney and Declaration of Representative', type: 'POA', url: `${BASE}/state-forms/GA_POA.pdf` },
    ]
  },
  {
    state: 'Idaho', abbr: 'ID',
    forms: [
      { num: 'ID-POA', label: 'Power of Attorney', type: 'POA', url: `${BASE}/state-forms/ID_POA.pdf` },
    ]
  },
  {
    state: 'Illinois', abbr: 'IL',
    forms: [
      { num: 'IL-2848', label: 'Power of Attorney', type: 'POA', url: `${BASE}/state-forms/IL_POA.pdf` },
    ]
  },
  {
    state: 'Massachusetts', abbr: 'MA',
    forms: [
      { num: 'M-2848', label: 'Power of Attorney and Declaration of Representative', type: 'POA', url: `${BASE}/state-forms/MA_POA.pdf` },
    ]
  },
  {
    state: 'Missouri', abbr: 'MO',
    forms: [
      { num: '2827',  label: 'Power of Attorney', type: 'POA', url: `${BASE}/state-forms/MO_POA.pdf` },
      { num: '149',   label: 'Sales and Use Tax Exemption Certificate', type: 'Other', url: `${BASE}/state-forms/Form_149_MO.pdf` },
    ]
  },
  {
    state: 'Oregon', abbr: 'OR',
    forms: [
      { num: '150-800-005', label: 'Tax Information Authorization and Power of Attorney for Representation', type: 'POA', url: `${BASE}/state-forms/OR_POA.pdf` },
    ]
  },
  {
    state: 'Tennessee', abbr: 'TN',
    forms: [
      { num: 'RV-F0103801', label: 'Power of Attorney', type: 'POA', url: `${BASE}/state-forms/TN_POA.pdf` },
    ]
  },
  {
    state: 'Washington', abbr: 'WA',
    forms: [
      { num: '42 2446', label: 'Confidential Tax Information Authorization', type: 'Auth', url: `${BASE}/state-forms/Washington_POA.pdf` },
    ]
  },
  {
    state: 'Wyoming', abbr: 'WY',
    forms: [
      { num: 'WY-POA', label: 'Statutory Form Power of Attorney', type: 'POA', url: `${BASE}/state-forms/Wyoming.pdf` },
    ]
  },
]

const TYPE_COLOR = {
  'POA':   { bg: 'rgba(59,130,246,.12)',  color: '#1d4ed8' },
  'Auth':  { bg: 'rgba(16,185,129,.12)',  color: '#065f46' },
  'Other': { bg: 'rgba(245,158,11,.12)',  color: '#92400e' },
}

export default function StateForms() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')

  const filtered = STATE_FORMS
    .map(s => ({
      ...s,
      forms: s.forms.filter(f => {
        const q = search.toLowerCase()
        const matchSearch = !q || s.state.toLowerCase().includes(q) || s.abbr.toLowerCase().includes(q) || f.num.toLowerCase().includes(q) || f.label.toLowerCase().includes(q)
        const matchType = typeFilter === 'All' || f.type === typeFilter
        return matchSearch && matchType
      })
    }))
    .filter(s => s.forms.length > 0)

  const totalForms = STATE_FORMS.reduce((n, s) => n + s.forms.length, 0)

  return (
    <div style={{padding:'20px 24px',maxWidth:1100}}>
      {/* Header */}
      <div style={{marginBottom:20}}>
        <div style={{fontSize:22,fontWeight:700,color:'var(--tx)',marginBottom:4}}>State Forms &amp; Docs</div>
        <div style={{fontSize:13,color:'var(--t3)'}}>{totalForms} forms across {STATE_FORMS.length} states — click any form to open or download</div>
      </div>

      {/* Filters */}
      <div style={{display:'flex',gap:10,marginBottom:20,flexWrap:'wrap',alignItems:'center'}}>
        <input
          value={search}
          onChange={e=>setSearch(e.target.value)}
          placeholder="Search state or form number…"
          style={{flex:'1 1 200px',maxWidth:320,padding:'8px 12px',borderRadius:8,border:'1px solid var(--br)',background:'var(--s2)',color:'var(--tx)',fontSize:13}}
        />
        <div style={{display:'flex',gap:6}}>
          {['All','POA','Auth','Other'].map(t=>(
            <button key={t} onClick={()=>setTypeFilter(t)}
              style={{padding:'7px 14px',borderRadius:7,border:'1px solid',fontSize:12,fontWeight:600,cursor:'pointer',
                borderColor:typeFilter===t?'var(--blue)':'var(--br)',
                background:typeFilter===t?'var(--blue)':'var(--s2)',
                color:typeFilter===t?'#fff':'var(--t2)'}}>
              {t==='POA'?'POA / Declaration':t==='Auth'?'Info Authorization':t==='Other'?'Other Forms':t}
            </button>
          ))}
        </div>
      </div>

      {/* State cards */}
      {filtered.length === 0 ? (
        <div style={{textAlign:'center',color:'var(--t3)',padding:40}}>No forms match your search.</div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:14}}>
          {filtered.map(s=>(
            <div key={s.abbr} className="card" style={{padding:0,overflow:'hidden'}}>
              {/* State header */}
              <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',borderBottom:'1px solid var(--br)',background:'var(--s2)'}}>
                <div style={{width:40,height:40,borderRadius:8,background:'var(--blue)',display:'flex',alignItems:'center',justifyContent:'center',
                  color:'#fff',fontSize:13,fontWeight:800,letterSpacing:'-.5px',flexShrink:0}}>
                  {s.abbr}
                </div>
                <div>
                  <div style={{fontWeight:700,fontSize:15,color:'var(--tx)'}}>{s.state}</div>
                  <div style={{fontSize:11,color:'var(--t3)'}}>{s.forms.length} form{s.forms.length!==1?'s':''}</div>
                </div>
              </div>

              {/* Forms list */}
              <div style={{padding:'8px 0'}}>
                {s.forms.map((f,i)=>(
                  <a key={i} href={f.url} target="_blank" rel="noreferrer"
                    style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',textDecoration:'none',
                      borderTop:i>0?'1px solid var(--br)':undefined,
                      transition:'background .12s'}}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--s2)'}
                    onMouseLeave={e=>e.currentTarget.style.background=''}>
                    {/* PDF icon */}
                    <div style={{fontSize:20,flexShrink:0}}>📄</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:12.5,color:'var(--blue)',marginBottom:2}}>Form {f.num}</div>
                      <div style={{fontSize:12,color:'var(--t2)',lineHeight:1.4}}>{f.label}</div>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4,flexShrink:0}}>
                      <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:4,
                        background:TYPE_COLOR[f.type]?.bg, color:TYPE_COLOR[f.type]?.color}}>
                        {f.type}
                      </span>
                      <span style={{fontSize:10,color:'var(--t3)'}}>↗ Open</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{marginTop:24,padding:'12px 16px',background:'var(--s2)',borderRadius:8,fontSize:12,color:'var(--t3)',border:'1px solid var(--br)'}}>
        💡 More state forms can be added anytime — send the PDFs and they'll be uploaded here automatically.
      </div>
    </div>
  )
}
