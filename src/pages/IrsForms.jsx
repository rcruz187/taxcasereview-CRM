import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BLANK = { formNumber:'2848', status:'Not Filed', client:'', caseNum:'', filedDate:'', notes:'' }

export default function IrsForms() {
  const [items, setItems]   = useState([])
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [toast, setToast]   = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('irsforms').select('*').order('created_at', { ascending: false })
    if (data) setItems(data)
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3000) }
  function fld(k,v) { setForm(f=>({...f,[k]:v})) }

  async function save() {
    if (!form.formNumber) { showToast('Form number required'); return }
    setSaving(true)
    const { error } = await supabase.from('irsforms').insert([{ ...form, created_at: new Date().toISOString() }])
    setSaving(false)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('IRS Form logged!')
    setModal(false)
    setForm(BLANK)
    load()
  }

  async function deleteItem(id) {
    await supabase.from('irsforms').delete().eq('id', id)
    showToast('Deleted'); load()
  }

  const STATUS_C = {'Not Filed':'bn',Draft:'ba',Sent:'bb',Filed:'bg','Pending IRS':'ba','In Review':'ba',Approved:'bg',Missing:'br'}

  return (
    <div>
      {toast && <div className="toast show">{toast}</div>}
      <div className="card">
        <div className="ch">
          <span className="ct">IRS Forms & Templates ({items.length})</span>
          <button className="btn pri" onClick={()=>setModal(true)}>+ Log IRS Form</button>
        </div>
        <div className="ovx">
          <table>
            <thead><tr><th>Form</th><th>Client</th><th>Case #</th><th>Filed Date</th><th>Status</th><th>Notes</th><th></th></tr></thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} style={{textAlign:'center',color:'var(--t3)',padding:20}}>No IRS forms logged yet</td></tr>
              ) : items.map(f => (
                <tr key={f.id}>
                  <td><span className="bdg bb" style={{fontWeight:700}}>Form {f.formNumber}</span></td>
                  <td style={{fontWeight:600}}>{f.client||'—'}</td>
                  <td style={{color:'var(--t2)'}}>{f.caseNum||'—'}</td>
                  <td style={{color:'var(--t2)'}}>{f.filedDate||'—'}</td>
                  <td><span className={`bdg ${STATUS_C[f.status]||'bn'}`}>{f.status}</span></td>
                  <td style={{color:'var(--t2)',fontSize:12}}>{f.notes||'—'}</td>
                  <td><button className="btn del" onClick={()=>deleteItem(f.id)}>Del</button></td>
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
              <span className="mt">Log IRS Form</span>
              <button className="xbtn" onClick={()=>setModal(false)}>&times;</button>
            </div>
            <div className="fg2">
              <div className="field"><label>Form Number</label>
                <select value={form.formNumber} onChange={e=>fld('formNumber',e.target.value)}>
                  {['2848','8821','433-A','433-B','433-F','656','9465','843','911'].map(f=><option key={f}>{f}</option>)}
                </select>
              </div>
              <div className="field"><label>Status</label>
                <select value={form.status} onChange={e=>fld('status',e.target.value)}>
                  {['Not Filed','Draft','Sent','Filed','Pending IRS','In Review','Approved','Missing'].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="fg2">
              <div className="field"><label>Client</label><input value={form.client} onChange={e=>fld('client',e.target.value)}/></div>
              <div className="field"><label>Case #</label><input value={form.caseNum} onChange={e=>fld('caseNum',e.target.value)}/></div>
            </div>
            <div className="fg2">
              <div className="field"><label>Filed Date</label><input type="date" value={form.filedDate} onChange={e=>fld('filedDate',e.target.value)}/></div>
              <div className="field"><label>Notes</label><input value={form.notes} onChange={e=>fld('notes',e.target.value)}/></div>
            </div>
            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Log IRS Form'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
