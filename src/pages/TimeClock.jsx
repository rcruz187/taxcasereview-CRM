import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const STAFF = ['Romy Cruz','Dana Richard','Yesenia Gonzalez']
const BLANK = { employee:'Romy Cruz', date:'', inTime:'', outTime:'', hours:'', notes:'' }

export default function TimeClock() {
  const [items, setItems]   = useState([])
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [toast, setToast]   = useState('')
  const [clocked, setClocked] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('timeentries').select('*').order('created_at', { ascending: false })
    if (data) setItems(data)
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3000) }
  function fld(k,v) { setForm(f=>({...f,[k]:v})) }

  function calcHours(inT, outT) {
    if (!inT || !outT) return ''
    const [ih,im] = inT.split(':').map(Number)
    const [oh,om] = outT.split(':').map(Number)
    const hrs = ((oh*60+om) - (ih*60+im)) / 60
    return hrs > 0 ? hrs.toFixed(2) : ''
  }

  async function save() {
    if (!form.employee || !form.date) { showToast('Employee and date required'); return }
    setSaving(true)
    const hours = calcHours(form.inTime, form.outTime) || form.hours
    const { error } = await supabase.from('timeentries').insert([{ ...form, hours, created_at: new Date().toISOString() }])
    setSaving(false)
    if (error) { showToast('Error: '+error.message); return }
    showToast('Time entry saved!')
    setModal(false); setForm(BLANK); load()
  }

  async function del(id) {
    await supabase.from('timeentries').delete().eq('id', id)
    showToast('Deleted'); load()
  }

  const totalHours = items.reduce((s,e)=>s+parseFloat(e.hours||0),0)

  return (
    <div>
      {toast && <div className="toast show">{toast}</div>}

      <div className="metrics">
        <div className="metric"><div className="ml">Total Hours Logged</div><div className="mv">{totalHours.toFixed(1)}h</div></div>
        <div className="metric"><div className="ml">Entries</div><div className="mv">{items.length}</div></div>
        {STAFF.map(s => {
          const h = items.filter(e=>e.employee===s).reduce((sum,e)=>sum+parseFloat(e.hours||0),0)
          return <div key={s} className="metric"><div className="ml">{s.split(' ')[0]}</div><div className="mv">{h.toFixed(1)}h</div></div>
        })}
      </div>

      <div className="card">
        <div className="ch">
          <span className="ct">Time Entries ({items.length})</span>
          <button className="btn pri" onClick={()=>setModal(true)}>+ Log Time</button>
        </div>
        <div className="ovx">
          <table>
            <thead><tr><th>Employee</th><th>Date</th><th>In</th><th>Out</th><th>Hours</th><th>Notes</th><th></th></tr></thead>
            <tbody>
              {items.length === 0
                ? <tr><td colSpan={7} style={{textAlign:'center',color:'var(--t3)',padding:20}}>No time entries yet</td></tr>
                : items.map(e => (
                  <tr key={e.id}>
                    <td style={{fontWeight:600}}>{e.employee}</td>
                    <td style={{color:'var(--t2)'}}>{e.date}</td>
                    <td>{e.inTime||'—'}</td>
                    <td>{e.outTime||<span className="bdg bg">Active</span>}</td>
                    <td style={{fontWeight:700,color:'var(--ok)'}}>{e.hours ? e.hours+'h' : '—'}</td>
                    <td style={{color:'var(--t2)',fontSize:12}}>{e.notes||'—'}</td>
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
            <div className="mh"><span className="mt">Log Time Entry</span><button className="xbtn" onClick={()=>setModal(false)}>&times;</button></div>
            <div className="fg2">
              <div className="field"><label>Employee</label>
                <select value={form.employee} onChange={e=>fld('employee',e.target.value)}>
                  {STAFF.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="field"><label>Date</label><input type="date" value={form.date} onChange={e=>fld('date',e.target.value)}/></div>
            </div>
            <div className="fg2">
              <div className="field"><label>Time In</label><input type="time" value={form.inTime} onChange={e=>fld('inTime',e.target.value)}/></div>
              <div className="field"><label>Time Out</label><input type="time" value={form.outTime} onChange={e=>{fld('outTime',e.target.value);fld('hours',calcHours(form.inTime,e.target.value))}}/></div>
            </div>
            <div className="fg2">
              <div className="field"><label>Hours</label><input type="number" step="0.25" value={form.hours} onChange={e=>fld('hours',e.target.value)} placeholder="Auto-calculated"/></div>
              <div className="field"><label>Notes</label><input value={form.notes} onChange={e=>fld('notes',e.target.value)}/></div>
            </div>
            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={save} disabled={saving}>
              {saving?'Saving...':'Save Entry'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
