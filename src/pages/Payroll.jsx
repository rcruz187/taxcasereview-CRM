import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BLANK = { period:'', payDate:'', grossPay:'', totalTaxes:'', netPay:'', numEmployees:'3', status:'Completed', notes:'' }

export default function Payroll() {
  const [items, setItems]   = useState([])
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [toast, setToast]   = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('payrollruns').select('*').order('created_at', { ascending: false })
    if (data) setItems(data)
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3000) }
  function fld(k,v) { setForm(f=>({...f,[k]:v})) }

  async function save() {
    if (!form.period) { showToast('Pay period required'); return }
    setSaving(true)
    const { error } = await supabase.from('payrollruns').insert([{ ...form, created_at: new Date().toISOString() }])
    setSaving(false)
    if (error) { showToast('Error: '+error.message); return }
    showToast('Payroll run saved!')
    setModal(false); setForm(BLANK); load()
  }

  async function del(id) {
    await supabase.from('payrollruns').delete().eq('id', id)
    showToast('Deleted'); load()
  }

  const totalNet = items.reduce((s,p)=>s+parseFloat(p.netPay||0),0)

  return (
    <div>
      {toast && <div className="toast show">{toast}</div>}
      <div className="metrics">
        <div className="metric"><div className="ml">Total Net Paid</div><div className="mv" style={{color:'var(--ok)'}}>${totalNet.toLocaleString()}</div></div>
        <div className="metric"><div className="ml">Payroll Runs</div><div className="mv">{items.length}</div></div>
      </div>
      <div className="card">
        <div className="ch">
          <span className="ct">Payroll Runs ({items.length})</span>
          <button className="btn pri" onClick={()=>setModal(true)}>+ Process Payroll</button>
        </div>
        <div className="ovx">
          <table>
            <thead><tr><th>Pay Period</th><th>Pay Date</th><th>Gross Pay</th><th>Taxes</th><th>Net Pay</th><th>Employees</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {items.length === 0
                ? <tr><td colSpan={8} style={{textAlign:'center',color:'var(--t3)',padding:20}}>No payroll runs yet</td></tr>
                : items.map(p => (
                  <tr key={p.id}>
                    <td style={{fontWeight:600}}>{p.period}</td>
                    <td style={{color:'var(--t2)'}}>{p.payDate||'—'}</td>
                    <td>${parseFloat(p.grossPay||0).toLocaleString()}</td>
                    <td style={{color:'var(--bad)'}}>${parseFloat(p.totalTaxes||0).toLocaleString()}</td>
                    <td style={{fontWeight:700,color:'var(--ok)'}}>${parseFloat(p.netPay||0).toLocaleString()}</td>
                    <td>{p.numEmployees}</td>
                    <td><span className={`bdg ${p.status==='Completed'?'bg':p.status==='Pending'?'ba':'bn'}`}>{p.status}</span></td>
                    <td><button className="btn del" onClick={()=>del(p.id)}>Del</button></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal">
            <div className="mh"><span className="mt">Process Payroll</span><button className="xbtn" onClick={()=>setModal(false)}>&times;</button></div>
            <div className="fg2">
              <div className="field"><label>Pay Period *</label><input value={form.period} onChange={e=>fld('period',e.target.value)} placeholder="e.g. May 1-15, 2025"/></div>
              <div className="field"><label>Pay Date</label><input type="date" value={form.payDate} onChange={e=>fld('payDate',e.target.value)}/></div>
            </div>
            <div className="fg3">
              <div className="field"><label>Gross Pay</label><input type="number" value={form.grossPay} onChange={e=>fld('grossPay',e.target.value)} placeholder="0.00"/></div>
              <div className="field"><label>Total Taxes</label><input type="number" value={form.totalTaxes} onChange={e=>fld('totalTaxes',e.target.value)} placeholder="0.00"/></div>
              <div className="field"><label>Net Pay</label><input type="number" value={form.netPay} onChange={e=>fld('netPay',e.target.value)} placeholder="0.00"/></div>
            </div>
            <div className="fg2">
              <div className="field"><label>No. of Employees</label><input type="number" value={form.numEmployees} onChange={e=>fld('numEmployees',e.target.value)}/></div>
              <div className="field"><label>Status</label>
                <select value={form.status} onChange={e=>fld('status',e.target.value)}>
                  <option>Completed</option><option>Pending</option><option>Draft</option>
                </select>
              </div>
            </div>
            <div className="field"><label>Notes</label><textarea value={form.notes} onChange={e=>fld('notes',e.target.value)}/></div>
            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={save} disabled={saving}>
              {saving?'Processing...':'Process Payroll'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
