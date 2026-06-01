import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BLANK = { clientName:'', service:'', amount:'', validUntil:'', status:'Draft', notes:'' }

export default function Estimates() {
  const [items, setItems]   = useState([])
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [toast, setToast]   = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('estimates').select('*').order('created_at', { ascending: false })
    if (data) setItems(data)
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3000) }
  function fld(k,v) { setForm(f=>({...f,[k]:v})) }

  async function save() {
    if (!form.clientName) { showToast('Client required'); return }
    setSaving(true)
    const estNum = 'EST-' + Date.now().toString().slice(-6)
    const { error } = await supabase.from('estimates').insert([{ ...form, estNum, created_at: new Date().toISOString() }])
    setSaving(false)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('Estimate created!')
    setModal(false); setForm(BLANK); load()
  }

  async function del(id) {
    await supabase.from('estimates').delete().eq('id', id)
    showToast('Deleted'); load()
  }

  return (
    <div>
      {toast && <div className="toast show">{toast}</div>}
      <div className="card">
        <div className="ch">
          <span className="ct">Estimates ({items.length})</span>
          <button className="btn pri" onClick={()=>setModal(true)}>+ New Estimate</button>
        </div>
        <div className="ovx">
          <table>
            <thead><tr><th>#</th><th>Client</th><th>Service</th><th>Amount</th><th>Valid Until</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {items.length === 0
                ? <tr><td colSpan={7} style={{textAlign:'center',color:'var(--t3)',padding:20}}>No estimates yet</td></tr>
                : items.map(e => (
                  <tr key={e.id}>
                    <td style={{color:'var(--t2)',fontSize:11}}>{e.estNum}</td>
                    <td style={{fontWeight:600}}>{e.clientName}</td>
                    <td>{e.service||'—'}</td>
                    <td style={{fontWeight:700}}>${parseFloat(e.amount||0).toLocaleString()}</td>
                    <td style={{color:'var(--t2)'}}>{e.validUntil||'—'}</td>
                    <td><span className={`bdg ${e.status==='Accepted'?'bg':e.status==='Rejected'?'br':'ba'}`}>{e.status||'Draft'}</span></td>
                    <td><button className="btn del" onClick={()=>del(e.id)}>Del</button></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal">
            <div className="mh"><span className="mt">New Estimate</span><button className="xbtn" onClick={()=>setModal(false)}>&times;</button></div>
            <div className="fg2">
              <div className="field"><label>Client *</label><input value={form.clientName} onChange={e=>fld('clientName',e.target.value)}/></div>
              <div className="field"><label>Service</label><input value={form.service} onChange={e=>fld('service',e.target.value)} placeholder="e.g. OIC Representation"/></div>
            </div>
            <div className="fg2">
              <div className="field"><label>Amount</label><input type="number" value={form.amount} onChange={e=>fld('amount',e.target.value)}/></div>
              <div className="field"><label>Valid Until</label><input type="date" value={form.validUntil} onChange={e=>fld('validUntil',e.target.value)}/></div>
            </div>
            <div className="field"><label>Notes / Scope</label><textarea value={form.notes} onChange={e=>fld('notes',e.target.value)}/></div>
            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={save} disabled={saving}>
              {saving?'Saving...':'Create Estimate'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
