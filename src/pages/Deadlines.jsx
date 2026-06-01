import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BLANK = { name:'', client:'', type:'OIC', dueDate:'', status:'Tracking' }
const TYPES = ['OIC','Installment Agreement','CDP','CSED','Penalty Abatement','Appeals','General']
const STATUSES = ['Tracking','Action Required','Scheduled','Completed']

export default function Deadlines() {
  const [items, setItems] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm]   = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [toast, setToast]   = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('deadlines').select('*').order('dueDate', { ascending: true })
    if (data) setItems(data)
    const badge = document.getElementById('badge-deadlines')
    if (badge && data) {
      const urgent = data.filter(d => {
        const dy = Math.ceil((new Date(d.dueDate) - new Date()) / 86400000)
        return dy <= 7 && dy >= 0 && d.status !== 'Completed'
      }).length
      badge.textContent = urgent || 0
    }
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3000) }
  function fld(k,v) { setForm(f=>({...f,[k]:v})) }

  function daysLeft(d) { return Math.ceil((new Date(d) - new Date()) / 86400000) }
  function urgencyColor(dy) { return dy <= 3 ? 'var(--bad)' : dy <= 7 ? 'var(--warn)' : dy <= 30 ? 'var(--tx)' : 'var(--t2)' }
  function urgencyBdg(dy) { return dy < 0 ? 'br' : dy <= 3 ? 'br' : dy <= 7 ? 'ba' : 'bg' }
  function daysText(dy) { return dy < 0 ? 'OVERDUE' : dy === 0 ? 'TODAY' : dy+'d' }

  async function save() {
    if (!form.name.trim() || !form.dueDate) { showToast('Name and date required'); return }
    setSaving(true)
    const { error } = await supabase.from('deadlines').insert([{ ...form, created_at: new Date().toISOString() }])
    setSaving(false)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('Deadline added!')
    setModal(false)
    setForm(BLANK)
    load()
  }

  async function deleteItem(id) {
    await supabase.from('deadlines').delete().eq('id', id)
    showToast('Deleted')
    load()
  }

  const urgent = items.filter(d => { const dy = daysLeft(d.dueDate); return dy <= 7 && dy >= -30 && d.status !== 'Completed' })
  const rest   = items.filter(d => { const dy = daysLeft(d.dueDate); return !(dy <= 7 && dy >= -30 && d.status !== 'Completed') })

  function Row({ d }) {
    const dy = daysLeft(d.dueDate)
    return (
      <tr>
        <td style={{fontWeight:600,color: urgencyColor(dy)}}>{d.name}</td>
        <td>{d.client||'—'}</td>
        <td><span className="bdg bn">{d.type}</span></td>
        <td style={{color: urgencyColor(dy)}}>{d.dueDate}</td>
        <td><span className={`bdg ${urgencyBdg(dy)}`}>{daysText(dy)}</span></td>
        <td><span className={`bdg ${d.status==='Completed'?'bg':d.status==='Action Required'?'br':'bb'}`}>{d.status}</span></td>
        <td><button className="btn del" onClick={()=>deleteItem(d.id)}>Del</button></td>
      </tr>
    )
  }

  return (
    <div>
      {toast && <div className="toast show">{toast}</div>}

      {urgent.length > 0 && (
        <div className="card" style={{borderColor:'var(--bad)'}}>
          <div className="ch"><span className="ct" style={{color:'var(--bad)'}}>⚠️ Urgent Deadlines ({urgent.length})</span></div>
          <div className="ovx">
            <table>
              <thead><tr><th>Name</th><th>Client</th><th>Type</th><th>Due Date</th><th>Days Left</th><th>Status</th><th></th></tr></thead>
              <tbody>{urgent.map(d=><Row key={d.id} d={d}/>)}</tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div className="ch">
          <span className="ct">All Deadlines ({items.length})</span>
          <button className="btn pri" onClick={()=>setModal(true)}>+ Add Deadline</button>
        </div>
        <div className="ovx">
          <table>
            <thead><tr><th>Name</th><th>Client</th><th>Type</th><th>Due Date</th><th>Days Left</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} style={{textAlign:'center',color:'var(--t3)',padding:20}}>No deadlines yet</td></tr>
              ) : items.map(d=><Row key={d.id} d={d}/>)}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal">
            <div className="mh">
              <span className="mt">Add Deadline</span>
              <button className="xbtn" onClick={()=>setModal(false)}>&times;</button>
            </div>
            <div className="fg2">
              <div className="field"><label>Deadline Name *</label><input value={form.name} onChange={e=>fld('name',e.target.value)} placeholder="e.g. OIC Response Due"/></div>
              <div className="field"><label>Client</label><input value={form.client} onChange={e=>fld('client',e.target.value)}/></div>
            </div>
            <div className="fg2">
              <div className="field"><label>Type</label>
                <select value={form.type} onChange={e=>fld('type',e.target.value)}>
                  {TYPES.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="field"><label>Due Date *</label><input type="date" value={form.dueDate} onChange={e=>fld('dueDate',e.target.value)}/></div>
            </div>
            <div className="field"><label>Status</label>
              <select value={form.status} onChange={e=>fld('status',e.target.value)}>
                {STATUSES.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Add Deadline'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
