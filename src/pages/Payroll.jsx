import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BLANK_RUN = { period:'', payDate:'', notes:'' }
const PAY_METHODS = ['Direct Deposit','Check','Cash']

export default function Payroll() {
  const [runs,      setRuns]      = useState([])
  const [employees, setEmployees] = useState([])
  const [timeEntries, setTimeEntries] = useState([])
  const [modal,     setModal]     = useState(false)   // new run modal
  const [detailId,  setDetailId]  = useState(null)    // expanded run
  const [form,      setForm]      = useState(BLANK_RUN)
  const [lineItems, setLineItems] = useState([])       // per-employee in current run
  const [saving,    setSaving]    = useState(false)
  const [toast,     setToast]     = useState('')
  const [search,    setSearch]    = useState('')

  useEffect(() => { load() }, [])

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
    const today = new Date()
    const period = `${today.toLocaleString('default',{month:'long'})} 1–15, ${today.getFullYear()}`
    setForm({...BLANK_RUN, period, payDate: today.toISOString().slice(0,10)})
    // Build line items from employees
    const lines = employees.map(emp => {
      const rate = parseFloat(emp.hourlyRate||0) || parseFloat(emp.salary||0)/26 || 0
      const method = emp.payType==='Hourly' ? 'hourly' : 'salary'
      // Hours from time entries this pay period (approximate: all entries)
      const hrs = timeEntries.filter(t=>t.employee===emp.name).reduce((s,t)=>s+parseFloat(t.hours||0),0)
      const gross = method==='hourly' ? rate * Math.min(hrs,80) : (parseFloat(emp.salary||0)/24) || 0
      const fedTax  = gross * 0.22
      const stateTax = gross * 0.06
      const ss = gross * 0.062
      const medicare = gross * 0.0145
      const totalTaxes = fedTax + stateTax + ss + medicare
      const net = Math.max(0, gross - totalTaxes)
      return { name:emp.name, payType:emp.payType||'Salary', rate, hours:Math.min(hrs,80).toFixed(2), gross:gross.toFixed(2), fedTax:fedTax.toFixed(2), stateTax:stateTax.toFixed(2), ss:ss.toFixed(2), medicare:medicare.toFixed(2), totalTaxes:totalTaxes.toFixed(2), net:net.toFixed(2), payMethod:emp.paymentMethod||'Direct Deposit' }
    })
    setLineItems(lines)
    setModal(true)
  }

  function updateLine(i,k,v) {
    setLineItems(lines=>lines.map((l,idx)=>{
      if (idx!==i) return l
      const updated = {...l,[k]:v}
      // Recalc totals
      if (k==='gross'||k==='fedTax'||k==='stateTax'||k==='ss'||k==='medicare') {
        const g=parseFloat(updated.gross||0), ft=parseFloat(updated.fedTax||0), st=parseFloat(updated.stateTax||0), s=parseFloat(updated.ss||0), m=parseFloat(updated.medicare||0)
        const tt = ft+st+s+m
        updated.totalTaxes = tt.toFixed(2)
        updated.net = Math.max(0,g-tt).toFixed(2)
      }
      if (k==='hours'&&l.payType==='Hourly') {
        const g = parseFloat(l.rate||0)*parseFloat(v||0)
        const ft=g*0.22, st=g*0.06, ss=g*0.062, med=g*0.0145, tt=ft+st+ss+med
        updated.gross=g.toFixed(2); updated.fedTax=ft.toFixed(2); updated.stateTax=st.toFixed(2)
        updated.ss=ss.toFixed(2); updated.medicare=med.toFixed(2); updated.totalTaxes=tt.toFixed(2); updated.net=Math.max(0,g-tt).toFixed(2)
      }
      return updated
    }))
  }

  async function saveRun() {
    if (!form.period) { showToast('Pay period required'); return }
    setSaving(true)
    const grossPay  = lineItems.reduce((s,l)=>s+parseFloat(l.gross||0),0)
    const totalTaxes= lineItems.reduce((s,l)=>s+parseFloat(l.totalTaxes||0),0)
    const netPay    = lineItems.reduce((s,l)=>s+parseFloat(l.net||0),0)
    const {error} = await supabase.from('payrollruns').insert([{
      ...form, grossPay:grossPay.toFixed(2), totalTaxes:totalTaxes.toFixed(2),
      netPay:netPay.toFixed(2), numEmployees:lineItems.length,
      status:'Completed', lineItems:JSON.stringify(lineItems),
      created_at:new Date().toISOString()
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
  const ytdGross   = runs.filter(r=>r.payDate?.startsWith(new Date().getFullYear().toString())).reduce((s,r)=>s+parseFloat(r.grossPay||0),0)

  const filtered = runs.filter(r=>!search || r.period?.toLowerCase().includes(search.toLowerCase()))

  const detail = detailId ? runs.find(r=>r.id===detailId) : null
  let detailLines = []
  if (detail?.lineItems) { try { detailLines = JSON.parse(detail.lineItems) } catch {} }

  return (
    <div>
      {toast&&<div className="toast show">{toast}</div>}

      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
        <h2 style={{fontSize:15,fontWeight:700,margin:0}}>💼 Payroll</h2>
        <button className="btn pri" onClick={openNewRun} disabled={employees.length===0}>
          {employees.length===0 ? 'Add Employees First' : '+ Process Payroll'}
        </button>
      </div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:8,marginBottom:14}}>
        {[
          ['Total Net Paid','$'+Math.round(totalNet).toLocaleString(),'var(--ok)'],
          ['Total Gross','$'+Math.round(totalGross).toLocaleString(),'var(--b2c)'],
          ['YTD Gross','$'+Math.round(ytdGross).toLocaleString(),'var(--warn)'],
          ['Payroll Runs',runs.length,'var(--t2)'],
        ].map(([label,val,color])=>(
          <div key={label} className="card" style={{padding:'10px 12px',textAlign:'center'}}>
            <div style={{fontWeight:800,fontSize:18,color,lineHeight:1}}>{val}</div>
            <div style={{fontSize:10,color:'var(--t3)',marginTop:3}}>{label}</div>
          </div>
        ))}
      </div>

      {/* Per-employee YTD */}
      {employees.length>0&&(
        <div className="card" style={{marginBottom:12}}>
          <div style={{fontWeight:700,fontSize:11,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--t3)',marginBottom:10}}>YTD by Employee</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:8}}>
            {employees.map(emp=>{
              let empYtdNet=0, empYtdGross=0
              runs.filter(r=>r.payDate?.startsWith(new Date().getFullYear().toString())).forEach(r=>{
                try {
                  const lines = JSON.parse(r.lineItems||'[]')
                  const line = lines.find(l=>l.name===emp.name)
                  if (line) { empYtdGross+=parseFloat(line.gross||0); empYtdNet+=parseFloat(line.net||0) }
                } catch {}
              })
              return (
                <div key={emp.id} style={{padding:'10px 12px',background:'var(--s2)',borderRadius:6}}>
                  <div style={{fontWeight:700,fontSize:12,marginBottom:4}}>{emp.name}</div>
                  <div style={{fontSize:11,color:'var(--t3)',display:'flex',gap:12}}>
                    <span>Gross: <strong style={{color:'var(--b2c)'}}>${Math.round(empYtdGross).toLocaleString()}</strong></span>
                    <span>Net: <strong style={{color:'var(--ok)'}}>${Math.round(empYtdNet).toLocaleString()}</strong></span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Payroll runs list */}
      <div style={{display:'flex',gap:8,marginBottom:12}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search pay periods…"
          style={{flex:1,padding:'7px 12px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',fontSize:12}}/>
      </div>

      <div className="card" style={{padding:0,overflow:'hidden'}}>
        {filtered.length===0 ? (
          <div style={{padding:24,textAlign:'center',color:'var(--t3)',fontSize:13}}>No payroll runs yet.</div>
        ) : (
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{borderBottom:'1px solid var(--br)',background:'var(--s2)'}}>
                {['Pay Period','Pay Date','Gross Pay','Taxes','Net Pay','# Employees','Status',''].map(h=>(
                  <th key={h} style={{padding:'9px 12px',textAlign:'left',fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.05em'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r=>(
                <>
                  <tr key={r.id} style={{borderBottom:'1px solid var(--br)',cursor:'pointer',background:detailId===r.id?'var(--s2)':''}}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--s2)'}
                    onMouseLeave={e=>e.currentTarget.style.background=detailId===r.id?'var(--s2)':''}>
                    <td style={{padding:'9px 12px',fontWeight:700}} onClick={()=>setDetailId(detailId===r.id?null:r.id)}>{r.period}</td>
                    <td style={{padding:'9px 12px',color:'var(--t2)'}}>{r.payDate||'—'}</td>
                    <td style={{padding:'9px 12px',fontWeight:600}}>${parseFloat(r.grossPay||0).toLocaleString()}</td>
                    <td style={{padding:'9px 12px',color:'var(--bad)'}}>${parseFloat(r.totalTaxes||0).toLocaleString()}</td>
                    <td style={{padding:'9px 12px',fontWeight:700,color:'var(--ok)',fontSize:13}}>${parseFloat(r.netPay||0).toLocaleString()}</td>
                    <td style={{padding:'9px 12px'}}>{r.numEmployees}</td>
                    <td style={{padding:'9px 12px'}}><span className={`bdg ${r.status==='Completed'?'bg':r.status==='Pending'?'ba':'bn'}`}>{r.status}</span></td>
                    <td style={{padding:'9px 12px'}}>
                      <div style={{display:'flex',gap:5}}>
                        <button className="btn sec" style={{fontSize:10,padding:'3px 8px'}} onClick={()=>setDetailId(detailId===r.id?null:r.id)}>{detailId===r.id?'▲':'▼'} Detail</button>
                        <button className="btn del" style={{fontSize:10,padding:'3px 8px'}} onClick={()=>del(r.id)}>Del</button>
                      </div>
                    </td>
                  </tr>
                  {detailId===r.id&&detailLines.length>0&&(
                    <tr key={r.id+'detail'}>
                      <td colSpan={8} style={{padding:0,background:'var(--s3)'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                          <thead>
                            <tr style={{borderBottom:'1px solid var(--br)'}}>
                              {['Employee','Type','Hours','Gross','Fed Tax','State Tax','SS','Medicare','Total Tax','Net Pay','Method'].map(h=>(
                                <th key={h} style={{padding:'6px 10px',textAlign:'left',color:'var(--t3)',fontWeight:600,fontSize:10}}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {detailLines.map((l,i)=>(
                              <tr key={i} style={{borderBottom:'1px solid var(--br)'}}>
                                <td style={{padding:'6px 10px',fontWeight:600}}>{l.name}</td>
                                <td style={{padding:'6px 10px',color:'var(--t2)'}}>{l.payType}</td>
                                <td style={{padding:'6px 10px'}}>{l.hours||'—'}h</td>
                                <td style={{padding:'6px 10px',fontWeight:700}}>${parseFloat(l.gross||0).toLocaleString()}</td>
                                <td style={{padding:'6px 10px',color:'var(--bad)'}}>${parseFloat(l.fedTax||0).toFixed(2)}</td>
                                <td style={{padding:'6px 10px',color:'var(--bad)'}}>${parseFloat(l.stateTax||0).toFixed(2)}</td>
                                <td style={{padding:'6px 10px',color:'var(--bad)'}}>${parseFloat(l.ss||0).toFixed(2)}</td>
                                <td style={{padding:'6px 10px',color:'var(--bad)'}}>${parseFloat(l.medicare||0).toFixed(2)}</td>
                                <td style={{padding:'6px 10px',color:'var(--bad)',fontWeight:600}}>${parseFloat(l.totalTaxes||0).toFixed(2)}</td>
                                <td style={{padding:'6px 10px',fontWeight:700,color:'var(--ok)'}}>${parseFloat(l.net||0).toLocaleString()}</td>
                                <td style={{padding:'6px 10px',color:'var(--t2)'}}>{l.payMethod||'—'}</td>
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

      {/* New Payroll Run Modal */}
      {modal&&(
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal" style={{width:900,maxWidth:'95vw'}}>
            <div className="mh">
              <span className="mt">Process Payroll</span>
              <button className="xbtn" onClick={()=>setModal(false)}>&times;</button>
            </div>

            <div className="fg2" style={{marginBottom:10}}>
              <div className="field"><label>Pay Period *</label><input value={form.period} onChange={e=>setForm(f=>({...f,period:e.target.value}))} placeholder="e.g. June 1–15, 2025"/></div>
              <div className="field"><label>Pay Date</label><input type="date" value={form.payDate} onChange={e=>setForm(f=>({...f,payDate:e.target.value}))}/></div>
            </div>

            {/* Employee line items */}
            <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)',marginBottom:8}}>Employee Pay</div>
            <div style={{overflowX:'auto',marginBottom:10}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,minWidth:800}}>
                <thead>
                  <tr style={{borderBottom:'1px solid var(--br)',background:'var(--s3)'}}>
                    {['Employee','Type','Hours','Gross ($)','Fed Tax','State Tax','SS','Medicare','Net Pay','Method'].map(h=>(
                      <th key={h} style={{padding:'6px 8px',textAlign:'left',color:'var(--t3)',fontWeight:600,fontSize:10}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((l,i)=>(
                    <tr key={i} style={{borderBottom:'1px solid var(--br)'}}>
                      <td style={{padding:'6px 8px',fontWeight:600,fontSize:12}}>{l.name}</td>
                      <td style={{padding:'6px 8px'}}><span className="bdg bn" style={{fontSize:9}}>{l.payType}</span></td>
                      <td style={{padding:'4px 8px'}}><input type="number" step="0.5" value={l.hours} onChange={e=>updateLine(i,'hours',e.target.value)} style={{width:55,padding:'3px 6px',fontSize:11,background:'var(--s2)',border:'1px solid var(--br)',borderRadius:4,color:'var(--tx)'}}/></td>
                      <td style={{padding:'4px 8px'}}><input type="number" step="0.01" value={l.gross} onChange={e=>updateLine(i,'gross',e.target.value)} style={{width:75,padding:'3px 6px',fontSize:11,background:'var(--s2)',border:'1px solid var(--br)',borderRadius:4,color:'var(--tx)'}}/></td>
                      <td style={{padding:'4px 8px'}}><input type="number" step="0.01" value={l.fedTax} onChange={e=>updateLine(i,'fedTax',e.target.value)} style={{width:65,padding:'3px 6px',fontSize:11,background:'var(--s2)',border:'1px solid var(--br)',borderRadius:4,color:'var(--tx)'}}/></td>
                      <td style={{padding:'4px 8px'}}><input type="number" step="0.01" value={l.stateTax} onChange={e=>updateLine(i,'stateTax',e.target.value)} style={{width:60,padding:'3px 6px',fontSize:11,background:'var(--s2)',border:'1px solid var(--br)',borderRadius:4,color:'var(--tx)'}}/></td>
                      <td style={{padding:'4px 8px'}}><input type="number" step="0.01" value={l.ss} onChange={e=>updateLine(i,'ss',e.target.value)} style={{width:60,padding:'3px 6px',fontSize:11,background:'var(--s2)',border:'1px solid var(--br)',borderRadius:4,color:'var(--tx)'}}/></td>
                      <td style={{padding:'4px 8px'}}><input type="number" step="0.01" value={l.medicare} onChange={e=>updateLine(i,'medicare',e.target.value)} style={{width:60,padding:'3px 6px',fontSize:11,background:'var(--s2)',border:'1px solid var(--br)',borderRadius:4,color:'var(--tx)'}}/></td>
                      <td style={{padding:'6px 8px',fontWeight:700,color:'var(--ok)',fontSize:12}}>${parseFloat(l.net||0).toLocaleString()}</td>
                      <td style={{padding:'4px 8px'}}>
                        <select value={l.payMethod||'Direct Deposit'} onChange={e=>updateLine(i,'payMethod',e.target.value)}
                          style={{fontSize:10,padding:'3px 6px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:4,color:'var(--tx)'}}>
                          {PAY_METHODS.map(m=><option key={m}>{m}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{borderTop:'2px solid var(--br)',background:'var(--s3)'}}>
                    <td colSpan={2} style={{padding:'8px 8px',fontWeight:700,fontSize:12}}>TOTALS</td>
                    <td style={{padding:'8px 8px',fontWeight:700}}>{lineItems.reduce((s,l)=>s+parseFloat(l.hours||0),0).toFixed(1)}h</td>
                    <td style={{padding:'8px 8px',fontWeight:700}}>${lineItems.reduce((s,l)=>s+parseFloat(l.gross||0),0).toLocaleString()}</td>
                    <td colSpan={4} style={{padding:'8px 8px',color:'var(--bad)',fontWeight:700}}>-${lineItems.reduce((s,l)=>s+parseFloat(l.totalTaxes||0),0).toFixed(2)}</td>
                    <td style={{padding:'8px 8px',fontWeight:800,color:'var(--ok)',fontSize:13}}>${lineItems.reduce((s,l)=>s+parseFloat(l.net||0),0).toFixed(2)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="field"><label>Notes</label><input value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Payroll notes…"/></div>

            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={saveRun} disabled={saving}>
              {saving?'Processing…':'✅ Confirm & Save Payroll Run'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
