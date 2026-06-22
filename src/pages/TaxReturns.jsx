import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const SQL_SETUP = `create table if not exists tax_returns (
  id uuid default gen_random_uuid() primary key,
  returnNum text, clientName text, taxYear text,
  returnType text, filingStatus text, status text default 'Draft',
  assignedTo text, wages numeric, interest numeric, dividends numeric,
  capitalGains numeric, businessIncome numeric, rentalIncome numeric,
  retirementIncome numeric, socialSecurity numeric, otherIncome numeric,
  studentLoanInterest numeric, iraDeduction numeric, selfEmployedHealth numeric,
  selfEmployedTax numeric, alimonyPaid numeric, otherAdjustments numeric,
  deductionType text default 'Standard', itemizedDeductions numeric,
  stateLocalTax numeric, mortgageInterest numeric, charitableContrib numeric,
  medicalExpenses numeric, childTaxCredit numeric, earnedIncomeCredit numeric,
  childCareCredit numeric, educationCredit numeric, otherCredits numeric,
  withholding numeric, estimatedPayments numeric, refundable numeric,
  notes text, created_at timestamptz default now(), updated_at timestamptz
);
alter table tax_returns enable row level security;
create policy "anon_all" on tax_returns for all using (true) with check (true);`

const TAX_YEARS = ['2024','2023','2022','2021','2020','2019','2018']
const FILING_STATUSES = ['Single','Married Filing Jointly','Married Filing Separately','Head of Household','Qualifying Surviving Spouse']
const RETURN_TYPES = ['Federal 1040','State Return','1040-X Amended','1040-SR Senior','1040-NR Non-Resident','941 Payroll','940 FUTA','1065 Partnership','1120 Corp','1120S S-Corp','1041 Estate/Trust']
const RETURN_STATUSES = ['Draft','In Review','Client Review','Ready to File','Filed','Accepted','Rejected','Amended']

const BLANK_RETURN = {
  clientName: '', taxYear: '2024', returnType: 'Federal 1040',
  filingStatus: 'Single', status: 'Draft', assignedTo: '',
  // Income
  wages: '', interest: '', dividends: '', capitalGains: '', businessIncome: '',
  rentalIncome: '', retirementIncome: '', socialSecurity: '', otherIncome: '',
  // Adjustments
  studentLoanInterest: '', iraDeduction: '', selfEmployedHealth: '', selfEmployedTax: '',
  alimonyPaid: '', otherAdjustments: '',
  // Deductions
  deductionType: 'Standard', itemizedDeductions: '',
  stateLocalTax: '', mortgageInterest: '', charitableContrib: '', medicalExpenses: '',
  // Credits
  childTaxCredit: '', earnedIncomeCredit: '', childCareCredit: '', educationCredit: '', otherCredits: '',
  // Payments
  withholding: '', estimatedPayments: '', refundable: '',
  // Refund/Owed
  refundOrOwed: '', notes: '',
}

function calcTotals(r) {
  const n = k => parseFloat(r[k] || 0) || 0
  const grossIncome = n('wages') + n('interest') + n('dividends') + n('capitalGains') +
    n('businessIncome') + n('rentalIncome') + n('retirementIncome') + n('socialSecurity') + n('otherIncome')
  const adjustments = n('studentLoanInterest') + n('iraDeduction') + n('selfEmployedHealth') +
    n('selfEmployedTax') + n('alimonyPaid') + n('otherAdjustments')
  const agi = grossIncome - adjustments
  let deductions = 0
  if (r.deductionType === 'Standard') {
    const stdDed = { 'Single': 14600, 'Married Filing Jointly': 29200, 'Married Filing Separately': 14600, 'Head of Household': 21900, 'Qualifying Surviving Spouse': 29200 }
    deductions = stdDed[r.filingStatus] || 14600
  } else {
    deductions = n('stateLocalTax') + n('mortgageInterest') + n('charitableContrib') + n('medicalExpenses') + n('itemizedDeductions')
  }
  const taxableIncome = Math.max(0, agi - deductions)
  // 2024 tax brackets (single)
  let tax = 0
  const brackets = r.filingStatus === 'Married Filing Jointly'
    ? [[23200,.1],[94300,.12],[201050,.22],[383900,.24],[487450,.32],[731200,.35],[Infinity,.37]]
    : [[11600,.1],[47150,.12],[100525,.22],[191950,.24],[243725,.32],[609350,.35],[Infinity,.37]]
  let remaining = taxableIncome
  let prev = 0
  for (const [limit, rate] of brackets) {
    const range = Math.min(remaining, limit - prev)
    if (range <= 0) break
    tax += range * rate
    remaining -= range
    prev = limit
    if (remaining <= 0) break
  }
  const credits = n('childTaxCredit') + n('earnedIncomeCredit') + n('childCareCredit') + n('educationCredit') + n('otherCredits')
  const taxAfterCredits = Math.max(0, tax - credits)
  const payments = n('withholding') + n('estimatedPayments') + n('refundable')
  const refundOrOwed = payments - taxAfterCredits

  return { grossIncome, adjustments, agi, deductions, taxableIncome, tax, credits, taxAfterCredits, payments, refundOrOwed }
}

function fmt(n) {
  if (!n && n !== 0) return '—'
  return '$' + Math.round(n).toLocaleString()
}

export default function TaxReturns() {
  const [returns, setReturns]   = useState([])
  const [clients, setClients]   = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading]   = useState(true)
  const [view, setView]         = useState('list') // list | edit
  const [current, setCurrent]   = useState(null)
  const [form, setForm]         = useState(BLANK_RETURN)
  const [saving, setSaving]     = useState(false)
  const [toast, setToast]       = useState('')
  const [search, setSearch]     = useState('')
  const [filterYear, setFilterYear] = useState('All')
  const [filterStatus, setFilterStatus] = useState('All')
  const [tab, setTab]           = useState('income')
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [preparer, setPreparer] = useState({ name:'', ptin:'', caf:'', efin:'' })

  useEffect(() => { load(); loadPreparer() }, [])

  async function loadPreparer() {
    const { data } = await supabase.from('settings').select('preparer_name,ptin,caf_number,efin').limit(1).maybeSingle()
    if (data) setPreparer({ name: data.preparer_name || '', ptin: data.ptin || '', caf: data.caf_number || '', efin: data.efin || '' })
  }

  async function load() {
    const [r, c, e] = await Promise.all([
      supabase.from('tax_returns').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('id,name,ssn,filingStatus,assignedTo').order('name'),
      supabase.from('employees').select('name'),
    ])
    // Detect missing table
    if (r.error && (r.error.code === '42P01' || r.error.message?.includes('does not exist'))) {
      setSetupNeeded(true)
    } else {
      setSetupNeeded(false)
      setReturns(r.data || [])
    }
    setClients(c.data || [])
    setEmployees(e.data || [])
    setLoading(false)
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  function openNew() {
    setForm({ ...BLANK_RETURN })
    setCurrent(null)
    setTab('income')
    setView('edit')
  }

  function openEdit(ret) {
    setForm({ ...BLANK_RETURN, ...ret })
    setCurrent(ret)
    setTab('income')
    setView('edit')
  }

  function fld(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function onClientChange(name) {
    fld('clientName', name)
    const c = clients.find(c => c.name === name)
    if (c) {
      if (c.filingStatus) fld('filingStatus', c.filingStatus)
      if (c.assignedTo) fld('assignedTo', c.assignedTo)
    }
  }

  async function save() {
    if (!form.clientName) { showToast('Client name required'); return }
    setSaving(true)
    const payload = { ...form, updated_at: new Date().toISOString() }
    let error
    if (current?.id) {
      ;({ error } = await supabase.from('tax_returns').update(payload).eq('id', current.id))
    } else {
      payload.created_at = new Date().toISOString()
      const returnNum = 'TR-' + Date.now().toString().slice(-6)
      payload.returnNum = returnNum
      ;({ error } = await supabase.from('tax_returns').insert([payload]))
    }
    setSaving(false)
    if (error) {
      // If table doesn't exist yet, show helpful message
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        showToast('⚠️ tax_returns table not created yet — see setup instructions')
      } else {
        showToast('Error: ' + error.message)
      }
      return
    }
    showToast('✅ Return saved!')
    load()
    setView('list')
  }

  async function deleteReturn(id) {
    if (!confirm('Delete this return?')) return
    await supabase.from('tax_returns').delete().eq('id', id)
    showToast('Deleted')
    load()
  }

  async function updateStatus(id, status) {
    await supabase.from('tax_returns').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  const reps = employees.length > 0 ? employees.map(e => e.name) : ['Romy Cruz', 'Dana Richard', 'Yesenia Gonzalez']

  const filtered = returns.filter(r => {
    const q = search.toLowerCase()
    const matchSearch = !q || r.clientName?.toLowerCase().includes(q) || r.returnNum?.includes(q)
    const matchYear = filterYear === 'All' || r.taxYear === filterYear
    const matchStatus = filterStatus === 'All' || r.status === filterStatus
    return matchSearch && matchYear && matchStatus
  })

  const totals = calcTotals(form)
  const stdDed = { 'Single': 14600, 'Married Filing Jointly': 29200, 'Married Filing Separately': 14600, 'Head of Household': 21900, 'Qualifying Surviving Spouse': 29200 }

  const statusColors = { Draft:'bn', 'In Review':'ba', 'Client Review':'ba', 'Ready to File':'bb', Filed:'bg', Accepted:'bg', Rejected:'br', Amended:'bw' }

  const MoneyField = ({ label, field, help }) => (
    <div className="field">
      <label style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        {help && <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 400 }}>{help}</span>}
      </label>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', fontSize: 13 }}>$</span>
        <input
          type="number" min="0" step="0.01"
          value={form[field] || ''}
          onChange={e => fld(field, e.target.value)}
          style={{ paddingLeft: 22 }}
          placeholder="0"
        />
      </div>
    </div>
  )

  if (loading) return <div style={{ color: 'var(--t3)', padding: 20 }}>Loading…</div>

  // ── LIST VIEW ──
  if (view === 'list') return (
    <div>
      {toast && <div className="toast show">{toast}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>🧾 Tax Returns</h2>
        <button className="btn pri" onClick={openNew}>+ New Return</button>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: 8, marginBottom: 14 }}>
        {[
          ['Total', returns.length, 'var(--blue)'],
          ['Draft', returns.filter(r => r.status === 'Draft').length, 'var(--t3)'],
          ['In Review', returns.filter(r => r.status === 'In Review' || r.status === 'Client Review').length, 'var(--warn)'],
          ['Ready', returns.filter(r => r.status === 'Ready to File').length, 'var(--blue)'],
          ['Filed', returns.filter(r => r.status === 'Filed' || r.status === 'Accepted').length, 'var(--ok)'],
          ['Rejected', returns.filter(r => r.status === 'Rejected').length, 'var(--bad)'],
        ].map(([label, val, color]) => (
          <div key={label} className="card" style={{ padding: '10px 12px', textAlign: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: 20, color, lineHeight: 1 }}>{val}</div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 3 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search client or return #…"
          style={{ flex: 1, minWidth: 180, padding: '7px 12px', background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }} />
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
          style={{ padding: '7px 10px', background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }}>
          <option value="All">All Years</option>
          {TAX_YEARS.map(y => <option key={y}>{y}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '7px 10px', background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }}>
          <option value="All">All Statuses</option>
          {RETURN_STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Returns table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>
            {returns.length === 0 ? 'No returns yet. Click "+ New Return" to get started.' : 'No returns match your filters.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--br)', background: 'var(--s2)' }}>
                {['Return #', 'Client', 'Year', 'Type', 'Filing Status', 'Rep', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(ret => (
                <tr key={ret.id} style={{ borderBottom: '1px solid var(--br)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: '9px 12px', fontWeight: 700, color: 'var(--blue)' }}>{ret.returnNum || '—'}</td>
                  <td style={{ padding: '9px 12px', fontWeight: 600 }}>{ret.clientName}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--t2)' }}>{ret.taxYear}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--t2)' }}>{ret.returnType}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--t2)' }}>{ret.filingStatus}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--t2)' }}>{ret.assignedTo || '—'}</td>
                  <td style={{ padding: '9px 12px' }}>
                    <select value={ret.status || 'Draft'}
                      onChange={e => updateStatus(ret.id, e.target.value)}
                      style={{ fontSize: 10, padding: '3px 6px', background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 4, color: 'var(--tx)', cursor: 'pointer' }}>
                      {RETURN_STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn sec" style={{ fontSize: 10, padding: '3px 10px' }} onClick={() => openEdit(ret)}>Edit</button>
                      <button className="btn del" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => deleteReturn(ret.id)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )

  // ── EDIT VIEW ──
  const TABS = [
    { key: 'income', label: '💰 Income' },
    { key: 'adjustments', label: '📉 Adjustments' },
    { key: 'deductions', label: '🏠 Deductions' },
    { key: 'credits', label: '⭐ Credits' },
    { key: 'payments', label: '💳 Payments' },
    { key: 'summary', label: '📊 Summary' },
    { key: 'submit',  label: '📤 Submit / Export' },
  ]

  return (
    <div style={{ maxWidth: 900 }}>
      {toast && <div className="toast show">{toast}</div>}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className="btn" style={{ fontSize: 12 }} onClick={() => setView('list')}>← Back</button>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, flex: 1 }}>
          {current ? `Edit Return — ${form.clientName} (${form.taxYear})` : '🧾 New Tax Return'}
        </h2>
        <select value={form.status} onChange={e => fld('status', e.target.value)}
          style={{ fontSize: 11, padding: '5px 10px', background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 6, color: 'var(--tx)' }}>
          {RETURN_STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <button className="btn pri" onClick={save} disabled={saving}>{saving ? 'Saving…' : '💾 Save Return'}</button>
      </div>

      {/* Client + Meta */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--t3)', marginBottom: 10 }}>Return Info</div>
        <div className="form-grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: 10, marginBottom: 10 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Client *</label>
            <input list="client-list" value={form.clientName} onChange={e => onClientChange(e.target.value)} placeholder="Type client name…"/>
            <datalist id="client-list">{clients.map(c => <option key={c.id} value={c.name}/>)}</datalist>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Tax Year</label>
            <select value={form.taxYear} onChange={e => fld('taxYear', e.target.value)}>
              {TAX_YEARS.map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div className="form-grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Return Type</label>
            <select value={form.returnType} onChange={e => fld('returnType', e.target.value)}>
              {RETURN_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Filing Status</label>
            <select value={form.filingStatus} onChange={e => fld('filingStatus', e.target.value)}>
              {FILING_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Assigned To</label>
            <select value={form.assignedTo} onChange={e => fld('assignedTo', e.target.value)}>
              <option value="">— Unassigned —</option>
              {reps.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--br)', marginBottom: 12, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '7px 14px', fontSize: 11, fontWeight: tab === t.key ? 700 : 400,
              background: 'none', border: 'none',
              borderBottom: tab === t.key ? '2px solid var(--blue)' : '2px solid transparent',
              color: tab === t.key ? 'var(--blue)' : 'var(--t2)', cursor: 'pointer',
              whiteSpace: 'nowrap', paddingBottom: 8 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── INCOME TAB ── */}
      {tab === 'income' && (
        <div className="card">
          <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>Income Sources</div>
          <div className="fg2">
            <MoneyField label="Wages, Salaries, Tips (W-2)" field="wages" help="Box 1 of W-2"/>
            <MoneyField label="Taxable Interest (1099-INT)" field="interest" help="Schedule B"/>
            <MoneyField label="Ordinary Dividends (1099-DIV)" field="dividends" help="Schedule B"/>
            <MoneyField label="Capital Gains / Losses (1099-B)" field="capitalGains" help="Schedule D"/>
            <MoneyField label="Business / Self-Employment Income" field="businessIncome" help="Schedule C"/>
            <MoneyField label="Rental / Royalty Income" field="rentalIncome" help="Schedule E"/>
            <MoneyField label="Retirement / Pension (1099-R)" field="retirementIncome" help="Form 1099-R"/>
            <MoneyField label="Social Security Benefits" field="socialSecurity" help="SSA-1099"/>
            <MoneyField label="Other Income" field="otherIncome" help="Alimony, prizes, etc."/>
          </div>
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--s3)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)' }}>Gross Income</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--blue)' }}>{fmt(totals.grossIncome)}</span>
          </div>
        </div>
      )}

      {/* ── ADJUSTMENTS TAB ── */}
      {tab === 'adjustments' && (
        <div className="card">
          <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>Above-the-Line Adjustments</div>
          <div className="fg2">
            <MoneyField label="Student Loan Interest" field="studentLoanInterest" help="Max $2,500"/>
            <MoneyField label="IRA Deduction" field="iraDeduction" help="Traditional IRA"/>
            <MoneyField label="Self-Employed Health Insurance" field="selfEmployedHealth"/>
            <MoneyField label="Deductible Self-Employment Tax" field="selfEmployedTax" help="50% of SE tax"/>
            <MoneyField label="Alimony Paid (pre-2019 agreements)" field="alimonyPaid"/>
            <MoneyField label="Other Adjustments" field="otherAdjustments"/>
          </div>
          <div className="form-grid2" style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ padding: '10px 14px', background: 'var(--s3)', borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 2 }}>Total Adjustments</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--bad)' }}>-{fmt(totals.adjustments)}</div>
            </div>
            <div style={{ padding: '10px 14px', background: 'var(--s3)', borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 2 }}>Adjusted Gross Income (AGI)</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--blue)' }}>{fmt(totals.agi)}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── DEDUCTIONS TAB ── */}
      {tab === 'deductions' && (
        <div className="card">
          <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Deduction Method</div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            {['Standard', 'Itemized'].map(type => (
              <button key={type} onClick={() => fld('deductionType', type)}
                className={`btn ${form.deductionType === type ? 'pri' : 'sec'}`}
                style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}>
                {type === 'Standard'
                  ? `Standard (${fmt(stdDed[form.filingStatus] || 14600)})`
                  : `Itemized (${fmt(totals.deductions)})`}
              </button>
            ))}
          </div>

          {form.deductionType === 'Standard' ? (
            <div style={{ padding: '14px 16px', background: 'var(--s3)', borderRadius: 6, fontSize: 13, color: 'var(--t2)', lineHeight: 1.8 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>2024 Standard Deduction</div>
              {[
                ['Single', 14600], ['Married Filing Jointly', 29200], ['Married Filing Separately', 14600],
                ['Head of Household', 21900], ['Qualifying Surviving Spouse', 29200]
              ].map(([s, amt]) => (
                <div key={s} style={{ display: 'flex', justifyContent: 'space-between', fontWeight: s === form.filingStatus ? 700 : 400, color: s === form.filingStatus ? 'var(--blue)' : 'var(--t3)' }}>
                  <span>{s}</span><span>{fmt(amt)}</span>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Schedule A — Itemized</div>
              <div className="fg2">
                <MoneyField label="State & Local Taxes (SALT)" field="stateLocalTax" help="Max $10,000"/>
                <MoneyField label="Mortgage Interest (1098)" field="mortgageInterest"/>
                <MoneyField label="Charitable Contributions" field="charitableContrib"/>
                <MoneyField label="Medical Expenses (>7.5% AGI)" field="medicalExpenses"/>
                <MoneyField label="Other Itemized" field="itemizedDeductions"/>
              </div>
            </>
          )}

          <div className="form-grid2" style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ padding: '10px 14px', background: 'var(--s3)', borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 2 }}>Total Deduction</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--bad)' }}>-{fmt(totals.deductions)}</div>
            </div>
            <div style={{ padding: '10px 14px', background: 'var(--s3)', borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 2 }}>Taxable Income</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--blue)' }}>{fmt(totals.taxableIncome)}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── CREDITS TAB ── */}
      {tab === 'credits' && (
        <div className="card">
          <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>Tax Credits</div>
          <div className="fg2">
            <MoneyField label="Child Tax Credit" field="childTaxCredit" help="Up to $2,000/child"/>
            <MoneyField label="Earned Income Tax Credit (EITC)" field="earnedIncomeCredit" help="Schedule EIC"/>
            <MoneyField label="Child & Dependent Care Credit" field="childCareCredit" help="Form 2441"/>
            <MoneyField label="Education Credit" field="educationCredit" help="Form 8863"/>
            <MoneyField label="Other Credits" field="otherCredits"/>
          </div>
          <div className="form-grid2" style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ padding: '10px 14px', background: 'var(--s3)', borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 2 }}>Est. Tax Before Credits</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--warn)' }}>{fmt(totals.tax)}</div>
            </div>
            <div style={{ padding: '10px 14px', background: 'var(--s3)', borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 2 }}>Tax After Credits</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--blue)' }}>{fmt(totals.taxAfterCredits)}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── PAYMENTS TAB ── */}
      {tab === 'payments' && (
        <div className="card">
          <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>Payments & Withholding</div>
          <div className="fg2">
            <MoneyField label="Federal Tax Withheld (W-2 Box 2)" field="withholding"/>
            <MoneyField label="Estimated Tax Payments" field="estimatedPayments" help="Form 1040-ES"/>
            <MoneyField label="Refundable Credits" field="refundable" help="EITC, ACTC, etc."/>
          </div>
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--s3)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)' }}>Total Payments</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--ok)' }}>{fmt(totals.payments)}</span>
          </div>

          {/* Notes */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Preparer Notes</div>
            <textarea value={form.notes || ''} onChange={e => fld('notes', e.target.value)}
              placeholder="Internal notes about this return…"
              style={{ width: '100%', minHeight: 80, padding: '8px 10px', background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 6, color: 'var(--tx)', fontSize: 12, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </div>
        </div>
      )}

      {/* ── SUMMARY TAB ── */}
      {tab === 'summary' && (
        <div>
          {/* Refund / Owed Banner */}
          <div style={{
            padding: '20px 24px', borderRadius: 8, marginBottom: 14,
            background: totals.refundOrOwed >= 0 ? 'var(--ok)22' : 'var(--bad)22',
            border: `1px solid ${totals.refundOrOwed >= 0 ? 'var(--ok)' : 'var(--bad)'}`,
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
              {totals.refundOrOwed >= 0 ? '💚 Estimated Refund' : '🔴 Estimated Amount Owed'}
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: totals.refundOrOwed >= 0 ? 'var(--ok)' : 'var(--bad)' }}>
              {fmt(Math.abs(totals.refundOrOwed))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
              Based on {form.taxYear} {form.filingStatus} · {form.returnType}
            </div>
          </div>

          {/* Full Calculation */}
          <div className="card">
            <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 12 }}>Return Calculation Summary</div>
            {[
              ['Gross Income', totals.grossIncome, 'var(--tx)', false],
              ['Adjustments', -totals.adjustments, 'var(--bad)', false],
              ['Adjusted Gross Income (AGI)', totals.agi, 'var(--blue)', true],
              [`${form.deductionType} Deduction`, -totals.deductions, 'var(--bad)', false],
              ['Taxable Income', totals.taxableIncome, 'var(--blue)', true],
              ['Estimated Tax (calculated)', totals.tax, 'var(--warn)', false],
              ['Tax Credits', -totals.credits, 'var(--ok)', false],
              ['Tax After Credits', totals.taxAfterCredits, 'var(--warn)', true],
              ['Total Payments & Withholding', totals.payments, 'var(--ok)', false],
              [totals.refundOrOwed >= 0 ? 'REFUND' : 'BALANCE DUE', totals.refundOrOwed, totals.refundOrOwed >= 0 ? 'var(--ok)' : 'var(--bad)', true],
            ].map(([label, val, color, bold]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--br)', fontWeight: bold ? 700 : 400 }}>
                <span style={{ fontSize: 12, color: bold ? 'var(--tx)' : 'var(--t2)' }}>{label}</span>
                <span style={{ fontSize: bold ? 15 : 13, color, fontWeight: bold ? 800 : 600 }}>
                  {val < 0 ? '-' : ''}{fmt(Math.abs(val))}
                </span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button className="btn pri" onClick={save} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
              {saving ? 'Saving…' : '💾 Save Return'}
            </button>
            <button className="btn sec" onClick={() => setView('list')} style={{ flex: 1, justifyContent: 'center' }}>
              ← Back to List
            </button>
          </div>
        </div>
      )}

      {/* ── SUBMIT / EXPORT TAB ── */}
      {tab === 'submit' && (() => {
        const t = calcTotals(form)
        function downloadFile(content, filename, type='text/plain') {
          const blob = new Blob([content], { type })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url; a.download = filename; a.click()
          URL.revokeObjectURL(url)
        }
        function printReturn() {
          const win = window.open('', '_blank')
          win.document.write(`<html><head><title>Tax Return — ${form.clientName} ${form.taxYear}</title>
            <style>body{font-family:Arial,sans-serif;font-size:12px;padding:20px;color:#000}
            h1{font-size:18px;border-bottom:2px solid #000;padding-bottom:6px}
            h2{font-size:14px;border-bottom:1px solid #ccc;padding-bottom:4px;margin-top:20px}
            .row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eee}
            .bold{font-weight:700}.total{font-size:14px;font-weight:700;background:#f0f0f0;padding:6px 8px}
            .refund{background:#d4edda;padding:12px;text-align:center;font-size:18px;font-weight:700;border:2px solid #28a745}
            .owed{background:#f8d7da;padding:12px;text-align:center;font-size:18px;font-weight:700;border:2px solid #dc3545}
            .footer{margin-top:30px;border-top:1px solid #000;padding-top:10px;font-size:10px}
            </style></head><body>
            <h1>FEDERAL INCOME TAX RETURN — ${form.taxYear}</h1>
            <div class="row"><span>Taxpayer Name:</span><span class="bold">${form.clientName}</span></div>
            <div class="row"><span>Filing Status:</span><span>${form.filingStatus}</span></div>
            <div class="row"><span>Return Type:</span><span>${form.returnType}</span></div>
            <div class="row"><span>Prepared By:</span><span>${preparer.name || 'Tax Case Review'}</span></div>
            <div class="row"><span>PTIN:</span><span>${preparer.ptin || '—'}</span></div>
            <div class="row"><span>CAF#:</span><span>${preparer.caf || '—'}</span></div>
            <div class="row"><span>Preparation Date:</span><span>${new Date().toLocaleDateString()}</span></div>
            <h2>INCOME</h2>
            ${[['Wages', form.wages],['Interest',form.interest],['Dividends',form.dividends],['Capital Gains',form.capitalGains],['Business Income',form.businessIncome],['Rental Income',form.rentalIncome],['Retirement',form.retirementIncome],['Social Security',form.socialSecurity],['Other Income',form.otherIncome]].filter(([,v])=>parseFloat(v||0)>0).map(([l,v])=>`<div class="row"><span>${l}</span><span>$${Math.round(parseFloat(v||0)).toLocaleString()}</span></div>`).join('')}
            <div class="row total"><span>GROSS INCOME</span><span>$${Math.round(t.grossIncome).toLocaleString()}</span></div>
            <h2>ADJUSTMENTS & DEDUCTIONS</h2>
            <div class="row"><span>Total Adjustments</span><span>-$${Math.round(t.adjustments).toLocaleString()}</span></div>
            <div class="row"><span>Adjusted Gross Income</span><span>$${Math.round(t.agi).toLocaleString()}</span></div>
            <div class="row"><span>${form.deductionType} Deduction</span><span>-$${Math.round(t.deductions).toLocaleString()}</span></div>
            <div class="row total"><span>TAXABLE INCOME</span><span>$${Math.round(t.taxableIncome).toLocaleString()}</span></div>
            <h2>TAX & CREDITS</h2>
            <div class="row"><span>Estimated Tax</span><span>$${Math.round(t.tax).toLocaleString()}</span></div>
            <div class="row"><span>Tax Credits</span><span>-$${Math.round(t.credits).toLocaleString()}</span></div>
            <div class="row total"><span>TAX AFTER CREDITS</span><span>$${Math.round(t.taxAfterCredits).toLocaleString()}</span></div>
            <h2>PAYMENTS</h2>
            <div class="row"><span>Withholding</span><span>$${Math.round(parseFloat(form.withholding||0)).toLocaleString()}</span></div>
            <div class="row"><span>Estimated Payments</span><span>$${Math.round(parseFloat(form.estimatedPayments||0)).toLocaleString()}</span></div>
            <div class="row total"><span>TOTAL PAYMENTS</span><span>$${Math.round(t.payments).toLocaleString()}</span></div>
            <br/>
            <div class="${t.refundOrOwed >= 0 ? 'refund' : 'owed'}">${t.refundOrOwed >= 0 ? '✓ ESTIMATED REFUND' : '⚠ BALANCE DUE'}: $${Math.round(Math.abs(t.refundOrOwed)).toLocaleString()}</div>
            <div class="footer">
              Prepared by ${preparer.name || 'Tax Case Review'} · PTIN: ${preparer.ptin || 'N/A'} · CAF#: ${preparer.caf || 'N/A'}<br/>
              This is a tax preparation worksheet. The final return must be submitted through IRS-approved e-file software using EFIN: ${preparer.efin || 'N/A'}.
            </div>
            </body></html>`)
          win.document.close()
          win.print()
        }
        return (
          <div>
            {/* Preparer info card */}
            <div className="card" style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--tx)', marginBottom: 12 }}>🪪 Preparer Credentials</div>
              <div className="form-grid2" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, maxWidth: 600 }}>
                <div className="field" style={{ margin: 0 }}><label>Preparer Name</label>
                  <input value={preparer.name} onChange={e => setPreparer(p => ({...p, name: e.target.value}))} placeholder="Your name" />
                </div>
                <div className="field" style={{ margin: 0 }}><label>PTIN</label>
                  <input value={preparer.ptin} onChange={e => setPreparer(p => ({...p, ptin: e.target.value}))} placeholder="P00000000" />
                </div>
                <div className="field" style={{ margin: 0 }}><label>CAF Number</label>
                  <input value={preparer.caf} onChange={e => setPreparer(p => ({...p, caf: e.target.value}))} placeholder="CAF number (for POA/transcripts)" />
                </div>
                <div className="field" style={{ margin: 0 }}><label>EFIN (e-file ID)</label>
                  <input value={preparer.efin} onChange={e => setPreparer(p => ({...p, efin: e.target.value}))} placeholder="6-digit EFIN" />
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 6 }}>
                💡 Save these in Settings → Firm Info to auto-populate on every return.
              </div>
            </div>

            {/* Return summary */}
            <div className="card" style={{ marginBottom: 14, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {[
                ['Client', form.clientName],
                ['Tax Year', form.taxYear],
                ['Type', form.returnType],
                ['Status', form.status],
                [t.refundOrOwed >= 0 ? 'Refund' : 'Balance Due', (t.refundOrOwed >= 0 ? '+' : '-') + '$' + Math.round(Math.abs(t.refundOrOwed)).toLocaleString()],
              ].map(([l, v]) => (
                <div key={l}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{l}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx)', marginTop: 2 }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Status workflow */}
            <div className="card" style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--tx)', marginBottom: 12 }}>📋 Filing Workflow</div>
              <div style={{ display: 'flex', gap: 0, overflowX: 'auto' }}>
                {['Draft','In Review','Client Review','Ready to File','Filed','Accepted'].map((s, i) => {
                  const statuses = ['Draft','In Review','Client Review','Ready to File','Filed','Accepted']
                  const idx = statuses.indexOf(form.status)
                  const done = i <= idx
                  return (
                    <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
                      <div onClick={() => fld('status', s)} style={{
                        padding: '6px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                        background: done ? 'var(--blue)' : 'var(--s2)',
                        color: done ? '#fff' : 'var(--t3)',
                        border: s === form.status ? '2px solid var(--blue)' : '2px solid transparent',
                        transition: 'all .15s'
                      }}>{s}</div>
                      {i < 5 && <div style={{ width: 14, height: 2, background: done && i < idx ? 'var(--blue)' : 'var(--br)', flexShrink: 0 }} />}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Export actions */}
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--tx)', marginBottom: 14 }}>📤 Export & Submit</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>

                <div style={{ padding: 16, borderRadius: 10, border: '1px solid var(--br)', background: 'var(--s2)' }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>🖨️</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx)', marginBottom: 4 }}>Print Return</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 12, lineHeight: 1.5 }}>Print a formatted return summary for client review and signature.</div>
                  <button className="btn pri" style={{ width: '100%', justifyContent: 'center' }} onClick={printReturn}>Print / Preview</button>
                </div>

                <div style={{ padding: 16, borderRadius: 10, border: '1px solid var(--br)', background: 'var(--s2)' }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>📄</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx)', marginBottom: 4 }}>IRS MeF XML Export</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 12, lineHeight: 1.5 }}>Generate MeF-compatible XML. Import into Drake, ProSeries, or Lacerte for final e-file submission.</div>
                  <button className="btn pri" style={{ width: '100%', justifyContent: 'center' }} onClick={() => {
                    const xml = generateMeFXML(form, t, preparer)
                    downloadFile(xml, `${form.clientName?.replace(/\s+/g,'_')}_${form.taxYear}_MeF.xml`, 'text/xml')
                  }}>⬇ Download XML</button>
                </div>

                <div style={{ padding: 16, borderRadius: 10, border: '1px solid var(--br)', background: 'var(--s2)' }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>📋</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx)', marginBottom: 4 }}>State Filing Export</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 12, lineHeight: 1.5 }}>Export a formatted state return worksheet with federal AGI carryover and preparer credentials.</div>
                  <button className="btn pri" style={{ width: '100%', justifyContent: 'center' }} onClick={() => {
                    const txt = generateStateExport(form, t, preparer)
                    downloadFile(txt, `${form.clientName?.replace(/\s+/g,'_')}_${form.taxYear}_State.txt`)
                  }}>⬇ Download State Export</button>
                </div>

                <div style={{ padding: 16, borderRadius: 10, border: '1px solid var(--br)', background: 'var(--s2)' }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>✅</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx)', marginBottom: 4 }}>Mark as Filed</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 12, lineHeight: 1.5 }}>After submitting through your e-file software, mark this return as filed and save.</div>
                  <button className="btn ok" style={{ width: '100%', justifyContent: 'center' }} onClick={async () => {
                    fld('status', 'Filed')
                    await supabase.from('tax_returns').update({ status: 'Filed', updated_at: new Date().toISOString() }).eq('id', current?.id)
                    showToast('✅ Return marked as Filed!')
                    load()
                  }} disabled={!current?.id}>Mark as Filed</button>
                </div>

              </div>

              <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(26,127,212,.1)', borderRadius: 8, border: '1px solid rgba(26,127,212,.3)', fontSize: 12, color: 'var(--t2)', lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--blue)' }}>📌 IRS E-File Requirement:</strong> Direct IRS MeF submission requires an approved EFIN (Electronic Filing Identification Number).
                Your PTIN ({preparer.ptin || 'not set'}) and CAF# ({preparer.caf || 'not set'}) are used for return preparation and IRS representation.
                Export the XML above and import it into your approved e-file software (Drake Tax, ProSeries, Lacerte, TaxSlayer Pro) for final submission.
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBMISSION HELPERS — appended to TaxReturns.jsx
// These are exported for use by the Submit tab rendered inside TaxReturns
// ─────────────────────────────────────────────────────────────────────────────

export function generateMeFXML(ret, totals, preparer) {
  const n = k => parseFloat(ret[k] || 0) || 0
  const ts = new Date().toISOString()
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- IRS MeF Compatible Export — Generated ${ts} -->
<!-- IMPORTANT: This XML is for review purposes. Submit via IRS-approved e-file software. -->
<Return xmlns="http://www.irs.gov/efile" returnVersion="2024v5.0">
  <ReturnHeader binaryAttachmentCount="0">
    <ReturnTs>${ts}</ReturnTs>
    <TaxYr>${ret.taxYear || '2024'}</TaxYr>
    <PreparerFirmGrp>
      <PreparerFirmName>
        <BusinessNameLine1Txt>Tax Case Review</BusinessNameLine1Txt>
      </PreparerFirmName>
      <PreparerFirmEIN>Applied For</PreparerFirmEIN>
    </PreparerFirmGrp>
    <PreparerPersonGrp>
      <PTIN>${preparer.ptin || 'P00000000'}</PTIN>
      <PreparerPersonNm>${preparer.name || ''}</PreparerPersonNm>
      <SelfEmployedInd>X</SelfEmployedInd>
    </PreparerPersonGrp>
    <ReturnTypeCd>1040</ReturnTypeCd>
    <FilingSecurityInformation>
      <AtSubmissionCreationGrp>
        <TotalPreparationSubmissionTs>${ts}</TotalPreparationSubmissionTs>
      </AtSubmissionCreationGrp>
    </FilingSecurityInformation>
    <Filer>
      <PrimarySSN>${ret.clientSSN ? ret.clientSSN.replace(/\D/g,'') : '000000000'}</PrimarySSN>
      <NameLine1Txt>${ret.clientName || ''}</NameLine1Txt>
      <USAddrGrp>
        <AddressLine1Txt>${ret.clientAddress || ''}</AddressLine1Txt>
        <CityNm>${ret.clientCity || ''}</CityNm>
        <StateAbbreviationCd>${ret.clientState || ''}</StateAbbreviationCd>
        <ZIPCd>${ret.clientZip || ''}</ZIPCd>
      </USAddrGrp>
    </Filer>
    <FilingStatus>
      <${ret.filingStatus === 'Single' ? 'SingleInd' :
         ret.filingStatus === 'Married Filing Jointly' ? 'MarriedFilingJointlyInd' :
         ret.filingStatus === 'Married Filing Separately' ? 'MarriedFilingSeparatelyInd' :
         ret.filingStatus === 'Head of Household' ? 'HeadOfHouseholdInd' : 'SingleInd'}/>X</${ret.filingStatus === 'Single' ? 'SingleInd' :
         ret.filingStatus === 'Married Filing Jointly' ? 'MarriedFilingJointlyInd' :
         ret.filingStatus === 'Married Filing Separately' ? 'MarriedFilingSeparatelyInd' :
         ret.filingStatus === 'Head of Household' ? 'HeadOfHouseholdInd' : 'SingleInd'}>
    </FilingStatus>
  </ReturnHeader>
  <ReturnData documentCnt="1">
    <IRS1040 documentId="IRS1040" referenceDocumentId="GeneralDep">
      <!-- LINE 1 — Wages -->
      <WagesAmt>${Math.round(n('wages'))}</WagesAmt>
      <!-- LINE 2b — Taxable Interest -->
      <TaxableInterestAmt>${Math.round(n('interest'))}</TaxableInterestAmt>
      <!-- LINE 3b — Ordinary Dividends -->
      <OrdinaryDividendsAmt>${Math.round(n('dividends'))}</OrdinaryDividendsAmt>
      <!-- LINE 4b — Retirement -->
      <TaxableIRAPensionAmt>${Math.round(n('retirementIncome'))}</TaxableIRAPensionAmt>
      <!-- LINE 5b — Social Security -->
      <TaxableSocSecBnftAmt>${Math.round(n('socialSecurity') * 0.85)}</TaxableSocSecBnftAmt>
      <!-- LINE 7 — Capital Gains -->
      <CapitalGainLossAmt>${Math.round(n('capitalGains'))}</CapitalGainLossAmt>
      <!-- LINE 8 — Other Income -->
      <OtherIncomeAmt>${Math.round(n('otherIncome') + n('businessIncome') + n('rentalIncome'))}</OtherIncomeAmt>
      <!-- LINE 9 — Total Income -->
      <TotalIncomeAmt>${Math.round(totals.grossIncome)}</TotalIncomeAmt>
      <!-- LINE 11 — AGI -->
      <AdjustedGrossIncomeAmt>${Math.round(totals.agi)}</AdjustedGrossIncomeAmt>
      <!-- LINE 12 — Standard/Itemized Deduction -->
      <TotalDeductionsAmt>${Math.round(totals.deductions)}</TotalDeductionsAmt>
      <!-- LINE 15 — Taxable Income -->
      <TaxableIncomeAmt>${Math.round(totals.taxableIncome)}</TaxableIncomeAmt>
      <!-- LINE 16 — Tax -->
      <TentativeTaxAmt>${Math.round(totals.tax)}</TentativeTaxAmt>
      <!-- LINE 19 — Child Tax Credit -->
      <ChildTaxCreditAmt>${Math.round(n('childTaxCredit'))}</ChildTaxCreditAmt>
      <!-- LINE 24 — Total Tax -->
      <TotalTaxAmt>${Math.round(totals.taxAfterCredits)}</TotalTaxAmt>
      <!-- LINE 25a — Withholding -->
      <WithholdingTaxAmt>${Math.round(n('withholding'))}</WithholdingTaxAmt>
      <!-- LINE 26 — Estimated Payments -->
      <EstimatedTaxPaymentsAmt>${Math.round(n('estimatedPayments'))}</EstimatedTaxPaymentsAmt>
      <!-- LINE 33 — Total Payments -->
      <TotalPaymentsAmt>${Math.round(totals.payments)}</TotalPaymentsAmt>
      ${totals.refundOrOwed >= 0
        ? `<!-- LINE 35a — Refund -->\n      <OverpaidAmt>${Math.round(totals.refundOrOwed)}</OverpaidAmt>\n      <RefundAmt>${Math.round(totals.refundOrOwed)}</RefundAmt>`
        : `<!-- LINE 37 — Amount Owed -->\n      <BalanceDueAmt>${Math.round(Math.abs(totals.refundOrOwed))}</BalanceDueAmt>`}
    </IRS1040>
  </ReturnData>
</Return>`
}

export function generateStateExport(ret, totals, preparer) {
  const n = k => parseFloat(ret[k] || 0) || 0
  return `STATE TAX RETURN EXPORT
===============================================================
Prepared by: ${preparer.name || 'Tax Case Review'}
CAF#: ${preparer.caf || ''}  PTIN: ${preparer.ptin || ''}
Generated: ${new Date().toLocaleString()}

TAXPAYER INFORMATION
---------------------------------------------------------------
Name:           ${ret.clientName || ''}
SSN:            ${ret.clientSSN || '***-**-****'}
Tax Year:       ${ret.taxYear || '2024'}
Filing Status:  ${ret.filingStatus || ''}
Return Type:    ${ret.returnType || ''}

FEDERAL AGI (carry-over to state):  $${Math.round(totals.agi).toLocaleString()}

INCOME SUMMARY
---------------------------------------------------------------
Wages & Salaries:         $${Math.round(n('wages')).toLocaleString()}
Interest Income:          $${Math.round(n('interest')).toLocaleString()}
Dividend Income:          $${Math.round(n('dividends')).toLocaleString()}
Capital Gains:            $${Math.round(n('capitalGains')).toLocaleString()}
Business Income:          $${Math.round(n('businessIncome')).toLocaleString()}
Rental Income:            $${Math.round(n('rentalIncome')).toLocaleString()}
Retirement Income:        $${Math.round(n('retirementIncome')).toLocaleString()}
Social Security:          $${Math.round(n('socialSecurity')).toLocaleString()}
Other Income:             $${Math.round(n('otherIncome')).toLocaleString()}
                          ─────────────
GROSS INCOME:             $${Math.round(totals.grossIncome).toLocaleString()}

ADJUSTMENTS
---------------------------------------------------------------
Total Adjustments:        -$${Math.round(totals.adjustments).toLocaleString()}
ADJUSTED GROSS INCOME:    $${Math.round(totals.agi).toLocaleString()}

DEDUCTIONS
---------------------------------------------------------------
Method: ${ret.deductionType}
Total Deductions:         -$${Math.round(totals.deductions).toLocaleString()}
TAXABLE INCOME:           $${Math.round(totals.taxableIncome).toLocaleString()}

TAX CALCULATION
---------------------------------------------------------------
Estimated Federal Tax:    $${Math.round(totals.tax).toLocaleString()}
Tax Credits:              -$${Math.round(totals.credits).toLocaleString()}
Tax After Credits:        $${Math.round(totals.taxAfterCredits).toLocaleString()}

PAYMENTS
---------------------------------------------------------------
Federal Withholding:      $${Math.round(n('withholding')).toLocaleString()}
Estimated Payments:       $${Math.round(n('estimatedPayments')).toLocaleString()}
Total Payments:           $${Math.round(totals.payments).toLocaleString()}

RESULT
---------------------------------------------------------------
${totals.refundOrOwed >= 0
  ? `ESTIMATED REFUND:         $${Math.round(totals.refundOrOwed).toLocaleString()}`
  : `BALANCE DUE:              $${Math.round(Math.abs(totals.refundOrOwed)).toLocaleString()}`}

===============================================================
PREPARER DECLARATION
I declare that this return was prepared by the following:
Name:  ${preparer.name || ''}
PTIN:  ${preparer.ptin || ''}
CAF#:  ${preparer.caf || ''}
Date:  ${new Date().toLocaleDateString()}
===============================================================
NOTE: This export is for review and state filing reference.
Submit to the IRS via IRS-approved e-file software (Drake,
ProSeries, Lacerte, etc.) using your EFIN after review.
===============================================================`
}

