import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Try both camelCase and snake_case for DB compatibility
const TEAM = [
  { name:'Romy Cruz',        role:'Tax Resolution Specialist', email:'romy@taxcasereview.org',    phone:'850-459-9039', pay_type:'Owner Draw', payType:'Owner Draw', access:'Super Admin', start_date:'2024-01-01', startDate:'2024-01-01', rate:'', notes:'' },
  { name:'Dana Richard',     role:'Tax Resolution Specialist', email:'dana@taxcasereview.org',    phone:'',             pay_type:'Salary',     payType:'Salary',     access:'Admin',       start_date:'2024-01-01', startDate:'2024-01-01', rate:'', notes:'' },
  { name:'Yesenia Gonzalez', role:'Tax Resolution Specialist', email:'yesenia@taxcasereview.org', phone:'',             pay_type:'Salary',     payType:'Salary',     access:'Admin',       start_date:'2024-01-01', startDate:'2024-01-01', rate:'', notes:'' },
]

const BLANK = { name:'', role:'Tax Resolution Specialist', email:'', phone:'', pay_type:'Hourly', payType:'Hourly', access:'Admin', start_date:'', startDate:'', rate:'', notes:'' }

export default function Employees() {
  const [items,   setItems]   = useState([])
  const [modal,   setModal]   = useState(false)
  const [editEmp, setEditEmp] = useState(null)
  const [form,    setForm]    = useState(BLANK)
  const [saving,  setSaving]  = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [toast,   setToast]   = useState('')
  const [seedLog, setSeedLog] = useState([])

  useEffect(() => { load() }, [])

  async function load() {
    const { data, error } = await supabase.from('employees').select('*').order('created_at', { ascending: false })
    if (error) { showToast('❌ Load error: ' + error.message); return }
    if (data) setItems(data)
  }

  async function seedTeam() {
    setSeeding(true)
    setSeedLog([])
    const log = []

    for (const member of TEAM) {
      // 1. Try to find existing record
      const { data: existing, error: findErr } = await supabase
        .from('employees').select('id').eq('email', member.email).maybeSingle()

      if (findErr) {
        log.push(`❌ Find ${member.name}: ${findErr.message}`)
        continue
      }

      if (existing) {
        // Update
        const { error: updErr } = await supabase
          .from('employees').update(member).eq('id', existing.id)
        log.push(updErr ? `❌ Update ${member.name}: ${updErr.message}` : `✅ Updated ${member.name}`)
      } else {
        // Insert
        const { error: insErr } = await supabase
          .from('employees').insert([{ ...member, created_at: new Date().toISOString() }])
        log.push(insErr ? `❌ Insert ${member.name}: ${insErr.message}` : `✅ Inserted ${member.name}`)
      }
    }

    setSeedLog(log)
    setSeeding(false)
    const failures = log.filter(l => l.startsWith('❌'))
    showToast(failures.length === 0 ? '✅ Team seeded successfully!' : `⚠️ Done with ${failures.length} error(s) — see log below`)
    load()
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),5000) }
  function fld(k,v) { setForm(f=>({...f,[k]:v,[k==='pay_type'?'payType':'startDate']:v})) }

  async function save() {
    if (!form.name.trim()) { showToast('Name is required'); return }
    setSaving(true)
    const { error } = await supabase.from('employees').insert([{ ...form, created_at: new Date().toISOString() }])
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

  const payType = e => e.pay_type || e.payType || '—'
  const startDate = e => e.start_date || e.startDate || '—'
  const accessColor = a => a === 'Super Admin' ? 'br' : a === 'Admin' ? 'bb' : 'bg'

  return (
    <div>
      {toast && <div className="toast show">{toast}</div>}
      <div className="card">
        <div className="ch">
          <span className="ct">Employees ({items.length})</span>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button className="btn sec" onClick={seedTeam} disabled={seeding}>
              {seeding ? '⏳ Seeding...' : '🌱 Seed Team (Romy, Dana, Yesenia)'}
            </button>
            <button className="btn pri" onClick={()=>{ setForm(BLANK); setModal(true) }}>+ Add Employee</button>
          </div>
        </div>

        {/* Seed log */}
        {seedLog.length > 0 && (
          <div style={{background:'var(--s3)',borderRadius:6,padding:10,margin:'0 0 12px',fontSize:12}}>
            <div style={{fontWeight:700,marginBottom:6,color:'var(--t2)'}}>Seed results:</div>
            {seedLog.map((l,i)=>(
              <div key={i} style={{color: l.startsWith('❌') ? 'var(--red)' : 'var(--green)', marginBottom:2}}>{l}</div>
            ))}
            <div style={{marginTop:8,color:'var(--t3)',fontSize:11}}>
              If you see column errors, run this SQL in Supabase → SQL Editor:<br/>
              <code style={{background:'var(--s2)',padding:'2px 6px',borderRadius:3,display:'inline-block',marginTop:4}}>
                ALTER TABLE employees ADD COLUMN IF NOT EXISTS pay_type text; ALTER TABLE employees ADD COLUMN IF NOT EXISTS start_date text;
              </code>
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <div style={{textAlign:'center',padding:40,color:'var(--t3)'}}>
            <div style={{fontSize:32,marginBottom:8}}>👥</div>
            <div style={{fontWeight:600,marginBottom:4}}>No employees yet</div>
            <div style={{fontSize:13,marginBottom:16}}>Click "Seed Team" to add Romy, Dana &amp; Yesenia automatically.</div>
          </div>
        ) : (
          <div className="ovx">
            <table>
              <thead>
                <tr><th>Name</th><th>Role</th><th>Email</th><th>Phone</th><th>Pay Type</th><th>Access</th><th>Since</th><th></th></tr>
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
                    <td><span className="bdg bn">{payType(e)}</span></td>
                    <td><span className={`bdg ${accessColor(e.access)}`}>{e.access}</span></td>
                    <td style={{color:'var(--t2)',fontSize:12}}>{startDate(e)}</td>
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

      {modal   && <EmpModal title="Add Employee"  form={form} fld={fld} saving={saving} onSave={save}     onClose={()=>setModal(false)}/>}
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
            <select value={form.pay_type||form.payType||'Hourly'} onChange={e=>fld('pay_type',e.target.value)}>
              <option>Hourly</option><option>Salary</option><option>1099 Contractor</option><option>Owner Draw</option>
            </select>
          </div>
        </div>
        <div className="fg2">
          <div className="field"><label>Rate ($/hr or annual)</label>
            <input type="number" value={form.rate||''} onChange={e=>fld('rate',e.target.value)} placeholder="e.g. 25.00"/>
          </div>
          <div className="field"><label>Start Date</label>
            <input type="date" value={form.start_date||form.startDate||''} onChange={e=>fld('start_date',e.target.value)}/>
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
