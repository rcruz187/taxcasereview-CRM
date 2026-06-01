import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BLANK = { name:'', role:'Tax Resolution Specialist', email:'', phone:'', payType:'Hourly', rate:'', startDate:'', access:'Admin', notes:'' }

export default function Employees() {
  const [items, setItems]   = useState([])
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [toast, setToast]   = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data, error } = await supabase.from('employees').select('*').order('created_at', { ascending: false })
    if (error) { showToast('Error loading: ' + error.message); return }
    if (data) setItems(data)
  }

  async function seedTeam() {
    setSaving(true)
    const { error } = await supabase.from('employees').insert([
      { name:'Romy Cruz',        role:'Tax Resolution Specialist', email:'romy@taxcasereview.org',    phone:'850-459-9039', payType:'Owner Draw', access:'Super Admin', startDate:'2024-01-01', created_at: new Date().toISOString() },
      { name:'Dana Richard',     role:'Tax Resolution Specialist', email:'dana@taxcasereview.org',    phone:'',            payType:'Salary',     access:'Admin',       startDate:'2024-01-01', created_at: new Date().toISOString() },
      { name:'Yesenia Gonzalez', role:'Tax Resolution Specialist', email:'yesenia@taxcasereview.org', phone:'',            payType:'Salary',     access:'Admin',       startDate:'2024-01-01', created_at: new Date().toISOString() },
    ])
    setSaving(false)
    if (error) { showToast('Seed error: ' + error.message); return }
    showToast('✅ Team seeded!')
    load()
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3000) }
  function fld(k,v) { setForm(f=>({...f,[k]:v})) }

  async function save() {
    if (!form.name) { showToast('Name required'); return }
    setSaving(true)
    const { error } = await supabase.from('employees').insert([{ ...form, created_at: new Date().toISOString() }])
    setSaving(false)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('Employee added!')
    setModal(false)
    setForm(BLANK)
    load()
  }

  async function deleteItem(id) {
    await supabase.from('employees').delete().eq('id', id)
    showToast('Deleted'); load()
  }

  return (
    <div>
      {toast && <div className="toast show">{toast}</div>}
      <div className="card">
        <div className="ch">
          <span className="ct">Employees ({items.length})</span>
          <div style={{display:'flex',gap:8}}>
            {items.length === 0 && <button className="btn sec" onClick={seedTeam} disabled={saving}>🌱 Seed Team (Romy, Dana, Yesenia)</button>}
            <button className="btn pri" onClick={()=>setModal(true)}>+ Add Employee</button>
          </div>
        </div>
        <div className="ovx">
          <table>
            <thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Phone</th><th>Pay Type</th><th>Access</th><th>Since</th><th></th></tr></thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={8} style={{textAlign:'center',color:'var(--t3)',padding:20}}>No employees yet</td></tr>
              ) : items.map(e => (
                <tr key={e.id}>
                  <td style={{fontWeight:600}}>{e.name}</td>
                  <td style={{color:'var(--t2)'}}>{e.role}</td>
                  <td style={{color:'var(--t2)'}}>{e.email||'—'}</td>
                  <td>{e.phone||'—'}</td>
                  <td><span className="bdg bn">{e.payType}</span></td>
                  <td><span className={`bdg ${e.access==='Super Admin'?'br':e.access==='Admin'?'bb':'bg'}`}>{e.access}</span></td>
                  <td style={{color:'var(--t2)'}}>{e.startDate||'—'}</td>
                  <td><button className="btn del" onClick={()=>deleteItem(e.id)}>Del</button></td>
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
              <span className="mt">Add Employee</span>
              <button className="xbtn" onClick={()=>setModal(false)}>&times;</button>
            </div>
            <div className="fg2">
              <div className="field"><label>Full Name *</label><input value={form.name} onChange={e=>fld('name',e.target.value)} placeholder="First Last"/></div>
              <div className="field"><label>Role</label>
                <select value={form.role} onChange={e=>fld('role',e.target.value)}>
                  {['Tax Resolution Specialist','Tax Preparer','Case Manager','Admin','Receptionist','1099 Contractor'].map(r=><option key={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="fg2">
              <div className="field"><label>Email</label><input value={form.email} onChange={e=>fld('email',e.target.value)} placeholder="email@taxcasereview.org"/></div>
              <div className="field"><label>Phone</label><input value={form.phone} onChange={e=>fld('phone',e.target.value)} placeholder="(305) 555-0000"/></div>
            </div>
            <div className="fg2">
              <div className="field"><label>Access Level</label>
                <select value={form.access} onChange={e=>fld('access',e.target.value)}>
                  <option>Super Admin</option><option>Admin</option><option>Staff</option><option>View Only</option>
                </select>
              </div>
              <div className="field"><label>Pay Type</label>
                <select value={form.payType} onChange={e=>fld('payType',e.target.value)}>
                  <option>Hourly</option><option>Salary</option><option>1099 Contractor</option><option>Owner Draw</option>
                </select>
              </div>
            </div>
            <div className="fg2">
              <div className="field"><label>Rate ($/hr or annual)</label><input type="number" value={form.rate} onChange={e=>fld('rate',e.target.value)} placeholder="e.g. 25.00"/></div>
              <div className="field"><label>Start Date</label><input type="date" value={form.startDate} onChange={e=>fld('startDate',e.target.value)}/></div>
            </div>
            <div style={{background:'var(--s2)',borderRadius:7,padding:10,fontSize:12,color:'var(--t3)',marginBottom:10}}>
              Employee will be added to the system with the specified access level.
            </div>
            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Add Employee'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
