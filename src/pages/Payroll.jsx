import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import PayrollStatCards from '../components/PayrollStatCards'
import { hoursFromEntry, buildLineItems, currentPeriod } from '../lib/payrollUtils'

const PAY_METHODS = ['Direct Deposit','Check','Cash']

// Small stat block used in Pay Stubs cards
function Stat({ label, value, color, bold, big }) {
  return (
    <div style={{ textAlign:'right', minWidth:60 }}>
      <div style={{ fontSize:9, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:2 }}>{label}</div>
      <div style={{ fontSize: big?15:12, fontWeight: bold?800:600, color: color||'var(--tx)' }}>{value}</div>
    </div>
  )
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
  const [activeTab,   setActiveTab]   = useState('payroll')

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
    const { start, end, label } = currentPeriod(today)
    setPeriodLabel(label)
    setPeriodStart(start)
    setPeriodEnd(end)
    setPayDate(new Date(new Date(end).getTime() + 2*24*60*60*1000).toISOString().slice(0,10))
    setNotes('')
    setLineItems(buildLineItems(employees, timeEntries, start, end))
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

  // Pay Stubs tab: current-period breakdown per employee
  const { start: curStart, end: curEnd, label: curLabel } = currentPeriod(today)
  const stubLines = buildLineItems(employees, timeEntries, curStart, curEnd)

  function printStub(l) {
    const w = window.open('', '_blank')
    w.document.write(`
      <html><head><title>Pay Stub — ${l.name}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:30px;color:#1a1a1a}
        h1{font-size:18px;margin:0 0 4px}
        .sub{color:#666;font-size:12px;margin-bottom:20px}
        table{width:100%;border-collapse:collapse;font-size:13px;margin-top:14px}
        td,th{padding:8px 10px;border-bottom:1px solid #ddd;text-align:left}
        th{color:#666;font-weight:600;font-size:11px;text-transform:uppercase}
        .net{font-weight:800;font-size:16px;color:#16a34a}
        .bad{color:#dc2626}
      </style></head><body>
        <h1>Tax Case Review — Pay Stub</h1>
        <div class="sub">${l.name} · ${l.payType} · Period: ${curLabel}</div>
        <table>
          <tr><th>Item</th><th>Hours</th><th>Amount</th></tr>
          <tr><td>Regular Pay</td><td>${l.regularHours}h</td><td>$${(l.payType==='Hourly' ? (parseFloat(l.regularHours)*l.rate) : (parseFloat(l.gross)-parseFloat(l.otHours)*l.rate*1.5)).toFixed(2)}</td></tr>
          <tr><td>Overtime Pay (1.5x)</td><td>${l.otHours}h</td><td>$${(parseFloat(l.otHours)*l.rate*1.5).toFixed(2)}</td></tr>
          <tr><td><strong>Gross Pay</strong></td><td>${l.hours}h</td><td><strong>$${parseFloat(l.gross).toLocaleString()}</strong></td></tr>
          <tr><td>Federal Tax</td><td></td><td class="bad">-$${l.fedTax}</td></tr>
          <tr><td>State Tax</td><td></td><td class="bad">-$${l.stateTax}</td></tr>
          <tr><td>Social Security</td><td></td><td class="bad">-$${l.ss}</td></tr>
          <tr><td>Medicare</td><td></td><td class="bad">-$${l.medicare}</td></tr>
          <tr><td colspan="2" class="net">Net Pay</td><td class="net">$${parseFloat(l.net).toLocaleString()}</td></tr>
        </table>
        <p style="margin-top:30px;font-size:11px;color:#999">Payment Method: ${l.payMethod}</p>
      </body></html>
    `)
    w.document.close()
    w.print()
  }

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

      <PayrollStatCards employees={employees} timeEntries={timeEntries} />

      {/* Tab Bar */}
      <div style={{ display:'flex', gap:4, marginBottom:16, borderBottom:'1px solid var(--br)' }}>
        {[['payroll','Payroll'],['stubs','Pay Stubs']].map(([k,l]) => (
          <button key={k} onClick={()=>setActiveTab(k)}
            style={{ padding:'10px 18px', border:'none', borderBottom: activeTab===k?'2px solid var(--blue)':'2px solid transparent',
              background:'none', cursor:'pointer', fontSize:13, fontWeight:activeTab===k?700:500,
              color:activeTab===k?'var(--blue)':'var(--t2)' }}>
            {l}
          </button>
        ))}
      </div>

      {activeTab==='payroll' && (<>

      {/* Run totals at a glance */}
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
      </>)}

      {/* ── Pay Stubs Tab ─────────────────────────────────────── */}
      {activeTab==='stubs' && (<>
        <div style={{ fontSize:12, color:'var(--t3)', marginBottom:12 }}>
          Showing current pay period: <strong style={{color:'var(--tx)'}}>{currentPeriod().label}</strong>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {stubLines.map(l => {
            const initials = l.name.split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()
            return (
              <div key={l.name} className="card" style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                <div style={{ width:38, height:38, borderRadius:'50%', background:'var(--ok)', color:'#fff',
                  display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:13, flexShrink:0 }}>
                  {initials}
                </div>
                <div style={{ minWidth:160 }}>
                  <div style={{ fontWeight:700, fontSize:14 }}>{l.name}</div>
                  <div style={{ display:'flex', gap:6, alignItems:'center', marginTop:3 }}>
                    <span className="bdg bn" style={{ fontSize:9 }}>{l.payType}</span>
                    <span style={{ fontSize:11, color:'var(--t3)' }}>{l.payType==='Hourly' ? `$${l.rate}/hr` : 'Salary'}</span>
                  </div>
                </div>
                <div style={{ display:'flex', gap:22, flex:1, flexWrap:'wrap', justifyContent:'flex-end', alignItems:'center' }}>
                  <Stat label="Regular" value={l.regularHours+'h'} />
                  <Stat label="Overtime" value={l.otHours+'h'} color={parseFloat(l.otHours)>0?'var(--warn)':'var(--t3)'} />
                  <Stat label="Gross Pay" value={'$'+parseFloat(l.gross).toLocaleString()} color="#8b5cf6" bold />
                  <Stat label="Fed Tax" value={'-$'+l.fedTax} color="var(--bad)" />
                  <Stat label="SS" value={'-$'+l.ss} color="var(--bad)" />
                  <Stat label="Medicare" value={'-$'+l.medicare} color="var(--bad)" />
                  <Stat label="Net Pay" value={'$'+parseFloat(l.net).toLocaleString()} color="var(--ok)" bold big />
                  <button className="btn sec" style={{ fontSize:11, padding:'6px 14px' }} onClick={()=>printStub(l)}>🖨️ Stub</button>
                </div>
              </div>
            )
          })}
          {stubLines.length===0 && (
            <div className="card" style={{ padding:24, textAlign:'center', color:'var(--t3)', fontSize:13 }}>No employees yet.</div>
          )}
        </div>
      </>)}

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
