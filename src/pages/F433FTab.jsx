import { useState } from 'react'
import { formatMoneyInput, parseMoney } from '../lib/money'
import { fillForm433F, fillForm433A, fillForm433D, fillForm433H, fillForm433B, fillForm433AOIC, fillForm656L } from '../lib/irsFormUtils'

function n(v) { const x = parseFloat(v); return isNaN(x) ? 0 : x }
function fmt(v) { return '$' + n(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

function Field({ label, value, onChange, type='text', wide }) {
  // type='number' means money here and renders as text so the separators show;
  // type='count' stays a real number input for months, headcounts and the like.
  const isMoney = type === 'number'
  const isCount = type === 'count'
  return (
    <div className="field" style={wide ? { gridColumn: '1 / -1' } : {}}>
      <label>{label}</label>
      <input
        type={isMoney ? 'text' : isCount ? 'number' : type}
        inputMode={isMoney || isCount ? 'decimal' : undefined}
        value={isMoney ? formatMoneyInput(value) : (value ?? '')}
        onChange={e=>onChange(isMoney ? parseMoney(e.target.value) : e.target.value)}
        placeholder=""/>
    </div>
  )
}

function SectionHeader({ children }) {
  return <div style={{fontSize:12,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em',margin:'18px 0 8px',paddingTop:14,borderTop:'1px solid var(--br)'}}>{children}</div>
}

function ReadRow({ label, value }) {
  return <div className="dr"><span className="dl">{label}</span><span className="dv">{value || '—'}</span></div>
}

function downloadPdf(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function F433FTab({ profile, set, client, totalHousehold, income, exp, assets }) {
  const extra = profile.f433_extra || {}
  const [filling, setFilling] = useState(null)
  const [fillError, setFillError] = useState('')
  function setExtra(key, value) {
    set('f433_extra', { ...extra, [key]: value })
  }

  const dependents = client?.dependents
    ? (typeof client.dependents === 'string' ? JSON.parse(client.dependents || '[]') : client.dependents)
    : []

  const re0 = profile.real_estate?.[0] || {}
  const vehicles = (profile.vehicles||[]).filter(v=>v.make_model)
  const ccTotal = (profile.credit_cards||[]).reduce((s,c)=>s+n(c.min_payment),0)

  function handlePrint() {
    document.body.classList.add('printing-fp')
    setTimeout(() => {
      window.print()
      document.body.classList.remove('printing-fp')
    }, 50)
  }

  const FILLERS = {
    '433a': fillForm433A,
    '433f': fillForm433F,
    '433d': fillForm433D,
    '433h': fillForm433H,
    '433b': fillForm433B,
    '433a_oic': fillForm433AOIC,
    '656l': (client) => fillForm656L(client),
  }

  async function handleFillPdf(formType) {
    setFilling(formType)
    setFillError('')
    try {
      const bytes = await FILLERS[formType](client, profile)
      const name = (client?.name || 'Client').replace(/\s+/g, '_')
      downloadPdf(bytes, `${formType.toUpperCase()}_${name}.pdf`)
    } catch (e) {
      setFillError(e.message || 'Failed to fill form')
    } finally {
      setFilling(null)
    }
  }

  return (
    <div className="print-target">
      <div className="no-print" style={{display:'flex',justifyContent:'flex-end',gap:8,marginBottom:10,flexWrap:'wrap'}}>
        {fillError && <div style={{fontSize:11,color:'var(--bad)',alignSelf:'center'}}>{fillError}</div>}
        <button className="btn sec" disabled={!!filling} onClick={()=>handleFillPdf('433a')}>
          {filling==='433a'?'⏳':'📄'}&nbsp; 433-A
        </button>
        <button className="btn sec" disabled={!!filling} onClick={()=>handleFillPdf('433a_oic')}>
          {filling==='433a_oic'?'⏳':'📄'}&nbsp; 433-A (OIC)
        </button>
        <button className="btn sec" disabled={!!filling} onClick={()=>handleFillPdf('656l')}>
          {filling==='656l'?'⏳':'📄'}&nbsp; 656-L (OIC Doubt as to Liability)
        </button>
        <button className="btn sec" disabled={!!filling} onClick={()=>handleFillPdf('433f')}>
          {filling==='433f'?'⏳':'📄'}&nbsp; 433-F
        </button>
        <button className="btn sec" disabled={!!filling} onClick={()=>handleFillPdf('433b')}>
          {filling==='433b'?'⏳':'📄'}&nbsp; 433-B
        </button>
        <button className="btn sec" disabled={!!filling} onClick={()=>handleFillPdf('433h')}>
          {filling==='433h'?'⏳':'📄'}&nbsp; 433-H
        </button>
        <button className="btn sec" disabled={!!filling} onClick={()=>handleFillPdf('433d')}>
          {filling==='433d'?'⏳':'📄'}&nbsp; 433-D
        </button>
        <button className="btn sec" onClick={handlePrint}>🖨️ Print / Save as PDF</button>
      </div>
      <div className="print-title">Form 433-F — Collection Information Statement Summary<br/>
        <span style={{fontSize:13,fontWeight:400}}>{client?.name||''} — {new Date().toLocaleDateString()}</span>
      </div>
      <div className="no-print" style={{fontSize:12,color:'var(--t3)',marginBottom:14,lineHeight:1.6}}>
        Form 433-F (Collection Information Statement) summary, compiled from the Intake, I&E, and
        Assets &amp; Equity tabs plus a few additional fields below. Use this as the source of truth
        when preparing the official 433-F for submission.
      </div>

      <SectionHeader>Identifying Information</SectionHeader>
      <ReadRow label="Client Name" value={client?.name}/>
      <ReadRow label="SSN" value={client?.ssn ? '***-**-'+client.ssn.replace(/-/g,'').slice(-4) : ''}/>
      <ReadRow label="Date of Birth" value={profile.dob}/>
      <ReadRow label="Address" value={client?.street}/>
      <ReadRow label="County of Residence" value={profile.county}/>
      <ReadRow label="Filing Status" value={profile.filing_status}/>
      <ReadRow label="Phone" value={client?.phone}/>

      <SectionHeader>Dependents</SectionHeader>
      {dependents.length === 0 && <div style={{fontSize:12,color:'var(--t3)'}}>None on file (add via Clients tab)</div>}
      {dependents.map((d,i)=>(
        <div key={i} className="dr"><span className="dl">{d.name}</span><span className="dv">{d.relationship} · DOB {d.dob}</span></div>
      ))}
      <div className="fg2" style={{marginTop:10}}>
        <Field label="Everyone Claimed Had Health Insurance All 12 Months?" value={extra.health_insurance_12mo} onChange={v=>setExtra('health_insurance_12mo',v)} placeholder="Yes/No"/>
        <Field label="If No, How Many Months?" value={extra.health_insurance_months} onChange={v=>setExtra('health_insurance_months',v)} type="count"/>
      </div>
      <div style={{fontSize:12,color:'var(--t3)',marginTop:4}}>Total Household Size: <strong style={{color:'var(--tx)'}}>{totalHousehold}</strong></div>

      <SectionHeader>Business (if applicable)</SectionHeader>
      <ReadRow label="Business Name" value={profile.business_1?.name}/>
      <div className="fg3" style={{marginTop:10}}>
        <Field label="Business EIN" value={extra.business_ein} onChange={v=>setExtra('business_ein',v)} placeholder={profile.business_1?.ein || ''}/>
        <Field label="Type of Business" value={extra.business_type} onChange={v=>setExtra('business_type',v)}/>
        <Field label="Number of Employees (Not Counting Owner)" value={extra.num_employees} onChange={v=>setExtra('num_employees',v)} type="count" placeholder={profile.business_1?.num_employees || ''}/>
      </div>

      <SectionHeader>Bank Accounts &amp; Assets (from Assets &amp; Equity)</SectionHeader>
      <ReadRow label="Total Bank Account Value" value={fmt(assets.bankTotal.value)}/>
      <ReadRow label="Cash on Hand" value={fmt(profile.cash_on_hand)}/>
      <ReadRow label="Total OIC Asset Equity" value={fmt(assets.grandTotal.amount)}/>

      <SectionHeader>Real Estate (Primary Residence — from Intake)</SectionHeader>
      <ReadRow label="Address" value={re0.address}/>
      <ReadRow label="Monthly Mortgage Expense" value={fmt(n(re0.mortgage_1)+n(re0.mortgage_2))}/>
      <ReadRow label="Purchase Date / Amount" value={`${re0.purchase_year||'—'} / ${fmt(re0.purchase_amount)}`}/>
      <ReadRow label="Refinance Date / Amount" value={`${re0.refi_year||'—'} / ${fmt(re0.refi_amount)}`}/>
      <ReadRow label="Value of Home (Zillow)" value={fmt(re0.zillow_value)}/>
      <ReadRow label="Length of Mortgage" value={re0.mortgage_length}/>
      <ReadRow label="Balance of Mortgage" value={fmt(re0.mortgage_balance)}/>

      <SectionHeader>Vehicles (from Intake)</SectionHeader>
      {vehicles.length === 0 && <div style={{fontSize:12,color:'var(--t3)'}}>None on file</div>}
      {vehicles.map((v,i)=>(
        <div key={i} style={{border:'1px solid var(--br)',borderRadius:8,padding:'10px 14px',marginBottom:8,background:'var(--s2)',fontSize:12}}>
          <div style={{fontWeight:700,marginBottom:4}}>{v.make_model} ({v.year})</div>
          <div className="dr"><span className="dl">Purchase</span><span className="dv">{v.purchase_date} · {fmt(v.purchase_amount)}</span></div>
          <div className="dr"><span className="dl">Monthly Payment / Final Payment Date</span><span className="dv">{fmt(v.monthly_payment)} · {v.final_payment_date}</span></div>
          <div className="dr"><span className="dl">Mileage</span><span className="dv">{v.mileage}</span></div>
          <div className="dr"><span className="dl">Current Value (KBB) / Remaining Balance</span><span className="dv">{fmt(v.kbb_value)} / {fmt(v.remaining_balance)}</span></div>
        </div>
      ))}

      <SectionHeader>Credit Cards / Unsecured Debt (from Assets &amp; Equity)</SectionHeader>
      <ReadRow label="Total Minimum Monthly Payments" value={fmt(ccTotal)}/>

      <SectionHeader>Employment &amp; Income (from Intake)</SectionHeader>
      <ReadRow label="Employer (Taxpayer)" value={profile.employment_taxpayer_1?.employer}/>
      <ReadRow label="Length of Time at Employer" value={profile.employment_taxpayer_1?.length}/>
      <ReadRow label="Net Income from Business" value={fmt(profile.business_1?.net_income)}/>
      <ReadRow label="Pay Frequency / Gross Pay" value={`${profile.employment_taxpayer_1?.pay_frequency||'—'} / ${fmt(profile.employment_taxpayer_1?.gross_monthly_salary)}`}/>
      <ReadRow label="Federal Taxes Withheld" value={fmt(profile.employment_taxpayer_1?.fed_withheld)}/>
      <ReadRow label="State Taxes Withheld" value={fmt(profile.employment_taxpayer_1?.state_withheld)}/>

      <ReadRow label="Spouse Employer" value={profile.employment_spouse_1?.employer}/>
      <ReadRow label="Spouse Length of Time at Employer" value={profile.employment_spouse_1?.length}/>
      <ReadRow label="Spouse Pay Frequency / Gross Pay" value={`${profile.employment_spouse_1?.pay_frequency||'—'} / ${fmt(profile.employment_spouse_1?.gross_monthly_salary)}`}/>
      <ReadRow label="Spouse Federal Taxes Withheld" value={fmt(profile.employment_spouse_1?.fed_withheld)}/>
      <ReadRow label="Spouse State Taxes Withheld" value={fmt(profile.employment_spouse_1?.state_withheld)}/>

      <SectionHeader>Other Income Sources</SectionHeader>
      <ReadRow label="Net Rental Income" value={fmt(income.rentalIncome)}/>
      <ReadRow label="K-1 Distributions" value={fmt(income.k1)}/>
      <ReadRow label="Other Income" value={fmt(income.otherIncome)}/>
      <ReadRow label="Total Gross Monthly Income" value={fmt(income.grossIncomeTotal)}/>

      <SectionHeader>Monthly Expenses (from I&amp;E)</SectionHeader>
      <ReadRow label="Food, Clothing and Misc." value={fmt(exp.foodClothingActual)}/>
      <ReadRow label="Housing & Utilities Total" value={fmt(exp.housing)}/>
      <ReadRow label="Vehicle Total" value={fmt(exp.vehicleTotal)}/>
      <ReadRow label="Health Care Total" value={fmt(exp.healthTotal)}/>
      <ReadRow label="Credit Card Minimum Payments" value={fmt(exp.creditTotal)}/>
      <ReadRow label="Child/Dependent Care" value={fmt(exp.childCare)}/>
      <ReadRow label="Court Ordered (Child Support / Judgments)" value={fmt(exp.courtTotal)}/>
      <ReadRow label="Other Secured Debt (Student Loans)" value={fmt(exp.otherSecured)}/>
      <ReadRow label="Life Insurance Total" value={fmt(exp.lifeTotal)}/>
      <ReadRow label="Taxes (Withholding + Installments)" value={fmt(exp.taxesSubtotal)}/>
      <ReadRow label="Total Monthly Expenses" value={fmt(exp.totalMonthlyExpenses)}/>
      <ReadRow label="Net Disposable Income" value={fmt(exp.netDisposableIncome)}/>

      <SectionHeader>Additional 433-F Fields</SectionHeader>
      <div className="fg2">
        <Field label="Union Dues (Monthly)" value={extra.union_dues} onChange={v=>setExtra('union_dues',v)} type="number"/>
        <Field label="Court Ordered Alimony (Monthly)" value={extra.court_ordered_alimony} onChange={v=>setExtra('court_ordered_alimony',v)} type="number"/>
      </div>
      <div className="fg2">
        <Field label="Other Expense — Specify 1" value={extra.other_expense_specify_1} onChange={v=>setExtra('other_expense_specify_1',v)}/>
        <Field label="Other Expense — Specify 2" value={extra.other_expense_specify_2} onChange={v=>setExtra('other_expense_specify_2',v)}/>
      </div>
      <div className="fg2">
        <Field label="Other Expense — Specify 3" value={extra.other_expense_specify_3} onChange={v=>setExtra('other_expense_specify_3',v)}/>
        <Field label="Other Expense — Specify 4" value={extra.other_expense_specify_4} onChange={v=>setExtra('other_expense_specify_4',v)}/>
      </div>
      <div style={{height:10}}/>
    </div>
  )
}
