import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS = Array.from({length:31},(_,i)=>String(i+1).padStart(2,'0'))
const YEARS_DOB = Array.from({length:80},(_,i)=>2005-i)

const BLANK = {
  clientType:'Individual', name:'', phone:'', phone2:'', email:'',
  street:'', city:'', state:'', zip:'', county:'',
  ssn:'', ein:'', dobM:'', dobD:'', dobY:'',
  spouse:'', spouseSsn:'', sdobM:'', sdobD:'', sdobY:'',
  filingStatus:'Single',
  irsBalance:'', issueType:'OIC', irsOrState:'IRS Federal', taxYears:'',
  clientSince:'', status:'Active', notes:'',
  assist:'Personal', irsOrStateTop:'IRS Federal'
}

function SBdg({s}) {
  const m = {Active:'bg',Inactive:'bn',Prospect:'ba',Individual:'bb',Business:'bb'}
  return <span className={`bdg ${m[s]||'bn'}`}>{s}</span>
}

export default function Clients() {
  const [clients, setClients] = useState([])
  const [filter, setFilter]   = useState('All')
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(BLANK)
  const [saving, setSaving]   = useState(false)
  const [toast, setToast]     = useState('')
  const [detail, setDetail]   = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('clients').select('*').order('created_at', { ascending: false })
    if (data) setClients(data)
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3000) }
  function fld(k,v) { setForm(f=>({...f,[k]:v})) }

  const filtered = filter === 'All' ? clients : clients.filter(c => c.clientType === filter)

  async function save() {
    if (!form.name.trim()) { showToast('Name is required'); return }
    setSaving(true)
    const { error } = await supabase.from('clients').insert([{ ...form, created_at: new Date().toISOString() }])
    setSaving(false)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('Client added!')
    setModal(false)
    setForm(BLANK)
    load()
  }

  async function deleteClient(id) {
    if (!confirm('Delete this client?')) return
    await supabase.from('clients').delete().eq('id', id)
    showToast('Deleted')
    load()
  }

  if (detail) {
    const c = detail
    return (
      <div>
        <button className="btn" style={{marginBottom:12}} onClick={()=>setDetail(null)}>← Back to Clients</button>
        <div className="card">
          <div className="ch">
            <div>
              <div style={{fontSize:18,fontWeight:800}}>{c.name}</div>
              <div style={{display:'flex',gap:6,marginTop:4,flexWrap:'wrap'}}>
                <SBdg s={c.clientType||'Individual'}/>
                <SBdg s={c.status||'Active'}/>
              </div>
            </div>
          </div>
          <div className="fg2">
            <div><div style={{color:'var(--t3)',fontSize:10,textTransform:'uppercase',marginBottom:2}}>Phone</div><div>{c.phone||'—'}</div></div>
            <div><div style={{color:'var(--t3)',fontSize:10,textTransform:'uppercase',marginBottom:2}}>Email</div><div>{c.email||'—'}</div></div>
            <div><div style={{color:'var(--t3)',fontSize:10,textTransform:'uppercase',marginBottom:2}}>Issue</div><div>{c.issueType||'—'}</div></div>
            <div><div style={{color:'var(--t3)',fontSize:10,textTransform:'uppercase',marginBottom:2}}>IRS Balance</div><div>{c.irsBalance ? '$'+Number(c.irsBalance).toLocaleString() : '—'}</div></div>
            <div><div style={{color:'var(--t3)',fontSize:10,textTransform:'uppercase',marginBottom:2}}>Tax Years</div><div>{c.taxYears||'—'}</div></div>
            <div><div style={{color:'var(--t3)',fontSize:10,textTransform:'uppercase',marginBottom:2}}>Client Since</div><div>{c.clientSince||'—'}</div></div>
          </div>
          {c.notes && <div style={{marginTop:12,padding:10,background:'var(--s2)',borderRadius:7,fontSize:12.5}}>{c.notes}</div>}
        </div>
      </div>
    )
  }

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
            <button className="btn pri" onClick={()=>setModal(true)}>+ Add Client</button>
          </div>
        </div>
        <div className="ovx">
          <table>
            <thead>
              <tr><th>Name</th><th>Type</th><th>Phone</th><th>Email</th><th>IRS Balance</th><th>Issue</th><th>Status</th><th>Since</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} style={{textAlign:'center',color:'var(--t3)',padding:20}}>No clients yet</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} style={{cursor:'pointer'}} onClick={()=>setDetail(c)}>
                  <td style={{fontWeight:600}}>{c.name}</td>
                  <td><span className="bdg bb">{c.clientType||'Individual'}</span></td>
                  <td>{c.phone||'—'}</td>
                  <td style={{color:'var(--t2)'}}>{c.email||'—'}</td>
                  <td>{c.irsBalance ? '$'+Number(c.irsBalance).toLocaleString() : '—'}</td>
                  <td>{c.issueType||'—'}</td>
                  <td><SBdg s={c.status||'Active'}/></td>
                  <td style={{color:'var(--t2)'}}>{c.clientSince||'—'}</td>
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
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal" style={{width:640}}>
            <div className="mh">
              <span className="mt">Add Client</span>
              <button className="xbtn" onClick={()=>setModal(false)}>&times;</button>
            </div>

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
              <div className="field"><label>Phone 1 (Cell)</label><input value={form.phone} onChange={e=>fld('phone',e.target.value)} placeholder="(305) 555-0000"/></div>
              <div className="field"><label>Phone 2</label><input value={form.phone2} onChange={e=>fld('phone2',e.target.value)} placeholder="(305) 555-0000"/></div>
              <div className="field"><label>Email</label><input value={form.email} onChange={e=>fld('email',e.target.value)}/></div>
            </div>
            <div className="field"><label>Street Address</label><input value={form.street} onChange={e=>fld('street',e.target.value)}/></div>
            <div className="fg3">
              <div className="field"><label>City</label><input value={form.city} onChange={e=>fld('city',e.target.value)}/></div>
              <div className="field"><label>State</label>
                <select value={form.state} onChange={e=>fld('state',e.target.value)}>
                  <option value="">Select...</option>{STATES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="field"><label>ZIP</label><input value={form.zip} onChange={e=>fld('zip',e.target.value)}/></div>
            </div>

            {/* Taxpayer Info */}
            <div style={{background:'var(--s3)',borderRadius:8,padding:12,marginBottom:10}}>
              <div style={{fontWeight:700,fontSize:12,marginBottom:8}}>Taxpayer Info</div>
              <div className="fg2">
                <div className="field"><label>SSN</label><input value={form.ssn} onChange={e=>fld('ssn',e.target.value)} placeholder="XXX-XX-XXXX" maxLength={11}/></div>
                <div className="field"><label>EIN (if business)</label><input value={form.ein} onChange={e=>fld('ein',e.target.value)} placeholder="XX-XXXXXXX"/></div>
              </div>
              <div className="field"><label>Date of Birth</label>
                <div style={{display:'flex',gap:6}}>
                  <select value={form.dobM} onChange={e=>fld('dobM',e.target.value)} style={{flex:2}}>
                    <option value="">Month</option>{MONTHS.map((m,i)=><option key={m} value={String(i+1).padStart(2,'0')}>{m}</option>)}
                  </select>
                  <select value={form.dobD} onChange={e=>fld('dobD',e.target.value)} style={{flex:1}}>
                    <option value="">Day</option>{DAYS.map(d=><option key={d}>{d}</option>)}
                  </select>
                  <select value={form.dobY} onChange={e=>fld('dobY',e.target.value)} style={{flex:2}}>
                    <option value="">Year</option>{YEARS_DOB.map(y=><option key={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Spouse */}
            <div style={{background:'var(--s3)',borderRadius:8,padding:12,marginBottom:10}}>
              <div style={{fontWeight:700,fontSize:12,marginBottom:8}}>Spouse / Partner</div>
              <div className="fg2">
                <div className="field"><label>Spouse Full Name</label><input value={form.spouse} onChange={e=>fld('spouse',e.target.value)}/></div>
                <div className="field"><label>Spouse SSN</label><input value={form.spouseSsn} onChange={e=>fld('spouseSsn',e.target.value)} placeholder="XXX-XX-XXXX" maxLength={11}/></div>
              </div>
              <div className="field"><label>Filing Status</label>
                <select value={form.filingStatus} onChange={e=>fld('filingStatus',e.target.value)}>
                  {['Single','Married Filing Jointly','Married Filing Separately','Head of Household','Qualifying Widow(er)'].map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
            </div>

            <div className="fg2">
              <div className="field"><label>IRS Balance</label><input type="number" value={form.irsBalance} onChange={e=>fld('irsBalance',e.target.value)}/></div>
              <div className="field"><label>Issue Type</label>
                <select value={form.issueType} onChange={e=>fld('issueType',e.target.value)}>
                  {['OIC','Installment Agreement','CNC','Penalty Abatement','Payroll Tax','Unfiled Returns','Appeals','Audit','Liens/Levies','Tax Investigation','Other'].map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div className="fg2">
              <div className="field"><label>IRS or State?</label>
                <select value={form.irsOrState} onChange={e=>fld('irsOrState',e.target.value)}>
                  <option>IRS Federal</option><option>State</option><option>Both IRS + State</option>
                </select>
              </div>
              <div className="field"><label>Tax Years</label><input value={form.taxYears} onChange={e=>fld('taxYears',e.target.value)} placeholder="2020, 2021, 2022"/></div>
            </div>
            <div className="fg2">
              <div className="field"><label>Client Since</label><input type="date" value={form.clientSince} onChange={e=>fld('clientSince',e.target.value)}/></div>
              <div className="field"><label>Status</label>
                <select value={form.status} onChange={e=>fld('status',e.target.value)}>
                  <option>Active</option><option>Inactive</option><option>Prospect</option>
                </select>
              </div>
            </div>
            <div className="field"><label>Notes</label><textarea value={form.notes} onChange={e=>fld('notes',e.target.value)}/></div>

            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Add Client'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
