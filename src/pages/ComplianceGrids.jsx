import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'

function n(v) { const x = parseFloat(v); return isNaN(x) ? 0 : x }
function fmt(v) { return '$' + n(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

// Default tax-year ranges per form, matching the original TO Worksheet tabs
const CURRENT_YEAR = new Date().getFullYear()
const YEAR_RANGES = {
  '1040':  range(2007, CURRENT_YEAR),
  'STATE': range(2009, CURRENT_YEAR),
  '940':   range(2007, CURRENT_YEAR),
  '1120S': range(2007, CURRENT_YEAR),
  'CP':    range(2010, CURRENT_YEAR),  // CP & 941 are quarterly
  '941':   range(2010, CURRENT_YEAR),
}

function range(start, end) {
  const out = []
  for (let y = end; y >= start; y--) out.push(y)
  return out
}

const QUARTERLY_FORMS = ['CP', '941']

const FORM_META = {
  '1040':  { label: 'Personal Federal (1040)',  sheet: 'Pers Fed Tax Prac',  csedYears: 10 },
  'STATE': { label: 'Personal State',           sheet: 'Pers State Tax Prac', csedYears: 0 },
  'CP':    { label: 'Business CP (Federal)',    sheet: 'CP Fed Tax Prac',     csedYears: 10 },
  '940':   { label: 'Business 940 (FUTA)',      sheet: 'Biz 940 Tax Prac Sheet', csedYears: 10 },
  '941':   { label: 'Business 941 (Payroll)',   sheet: 'Biz 941 Tax Prac Sheet', csedYears: 10 },
  '1120S': { label: 'Business 1120-S',          sheet: 'Biz 1120s Tax Prac Sheet', csedYears: 10 },
}

const FILED_STATUS_OPTIONS = ['', 'Filed', 'Not Filed', 'SFR (Substitute for Return)', 'Filed - Not Assessed', 'No Liability', 'N/A']

function calcCSED(assessmentDate, years) {
  if (!assessmentDate || !years) return ''
  const d = new Date(assessmentDate)
  if (isNaN(d.getTime())) return ''
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString().slice(0, 10)
}

// One editable row in a grid
function GridRow({ rec, onChange, showQuarter, csedYears }) {
  const handle = (key, value) => {
    const next = { ...rec, [key]: value }
    if (key === 'assessment_date' && csedYears) {
      next.csed = calcCSED(value, csedYears)
    }
    onChange(next)
  }

  return (
    <tr>
      <td style={{padding:'4px 6px',fontWeight:600,whiteSpace:'nowrap'}}>{rec.tax_year}{showQuarter ? ` Q${rec.quarter}` : ''}</td>
      <td style={{padding:'4px 6px'}}>
        <select value={rec.filed_status||''} onChange={e=>handle('filed_status', e.target.value)} style={selStyle}>
          {FILED_STATUS_OPTIONS.map(o=><option key={o} value={o}>{o||'—'}</option>)}
        </select>
      </td>
      <td style={{padding:'4px 6px'}}><input type="number" value={rec.amount ?? ''} onChange={e=>handle('amount', e.target.value)} placeholder="0.00" style={inpStyle}/></td>
      <td style={{padding:'4px 6px'}}><input type="number" value={rec.credits ?? ''} onChange={e=>handle('credits', e.target.value)} placeholder="0.00" style={inpStyle}/></td>
      {showQuarter && <td style={{padding:'4px 6px'}}><input type="number" value={rec.deposit ?? ''} onChange={e=>handle('deposit', e.target.value)} placeholder="0.00" style={inpStyle}/></td>}
      <td style={{padding:'4px 6px'}}><input value={rec.lien||''} onChange={e=>handle('lien', e.target.value)} placeholder="Lien?" style={{...inpStyle,width:90}}/></td>
      <td style={{padding:'4px 6px'}}><input type="date" value={rec.assessment_date||''} onChange={e=>handle('assessment_date', e.target.value)} style={{...inpStyle,width:130}}/></td>
      <td style={{padding:'4px 6px'}}>
        <input type="date" value={rec.csed||''} onChange={e=>handle('csed', e.target.value)} style={{...inpStyle,width:130,
          ...(rec.csed && new Date(rec.csed) < new Date() ? {color:'var(--err)',fontWeight:700} : {})}}/>
      </td>
    </tr>
  )
}

const inpStyle = { width:100, padding:'5px 8px', fontSize:12, background:'var(--s2)', border:'1px solid var(--br)', borderRadius:6, color:'var(--tx)' }
const selStyle = { ...inpStyle, width:160 }

function FormGrid({ clientName, formType, records, onSaveRow }) {
  const meta = FORM_META[formType]
  const isQuarterly = QUARTERLY_FORMS.includes(formType)
  const years = YEAR_RANGES[formType]

  // Build full row list: existing records keyed by year[+quarter], filled in with blanks
  const rows = []
  years.forEach(year => {
    if (isQuarterly) {
      for (let q = 4; q >= 1; q--) {
        const existing = records.find(r => r.tax_year === year && r.quarter === q)
        rows.push(existing || { client_name: clientName, form_type: formType, tax_year: year, quarter: q })
      }
    } else {
      const existing = records.find(r => r.tax_year === year && !r.quarter)
      rows.push(existing || { client_name: clientName, form_type: formType, tax_year: year, quarter: null })
    }
  })

  // Totals
  const totalAmount = records.reduce((s,r)=>s+n(r.amount),0)
  const totalCredits = records.reduce((s,r)=>s+n(r.credits),0)
  const overdueCount = records.filter(r => r.csed && new Date(r.csed) < new Date()).length

  return (
    <div style={{marginBottom:24}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:6,flexWrap:'wrap',gap:8}}>
        <div style={{fontWeight:700,fontSize:13,color:'var(--t2)'}}>{meta.label}</div>
        <div style={{fontSize:11,color:'var(--t3)'}}>
          Total Amount: <strong style={{color:'var(--tx)'}}>{fmt(totalAmount)}</strong>
          {' · '}Total Credits: <strong style={{color:'var(--tx)'}}>{fmt(totalCredits)}</strong>
          {overdueCount > 0 && <span style={{color:'var(--err)',fontWeight:700}}> · {overdueCount} CSED(s) expired</span>}
        </div>
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead>
            <tr style={{borderBottom:'1px solid var(--br)',color:'var(--t3)',textAlign:'left'}}>
              <th style={{padding:'4px 6px'}}>{isQuarterly ? 'Year / Qtr' : 'Tax Year'}</th>
              <th style={{padding:'4px 6px'}}>Filed Status</th>
              <th style={{padding:'4px 6px'}}>Amount</th>
              <th style={{padding:'4px 6px'}}>Credits/Payments</th>
              {isQuarterly && <th style={{padding:'4px 6px'}}>Deposits</th>}
              <th style={{padding:'4px 6px'}}>Lien</th>
              <th style={{padding:'4px 6px'}}>Assessment Date</th>
              <th style={{padding:'4px 6px'}}>CSED</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((rec,i) => (
              <GridRow key={`${rec.tax_year}-${rec.quarter||0}`} rec={rec} showQuarter={isQuarterly}
                csedYears={meta.csedYears} onChange={(updated)=>onSaveRow(updated)}/>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ComplianceGrids({ clientName }) {
  const { showToast } = useApp()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeForm, setActiveForm] = useState('1040')
  const [pendingSaves, setPendingSaves] = useState({})

  useEffect(() => { load() }, [clientName])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('client_compliance_records')
      .select('*').eq('client_name', clientName)
    if (error) { showToast('Error loading compliance data: '+error.message, 'err') }
    setRecords(data || [])
    setLoading(false)
  }

  // Debounced upsert per row
  async function handleSaveRow(rec) {
    const key = `${rec.form_type}-${rec.tax_year}-${rec.quarter||0}`
    // optimistic local update
    setRecords(prev => {
      const idx = prev.findIndex(r => r.form_type===rec.form_type && r.tax_year===rec.tax_year && (r.quarter||0)===(rec.quarter||0))
      if (idx >= 0) { const next=[...prev]; next[idx]=rec; return next }
      return [...prev, rec]
    })

    if (pendingSaves[key]) clearTimeout(pendingSaves[key])
    const timeout = setTimeout(async () => {
      const payload = {
        client_name: clientName,
        form_type: rec.form_type,
        tax_year: rec.tax_year,
        quarter: rec.quarter || null,
        amount: rec.amount === '' ? null : rec.amount,
        credits: rec.credits === '' ? null : rec.credits,
        deposit: rec.deposit === '' ? null : rec.deposit,
        lien: rec.lien || null,
        filed_status: rec.filed_status || null,
        assessment_date: rec.assessment_date || null,
        csed: rec.csed || null,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('client_compliance_records')
        .upsert(payload, { onConflict: 'client_name,form_type,tax_year,quarter' })
      if (error) showToast('Error saving: '+error.message, 'err')
    }, 600)
    setPendingSaves(p => ({ ...p, [key]: timeout }))
  }

  if (loading) return <div style={{padding:24,textAlign:'center',color:'var(--t3)'}}>Loading…</div>

  // Cross-form CSED summary
  const allCsed = records.filter(r=>r.csed).map(r=>({...r}))
  const expiredCsed = allCsed.filter(r=>new Date(r.csed) < new Date())
  const upcomingCsed = allCsed.filter(r=>new Date(r.csed) >= new Date())
    .sort((a,b)=>new Date(a.csed)-new Date(b.csed)).slice(0,5)

  return (
    <div>
      <div style={{fontSize:12,color:'var(--t3)',marginBottom:14,lineHeight:1.6}}>
        Year-by-year compliance status for each filing type. CSED auto-calculates as Assessment Date + 10 years
        (federal forms) when an assessment date is entered — edit manually if a different statute applies.
        Changes save automatically.
      </div>

      {(expiredCsed.length > 0 || upcomingCsed.length > 0) && (
        <div className="card" style={{padding:'12px 16px',marginBottom:16,background:'var(--s2)'}}>
          <div style={{fontWeight:700,fontSize:12,marginBottom:6}}>CSED Summary</div>
          {expiredCsed.length > 0 && (
            <div style={{fontSize:12,color:'var(--err)',marginBottom:4}}>
              ⚠️ {expiredCsed.length} CSED(s) already expired: {expiredCsed.map(r=>`${FORM_META[r.form_type]?.label||r.form_type} ${r.tax_year}${r.quarter?` Q${r.quarter}`:''} (${r.csed})`).join(', ')}
            </div>
          )}
          {upcomingCsed.length > 0 && (
            <div style={{fontSize:12,color:'var(--t2)'}}>
              Upcoming: {upcomingCsed.map(r=>`${FORM_META[r.form_type]?.label||r.form_type} ${r.tax_year}${r.quarter?` Q${r.quarter}`:''} → ${r.csed}`).join(' · ')}
            </div>
          )}
        </div>
      )}

      <div style={{display:'flex',gap:4,marginBottom:16,flexWrap:'wrap'}}>
        {Object.entries(FORM_META).map(([key,meta])=>(
          <button key={key} onClick={()=>setActiveForm(key)} className="btn sm" style={{
            background: activeForm===key ? 'var(--blue)' : 'var(--s2)',
            color: activeForm===key ? '#fff' : 'var(--t2)',
            border:'1px solid var(--br)',
          }}>{meta.label}</button>
        ))}
      </div>

      <FormGrid clientName={clientName} formType={activeForm}
        records={records.filter(r=>r.form_type===activeForm)}
        onSaveRow={handleSaveRow}/>
    </div>
  )
}
