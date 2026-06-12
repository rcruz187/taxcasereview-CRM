import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const PAY_METHODS = ['Direct Deposit','Check','Cash']

// Parse "4:29 PM" or "16:29" → decimal hours from midnight
function parseTimeToMins(t) {
  if (!t) return null
  t = t.trim()
  const ampm = t.match(/(\d+):(\d+)\s*(AM|PM)/i)
  if (ampm) {
    let h = parseInt(ampm[1]), m = parseInt(ampm[2])
    const p = ampm[3].toUpperCase()
    if (p==='PM' && h!==12) h += 12
    if (p==='AM' && h===12) h = 0
    return h*60+m
  }
  const plain = t.match(/^(\d+):(\d+)$/)
  if (plain) return parseInt(plain[1])*60+parseInt(plain[2])
  return null
}
function hoursFromEntry(e) {
  if (e.hours && parseFloat(e.hours) > 0) return parseFloat(e.hours)
  const inM = parseTimeToMins(e.inTime), outM = parseTimeToMins(e.outTime)
  if (inM===null || outM===null) return 0
  let diffMins = outM - inM
  if (diffMins <= 0) diffMins += 24 * 60  // overnight shift: clock-out is next day
  return diffMins / 60
}

function buildLineItems(employees, timeEntries, periodStart, periodEnd) {
  return employees.map(emp => {
    // Filter time entries for this employee within the date range
    const empEntries = timeEntries.filter(t => {
      if ((t.employee||'').trim().toLowerCase() !== (emp.name||'').trim().toLowerCase()) return false
      if (!t.date) return false
      if (periodStart && t.date < periodStart) return false
      if (periodEnd   && t.date > periodEnd)   return false
      return true
    })
    const hrs = empEntries.reduce((s,t) => s + hoursFromEntry(t), 0)

    const isHourly = emp.payType === 'Hourly'
    const rate = parseFloat(emp.hourlyRate||0)
    const salary = parseFloat(emp.salary||0)
    const gross = isHourly ? rate * hrs : (salary / 24) || 0

    const fedTax    = gross * 0.22
    const stateTax  = gross * 0.06
    const ss        = gross * 0.062
    const medicare  = gross * 0.0145
    const totalTaxes = fedTax + stateTax + ss + medicare
    const net = Math.max(0, gross - totalTaxes)

    return {
      name: emp.name, payType: emp.payType||'Salary', rate,
      hours: hrs.toFixed(2),
      gross: gross.toFixed(2), fedTax: fedTax.toFixed(2),
      stateTax: stateTax.toFixed(2), ss: ss.toFixed(2),
      medicare: medicare.toFixed(2), totalTaxes: totalTaxes.toFixed(2),
      net: net.toFixed(2), payMethod: emp.paymentMethod||'Direct Deposit',
      entryCount: empEntries.length
    }
  })
}

export default function Payroll() {
  const [runs,       setRuns]       = useState([])
  const [employees,  setEmployees]  = useState([])
  const [timeEntries,setTimeEntries]= useState([])
  const [modal,      setModal]      = useState(false)
  const [detailId,   setDetailId]   = useState(null)
  const [saving,     setSaving]     = useState(false)
  const [toast,      setToast]      = useState('')
  const [search,     setSearch]     = useState('')

  // Pay period form state
  const today = new Date()
  const [periodLabel, setPeriodLabel] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd,   setPeriodEnd]   = useState('')
  const [payDate,     setPayDate]     = useState('')
  const [notes,       setNotes]       = useState('')
  const [lineItems,   setLineItems]   = useState([])

  useEffect(() => {
    load()
    // Auto-sync with TimeClock every 30 seconds
    const interval = setInterval(() => {
      supabase.from('timeentries').select('*').then(({ data }) => {
        if (data) setTimeEntries(data)
      })
    }, 30000)
    const empInterval = setInterval(() => {
      supabase.from('employees').select('*').order('name').then(({ data }) => {
        if (data) setEmployees(data)
      })
    }, 30000)
    return () => { clearInterval(interval); clearInterval(empInterval) }
  }, [])

  async function load() {
    const [{ data:r },{ data:e },{ data:t }] = await Promise.all([
      supabase.from('payrollruns').select('*').order('created_at',{ascending:false}),
      supabase.from('employees').select('*').order('name'),
      supabase.from('timeentries').select('*'),
    ])
    if (r) setRuns(r)
    if (e) setEmployees(e)
    if (t) setTimeEntries(t)
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3000) }

  function openNewRun() {
    // Default: current semi-monthly period
    const d = today
    const isFirstHalf = d.getDate() <= 15
    const start = new Date(d.getFullYear(), d.getMonth(), isFirstHalf ? 1 : 16)
    const end   = new Date(d.getFullYear(), d.getMonth(), isFirstHalf ? 15 : new Date(d.getFullYear(), d.getMonth()+1,0).getDate())
    const fmtD  = dt => dt.toISOString().slice(0,10)
    const label = `${start.toLocaleString('default',{month:'long'})} ${start.getDate()}–${end.getDate()}, ${d.getFullYear()}`

    setPeriodLabel(label)
    setPeriodStart(fmtD(start))
    setPeriodEnd(fmtD(end))
    setPayDate(fmtD(new Date(end.getTime() + 2*24*60*60*1000)))
    setNotes('')
    setLineItems(buildLineItems(employees, timeEntries, fmtD(start), fmtD(end)))
    setModal(true)
  }

  // Recompute line items when date range changes
  function onRangeChange(start, end) {
    if (start && end) setLineItems(buildLineItems(employees, timeEntries, start, end))
  }

  // Keep the open "Process Payroll" modal in sync with live TimeClock + employee data
  useEffect(() => {
    if (modal && periodStart && periodEnd) {
      setLineItems(buildLineItems(employees, timeEntries, periodStart, periodEnd))
    }
  }, [timeEntries, employees])

  function updateLine(i, k, v) {
    setLineItems(lines => lines.map((l,idx) => {
      if (idx!==i) return l
      const u = {...l, [k]:v}
      if (['gross','fedTax','stateTax','ss','medicare'].includes(k)) {
        const g=parseFloat(u.gross||0), ft=parseFloat(u.fedTax||0), st=parseFloat(u.stateTax||0), s=parseFloat(u.ss||0), m=parseFloat(u.medicare||0)
        const tt=ft+st+s+m; u.totalTaxes=tt.toFixed(2); u.net=Math.max(0,g-tt).toFixed(2)
      }
      if (k==='hours' && l.payType==='Hourly') {
        const g=parseFloat(l.rate||0)*parseFloat(v||0)
        const ft=g*0.22, st=g*0.06, ss=g*0.062, med=g*0.0145, tt=ft+st+ss+med
        u.gross=g.toFixed(2); u.fedTax=ft.toFixed(2); u.stateTax=st.toFixed(2)
        u.ss=ss.toFixed(2); u.medicare=med.toFixed(2); u.totalTaxes=tt.toFixed(2); u.net=Math.max(0,g-tt).toFixed(2)
      }
      return u
    }))
  }

  async function saveRun() {
    if (!periodLabel) { showToast('Pay period required'); return }
    setSaving(true)
    const grossPay   = lineItems.reduce((s,l)=>s+parseFloat(l.gross||0),0)
    const totalTaxes = lineItems.reduce((s,l)=>s+parseFloat(l.totalTaxes||0),0)
    const netPay     = lineItems.reduce((s,l)=>s+parseFloat(l.net||0),0)
    const { error } = await supabase.from('payrollruns').insert([{
      period: periodLabel, payDate, notes,
      grossPay: grossPay.toFixed(2), totalTaxes: totalTaxes.toFixed(2),
      netPay: netPay.toFixed(2), numEmployees: lineItems.length,
      status: 'Completed', lineItems: JSON.stringify(lineItems),
      created_at: new Date().toISOString()
    }])
    setSaving(false)
    if (error) { showToast('Error: '+error.message); return }
    showToast('✅ Payroll run saved!')
    setModal(false); load()
  }

  async function del(id) {
    if (!confirm('Delete this payroll run?')) return
    await supabase.from('payrollruns').delete().eq('id',id)
    showToast('Deleted'); load()
  }

  const totalNet   = runs.reduce((s,r)=>s+parseFloat(r.netPay||0),0)
  const totalGross = runs.reduce((s,r)=>s+parseFloat(r.grossPay||0),0)
  const ytdGross   = runs.filter(r=>r.payDate?.startsWith(today.getFullYear().toString())).reduce((s,r)=>s+parseFloat(r.grossPay||0),0)
  const filtered   = runs.filter(r=>!search || r.period?.toLowerCase().includes(search.toLowerCase()))
  const detail     = detailId ? runs.find(r=>r.id===detailId) : null
  let detailLines  = []
  if (detail?.lineItems) { try { detailLines = JSON.parse(detail.lineItems) } catch {} }

  // YTD per employee across all runs
  const ytdByEmp = {}
  runs.forEach(r => {
    let lines = []; try { lines = JSON.parse(r.lineItems||'[]') } catch {}
    lines.forEach(l => {
      if (!ytdByEmp[l.name]) ytdByEmp[l.name] = {gross:0,net:0}
      ytdByEmp[l.name].gross += parseFloat(l.gross||0)
      ytdByEmp[l.name].net   += parseFloat(l.net||0)
    })
  })

  const empNames = employees.length>0 ? employees.map(e=>e.name) : ['Romy Cruz','Dana Richard','Yesenia Gonzalez']

  return (
    <div>
      {toast && <div className="toast show">{toast}</div>}

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:8 }}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <h2 style={{ fontSize:15, fontWeight:700, margin:0 }}>💼 Payroll</h2>
          <button className="btn sec" style={{fontSize:11,padding:'4px 10px'}} onClick={async()=>{
            const [{data:t},{data:e}] = await Promise.all([
              supabase.from('timeentries').select('*'),
              supabase.from('employees').select('*').order('name'),
            ])
            if(t) setTimeEntries(t)
            if(e) setEmployees(e)
            showToast('✅ Synced with Time Clock')
          }}>⟳ Sync Time Clock</button>
        </div>
        <button className="btn pri" onClick={openNewRun} disabled={employees.length===0}>
          {employees.length===0 ? 'Add Employees First' : '+ Process Payroll'}
        </button>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:8, marginBottom:14 }}>
        {[
          ['Total Net Paid', '$'+Math.round(totalNet).toLocaleString(), 'var(--ok)'],
          ['Total Gross',    '$'+Math.round(totalGross).toLocaleString(), 'var(--b2c)'],
          ['YTD Gross',      '$'+Math.round(ytdGross).toLocaleString(), 'var(--warn)'],
          ['Payroll Runs',   runs.length, 'var(--tx)'],
        ].map(([l,v,c]) => (
          <div key={l} className="card" style={{ padding:'12px 14px' }}>
            <div style={{ fontWeight:800, fontSize:18, color:c }}>{v}</div>
            <div style={{ fontSize:10, color:'var(--t3)', marginTop:3, textTransform:'uppercase', letterSpacing:'.05em' }}>{l}</div>
          </div>
        ))}
      </div>

      {/* YTD per employee */}
      <div className="card" style={{ marginBottom:14, padding:'12px 16px' }}>
        <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'var(--t3)', marginBottom:10 }}>YTD by Employee</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:10 }}>
          {empNames.map(name => {
            const y = ytdByEmp[name] || {gross:0,net:0}
            // Hours from time entries this year
            const yHrs = timeEntries.filter(t=>t.employee===name&&t.date?.startsWith(today.getFullYear().toString())).reduce((s,t)=>s+hoursFromEntry(t),0)
            return (
              <div key={name} style={{ background:'var(--s2)', borderRadius:8, padding:'10px 12px', border:'1px solid var(--br)' }}>
                <div style={{ fontWeight:700, fontSize:13, marginBottom:6 }}>{name}</div>
                <div style={{ display:'flex', gap:12, fontSize:12 }}>
                  <span style={{ color:'var(--t3)' }}>Gross: <span style={{ color:'var(--b2c)', fontWeight:700 }}>${Math.round(y.gross).toLocaleString()}</span></span>
                  <span style={{ color:'var(--t3)' }}>Net: <span style={{ color:'var(--ok)', fontWeight:700 }}>${Math.round(y.net).toLocaleString()}</span></span>
                </div>
                <div style={{ fontSize:11, color:'var(--t3)', marginTop:4 }}>
                  {yHrs.toFixed(1)}h logged this year
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Runs list */}
      <div style={{ display:'flex', gap:8, marginBottom:10, alignItems:'center' }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search pay periods…"
          style={{ flex:1, padding:'7px 12px', background:'var(--s2)', border:'1px solid var(--br)', borderRadius:6, color:'var(--tx)', fontSize:12 }}/>
      </div>

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        {filtered.length===0 ? (
          <div style={{ padding:24, textAlign:'center', color:'var(--t3)', fontSize:13 }}>No payroll runs yet.</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--br)', background:'var(--s2)' }}>
                {['Pay Period','Pay Date','Gross','Taxes','Net Pay','Employees','Status',''].map(h=>(
                  <th key={h} style={{ padding:'9px 12px', textAlign:'left', fontSize:10, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <>
                  <tr key={r.id} style={{ borderBottom:'1px solid var(--br)', background:detailId===r.id?'var(--s2)':'' }}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--s2)'}
                    onMouseLeave={e=>e.currentTarget.style.background=detailId===r.id?'var(--s2)':''}>
                    <td style={{ padding:'9px 12px', fontWeight:700 }} onClick={()=>setDetailId(detailId===r.id?null:r.id)}>{r.period}</td>
                    <td style={{ padding:'9px 12px', color:'var(--t2)' }}>{r.payDate||'—'}</td>
                    <td style={{ padding:'9px 12px', fontWeight:600 }}>${parseFloat(r.grossPay||0).toLocaleString()}</td>
                    <td style={{ padding:'9px 12px', color:'var(--bad)' }}>${parseFloat(r.totalTaxes||0).toLocaleString()}</td>
                    <td style={{ padding:'9px 12px', fontWeight:700, color:'var(--ok)', fontSize:13 }}>${parseFloat(r.netPay||0).toLocaleString()}</td>
                    <td style={{ padding:'9px 12px' }}>{r.numEmployees}</td>
                    <td style={{ padding:'9px 12px' }}><span className={`bdg ${r.status==='Completed'?'bg':'ba'}`}>{r.status}</span></td>
                    <td style={{ padding:'9px 12px' }}>
                      <div style={{ display:'flex', gap:5 }}>
                        <button className="btn sec" style={{ fontSize:10, padding:'3px 8px' }} onClick={()=>setDetailId(detailId===r.id?null:r.id)}>{detailId===r.id?'▲':'▼'} Detail</button>
                        <button className="btn del" style={{ fontSize:10, padding:'3px 8px' }} onClick={()=>del(r.id)}>Del</button>
                      </div>
                    </td>
                  </tr>
                  {detailId===r.id && detailLines.length>0 && (
                    <tr key={r.id+'d'}>
                      <td colSpan={8} style={{ padding:0, background:'var(--s3)' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                          <thead>
                            <tr style={{ borderBottom:'1px solid var(--br)' }}>
                              {['Employee','Type','Hours','Gross','Fed Tax','State Tax','SS','Medicare','Total Tax','Net Pay','Method'].map(h=>(
                                <th key={h} style={{ padding:'6px 10px', textAlign:'left', color:'var(--t3)', fontWeight:600, fontSize:10 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {detailLines.map((l,i)=>(
                              <tr key={i} style={{ borderBottom:'1px solid var(--br)' }}>
                                <td style={{ padding:'6px 10px', fontWeight:600 }}>{l.name}</td>
                                <td style={{ padding:'6px 10px', color:'var(--t2)' }}>{l.payType}</td>
                                <td style={{ padding:'6px 10px' }}>{l.hours||'—'}h</td>
                                <td style={{ padding:'6px 10px', fontWeight:700 }}>${parseFloat(l.gross||0).toLocaleString()}</td>
                                <td style={{ padding:'6px 10px', color:'var(--bad)' }}>${parseFloat(l.fedTax||0).toFixed(2)}</td>
                                <td style={{ padding:'6px 10px', color:'var(--bad)' }}>${parseFloat(l.stateTax||0).toFixed(2)}</td>
                                <td style={{ padding:'6px 10px', color:'var(--bad)' }}>${parseFloat(l.ss||0).toFixed(2)}</td>
                                <td style={{ padding:'6px 10px', color:'var(--bad)' }}>${parseFloat(l.medicare||0).toFixed(2)}</td>
                                <td style={{ padding:'6px 10px', color:'var(--bad)', fontWeight:600 }}>${parseFloat(l.totalTaxes||0).toFixed(2)}</td>
                                <td style={{ padding:'6px 10px', fontWeight:700, color:'var(--ok)' }}>${parseFloat(l.net||0).toLocaleString()}</td>
                                <td style={{ padding:'6px 10px', color:'var(--t2)' }}>{l.payMethod||'—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New Run Modal */}
      {modal && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal" style={{ width:920, maxWidth:'96vw' }}>
            <div className="mh">
              <span className="mt">Process Payroll</span>
              <button className="xbtn" onClick={()=>setModal(false)}>&times;</button>
            </div>

            {/* Period setup */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10, marginBottom:14 }}>
              <div className="field" style={{ margin:0 }}>
                <label>Pay Period Label *</label>
                <input value={periodLabel} onChange={e=>setPeriodLabel(e.target.value)} placeholder="e.g. June 1–15, 2025"/>
              </div>
              <div className="field" style={{ margin:0 }}>
                <label>Period Start</label>
                <input type="date" value={periodStart} onChange={e=>{ setPeriodStart(e.target.value); onRangeChange(e.target.value, periodEnd) }}/>
              </div>
              <div className="field" style={{ margin:0 }}>
                <label>Period End</label>
                <input type="date" value={periodEnd} onChange={e=>{ setPeriodEnd(e.target.value); onRangeChange(periodStart, e.target.value) }}/>
              </div>
              <div className="field" style={{ margin:0 }}>
                <label>Pay Date</label>
                <input type="date" value={payDate} onChange={e=>setPayDate(e.target.value)}/>
              </div>
            </div>

            {/* Hours pulled notice */}
            {periodStart && periodEnd && (
              <div style={{ background:'rgba(26,127,212,.08)', border:'1px solid rgba(26,127,212,.25)', borderRadius:8, padding:'8px 14px', marginBottom:12, fontSize:12, color:'var(--t2)' }}>
                📊 Hours auto-loaded from time entries between <strong>{periodStart}</strong> and <strong>{periodEnd}</strong>.
                Adjust the date range above to recalculate, or edit hours/gross directly in the table.
              </div>
            )}

            {/* Line items table */}
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'var(--t3)', marginBottom:8 }}>Employee Pay</div>
            <div style={{ overflowX:'auto', marginBottom:12 }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, minWidth:820 }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--br)', background:'var(--s3)' }}>
                    {['Employee','Type','Hours Pulled','Gross ($)','Fed Tax','State Tax','SS','Medicare','Net Pay','Method'].map(h=>(
                      <th key={h} style={{ padding:'6px 8px', textAlign:'left', color:'var(--t3)', fontWeight:600, fontSize:10 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((l,i)=>(
                    <tr key={i} style={{ borderBottom:'1px solid var(--br)' }}>
                      <td style={{ padding:'6px 8px', fontWeight:600, fontSize:12 }}>
                        {l.name}
                        {l.entryCount > 0 && <span style={{ fontSize:9, color:'var(--ok)', marginLeft:5 }}>({l.entryCount} punches)</span>}
                      </td>
                      <td style={{ padding:'6px 8px' }}><span className="bdg bn" style={{ fontSize:9 }}>{l.payType}</span></td>
                      <td style={{ padding:'4px 8px' }}>
                        <input type="number" step="0.5" value={l.hours} onChange={e=>updateLine(i,'hours',e.target.value)}
                          style={{ width:65, padding:'3px 6px', fontSize:11, background:'var(--s2)', border:'1px solid var(--br)', borderRadius:4, color:'var(--tx)' }}/>
                      </td>
                      <td style={{ padding:'4px 8px' }}>
                        <input type="number" step="0.01" value={l.gross} onChange={e=>updateLine(i,'gross',e.target.value)}
                          style={{ width:80, padding:'3px 6px', fontSize:11, background:'var(--s2)', border:'1px solid var(--br)', borderRadius:4, color:'var(--tx)' }}/>
                      </td>
                      <td style={{ padding:'4px 8px' }}>
                        <input type="number" step="0.01" value={l.fedTax} onChange={e=>updateLine(i,'fedTax',e.target.value)}
                          style={{ width:65, padding:'3px 6px', fontSize:11, background:'var(--s2)', border:'1px solid var(--br)', borderRadius:4, color:'var(--tx)' }}/>
                      </td>
                      <td style={{ padding:'4px 8px' }}>
                        <input type="number" step="0.01" value={l.stateTax} onChange={e=>updateLine(i,'stateTax',e.target.value)}
                          style={{ width:62, padding:'3px 6px', fontSize:11, background:'var(--s2)', border:'1px solid var(--br)', borderRadius:4, color:'var(--tx)' }}/>
                      </td>
                      <td style={{ padding:'4px 8px' }}>
                        <input type="number" step="0.01" value={l.ss} onChange={e=>updateLine(i,'ss',e.target.value)}
                          style={{ width:62, padding:'3px 6px', fontSize:11, background:'var(--s2)', border:'1px solid var(--br)', borderRadius:4, color:'var(--tx)' }}/>
                      </td>
                      <td style={{ padding:'4px 8px' }}>
                        <input type="number" step="0.01" value={l.medicare} onChange={e=>updateLine(i,'medicare',e.target.value)}
                          style={{ width:62, padding:'3px 6px', fontSize:11, background:'var(--s2)', border:'1px solid var(--br)', borderRadius:4, color:'var(--tx)' }}/>
                      </td>
                      <td style={{ padding:'6px 8px', fontWeight:700, color:'var(--ok)', fontSize:13 }}>${parseFloat(l.net||0).toLocaleString()}</td>
                      <td style={{ padding:'4px 8px' }}>
                        <select value={l.payMethod||'Direct Deposit'} onChange={e=>updateLine(i,'payMethod',e.target.value)}
                          style={{ fontSize:10, padding:'3px 6px', background:'var(--s2)', border:'1px solid var(--br)', borderRadius:4, color:'var(--tx)' }}>
                          {PAY_METHODS.map(m=><option key={m}>{m}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop:'2px solid var(--br)', background:'var(--s3)' }}>
                    <td colSpan={2} style={{ padding:'8px 8px', fontWeight:700, fontSize:12 }}>TOTALS</td>
                    <td style={{ padding:'8px 8px', fontWeight:700 }}>{lineItems.reduce((s,l)=>s+parseFloat(l.hours||0),0).toFixed(1)}h</td>
                    <td style={{ padding:'8px 8px', fontWeight:700 }}>${lineItems.reduce((s,l)=>s+parseFloat(l.gross||0),0).toLocaleString()}</td>
                    <td colSpan={4} style={{ padding:'8px 8px', color:'var(--bad)', fontWeight:700 }}>-${lineItems.reduce((s,l)=>s+parseFloat(l.totalTaxes||0),0).toFixed(2)}</td>
                    <td style={{ padding:'8px 8px', fontWeight:800, color:'var(--ok)', fontSize:13 }}>${lineItems.reduce((s,l)=>s+parseFloat(l.net||0),0).toFixed(2)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="field"><label>Notes</label><input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Payroll notes…"/></div>

            <button className="btn pri" style={{ width:'100%', justifyContent:'center', padding:10 }} onClick={saveRun} disabled={saving}>
              {saving ? 'Processing…' : '✅ Confirm & Save Payroll Run'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
