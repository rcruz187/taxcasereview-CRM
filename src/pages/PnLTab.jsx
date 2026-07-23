import { formatMoneyInput, parseMoney } from '../lib/money'

function n(v) { const x = parseFloat(v); return isNaN(x) ? 0 : x }
function fmt(v) { return '$' + n(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

// Income line items (workbook rows 4-9)
const INCOME_LINES = [
  { key: 'gross_receipts',      label: 'Gross Receipts' },
  { key: 'returns_allowances',  label: 'Returns and Allowances' },
  { key: 'cogs',                label: 'Cost of Goods Sold' },
  { key: 'other_income',         label: 'Other Income' },
]

// Deduction line items (workbook rows 13-35)
const DEDUCTION_LINES = [
  { key: 'advertising',         label: 'Advertising' },
  { key: 'car_truck',           label: 'Car & Truck Expense' },
  { key: 'commissions_fees',    label: 'Commissions and Fees' },
  { key: 'contract_labor',      label: 'Contract Labor' },
  { key: 'depletion',           label: 'Depletion' },
  { key: 'depreciation',        label: 'Depreciation from Form 4562' },
  { key: 'employee_benefits',   label: 'Employee Benefit Programs' },
  { key: 'insurance',           label: 'Insurance' },
  { key: 'interest',            label: 'Interest' },
  { key: 'legal_professional',  label: 'Legal and Professional' },
  { key: 'office_expense',      label: 'Office Expense' },
  { key: 'pension_profit',      label: 'Pension, Profit-Sharing, etc.' },
  { key: 'rent_lease',          label: 'Rent or Lease' },
  { key: 'repairs_maintenance', label: 'Repairs and Maintenance' },
  { key: 'supplies',            label: 'Supplies' },
  { key: 'taxes_licenses',      label: 'Taxes and Licenses' },
  { key: 'travel_meals',        label: 'Travel, Meals, Entertainment' },
  { key: 'utilities',           label: 'Utilities' },
  { key: 'wages',               label: 'Wages' },
  { key: 'internet',            label: 'Internet' },
  { key: 'cell_phone',          label: 'Cell Phone' },
  { key: 'fuel',                label: 'Fuel' },
]

function Field({ label, value, onChange, type='text', wide, monthly }) {
  return (
    <div className="field" style={wide ? { gridColumn: '1 / -1' } : {}}>
      <label>{label}{monthly!==undefined && <span style={{color:'var(--t3)',fontWeight:400}}> · Monthly: {fmt(monthly)}</span>}</label>
      <input
        type={type === 'number' ? 'text' : type}
        inputMode={type === 'number' ? 'decimal' : undefined}
        value={type === 'number' ? formatMoneyInput(value) : (value ?? '')}
        onChange={e=>onChange(type === 'number' ? parseMoney(e.target.value) : e.target.value)}
        placeholder="0.00"/>
    </div>
  )
}

function SectionHeader({ children }) {
  return <div style={{fontSize:12,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em',margin:'18px 0 8px',paddingTop:14,borderTop:'1px solid var(--br)'}}>{children}</div>
}

function SubtotalRow({ label, value, monthly }) {
  return (
    <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderTop:'1px solid var(--br)',marginTop:6,fontWeight:700,fontSize:13}}>
      <span>{label}</span>
      <span>{fmt(value)}{monthly!==undefined && <span style={{fontSize:12.5,fontWeight:400,color:'var(--t3)'}}> ({fmt(monthly)}/mo)</span>}</span>
    </div>
  )
}

// Compute base-year totals from raw income/deduction values
function calcBaseYear(base) {
  const income = base.income || {}
  const deductions = base.deductions || {}

  const grossReceipts = n(income.gross_receipts)
  const returns = n(income.returns_allowances)
  const totalReceipts = grossReceipts - returns
  const cogs = n(income.cogs)
  const grossProfit = totalReceipts - cogs
  const otherIncome = n(income.other_income)
  const grossIncome = grossProfit + otherIncome

  const totalDeductions = DEDUCTION_LINES.reduce((s,l)=>s+n(deductions[l.key]),0)
  const netProfit = grossIncome - totalDeductions

  return { grossReceipts, returns, totalReceipts, cogs, grossProfit, otherIncome, grossIncome, totalDeductions, netProfit }
}

// Allocate a missing year's amounts proportionally based on its declared gross income
// vs base year gross income (matches workbook H3/G3 * row formula)
function calcMissingYear(base, missingYear, calc) {
  const declaredGross = n(missingYear.gross_income)
  const ratio = calc.grossIncome !== 0 ? declaredGross / calc.grossIncome : 0

  const income = base.income || {}
  const deductions = base.deductions || {}

  const allocatedIncome = {}
  INCOME_LINES.forEach(l => { allocatedIncome[l.key] = n(income[l.key]) * ratio })
  const allocatedDeductions = {}
  DEDUCTION_LINES.forEach(l => { allocatedDeductions[l.key] = n(deductions[l.key]) * ratio })

  const totalExpenses = DEDUCTION_LINES.reduce((s,l)=>s+allocatedDeductions[l.key],0)
  const netProfit = declaredGross - totalExpenses

  return { ratio, allocatedIncome, allocatedDeductions, totalExpenses, netProfit, declaredGross }
}

function MissingYearCard({ row, idx, base, calc, onChange, onRemove }) {
  const result = calcMissingYear(base, row, calc)
  return (
    <div style={{border:'1px solid var(--br)',borderRadius:8,padding:'12px 14px',marginBottom:12,background:'var(--s2)'}}>
      <div className="fg3" style={{alignItems:'end'}}>
        <Field label="Tax Year" value={row.year} onChange={v=>onChange('year',v)}/>
        <Field label="Declared Gross Income (Yearly)" value={row.gross_income} onChange={v=>onChange('gross_income',v)} type="number"/>
        <button className="btn del sm" onClick={onRemove} style={{marginBottom:14}}>Remove</button>
      </div>
      <div style={{fontSize:12,color:'var(--t3)',marginTop:4}}>
        Ratio to Base Year: {(result.ratio*100).toFixed(1)}% &nbsp;·&nbsp;
        Allocated Total Expenses: {fmt(result.totalExpenses)} &nbsp;·&nbsp;
        Allocated Net Profit: <strong style={{color: result.netProfit>=0 ? 'var(--ok)' : 'var(--bad)'}}>{fmt(result.netProfit)}</strong>
      </div>
    </div>
  )
}

export default function PnLTab({ profile, set }) {
  const base = profile.pl_base_year || {}
  const missingYears = profile.pl_missing_years || []
  const calc = calcBaseYear(base)

  function setBase(section, key, value) {
    const next = { ...base }
    next[section] = { ...(next[section]||{}), [key]: value }
    set('pl_base_year', next)
  }
  function setBaseYear(value) {
    set('pl_base_year', { ...base, year: value })
  }
  function addMissingYear() {
    set('pl_missing_years', [...missingYears, { year: '', gross_income: '' }])
  }
  function updateMissingYear(idx, key, value) {
    const next = missingYears.map((r,i)=> i===idx ? {...r,[key]:value} : r)
    set('pl_missing_years', next)
  }
  function removeMissingYear(idx) {
    set('pl_missing_years', missingYears.filter((_,i)=>i!==idx))
  }

  const income = base.income || {}
  const deductions = base.deductions || {}

  return (
    <div>
      <SectionHeader>Base Year</SectionHeader>
      <div className="fg2">
        <Field label="Base Tax Year" value={base.year} onChange={setBaseYear}/>
        <div/>
      </div>

      <SectionHeader>Income (Yearly)</SectionHeader>
      <div className="fg2">
        <Field label="Gross Receipts" value={income.gross_receipts} onChange={v=>setBase('income','gross_receipts',v)} type="number" monthly={n(income.gross_receipts)/12}/>
        <Field label="Returns and Allowances" value={income.returns_allowances} onChange={v=>setBase('income','returns_allowances',v)} type="number" monthly={n(income.returns_allowances)/12}/>
      </div>
      <SubtotalRow label="Total Receipts" value={calc.totalReceipts} monthly={calc.totalReceipts/12}/>
      <div className="fg2" style={{marginTop:10}}>
        <Field label="Cost of Goods Sold" value={income.cogs} onChange={v=>setBase('income','cogs',v)} type="number" monthly={n(income.cogs)/12}/>
        <Field label="Other Income" value={income.other_income} onChange={v=>setBase('income','other_income',v)} type="number" monthly={n(income.other_income)/12}/>
      </div>
      <SubtotalRow label="Gross Profit" value={calc.grossProfit} monthly={calc.grossProfit/12}/>
      <SubtotalRow label="Gross Income" value={calc.grossIncome} monthly={calc.grossIncome/12}/>

      <SectionHeader>Deductions (Yearly)</SectionHeader>
      <div className="fg2">
        {DEDUCTION_LINES.map(l=>(
          <Field key={l.key} label={l.label} value={deductions[l.key]} onChange={v=>setBase('deductions',l.key,v)} type="number" monthly={n(deductions[l.key])/12}/>
        ))}
      </div>
      <SubtotalRow label="Total Expenses" value={calc.totalDeductions} monthly={calc.totalDeductions/12}/>

      <div className="card" style={{padding:'14px 16px',background:'var(--blt)',marginTop:16,border:'1px solid var(--blue)'}}>
        <div className="dr"><span className="dl" style={{fontWeight:800,fontSize:14}}>Net Profit (Base Year)</span>
          <span className="dv" style={{fontWeight:800,fontSize:14,color: calc.netProfit>=0 ? 'var(--b2)' : 'var(--bad)'}}>{fmt(calc.netProfit)} <span style={{fontSize:12.5,fontWeight:400,color:'var(--t3)'}}>({fmt(calc.netProfit/12)}/mo)</span></span>
        </div>
      </div>

      <SectionHeader>Missing Years (Allocated from Base Year)</SectionHeader>
      <div style={{fontSize:12,color:'var(--t3)',marginBottom:10,lineHeight:1.6}}>
        For each unfiled year, enter the declared gross income. Income and expense line items are
        allocated proportionally based on the ratio of that year's gross income to the base year's
        gross income — matching the workbook's allocation formula.
      </div>
      {missingYears.map((row,i)=>(
        <MissingYearCard key={i} row={row} idx={i} base={base} calc={calc}
          onChange={(k,v)=>updateMissingYear(i,k,v)} onRemove={()=>removeMissingYear(i)}/>
      ))}
      <button className="btn sm" onClick={addMissingYear}>+ Add Missing Year</button>
      <div style={{height:10}}/>
    </div>
  )
}
