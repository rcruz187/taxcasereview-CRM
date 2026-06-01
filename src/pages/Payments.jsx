import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BLANK = { clientName:'', invNum:'', amount:'', method:'Credit Card', date:'', status:'Cleared', notes:'' }

export default function Payments() {
  const [items, setItems]   = useState([])
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [toast, setToast]   = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('payments').select('*').order('created_at', { ascending: false })
    if (data) setItems(data)
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3000) }
  function fld(k,v) { setForm(f=>({...f,[k]:v})) }

  async function save() {
    if (!form.clientName || !form.amount) { showToast('Client and amount required'); return }
    setSaving(true)
    const { error } = await supabase.from('payments').insert([{ ...form, created_at: new Date().toISOString() }])
    setSaving(false)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('Payment recorded!')
    setModal(false)
    setForm(BLANK)
    load()
  }

  async function deleteItem(id) {
    await supabase.from('payments').delete().eq('id', id)
    showToast('Deleted')
    load()
  }

  const totalCleared = items.filter(p=>p.status==='Cleared').reduce((s,p)=>s+parseFloat(p.amount||0),0)

  return (
    <div>
      {toast && <div className="toast show">{toast}</div>}

      <div className="metrics">
        <div className="metric"><div className="ml">Total Collected</div><div className="mv" style={{color:'var(--ok)'}}>${totalCleared.toLocaleString()}</div></div>
        <div className="metric"><div className="ml">Payments</div><div className="mv">{items.length}</div></div>
        <div className="metric"><div className="ml">Pending</div><div className="mv">{items.filter(p=>p.status==='Pending').length}</div></div>
      </div>

      <div className="card">
        <div className="ch">
          <span className="ct">Payment History ({items.length})</span>
          <button className="btn pri" onClick={()=>setModal(true)}>+ Record Payment</button>
        </div>
        <div className="ovx">
          <table>
            <thead><tr><th>Client</th><th>Invoice #</th><th>Amount</th><th>Method</th><th>Date</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} style={{textAlign:'center',color:'var(--t3)',padding:20}}>No payments yet</td></tr>
              ) : items.map(p => (
                <tr key={p.id}>
                  <td style={{fontWeight:600}}>{p.clientName}</td>
                  <td style={{color:'var(--t2)'}}>{p.invNum||'—'}</td>
                  <td style={{fontWeight:700,color:'var(--ok)'}}>${parseFloat(p.amount||0).toLocaleString()}</td>
                  <td><span className="bdg bn">{p.method}</span></td>
                  <td style={{color:'var(--t2)'}}>{p.date||'—'}</td>
                  <td><span className={`bdg ${p.status==='Cleared'?'bg':p.status==='Failed'?'br':'ba'}`}>{p.status}</span></td>
                  <td><button className="btn del" onClick={()=>deleteItem(p.id)}>Del</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal">
            <div className="mh">
              <span className="mt">Record Payment</span>
              <button className="xbtn" onClick={()=>setModal(false)}>&times;</button>
            </div>
            <div className="fg2">
              <div className="field"><label>Client *</label><input value={form.clientName} onChange={e=>fld('clientName',e.target.value)}/></div>
              <div className="field"><label>Invoice #</label><input value={form.invNum} onChange={e=>fld('invNum',e.target.value)}/></div>
            </div>
            <div className="fg2">
              <div className="field"><label>Amount *</label><input type="number" value={form.amount} onChange={e=>fld('amount',e.target.value)}/></div>
              <div className="field"><label>Method</label>
                <select value={form.method} onChange={e=>fld('method',e.target.value)}>
                  {['Credit Card','ACH','Check','Cash','Zelle','Venmo','Other'].map(m=><option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div className="fg2">
              <div className="field"><label>Date</label><input type="date" value={form.date} onChange={e=>fld('date',e.target.value)}/></div>
              <div className="field"><label>Status</label>
                <select value={form.status} onChange={e=>fld('status',e.target.value)}>
                  <option>Cleared</option><option>Pending</option><option>Failed</option>
                </select>
              </div>
            </div>
            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Record Payment'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
