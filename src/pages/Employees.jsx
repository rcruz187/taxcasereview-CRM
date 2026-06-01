import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BLANK = { name:'', role:'Tax Resolution Specialist', email:'', phone:'', payType:'Hourly', rate:'', startDate:'', access:'Admin', notes:'' }

const TEAM = [
  { name:'Romy Cruz',        role:'Tax Resolution Specialist', email:'romy@taxcasereview.org',    phone:'850-459-9039', payType:'Owner Draw', access:'Super Admin', startDate:'2024-01-01', rate:'', notes:'' },
  { name:'Dana Richard',     role:'Tax Resolution Specialist', email:'dana@taxcasereview.org',    phone:'',            payType:'Salary',     access:'Admin',       startDate:'2024-01-01', rate:'', notes:'' },
  { name:'Yesenia Gonzalez', role:'Tax Resolution Specialist', email:'yesenia@taxcasereview.org', phone:'',            payType:'Salary',     access:'Admin',       startDate:'2024-01-01', rate:'', notes:'' },
]

export default function Employees() {
  const [items,   setItems]   = useState([])
  const [modal,   setModal]   = useState(false)
  const [editEmp, setEditEmp] = useState(null)
  const [form,    setForm]    = useState(BLANK)
  const [saving,  setSaving]  = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [toast,   setToast]   = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data, error } = await supabase.from('employees').select('*').order('created_at', { ascending: false })
    if (error) { showToast('❌ Load error: ' + error.message); return }
    if (data) setItems(data)
  }

  async function seedTeam() {
    setSeeding(true)
    showToast('Seeding team...')
    let successCount = 0
    let lastError = null

    for (const member of TEAM) {
      // Try update first (if email exists), then insert
      const { data: existing } = await supabase.from('employees').select('id').eq('email', member.email).maybeSingle()
      if (existing) {
        const { error } = await supabase.from('employees').update(member).eq('email', member.email)
        if (error) { lastError = error } else { successCount++ }
      } else {
        const { error } = await supabase.from('employees').insert([{ ...member, created_at: new Date().toISOString() }])
        if (error) { lastError = error } else { successCount++ }
      }
    }

    setSeeding(false)
    if (lastError) {
      showToast(`⚠️ Seeded ${successCount}/3 — Error: ${lastError.message}`)
    } else {
      showToast(`✅ Team seeded (${successCount} members)!`)
    }
    load()
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),4000) }
  function fld(k,v) { setForm(f=>({...f,[k]:v})) }

  async function save() {
    if (!form.name.trim()) { showToast('Name is required'); return }
    setSaving(true)
    const payload = { ...form, created_at: new Date().toISOString() }
    const { error } = await supabase.from('employees').insert([payload])
    setSaving(false)
    if (error) { showToast('❌ Error: ' + error.message); return }
    showToast('✅ Employee added!')
    setModal(false); setForm(BLANK); load()
  }

  async function saveEdit() {
    setSaving(true)
    const { id, created_at, ...rest } = form
    const { error } = await supabase.from('employees').update(rest).eq('id', id)
    setSaving(false)
    if (error) { showToast('❌ Error: ' + error.message); return }
    showToast('✅ Saved!'); setEditEmp(null); load()
  }

  async function deleteItem(id) {
    if (!confirm('Delete this employee?')) return
    const { error } = await supabase.from('employees').delete().eq('id', id)
    if (error) { showToast('❌ ' + error.message); return }
    showToast('Deleted'); load()
  }

  function openEdit(e) { setForm({ ...BLANK, ...e }); setEditEmp(e) }

  const accessColor = a => a === 'Super Admin' ? 'br' : a === 'Admin' ? 'bb' : 'bg'

  return (
    <div>
      {toast && <div className="toast show">{toast}</div>}
      <div className="card">
        <div className="ch">
          <span className="ct">Employees ({items.length})</span>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button className="btn sec" onClick={seedTeam} disabled={seeding}>
              {seeding ? 'Seeding...' : '🌱 Seed Team'}
            </button>
            <button className="btn pri" onClick={()=>{ setForm(BLANK); setModal(true) }}>+ Add Employee</button>
          </div>
        </div>

        {items.length === 0 ? (
          <div style={{textAlign:'center',padding:40,color:'var(--t3)'}}>
            <div style={{fontSize:32,marginBottom:8}}>👥</div>
            <div style={{fontWeight:600,marginBottom:4}}>No employees yet</div>
            <div style={{fontSize:13,marginBottom:16}}>Click "Seed Team" to add Romy, Dana &amp; Yesenia, or add employees manually.</div>
            <button className="btn pri" onClick={seedTeam} disabled={seeding}>{seeding ? 'Seeding...' : '🌱 Seed Team'}</button>
          </div>
        ) : (
          <div className="ovx">
            <table>
              <thead>
                <tr><th>Name</th><th>Role</th><th>Email</th><th>Phone</th><th>Pay Type</th><th>Rate</th><th>Access</th><th>Since</th><th></th></tr>
              </thead>
              <tbody>
                {items.map(e => (
                  <tr key={e.id}>
                    <td>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <div style={{width:30,height:30,borderRadius:'50%',background:'var(--blue)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:800,color:'#fff',flexShrink:0}}>
                          {(e.name||'?')[0].toUpperCase()}
                        </div>
                        <span style={{fontWeight:600}}>{e.name}</span>
                      </div>
                    </td>
                    <td style={{color:'var(--t2)',fontSize:12}}>{e.role}</td>
                    <td style={{color:'var(--t2)',fontSize:12}}>{e.email||'—'}</td>
                    <td style={{fontSize:12}}>{e.phone||'—'}</td>
                    <td><span className="bdg bn">{e.payType}</span></td>
                    <td style={{fontSize:12}}>{e.rate ? '$'+e.rate : '—'}</td>
                    <td><span className={`bdg ${accessColor(e.access)}`}>{e.access}</span></td>
                    <td style={{color:'var(--t2)',fontSize:12}}>{e.startDate||'—'}</td>
                    <td style={{display:'flex',gap:4}}>
                      <button className="btn sec" style={{fontSize:11,padding:'3px 8px'}} onClick={()=>openEdit(e)}>Edit</button>
                      <button className="btn del" style={{fontSize:11,padding:'3px 8px'}} onClick={()=>deleteItem(e.id)}>Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Modal */}
      {modal && <EmpModal title="Add Employee" form={form} fld={fld} saving={saving} onSave={save} onClose={()=>setModal(false)}/>}

      {/* Edit Modal */}
      {editEmp && <EmpModal title="Edit Employee" form={form} fld={fld} saving={saving} onSave={saveEdit} onClose={()=>setEditEmp(null)}/>}
    </div>
  )
}

function EmpModal({ title, form, fld, saving, onSave, onClose }) {
  return (
    <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{width:600,maxHeight:'90vh',overflowY:'auto'}}>
        <div className="mh">
          <span className="mt">{title}</span>
          <button className="xbtn" onClick={onClose}>&times;</button>
        </div>

        <div className="fg2">
          <div className="field"><label>Full Name *</label>
            <input value={form.name} onChange={e=>fld('name',e.target.value)} placeholder="First Last"/>
          </div>
          <div className="field"><label>Role</label>
            <select value={form.role} onChange={e=>fld('role',e.target.value)}>
              {['Tax Resolution Specialist','Tax Preparer','Case Manager','Admin','Receptionist','1099 Contractor','Office Manager'].map(r=><option key={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <div className="fg2">
          <div className="field"><label>Email</label>
            <input value={form.email||''} onChange={e=>fld('email',e.target.value)} placeholder="email@taxcasereview.org"/>
          </div>
          <div className="field"><label>Phone</label>
            <input value={form.phone||''} onChange={e=>fld('phone',e.target.value)} placeholder="(305) 555-0000"/>
          </div>
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
          <div className="field"><label>Rate ($/hr or annual)</label>
            <input type="number" value={form.rate||''} onChange={e=>fld('rate',e.target.value)} placeholder="e.g. 25.00"/>
          </div>
          <div className="field"><label>Start Date</label>
            <input type="date" value={form.startDate||''} onChange={e=>fld('startDate',e.target.value)}/>
          </div>
        </div>

        <div className="field"><label>Notes</label>
          <textarea value={form.notes||''} onChange={e=>fld('notes',e.target.value)} style={{minHeight:60}}/>
        </div>

        <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={onSave} disabled={saving}>
          {saving ? 'Saving...' : title}
        </button>
      </div>
    </div>
  )
}
