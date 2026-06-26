import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { FINANCIAL_INTAKE_STEPS, shouldShow } from '../lib/financialIntakeSchema'
import { getStateTaxRate } from '../lib/stateTaxRates'

const LOGO_URL = 'https://mpxgxfqdbquzkrvvejkh.supabase.co/storage/v1/object/public/firm-assets/logo'

// Renders the submitted answers into an email-safe HTML block, mirroring
// the same step/question iteration FinancialIntakeView.jsx uses in the CRM
// (so what the client receives matches what staff sees) -- just as inline
// HTML strings instead of React, since this needs to go through send-email.
function fmtAnswerVal(v) {
  if (v === undefined || v === null || v === '') return null
  return v
}
function renderAnswersHtml(answers) {
  const sections = FINANCIAL_INTAKE_STEPS.filter(s => s.id !== 'intro' && s.id !== 'done').map(step => {
    const visibleQuestions = step.questions.filter(q => q.type !== 'info' && shouldShow(q, answers))
    const rows = []

    visibleQuestions.forEach(q => {
      if (q.type === 'entries') {
        const entries = answers[q.id] || []
        if (!entries.length) return
        entries.forEach((entry, i) => {
          const fieldRows = q.entryFields.map(f => {
            const v = fmtAnswerVal(entry[f.id])
            if (v === null) return ''
            return `<tr><td style="padding:3px 0;color:#64748b;font-size:12.5px;">${f.label}</td><td style="padding:3px 0;text-align:right;font-weight:600;font-size:12.5px;">${v}</td></tr>`
          }).filter(Boolean).join('')
          if (fieldRows) {
            rows.push(`<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin-bottom:8px;"><div style="font-size:11px;font-weight:700;color:#1d4ed8;text-transform:uppercase;margin-bottom:6px;">${q.label} — Entry ${i+1}</div><table style="width:100%;border-collapse:collapse;">${fieldRows}</table></div>`)
          }
        })
      } else {
        const v = fmtAnswerVal(answers[q.id])
        if (v === null) return
        rows.push(`<tr><td style="padding:5px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">${q.label}</td><td style="padding:5px 0;text-align:right;font-weight:600;font-size:13px;border-bottom:1px solid #f1f5f9;">${v}</td></tr>`)
      }
    })

    if (!rows.length) return ''
    const isEntryStyle = rows.some(r => r.startsWith('<div'))
    const body = isEntryStyle ? rows.join('') : `<table style="width:100%;border-collapse:collapse;">${rows.join('')}</table>`
    return `<div style="margin-bottom:20px;"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;margin-bottom:8px;padding-top:12px;border-top:1px solid #e2e8f0;">${step.title}</div>${body}</div>`
  }).filter(Boolean).join('')

  return sections
}

async function sendIntakeCopyEmail(record, answers) {
  if (!record?.client_email) return
  const answersHtml = renderAnswersHtml(answers)
  await supabase.functions.invoke('send-email', {
    body: {
      to: record.client_email,
      subject: `Your Financial Intake Submission — Tax Case Review`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px"><div style="text-align:center;margin-bottom:20px"><img src=\"https://mpxgxfqdbquzkrvvejkh.supabase.co/storage/v1/object/public/firm-assets/logo\" alt=\"Tax Case Review\" style=\"max-height:56px;max-width:190px;object-fit:contain;display:block;margin:0 auto 8px\" onerror=\"this.style.display='none'\"/><div style="font-size:12px;font-weight:800;color:#1d4ed8;letter-spacing:.1em;text-transform:uppercase;margin-top:6px">Tax Case Review</div></div><p>Dear <strong>${record.client_name||'Client'}</strong>,</p><p>Thank you for completing your financial intake form. Here's a copy of everything you submitted for your records:</p>${answersHtml}<p style="font-size:11px;color:#94a3b8;margin-top:24px">Tax Case Review · 631 US Highway One Ste 304, North Palm Beach, FL 33408</p></div>`
    }
  })
}

// Shared wizard engine for the Financial Intake — separate from OrganizerWizard
// (Tax Organizer is for return-prep, sent during filing season; this is the
// resolution-case financial breakdown, sent once when a lead becomes a client).
// Persists answers to `financial_intake_responses`, autosaving on every change.
export default function FinancialIntakeWizard({ intakeId, embedded = false, onComplete }) {
  const [record, setRecord] = useState(null)
  const [answers, setAnswers] = useState({})
  const [stepIdx, setStepIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [leadState, setLeadState] = useState(null) // for state tax auto-calc
  const saveTimer = useRef(null)

  useEffect(() => {
    async function load() {
      // First try direct lookup by intake record ID
      const { data, error } = await supabase.from('financial_intake_responses').select('*').eq('id', intakeId).maybeSingle()
      if (data && !error) {
        setRecord(data)
        setAnswers(data.answers || {})
        if (data.status === 'Submitted') setSubmitted(true)
        setLoading(false)
        // Load lead's state for state tax auto-calc
        if (data.client_name) {
          supabase.from('leads').select('state,irsOrState').eq('name', data.client_name).maybeSingle()
            .then(({ data: lead }) => { if (lead?.state) setLeadState(lead.state) })
        }
        return
      }
      // Fallback: the URL might contain a lead ID (old emails sent before fix).
      // Look up the lead by ID, then find or create their intake record by name.
      const { data: lead } = await supabase.from('leads').select('id,name,email').eq('id', intakeId).maybeSingle()
      if (lead) {
        const { data: existing } = await supabase.from('financial_intake_responses')
          .select('*').eq('client_name', lead.name).order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (existing) {
          setRecord(existing)
          setAnswers(existing.answers || {})
          if (existing.status === 'Submitted') setSubmitted(true)
          setLoading(false)
          return
        }
        // Create a fresh intake record for this lead
        const { data: created } = await supabase.from('financial_intake_responses').insert([{
          client_name: lead.name, client_email: lead.email || '', status: 'Sent',
          answers: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }]).select().single()
        if (created) {
          setRecord(created)
          setAnswers({})
          setLoading(false)
          return
        }
      }
      setError('Financial intake form not found or expired.')
      setLoading(false)
    }
    if (intakeId) load()
  }, [intakeId])

  function setAnswer(id, value) {
    setAnswers(prev => {
      const next = { ...prev, [id]: value }
      scheduleSave(next)
      return next
    })
  }

  function scheduleSave(next) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => doSave(next), 900)
  }

  async function doSave(next) {
    setSaving(true)
    await supabase.from('financial_intake_responses').update({
      answers: next,
      updated_at: new Date().toISOString(),
    }).eq('id', intakeId)
    setSaving(false)
  }

  function addEntry(questionId, fields) {
    const current = answers[questionId] || []
    const blank = {}
    fields.forEach(f => blank[f.id] = '')
    setAnswer(questionId, [...current, blank])
  }
  function updateEntry(questionId, idx, fieldId, value) {
    const current = [...(answers[questionId] || [])]
    current[idx] = { ...current[idx], [fieldId]: value }

    // Auto-calculate state tax when gross pay changes on an employment entry
    if (questionId === 'jobs_list' && fieldId === 'gross_monthly' && leadState) {
      const rate = getStateTaxRate(leadState)
      if (rate !== null && rate > 0 && !current[idx].state_withheld) {
        current[idx].state_withheld = Math.round(parseFloat(value || 0) * rate)
      }
    }

    setAnswer(questionId, current)
  }
  function removeEntry(questionId, idx) {
    const current = [...(answers[questionId] || [])]
    current.splice(idx, 1)
    setAnswer(questionId, current)
  }

  async function submit() {
    setSaving(true)
    await supabase.from('financial_intake_responses').update({
      answers, status: 'Submitted', submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', intakeId)

    // Sync core fields into the Lead record (same as before, unchanged).
    try {
      const { data: leadMatch } = await supabase.from('leads').select('id,dob,filingStatus,county').eq('name', record.client_name).maybeSingle()
      if (leadMatch) {
        const patch = {}
        if (!leadMatch.dob && answers.dob) patch.dob = answers.dob
        if (!leadMatch.filingStatus && answers.filing_status) {
          patch.filingStatus = answers.filing_status === 'Widowed' ? 'Qualifying Widow(er)' : answers.filing_status
        }
        if (!leadMatch.county && answers.county) patch.county = answers.county
        if (Object.keys(patch).length) await supabase.from('leads').update(patch).eq('id', leadMatch.id)
      }
    } catch (e) { console.error('Financial intake -> lead field sync error:', e) }

    // ── Comprehensive sync into client_financial_profiles ──────────────────
    // Maps all income, asset, expense, and debt answers into the structured
    // profile the tax associate will review on the Financial Profile tabs
    // (I&E, TO Intake, Assets & Equity). Non-destructive: upserts only --
    // if a profile row already exists and a field is already filled in by a
    // tax associate, we leave it alone and only fill blanks. This means a
    // rep who did a quick intake over the phone and typed some notes won't
    // get their work overwritten if the client later submits the wizard.
    try {
      const a = answers
      const n = v => parseFloat(v) || 0

      // Employment — wizard supports multiple jobs via `jobs_list` entries.
      // Map the first two taxpayer jobs and first two spouse jobs into the
      // four flat employment blocks the Financial Profile uses.
      const jobs = a.jobs_list || []
      const myJobs = jobs.filter(j => j.whose_job !== "My Spouse's")
      const spouseJobs = jobs.filter(j => j.whose_job === "My Spouse's")
      function mapJob(j) {
        if (!j) return {}
        return {
          employer: j.employer || '',
          position: j.position || '',
          length_employed: j.length_employed || '',
          pay_frequency: j.pay_frequency || '',
          gross_monthly_salary: n(j.gross_monthly), // profile uses gross_monthly_salary
          fed_withheld: n(j.fed_withheld),
          ss_med_withheld: n(j.ss_med_withheld),
          state_withheld: n(j.state_withheld),
        }
      }

      // Business — first two businesses from the wizard
      const businesses = a.business_list || []
      function mapBiz(b) {
        if (!b) return {}
        return {
          name: b.business_name || '',        // profile uses 'name' not 'business_name'
          ein: b.ein || '',
          structure: b.structure || '',
          pct_ownership: b.pct_ownership || '',
          num_employees: b.num_employees || '',
          net_income: n(b.net_income_monthly), // profile uses 'net_income' not 'net_income_monthly'
          current_941: b.current_941 || '',
          notes: b.notes || '',
        }
      }

      // Other income rows
      const otherIncome = (a.other_income_list || []).map(r => ({
        source: r.source || '',
        amount: n(r.monthly_amount),
      }))

      // Real estate rows
      const realEstate = (a.real_estate_list || []).map(r => ({
        address: r.address || '',
        property_type: r.property_type || '',
        estimated_value: n(r.estimated_value),
        mortgage_balance: n(r.mortgage_balance),
        monthly_payment: n(r.monthly_payment),
        rental_income: n(r.rental_income),
      }))

      // Vehicles rows
      const vehicles = (a.vehicles_list || []).map(v => ({
        make_model: v.make_model || '',
        estimated_value: n(v.estimated_value),
        remaining_balance: n(v.remaining_balance),
        monthly_payment: n(v.monthly_payment),
      }))

      // Financial assets (bank/retirement/insurance)
      const assets = (a.assets_list || []).map(asset => ({
        asset_type: asset.asset_type || '',
        description: asset.description || '',
        value: n(asset.value),
        loan_against: n(asset.loan_against),
      }))

      // Credit cards
      const creditCards = (a.credit_cards_list || []).map(c => ({
        card_name: c.card_name || '',
        balance: n(c.balance),
        credit_limit: n(c.credit_limit),
        min_payment: n(c.min_payment),
      }))

      // Expenses -- direct 1:1 from schema IDs to profile expense object
      const expenses = {
        food_clothing: n(a.food_clothing),
        housing: n(a.housing_payment),
        homeowners_renters_insurance: n(a.homeowners_renters_insurance),
        property_taxes: n(a.property_taxes),
        hoa_dues: n(a.hoa_dues),
        electricity: n(a.electricity),
        water_sewer_trash: n(a.water_sewer_trash),
        cell_phone: n(a.cell_phone),
        internet: n(a.internet),
        cable: n(a.cable),
        maintenance: n(a.maintenance),
        public_transportation: n(a.public_transportation),
        car_misc: n(a.car_misc),
        health_insurance: n(a.health_insurance),
        health_dental_vision: n(a.health_dental_vision),
        health_oop: n(a.health_oop),
        child_care: n(a.child_care),
        child_support: n(a.child_support),
        court_judgment: n(a.court_judgment),
        life_insurance: n(a.life_insurance),
        irs_installment: n(a.irs_installment),
        state_installment: n(a.state_installment),
      }

      // Other secured debt summary
      const otherSecuredDebt = a.has_other_debt === 'Yes' ? {
        monthly_payment: n(a.other_debt_payment),
        remaining_balance: n(a.other_debt_balance),
      } : {}

      const profileData = {
        client_name: record.client_name,
        // Household/basic fields
        dob: a.dob || null,
        county: a.county || '',
        filing_status: a.filing_status || '',
        household_under_65: n(a.household_under_65),
        household_over_65: n(a.household_over_65),
        tax_years_not_filed: a.tax_years_not_filed || '',
        has_lived_other_states: a.lived_other_states || '',
        other_states_notes: a.other_states_notes || '',
        // Employment
        employment_taxpayer_1: myJobs[0] ? mapJob(myJobs[0]) : undefined,
        employment_taxpayer_2: myJobs[1] ? mapJob(myJobs[1]) : undefined,
        employment_spouse_1: spouseJobs[0] ? mapJob(spouseJobs[0]) : undefined,
        employment_spouse_2: spouseJobs[1] ? mapJob(spouseJobs[1]) : undefined,
        // Business
        business_1: businesses[0] ? mapBiz(businesses[0]) : undefined,
        business_2: businesses[1] ? mapBiz(businesses[1]) : undefined,
        // Other income, real estate, vehicles, assets
        other_income: otherIncome.length ? otherIncome : undefined,
        real_estate: realEstate.length ? realEstate : undefined,
        vehicles: vehicles.length ? vehicles : undefined,
        assets: assets.length ? assets : undefined,
        cash_on_hand: n(a.cash_on_hand),
        // Debts
        credit_cards: creditCards.length ? creditCards : undefined,
        other_secured_debt: Object.keys(otherSecuredDebt).length ? otherSecuredDebt : undefined,
        // Monthly expenses
        expenses,
        updated_at: new Date().toISOString(),
      }

      // Strip undefined values -- only upsert fields the intake actually
      // collected so we don't accidentally zero out a field the tax associate
      // typed in manually just because this intake question was optional and
      // left blank.
      const cleanProfile = Object.fromEntries(
        Object.entries(profileData).filter(([, v]) => v !== undefined)
      )

      // Upsert by client_name -- inserts if no profile exists yet, updates
      // (non-destructively by PostgreSQL's ON CONFLICT behavior) if one does.
      await supabase.from('client_financial_profiles').upsert(cleanProfile, {
        onConflict: 'client_name',
        ignoreDuplicates: false,
      })
    } catch (e) { console.error('Financial intake -> financial profile sync error:', e) }

    // Email a full copy of the submitted answers to the client.
    try { await sendIntakeCopyEmail(record, answers) } catch (e) { console.error('Financial intake copy email error:', e) }
    setSaving(false)
    setSubmitted(true)
    if (onComplete) onComplete()
  }

  if (loading) return <div style={S.center}>Loading…</div>
  if (error) return <div style={S.center}>{error}</div>

  if (submitted) return (
    <div style={S.card}>
      <div style={{textAlign:'center', padding:'32px 16px'}}>
        <div style={{fontSize:48, marginBottom:12}}>✅</div>
        <div style={{fontSize:19, fontWeight:800, color:'#4ade80', marginBottom:8}}>Submitted — Thank You!</div>
        <div style={{color:'#94a3b8', fontSize:13.5, lineHeight:1.7}}>
          Thank you{record?.client_name ? `, ${record.client_name}` : ''}. Your financial information has been sent to Tax Case Review, and your advisor will be reaching out soon.
          {!embedded && ' You may close this window.'}
        </div>
      </div>
    </div>
  )

  const visibleSteps = FINANCIAL_INTAKE_STEPS
  const step = visibleSteps[stepIdx]
  const visibleQuestions = step.questions.filter(q => shouldShow(q, answers))
  const isLast = stepIdx === visibleSteps.length - 1
  const isFirst = stepIdx === 0
  const progressPct = Math.round(((stepIdx + 1) / visibleSteps.length) * 100)

  return (
    <div style={S.card}>
      {!embedded && (
        <div style={{textAlign:'center', marginBottom:18}}>
          <img src={LOGO_URL} style={{height:42, marginBottom:8}} onError={e=>e.target.style.display='none'}/>
          <div style={{fontSize:11, fontWeight:800, color:'#60a5fa', letterSpacing:'.1em', textTransform:'uppercase'}}>Tax Case Review</div>
          <div style={{fontSize:11, color:'#64748b'}}>Financial Intake</div>
        </div>
      )}

      {/* Progress bar */}
      <div style={{marginBottom:18}}>
        <div style={{display:'flex', justifyContent:'space-between', fontSize:11, color:'#64748b', marginBottom:6}}>
          <span>Step {stepIdx+1} of {visibleSteps.length}</span>
          <span>{saving ? 'Saving…' : 'Saved'}</span>
        </div>
        <div style={{height:6, background:'#1e293b', borderRadius:3, overflow:'hidden'}}>
          <div style={{height:'100%', width:`${progressPct}%`, background:'#3b82f6', transition:'width .3s'}}/>
        </div>
      </div>

      <div style={{fontSize:18, fontWeight:800, color:'#f1f5f9', marginBottom:16}}>{step.title}</div>

      <div>
        {visibleQuestions.map(q => (
          <Question key={q.id} q={q} answers={answers} setAnswer={setAnswer}
            addEntry={addEntry} updateEntry={updateEntry} removeEntry={removeEntry}/>
        ))}
      </div>

      <div style={{display:'flex', gap:10, marginTop:24}}>
        {!isFirst && (
          <button onClick={()=>setStepIdx(i=>i-1)} style={S.btnSecondary}>← Back</button>
        )}
        {!isLast ? (
          <button onClick={()=>setStepIdx(i=>i+1)} style={S.btnPrimary}>Next →</button>
        ) : (
          <button onClick={submit} disabled={saving} style={S.btnSubmit}>{saving ? 'Submitting…' : 'Submit'}</button>
        )}
      </div>
    </div>
  )
}

function Question({ q, answers, setAnswer, addEntry, updateEntry, removeEntry }) {
  const val = answers[q.id]

  if (q.type === 'info') {
    return <div style={{...S.docBody, whiteSpace:'pre-wrap'}}>{q.text}</div>
  }

  return (
    <div style={{marginBottom:18}}>
      <label style={S.label}>{q.label}{q.optional && <span style={{color:'#64748b', fontWeight:400}}> (optional)</span>}</label>

      {q.type === 'yesno' && (
        <div style={{display:'flex', gap:10}}>
          {['Yes','No'].map(opt => (
            <button key={opt} onClick={()=>setAnswer(q.id, opt)} style={val===opt ? S.toggleActive : S.toggle}>{opt}</button>
          ))}
        </div>
      )}

      {q.type === 'select' && (
        <select value={val||''} onChange={e=>setAnswer(q.id, e.target.value)} style={S.input}>
          <option value="">— Select —</option>
          {q.options.map(o=><option key={o} value={o}>{o}</option>)}
        </select>
      )}

      {q.type === 'text' && (
        <input type="text" value={val||''} onChange={e=>setAnswer(q.id, e.target.value)} placeholder={q.placeholder||''} style={S.input}/>
      )}

      {q.type === 'textarea' && (
        <textarea value={val||''} onChange={e=>setAnswer(q.id, e.target.value)} style={{...S.input, minHeight:80, resize:'vertical'}}/>
      )}

      {q.type === 'number' && (
        <input type="number" value={val||''} onChange={e=>setAnswer(q.id, e.target.value)} style={S.input}/>
      )}

      {q.type === 'date' && (
        <input type="date" value={val||''} onChange={e=>setAnswer(q.id, e.target.value)} style={S.input}/>
      )}

      {q.type === 'entries' && (
        <div>
          {(val||[]).map((entry, idx) => (
            <div key={idx} style={{background:'#0a1628', border:'1px solid #1e3a5f', borderRadius:8, padding:14, marginBottom:10}}>
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:8}}>
                <div style={{fontSize:11, fontWeight:700, color:'#60a5fa', textTransform:'uppercase'}}>Entry #{idx+1}</div>
                <button onClick={()=>removeEntry(q.id, idx)} style={{...S.linkBtn, color:'#f87171'}}>Remove</button>
              </div>
              {q.entryFields.map(f => (
                <div key={f.id} style={{marginBottom:8}}>
                  <div style={{fontSize:11, color:'#94a3b8', marginBottom:3}}>{f.label}{f.optional && ' (optional)'}</div>
                  {f.type === 'select' ? (
                    <select value={entry[f.id]||''} onChange={e=>updateEntry(q.id, idx, f.id, e.target.value)} style={S.inputSm}>
                      <option value="">— Select —</option>
                      {f.options.map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : f.type === 'yesno' ? (
                    <div style={{display:'flex', gap:8}}>
                      {['Yes','No'].map(opt=>(
                        <button key={opt} onClick={()=>updateEntry(q.id, idx, f.id, opt)}
                          style={entry[f.id]===opt ? {...S.toggleActive, padding:'4px 14px', fontSize:12} : {...S.toggle, padding:'4px 14px', fontSize:12}}>{opt}</button>
                      ))}
                    </div>
                  ) : (
                    <>
                      <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} placeholder={f.placeholder||''}
                        value={entry[f.id]||''} onChange={e=>updateEntry(q.id, idx, f.id, e.target.value)} style={S.inputSm}/>
                      {f.id === 'state_withheld' && leadState && getStateTaxRate(leadState) !== null && (
                        <div style={{fontSize:10, color:'#60a5fa', marginTop:3}}>
                          Auto-estimated from {leadState} state tax rate ({Math.round((getStateTaxRate(leadState)||0)*100)}%). You can override this.
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
          <button onClick={()=>addEntry(q.id, q.entryFields)} style={S.btnAdd}>+ Add Entry</button>
        </div>
      )}
    </div>
  )
}

const S = {
  center: { display:'flex', alignItems:'center', justifyContent:'center', minHeight:300, color:'#64748b', fontSize:13 },
  card: { background:'#0f172a', border:'1px solid #1e293b', borderRadius:14, padding:'24px 22px', maxWidth:560, margin:'0 auto', width:'100%' },
  label: { display:'block', fontSize:13, fontWeight:700, color:'#e2e8f0', marginBottom:8 },
  input: { width:'100%', padding:'10px 12px', background:'#0a1628', border:'1px solid #1e3a5f', borderRadius:8, color:'#f1f5f9', fontSize:13.5, boxSizing:'border-box' },
  inputSm: { width:'100%', padding:'7px 10px', background:'#0a1628', border:'1px solid #1e3a5f', borderRadius:6, color:'#f1f5f9', fontSize:12.5, boxSizing:'border-box' },
  toggle: { padding:'8px 22px', borderRadius:7, border:'1px solid #334155', background:'#0a1628', color:'#94a3b8', fontSize:13, fontWeight:600, cursor:'pointer' },
  toggleActive: { padding:'8px 22px', borderRadius:7, border:'1px solid #3b82f6', background:'#1d4ed8', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' },
  btnPrimary: { flex:1, padding:'13px', background:'#1d4ed8', color:'#fff', border:'none', borderRadius:9, fontSize:14, fontWeight:700, cursor:'pointer' },
  btnSecondary: { padding:'13px 20px', background:'transparent', color:'#94a3b8', border:'1px solid #334155', borderRadius:9, fontSize:14, fontWeight:600, cursor:'pointer' },
  btnSubmit: { flex:1, padding:'13px', background:'#16a34a', color:'#fff', border:'none', borderRadius:9, fontSize:14, fontWeight:700, cursor:'pointer' },
  btnAdd: { padding:'8px 16px', background:'transparent', border:'1px dashed #3b82f6', color:'#60a5fa', borderRadius:7, fontSize:12.5, fontWeight:600, cursor:'pointer' },
  linkBtn: { background:'none', border:'none', color:'#64748b', fontSize:11.5, cursor:'pointer', textDecoration:'underline', padding:0 },
  docBody: { background:'#0a1628', border:'1px solid #1e3a5f', borderRadius:9, padding:16, fontSize:13, lineHeight:1.7, color:'#cbd5e1' },
}
