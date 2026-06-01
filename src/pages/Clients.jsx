import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS   = Array.from({length:31},(_,i)=>String(i+1).padStart(2,'0'))
const YDOB   = Array.from({length:80},(_,i)=>2005-i)

const BLANK_DEP = { name:'', ssn:'', dob:'', relationship:'Child' }

const BLANK = {
  clientType:'Individual', name:'', phone:'', phone2:'', email:'',
  street:'', city:'', state:'', zip:'', county:'',
  ssn:'', ein:'', dobM:'', dobD:'', dobY:'',
  spouseName:'', spouseSsn:'', filingStatus:'Single',
  irsBalance:'', issueType:'OIC', irsOrState:'IRS Federal', taxYears:'',
  clientSince:'', status:'Active', notes:'', assignedTo:'',
  dependents: []
}

function Bdg({s,c}) { return <span className={`bdg ${c||'bn'}`}>{s}</span> }

function DR({label, val}) {
  return (
    <div style={{display:'flex',borderBottom:'1px solid var(--br)',padding:'7px 0',gap:12,alignItems:'flex-start'}}>
      <div style={{minWidth:130,fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--t3)',paddingTop:1}}>{label}</div>
      <div style={{flex:1,fontSize:13,color:'var(--tx)'}}>{val || <span style={{color:'var(--t3)'}}>—</span>}</div>
    </div>
  )
}

function formatBalance(val) {
  if (!val) return '—'
  if (typeof val === 'string' && (val.includes('$') || isNaN(Number(val)))) return val
  const n = Number(val)
  return isNaN(n) ? val : '$' + n.toLocaleString()
}

function parseDependents(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return [] }
}

export default function Clients() {
  const [clients,   setClients]   = useState([])
  const [employees, setEmployees] = useState([])
  const [filter,    setFilter]    = useState('All')
  const [modal,     setModal]     = useState(false)
  const [editModal, setEditModal] = useState(false)
  const [form,      setForm]      = useState(BLANK)
  const [saving,    setSaving]    = useState(false)
  const [toast,     setToast]     = useState('')
  const [detail,    setDetail]    = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: cl }, { data: em }] = await Promise.all([
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('employees').select('id,name')
    ])
    if (cl) setClients(cl)
    if (em) setEmployees(em)
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3500) }
  function fld(k,v) { setForm(f=>({...f,[k]:v})) }

  const filtered = filter === 'All' ? clients : clients.filter(c => c.clientType === filter)

  function buildPayload(f) {
    const { dobM, dobD, dobY, id, created_at, ...rest } = f
    const dob = dobM && dobD && dobY ? `${dobM}/${dobD}/${dobY}` : f.dob || ''
    return { ...rest, dob, dependents: JSON.stringify(f.dependents || []) }
  }

  async function save() {
    if (!form.name.trim()) { showToast('Name is required'); return }
    setSaving(true)
    const { error } = await supabase.from('clients').insert([{ ...buildPayload(form), created_at: new Date().toISOString() }])
    setSaving(false)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('✅ Client added!')
    setModal(false); setForm(BLANK); load()
  }

  async function saveEdit() {
    setSaving(true)
    const { error } = await supabase.from('clients').update(buildPayload(form)).eq('id', form.id)
    setSaving(false)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('✅ Saved!')
    setEditModal(false)
    const { data } = await supabase.from('clients').select('*').eq('id', form.id).single()
    if (data) setDetail(data)
    load()
  }

  async function deleteClient(id) {
    if (!confirm('Delete this client?')) return
    await supabase.from('clients').delete().eq('id', id)
    showToast('Deleted'); setDetail(null); load()
  }

  function openEdit(c) {
    const deps = parseDependents(c.dependents)
    // Parse dob back into parts
    let dobM='', dobD='', dobY=''
    if (c.dob) {
      const parts = c.dob.split('/')
      if (parts.length === 3) { dobM = parts[0]; dobD = parts[1]; dobY = parts[2] }
    }
    setForm({ ...BLANK, ...c, dobM, dobD, dobY, dependents: deps })
    setEditModal(true)
  }

  const reps = employees.length > 0
    ? employees.map(e => e.name)
    : ['Romy Cruz', 'Dana Richard', 'Yesenia Gonzalez']

  // ── Detail View ──────────────────────────────────────────────────────────────
  if (detail) {
    const c = detail
    const deps = parseDependents(c.dependents)
    return (
      <div style={{maxWidth:900,margin:'0 auto'}}>
        {toast && <div className="toast show">{toast}</div>}
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
          <button className="btn" onClick={()=>setDetail(null)}>← Back to Clients</button>
          <button className="btn pri" onClick={()=>openEdit(c)} style={{marginLeft:'auto'}}>✏️ Edit</button>
          <button className="btn del" onClick={()=>deleteClient(c.id)}>🗑 Delete</button>
        </div>

        {/* Header */}
        <div className="card" style={{marginBottom:12}}>
          <div style={{display:'flex',alignItems:'center',gap:16,padding:'4px 0 8px'}}>
            <div style={{width:56,height:56,borderRadius:'50%',background:'var(--blue)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:22,color:'#fff',flexShrink:0}}>
              {(c.name||'?')[0].toUpperCase()}
            </div>
            <div>
              <div style={{fontSize:22,fontWeight:800}}>{c.name}</div>
              <div style={{display:'flex',gap:6,marginTop:5,flexWrap:'wrap'}}>
                <Bdg s={c.clientType||'Individual'} c="bb"/>
                <Bdg s={c.status||'Active'} c={c.status==='Active'?'bg':'bn'}/>
                {c.irsOrState && <Bdg s={c.irsOrState} c="ba"/>}
                {c.issueType  && <Bdg s={c.issueType}  c="bb"/>}
              </div>
            </div>
          </div>
        </div>

        <div className="g2" style={{alignItems:'start',gap:12}}>
          {/* Left column */}
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div className="card">
              <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)',marginBottom:10}}>Contact Info</div>
              <DR label="Phone"   val={c.phone} />
              <DR label="Phone 2" val={c.phone2} />
              <DR label="Email"   val={c.email} />
              <DR label="Address" val={[c.street,c.city,c.state,c.zip].filter(Boolean).join(', ')} />
              <DR label="County"  val={c.county} />
            </div>

            <div className="card">
              <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)',marginBottom:10}}>🔒 Taxpayer Info</div>
              <DR label="SSN"           val={c.ssn ? '***-**-' + c.ssn.replace(/-/g,'').slice(-4) : null} />
              <DR label="EIN"           val={c.ein} />
              <DR label="Date of Birth" val={c.dob} />
              <DR label="Filing Status" val={c.filingStatus} />
              <DR label="Spouse Name"   val={c.spouseName} />
              <DR label="Spouse SSN"    val={c.spouseSsn ? '***-**-' + c.spouseSsn.replace(/-/g,'').slice(-4) : null} />
            </div>

            {/* Dependents */}
            {deps.length > 0 && (
              <div className="card">
                <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)',marginBottom:10}}>👨‍👩‍👧 Dependents ({deps.length})</div>
                {deps.map((d,i) => (
                  <div key={i} style={{borderBottom:'1px solid var(--br)',padding:'8px 0',display:'flex',gap:12,alignItems:'flex-start'}}>
                    <div style={{width:28,height:28,borderRadius:'50%',background:'var(--s3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0,color:'var(--t2)'}}>
                      {i+1}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,fontSize:13}}>{d.name||'Unnamed'}</div>
                      <div style={{fontSize:11,color:'var(--t3)',marginTop:2,display:'flex',gap:12,flexWrap:'wrap'}}>
                        <span>{d.relationship||'—'}</span>
                        {d.dob && <span>DOB: {d.dob}</span>}
                        {d.ssn && <span>SSN: ***-**-{d.ssn.replace(/-/g,'').slice(-4)}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right column */}
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div className="card">
              <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)',marginBottom:10}}>IRS / Case Info</div>
              <DR label="IRS Balance"  val={formatBalance(c.irsBalance)} />
              <DR label="Issue Type"   val={c.issueType} />
              <DR label="IRS or State" val={c.irsOrState} />
              <DR label="Tax Years"    val={c.taxYears} />
              <DR label="Assigned Rep" val={c.assignedTo} />
              <DR label="Client Since" val={c.clientSince} />
            </div>

            {c.notes && (
              <div className="card">
                <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)',marginBottom:8}}>Notes</div>
                <div style={{fontSize:13,color:'var(--t2)',lineHeight:1.7,whiteSpace:'pre-wrap'}}>{c.notes}</div>
              </div>
            )}
          </div>
        </div>

        {editModal && (
          <ClientFormModal
            form={form} fld={fld} reps={reps} saving={saving}
            onSave={saveEdit} onClose={()=>setEditModal(false)} title="Edit Client"
          />
        )}
      </div>
    )
  }

  // ── List View ────────────────────────────────────────────────────────────────
  return (
    <div>
      {toast && <div className="toast show">{toast}</div>}
      <div className="card">
        <div className="ch">
          <span className="ct">Client Roster ({filtered.length})</span>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
            {['All','Individual','Business'].map(f=>(
              <span key={f} className={`chip${filter===f?' on':''}`} onClick={()=>setFilter(f)}>{f}</span>
            ))}
            <button className="btn pri" onClick={()=>{ setForm(BLANK); setModal(true) }}>+ Add Client</button>
          </div>
        </div>
        <div className="ovx">
          <table>
            <thead>
              <tr><th>Name</th><th>Type</th><th>Phone</th><th>Email</th><th>IRS Balance</th><th>Issue</th><th>Assigned</th><th>Status</th><th>Since</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={10} style={{textAlign:'center',color:'var(--t3)',padding:20}}>No clients yet</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} style={{cursor:'pointer'}} onClick={()=>setDetail(c)}>
                  <td style={{fontWeight:600}}>{c.name}</td>
                  <td><span className="bdg bb">{c.clientType||'Individual'}</span></td>
                  <td>{c.phone||'—'}</td>
                  <td style={{color:'var(--t2)',fontSize:12}}>{c.email||'—'}</td>
                  <td>{formatBalance(c.irsBalance)}</td>
                  <td>{c.issueType||'—'}</td>
                  <td style={{color:'var(--t2)',fontSize:12}}>{c.assignedTo||'—'}</td>
                  <td><span className={`bdg ${c.status==='Active'?'bg':'bn'}`}>{c.status||'Active'}</span></td>
                  <td style={{color:'var(--t2)',fontSize:12}}>{c.clientSince||'—'}</td>
                  <td onClick={e=>e.stopPropagation()}>
                    <button className="btn del" onClick={()=>deleteClient(c.id)}>Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <ClientFormModal
          form={form} fld={fld} reps={reps} saving={saving}
          onSave={save} onClose={()=>setModal(false)} title="Add Client"
        />
      )}
    </div>
  )
}

// ── Client Form Modal (Add + Edit) ────────────────────────────────────────────
function ClientFormModal({ form, fld, reps, saving, onSave, onClose, title }) {
  function addDependent() {
    fld('dependents', [...(form.dependents||[]), { ...BLANK_DEP }])
  }
  function updateDep(i, k, v) {
    const deps = [...(form.dependents||[])]
    deps[i] = { ...deps[i], [k]: v }
    fld('dependents', deps)
  }
  function removeDep(i) {
    const deps = [...(form.dependents||[])]
    deps.splice(i, 1)
    fld('dependents', deps)
  }

  return (
    <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{width:680,maxHeight:'92vh',overflowY:'auto'}}>
        <div className="mh">
          <span className="mt">{title}</span>
          <button className="xbtn" onClick={onClose}>&times;</button>
        </div>

        {/* Basic Info */}
        <div className="fg2">
          <div className="field"><label>Client Type</label>
            <select value={form.clientType} onChange={e=>fld('clientType',e.target.value)}>
              <option>Individual</option><option>Business</option><option>Individual &amp; Biz</option>
            </select>
          </div>
          <div className="field"><label>Full Name *</label>
            <input value={form.name} onChange={e=>fld('name',e.target.value)} placeholder="First Last / Business Name"/>
          </div>
        </div>

        <div className="fg3">
          <div className="field"><label>Phone 1</label><input value={form.phone||''} onChange={e=>fld('phone',e.target.value)} placeholder="(305) 555-0000"/></div>
          <div className="field"><label>Phone 2</label><input value={form.phone2||''} onChange={e=>fld('phone2',e.target.value)} placeholder="(305) 555-0000"/></div>
          <div className="field"><label>Email</label><input value={form.email||''} onChange={e=>fld('email',e.target.value)}/></div>
        </div>

        <div className="field"><label>Street Address</label><input value={form.street||''} onChange={e=>fld('street',e.target.value)}/></div>
        <div className="fg3">
          <div className="field"><label>City</label><input value={form.city||''} onChange={e=>fld('city',e.target.value)}/></div>
          <div className="field"><label>State</label>
            <select value={form.state||''} onChange={e=>fld('state',e.target.value)}>
              <option value="">Select...</option>{STATES.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="field"><label>ZIP</label><input value={form.zip||''} onChange={e=>fld('zip',e.target.value)}/></div>
        </div>
        <div className="field"><label>County</label><input value={form.county||''} onChange={e=>fld('county',e.target.value)} placeholder="e.g. Palm Beach"/></div>

        {/* Taxpayer Info */}
        <div style={{background:'var(--s3)',borderRadius:8,padding:12,marginBottom:10}}>
          <div style={{fontWeight:700,fontSize:12,marginBottom:8}}>🔒 Taxpayer Info</div>
          <div className="fg2">
            <div className="field"><label>SSN</label><input value={form.ssn||''} onChange={e=>fld('ssn',e.target.value)} placeholder="XXX-XX-XXXX" maxLength={11}/></div>
            <div className="field"><label>EIN (if business)</label><input value={form.ein||''} onChange={e=>fld('ein',e.target.value)} placeholder="XX-XXXXXXX"/></div>
          </div>
          <div className="field"><label>Date of Birth</label>
            <div style={{display:'flex',gap:6}}>
              <select value={form.dobM||''} onChange={e=>fld('dobM',e.target.value)} style={{flex:2}}>
                <option value="">Month</option>{MONTHS.map((m,i)=><option key={m} value={String(i+1).padStart(2,'0')}>{m}</option>)}
              </select>
              <select value={form.dobD||''} onChange={e=>fld('dobD',e.target.value)} style={{flex:1}}>
                <option value="">Day</option>{DAYS.map(d=><option key={d}>{d}</option>)}
              </select>
              <select value={form.dobY||''} onChange={e=>fld('dobY',e.target.value)} style={{flex:2}}>
                <option value="">Year</option>{YDOB.map(y=><option key={y}>{y}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Spouse / Partner */}
        <div style={{background:'var(--s3)',borderRadius:8,padding:12,marginBottom:10}}>
          <div style={{fontWeight:700,fontSize:12,marginBottom:8}}>👥 Spouse / Partner</div>
          <div className="fg2">
            <div className="field"><label>Spouse Full Name</label><input value={form.spouseName||''} onChange={e=>fld('spouseName',e.target.value)}/></div>
            <div className="field"><label>Spouse SSN</label><input value={form.spouseSsn||''} onChange={e=>fld('spouseSsn',e.target.value)} placeholder="XXX-XX-XXXX" maxLength={11}/></div>
          </div>
          <div className="field"><label>Filing Status</label>
            <select value={form.filingStatus||'Single'} onChange={e=>fld('filingStatus',e.target.value)}>
              {['Single','Married Filing Jointly','Married Filing Separately','Head of Household','Qualifying Widow(er)'].map(o=><option key={o}>{o}</option>)}
            </select>
          </div>
        </div>

        {/* Dependents */}
        <div style={{background:'var(--s3)',borderRadius:8,padding:12,marginBottom:10}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <div style={{fontWeight:700,fontSize:12}}>👨‍👩‍👧 Dependents ({(form.dependents||[]).length})</div>
            <button className="btn sec" style={{fontSize:11,padding:'3px 10px'}} onClick={addDependent}>+ Add Dependent</button>
          </div>

          {(form.dependents||[]).length === 0 && (
            <div style={{textAlign:'center',color:'var(--t3)',fontSize:12,padding:'10px 0'}}>
              No dependents added — click "+ Add Dependent" to add one.
            </div>
          )}

          {(form.dependents||[]).map((d,i) => (
            <div key={i} style={{background:'var(--s2)',borderRadius:6,padding:10,marginBottom:8,position:'relative'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                <span style={{fontSize:11,fontWeight:700,color:'var(--t2)',textTransform:'uppercase'}}>Dependent {i+1}</span>
                <button onClick={()=>removeDep(i)} style={{background:'none',border:'none',color:'var(--red)',cursor:'pointer',fontSize:16,lineHeight:1}}>×</button>
              </div>
              <div className="fg2">
                <div className="field"><label>Full Name</label>
                  <input value={d.name||''} onChange={e=>updateDep(i,'name',e.target.value)} placeholder="First Last"/>
                </div>
                <div className="field"><label>Relationship</label>
                  <select value={d.relationship||'Child'} onChange={e=>updateDep(i,'relationship',e.target.value)}>
                    {['Child','Stepchild','Foster Child','Sibling','Parent','Other'].map(r=><option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div className="fg2">
                <div className="field"><label>Date of Birth</label>
                  <input type="date" value={d.dob||''} onChange={e=>updateDep(i,'dob',e.target.value)}/>
                </div>
                <div className="field"><label>SSN</label>
                  <input value={d.ssn||''} onChange={e=>updateDep(i,'ssn',e.target.value)} placeholder="XXX-XX-XXXX" maxLength={11}/>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* IRS / Case Info */}
        <div className="fg2">
          <div className="field"><label>Est. IRS Balance ($)</label>
            <input type="number" value={form.irsBalance||''} onChange={e=>fld('irsBalance',e.target.value)} placeholder="e.g. 45000"/>
          </div>
          <div className="field"><label>Issue Type</label>
            <select value={form.issueType||'OIC'} onChange={e=>fld('issueType',e.target.value)}>
              {['OIC','Installment Agreement','CNC','Penalty Abatement','Payroll Tax','Unfiled Returns','Appeals','Audit','Liens/Levies','Tax Investigation','ACS','Notice Status','Other'].map(o=><option key={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <div className="fg2">
          <div className="field"><label>IRS or State?</label>
            <select value={form.irsOrState||'IRS Federal'} onChange={e=>fld('irsOrState',e.target.value)}>
              <option>IRS Federal</option><option>State</option><option>Both IRS + State</option>
            </select>
          </div>
          <div className="field"><label>Tax Years</label>
            <input value={form.taxYears||''} onChange={e=>fld('taxYears',e.target.value)} placeholder="2020, 2021, 2022"/>
          </div>
        </div>
        <div className="fg3">
          <div className="field"><label>Client Since</label>
            <input type="date" value={form.clientSince||''} onChange={e=>fld('clientSince',e.target.value)}/>
          </div>
          <div className="field"><label>Status</label>
            <select value={form.status||'Active'} onChange={e=>fld('status',e.target.value)}>
              <option>Active</option><option>Inactive</option><option>Prospect</option>
            </select>
          </div>
          <div className="field"><label>Assigned Rep</label>
            <select value={form.assignedTo||''} onChange={e=>fld('assignedTo',e.target.value)}>
              <option value="">Unassigned</option>
              {reps.map(r=><option key={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <div className="field"><label>Notes</label>
          <textarea value={form.notes||''} onChange={e=>fld('notes',e.target.value)} style={{minHeight:80}}/>
        </div>

        <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={onSave} disabled={saving}>
          {saving ? 'Saving...' : title}
        </button>
      </div>
    </div>
  )
}
