import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BLANK = { clientName:'', caseNum:'', lineItems:'', total:'', paid:'0', dueDate:'', taxRate:'0', status:'Unpaid' }

function SBdg({s}) {
  const m = {Paid:'bg',Partial:'ba',Overdue:'br',Unpaid:'bn'}
  return <span className={`bdg ${m[s]||'bn'}`}>{s}</span>
}

export default function Invoices() {
  const [items, setItems]     = useState([])
  const [clients, setClients] = useState([])
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(BLANK)
  const [suggestions, setSug] = useState([])
  const [saving, setSaving]   = useState(false)
  const [toast, setToast]     = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: inv }, { data: cl }] = await Promise.all([
      supabase.from('invoices').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('id,name')
    ])
    if (inv) setItems(inv)
    if (cl)  setClients(cl)
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3000) }
  function fld(k,v) { setForm(f=>({...f,[k]:v})) }

  function searchClient(val) {
    fld('clientName', val)
    if (val.length < 2) { setSug([]); return }
    setSug(clients.filter(c=>c.name.toLowerCase().includes(val.toLowerCase())).slice(0,6))
  }

  const total = parseFloat(form.total||0)
  const paid  = parseFloat(form.paid||0)
  const tax   = total * (parseFloat(form.taxRate||0)/100)
  const balance = (total + tax) - paid

  async function save() {
    if (!form.clientName || !form.total) { showToast('Client and total required'); return }
    setSaving(true)
    const invNum = 'INV-' + Date.now().toString().slice(-6)
    const statusCalc = paid >= (total+tax) ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid'
    const { error } = await supabase.from('invoices').insert([{ ...form, invNum, status: statusCalc, created_at: new Date().toISOString() }])
    setSaving(false)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('Invoice created!')
    setModal(false)
    setForm(BLANK)
    load()
  }

  async function deleteItem(id) {
    await supabase.from('invoices').delete().eq('id', id)
    showToast('Deleted')
    load()
  }

  const totalRevenue = items.reduce((s,i)=>s+parseFloat(i.paid||0),0)
  const totalOwed    = items.reduce((s,i)=>s+parseFloat(i.total||0),0) - totalRevenue

  return (
    <div>
      {toast && <div className="toast show">{toast}</div>}

      <div className="metrics">
        <div className="metric"><div className="ml">Total Invoiced</div><div className="mv">${items.reduce((s,i)=>s+parseFloat(i.total||0),0).toLocaleString()}</div></div>
        <div className="metric"><div className="ml">Collected</div><div className="mv" style={{color:'var(--ok)'}}>${totalRevenue.toLocaleString()}</div></div>
        <div className="metric"><div className="ml">Outstanding</div><div className="mv" style={{color: totalOwed > 0 ? 'var(--warn)':'var(--t2)'}}>${totalOwed.toLocaleString()}</div></div>
        <div className="metric"><div className="ml">Invoices</div><div className="mv">{items.length}</div></div>
      </div>

      <div className="card">
        <div className="ch">
          <span className="ct">Invoices ({items.length})</span>
          <button className="btn pri" onClick={()=>setModal(true)}>+ New Invoice</button>
        </div>
        <div className="ovx">
          <table>
            <thead><tr><th>#</th><th>Client</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Due</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={8} style={{textAlign:'center',color:'var(--t3)',padding:20}}>No invoices yet</td></tr>
              ) : items.map(inv => {
                const t = parseFloat(inv.total||0), p = parseFloat(inv.paid||0)
                const bal = t - p
                return (
                  <tr key={inv.id}>
                    <td style={{color:'var(--t2)',fontSize:11}}>{inv.invNum}</td>
                    <td style={{fontWeight:600}}>{inv.clientName}</td>
                    <td>${t.toLocaleString()}</td>
                    <td style={{color:'var(--ok)'}}>${p.toLocaleString()}</td>
                    <td style={{color: bal > 0 ? 'var(--warn)' : 'var(--t2)', fontWeight: bal > 0 ? 700 : 400}}>${bal.toLocaleString()}</td>
                    <td style={{color:'var(--t2)'}}>{inv.dueDate||'—'}</td>
                    <td><SBdg s={inv.status||'Unpaid'}/></td>
                    <td><button className="btn del" onClick={()=>deleteItem(inv.id)}>Del</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal" style={{width:580}}>
            <div className="mh">
              <span className="mt">New Invoice</span>
              <button className="xbtn" onClick={()=>setModal(false)}>&times;</button>
            </div>
            <div className="field" style={{position:'relative'}}>
              <label>Client * (search)</label>
              <input value={form.clientName} onChange={e=>searchClient(e.target.value)} placeholder="Search client name..." autoComplete="off"/>
              {suggestions.length > 0 && (
                <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--s3)',border:'1px solid var(--b2c)',borderRadius:7,zIndex:500}}>
                  {suggestions.map(c=>(
                    <div key={c.id} onClick={()=>{fld('clientName',c.name);setSug([])}} style={{padding:'7px 12px',cursor:'pointer',fontSize:13}}>{c.name}</div>
                  ))}
                </div>
              )}
            </div>
            <div className="field"><label>Case #</label><input value={form.caseNum} onChange={e=>fld('caseNum',e.target.value)}/></div>
            <div className="field"><label>Services / Line Items</label>
              <textarea value={form.lineItems} onChange={e=>fld('lineItems',e.target.value)} placeholder="e.g. OIC Representation Services - $2,500&#10;IRS Transcript Request - $150"/>
            </div>
            <div className="fg2">
              <div className="field"><label>Total Amount *</label><input type="number" value={form.total} onChange={e=>fld('total',e.target.value)} placeholder="0.00"/></div>
              <div className="field"><label>Amount Paid</label><input type="number" value={form.paid} onChange={e=>fld('paid',e.target.value)} placeholder="0.00"/></div>
            </div>
            <div className="fg2">
              <div className="field"><label>Due Date</label><input type="date" value={form.dueDate} onChange={e=>fld('dueDate',e.target.value)}/></div>
              <div className="field"><label>Tax Rate %</label><input type="number" value={form.taxRate} onChange={e=>fld('taxRate',e.target.value)} placeholder="0"/></div>
            </div>
            {form.total && (
              <div style={{background:'var(--s2)',borderRadius:7,padding:10,marginBottom:10,fontSize:12.5}}>
                <div style={{display:'flex',justifyContent:'space-between'}}><span>Subtotal</span><span>${parseFloat(form.total||0).toLocaleString()}</span></div>
                {parseFloat(form.taxRate||0) > 0 && <div style={{display:'flex',justifyContent:'space-between',color:'var(--t2)'}}><span>Tax ({form.taxRate}%)</span><span>${tax.toFixed(2)}</span></div>}
                <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,borderTop:'1px solid var(--br)',marginTop:6,paddingTop:6}}><span>Balance Due</span><span style={{color: balance > 0 ? 'var(--warn)' : 'var(--ok)'}}>${balance.toFixed(2)}</span></div>
              </div>
            )}
            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Create Invoice'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
