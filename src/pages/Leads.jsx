import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const STATUSES = ['New Lead','Contacted','Consultation Scheduled','Consultation Completed',
  'Tax Inv Agreement Sent','Tax Inv Agreement Signed','Tax Inv Fee Paid',
  'Tax Investigation Active','IRS Facts Received','Addendum Sent','Addendum Signed',
  'Resolution Fee Paid','Converted to Client','Dead','Do Not Contact']

const STATUS_COLOR = {
  'New Lead':'bb','Contacted':'bn','Consultation Scheduled':'ba','Consultation Completed':'ba',
  'Tax Inv Agreement Sent':'ba','Tax Inv Agreement Signed':'bg','Tax Inv Fee Paid':'bg',
  'Tax Investigation Active':'bg','IRS Facts Received':'bg','Addendum Sent':'ba',
  'Addendum Signed':'bg','Resolution Fee Paid':'bg','Converted to Client':'bg',
  'Dead':'br','Do Not Contact':'br'
}

const YEARS = Array.from({length:20},(_,i)=>2026-i)
const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

function Bdg({s}) {
  return <span className={`bdg ${STATUS_COLOR[s]||'bn'}`}>{s}</span>
}

const BLANK = {
  clientType:'Individual', name:'', first:'', mi:'', last:'', phone:'', email:'',
  street:'', city:'', state:'', zip:'', county:'', source:'Referral',
  irsBalance:'', issueType:'OIC', irsOrState:'IRS Federal', taxYears:[],
  taxYearsCustom:'', notes:'', assignedTo:'', status:'New Lead', taxFee:'', taxFeeOverride:''
}

export default function Leads() {
  const [leads, setLeads]   = useState([])
  const [filter, setFilter] = useState('All')
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [toast, setToast]   = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('leads').select('*').order('created_at', { ascending: false })
    if (data) setLeads(data)
    // update badge
    const badge = document.getElementById('badge-leads')
    if (badge && data) badge.textContent = data.filter(l => l.status === 'New Lead').length || 0
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3000) }

  const filtered = filter === 'All' ? leads : leads.filter(l => l.status === filter)

  function fld(k, v) { setForm(f => ({...f, [k]: v})) }

  function toggleYear(y) {
    setForm(f => ({...f, taxYears: f.taxYears.includes(y) ? f.taxYears.filter(x=>x!==y) : [...f.taxYears, y]}))
  }

  async function save() {
    if (!form.name.trim()) { showToast('Name is required'); return }
    setSaving(true)
    const payload = { ...form, taxYears: JSON.stringify(form.taxYears), created_at: new Date().toISOString() }
    const { error } = await supabase.from('leads').insert([payload])
    setSaving(false)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('Lead added!')
    setModal(false)
    setForm(BLANK)
    load()
  }

  async function deleteLead(id) {
    if (!confirm('Delete this lead?')) return
    await supabase.from('leads').delete().eq('id', id)
    showToast('Deleted')
    load()
  }

  return (
    <div>
      {toast && <div className="toast show">{toast}</div>}

      {/* Status filter chips */}
      <div style={{marginBottom:10,display:'flex',flexWrap:'wrap',gap:4}}>
        {['All',...STATUSES.slice(0,8)].map(s => (
          <span key={s} className={`chip${filter===s?' on':''}`} onClick={()=>setFilter(s)}>{s}</span>
        ))}
      </div>

      <div className="card">
        <div className="ch">
          <span className="ct">All Leads ({filtered.length})</span>
          <button className="btn pri" onClick={()=>setModal(true)}>+ Add Lead</button>
        </div>
        <div className="ovx">
          <table>
            <thead>
              <tr><th>Name</th><th>Type</th><th>Phone</th><th>Issue</th><th>IRS/State</th><th>Balance</th><th>Source</th><th>Status</th><th>Assigned</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={10} style={{textAlign:'center',color:'var(--t3)',padding:20}}>No leads yet — add your first one!</td></tr>
              ) : filtered.map(l => (
                <tr key={l.id}>
                  <td style={{fontWeight:600}}>{l.name}</td>
                  <td><span className="bdg bb">{l.clientType||'Individual'}</span></td>
                  <td>{l.phone||'—'}</td>
                  <td>{l.issueType||'—'}</td>
                  <td>{l.irsOrState||'—'}</td>
                  <td>{l.irsBalance ? '$'+Number(l.irsBalance).toLocaleString() : '—'}</td>
                  <td>{l.source||'—'}</td>
                  <td><Bdg s={l.status||'New Lead'}/></td>
                  <td style={{color:'var(--t2)',fontSize:12}}>{l.assignedTo||'—'}</td>
                  <td>
                    <button className="btn del" onClick={()=>deleteLead(l.id)}>Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal" style={{width:620}}>
            <div className="mh">
              <span className="mt">Add Lead</span>
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
              <div className="field"><label>First Name</label><input value={form.first} onChange={e=>fld('first',e.target.value)}/></div>
              <div className="field"><label>MI</label><input value={form.mi} onChange={e=>fld('mi',e.target.value)} maxLength={1} style={{width:50}}/></div>
              <div className="field"><label>Last Name</label><input value={form.last} onChange={e=>fld('last',e.target.value)}/></div>
            </div>
            <div className="fg2">
              <div className="field"><label>Phone</label><input value={form.phone} onChange={e=>fld('phone',e.target.value)} placeholder="(305) 555-0000"/></div>
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
            <div className="fg2">
              <div className="field"><label>Source</label>
                <select value={form.source} onChange={e=>fld('source',e.target.value)}>
                  {['Referral','Web Form','Google Ad','Social Media','Phone Call','Walk-In','Other'].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="field"><label>Est. IRS Balance</label>
                <select value={form.irsBalance} onChange={e=>fld('irsBalance',e.target.value)}>
                  <option value="">Unknown</option>
                  {['Under $10,000','$10,000 - $20,000','$20,000 - $30,000','$30,000 - $50,000','$50,000 - $100,000','$100,000 - $250,000','Over $250,000'].map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div className="fg2">
              <div className="field"><label>Issue Type</label>
                <select value={form.issueType} onChange={e=>fld('issueType',e.target.value)}>
                  {['OIC','Installment Agreement','CNC','Penalty Abatement','Payroll Tax','Unfiled Returns','Appeals','Audit','Liens/Levies','Tax Investigation','Other'].map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
              <div className="field"><label>IRS or State?</label>
                <select value={form.irsOrState} onChange={e=>fld('irsOrState',e.target.value)}>
                  <option>IRS Federal</option><option>State</option><option>Both IRS + State</option>
                </select>
              </div>
            </div>

            <div className="field"><label>Tax Years</label>
              <div style={{background:'var(--s2)',border:'1px solid var(--b2c)',borderRadius:7,padding:'8px 10px',maxHeight:80,overflowY:'auto',display:'flex',flexWrap:'wrap',gap:'2px 12px'}}>
                {YEARS.map(y=>(
                  <label key={y} style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:12,cursor:'pointer'}}>
                    <input type="checkbox" checked={form.taxYears.includes(String(y))} onChange={()=>toggleYear(String(y))} style={{width:'auto'}}/>
                    {y}
                  </label>
                ))}
              </div>
            </div>

            <div className="field"><label>Notes</label><textarea value={form.notes} onChange={e=>fld('notes',e.target.value)}/></div>

            <div className="fg2">
              <div className="field"><label>Assigned Rep</label>
                <select value={form.assignedTo} onChange={e=>fld('assignedTo',e.target.value)}>
                  <option value="">Unassigned</option>
                  <option>Romy Cruz</option><option>Dana Richard</option><option>Yesenia Gonzalez</option>
                </select>
              </div>
              <div className="field"><label>Lead Status</label>
                <select value={form.status} onChange={e=>fld('status',e.target.value)}>
                  {STATUSES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div style={{background:'var(--s3)',borderRadius:7,padding:10,marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:'var(--ok)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>💰 Tax Investigation Fee</div>
              <div className="fg2">
                <div className="field"><label>Fee Amount ($499–$699)</label>
                  <input type="number" value={form.taxFee} onChange={e=>fld('taxFee',e.target.value)} min={499} max={699} placeholder="599"/>
                </div>
                <div className="field"><label>Manager Override?</label>
                  <select value={form.taxFeeOverride} onChange={e=>fld('taxFeeOverride',e.target.value)}>
                    <option value="">No Override</option><option>Manager Approved</option>
                  </select>
                </div>
              </div>
            </div>

            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Add Lead'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
