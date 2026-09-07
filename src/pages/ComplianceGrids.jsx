import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'

function n(v) { const x = parseFloat(v); return isNaN(x) ? 0 : x }
function fmt(v) { return '$' + n(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

// Default tax-year ranges per form, matching the original TO Worksheet tabs
const CURRENT_YEAR = new Date().getFullYear() + 1 // include next tax year
const YEAR_RANGES = {
  '1040':       range(2007, CURRENT_YEAR),
  'STATE':      range(2009, CURRENT_YEAR),
  'PERS_CP':    range(2010, CURRENT_YEAR),  // quarterly-style notice form
  '940':        range(2007, CURRENT_YEAR),
  '1065':       range(2007, CURRENT_YEAR),
  '1120':       range(2007, CURRENT_YEAR),
  '1120S':      range(2007, CURRENT_YEAR),
  '941':        range(2010, CURRENT_YEAR),  // quarterly
  'CP':         range(2010, CURRENT_YEAR),  // quarterly
  'BIZ_STATE':  range(2007, CURRENT_YEAR),
}

function range(start, end) {
  const out = []
  for (let y = end; y >= start; y--) out.push(y)
  return out
}

const QUARTERLY_FORMS = ['CP', '941', 'PERS_CP']

const FORM_META = {
  '1040':      { label: 'Personal Federal (1040)',  sheet: 'Pers Fed Tax Prac',   csedYears: 10 },
  'STATE':     { label: 'Personal State',           sheet: 'Pers State Tax Prac', csedYears: 0 },
  'PERS_CP':   { label: 'Personal CP',              sheet: 'Pers CP Tax Prac',    csedYears: 10 },
  '940':       { label: 'Business 940 (FUTA)',      sheet: 'Biz 940 Tax Prac Sheet', csedYears: 10 },
  '1065':      { label: 'Business 1065',            sheet: 'Biz 1065 Tax Prac Sheet', csedYears: 10 },
  '1120':      { label: 'Business 1120',            sheet: 'Biz 1120 Tax Prac Sheet', csedYears: 10 },
  '1120S':     { label: 'Business 1120-S',          sheet: 'Biz 1120s Tax Prac Sheet', csedYears: 10 },
  '941':       { label: 'Business 941 (Payroll)',   sheet: 'Biz 941 Tax Prac Sheet', csedYears: 10 },
  'CP':        { label: 'Business CP (Federal)',    sheet: 'CP Fed Tax Prac',     csedYears: 10 },
  'BIZ_STATE': { label: 'Business State',           sheet: 'Biz State Tax Prac',  csedYears: 0 },
}

// IMPORTANT: numeric-looking object keys ('940','1065','1120','1040','941') get
// auto-sorted to the front by JS regardless of insertion order (ECMA spec behavior
// for integer-index-like string keys). Object.keys(FORM_META) is NOT reliable for
// display order. This explicit array is the single source of truth for tab order.
const FORM_ORDER = ['1040','STATE','PERS_CP','940','1065','1120','1120S','941','CP','BIZ_STATE']

const FILED_STATUS_OPTIONS = ['', 'Filed', 'Not Filed', 'SFR (Substitute for Return)', 'Filed - Not Assessed', 'No Liability', 'N/A']
const LIEN_OPTIONS = ['', 'Yes', 'No']

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
      <td style={{padding:'8px 8px',fontWeight:600,whiteSpace:'nowrap'}}>{rec.tax_year}{showQuarter ? ` Q${rec.quarter}` : ''}</td>
      <td style={{padding:'8px 8px'}}>
        <select value={rec.filed_status||''} onChange={e=>handle('filed_status', e.target.value)} style={selStyle}>
          {FILED_STATUS_OPTIONS.map(o=><option key={o} value={o}>{o||'—'}</option>)}
        </select>
      </td>
      <td style={{padding:'8px 8px'}}><MoneyInput value={rec.amount ?? ''} onChange={v=>handle('amount', v)} style={inpStyle}/></td>
      <td style={{padding:'8px 8px'}}><MoneyInput value={rec.credits ?? ''} onChange={v=>handle('credits', v)} style={inpStyle}/></td>
      {showQuarter && <td style={{padding:'8px 8px'}}><MoneyInput value={rec.deposit ?? ''} onChange={v=>handle('deposit', v)} style={inpStyle}/></td>}
      <td style={{padding:'8px 8px'}}>
        <select value={rec.lien||''} onChange={e=>handle('lien', e.target.value)} style={{...selStyle,width:90}}>
          {LIEN_OPTIONS.map(o=><option key={o} value={o}>{o||'—'}</option>)}
        </select>
      </td>
      <td style={{padding:'8px 8px'}}><input type="date" value={rec.assessment_date||''} onChange={e=>handle('assessment_date', e.target.value)} style={{...inpStyle,width:130}}/></td>
      <td style={{padding:'8px 8px'}}>
        <input type="date" value={rec.csed||''} onChange={e=>handle('csed', e.target.value)} style={{...inpStyle,width:130,
          ...(rec.csed && new Date(rec.csed) < new Date() ? {color:'var(--bad)',fontWeight:700} : {})}}/>
      </td>
    </tr>
  )
}

const inpStyle = { width:110, padding:'7px 9px', fontSize:13.5, background:'var(--s2)', border:'1px solid var(--br)', borderRadius:6, color:'var(--tx)' }
const selStyle = { ...inpStyle, width:175 }

// Number input that displays comma-separated thousands while not focused,
// and shows the raw editable number while focused. Emits plain numeric
// strings (no commas) via onChange, same as a normal number input.
function MoneyInput({ value, onChange, style, placeholder='0.00' }) {
  const [focused, setFocused] = useState(false)
  const display = (focused || value === '' || value == null)
    ? (value ?? '')
    : Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={e => {
        const raw = e.target.value.replace(/,/g, '')
        if (raw === '' || /^-?\d*\.?\d*$/.test(raw)) onChange(raw)
      }}
      style={style}
    />
  )
}

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
      </div>
      <div style={{display:'flex',gap:24,alignItems:'baseline',padding:'8px 10px',marginBottom:8,background:'var(--s3)',border:'1px solid var(--br)',borderRadius:6,flexWrap:'wrap'}}>
        <div style={{fontWeight:700,fontSize:12,color:'var(--t2)',textTransform:'uppercase',letterSpacing:'.04em'}}>Totals</div>
        <div style={{fontSize:13.5}}><span style={{color:'var(--t3)'}}>Amount: </span><span style={{color:'var(--tx)',fontWeight:700}}>{fmt(totalAmount)}</span></div>
        <div style={{fontSize:13.5}}><span style={{color:'var(--t3)'}}>Credits/Payments: </span><span style={{color:'var(--ok)',fontWeight:700}}>{fmt(totalCredits)}</span></div>
        {isQuarterly && <div style={{fontSize:13.5}}><span style={{color:'var(--t3)'}}>Deposits: </span><span style={{color:'var(--tx)',fontWeight:700}}>{fmt(records.reduce((s,r)=>s+n(r.deposit),0))}</span></div>}
        {overdueCount > 0 && <div style={{fontSize:12,color:'var(--bad)',fontWeight:700}}>{overdueCount} CSED{overdueCount>1?'s':''} expired</div>}
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:13.5}}>
          <thead>
            <tr style={{borderBottom:'1px solid var(--br)',color:'var(--t3)',textAlign:'left'}}>
              <th style={{padding:'8px 8px'}}>{isQuarterly ? 'Year / Qtr' : 'Tax Year'}</th>
              <th style={{padding:'8px 8px'}}>Filed Status</th>
              <th style={{padding:'8px 8px'}}>Amount</th>
              <th style={{padding:'8px 8px'}}>Credits/Payments</th>
              {isQuarterly && <th style={{padding:'8px 8px'}}>Deposits</th>}
              <th style={{padding:'8px 8px'}}>Lien</th>
              <th style={{padding:'8px 8px'}}>Assessment Date</th>
              <th style={{padding:'8px 8px'}}>CSED</th>
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeForm, setActiveFormRaw] = useState(() => searchParams.get('ctab') || '1040')
  function setActiveForm(f) {
    setActiveFormRaw(f)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('ctab', f)
      return next
    }, { replace: true })
  }
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
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,marginBottom:14,flexWrap:'wrap'}}>
        <div style={{fontSize:12,color:'var(--t3)',lineHeight:1.6,flex:1,minWidth:240}}>
          Year-by-year compliance status for each filing type. CSED auto-calculates as Assessment Date + 10 years
          (federal forms) when an assessment date is entered — edit manually if a different statute applies.
          Changes save automatically.
        </div>
        <button
          className="btn sec"
          style={{fontSize:11,padding:'5px 12px',whiteSpace:'nowrap'}}
          disabled={records.length===0}
          onClick={async()=>{
            const { exportComplianceToExcel } = await import('../lib/complianceExport')
            exportComplianceToExcel(clientName, records)
            showToast('✅ Compliance spreadsheet downloaded!')
          }}
        >⬇ Export to Excel</button>
      </div>

      {(expiredCsed.length > 0 || upcomingCsed.length > 0) && (
        <div className="card" style={{padding:'12px 16px',marginBottom:16,background:'var(--s2)'}}>
          <div style={{fontWeight:700,fontSize:12,marginBottom:6}}>CSED Summary</div>
          {expiredCsed.length > 0 && (
            <div style={{fontSize:12,color:'var(--bad)',marginBottom:4}}>
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
        {FORM_ORDER.map(key=>{ const meta = FORM_META[key]; return (
          <button key={key} onClick={()=>setActiveForm(key)} className="btn sm" style={{
            background: activeForm===key ? 'var(--blue)' : 'var(--s2)',
            color: activeForm===key ? '#fff' : 'var(--t2)',
            border:'1px solid var(--br)',
          }}>{meta.label}</button>
        )})}
      </div>

      <FormGrid clientName={clientName} formType={activeForm}
        records={records.filter(r=>r.form_type===activeForm)}
        onSaveRow={handleSaveRow}/>
    </div>
  )
}
