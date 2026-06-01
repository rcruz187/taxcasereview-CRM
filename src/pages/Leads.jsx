import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateServiceAgreement, generateAddendum, generateEngagementLetter, generatePOACoverLetter } from '../lib/docUtils'

const PIPELINE_STAGES = [
  { label:'Contacted',    key:'contacted' },
  { label:'Consultation', key:'consult' },
  { label:'Agr Signed',   key:'agreement' },
  { label:'Fee Paid',     key:'paid' },
  { label:'Tax Inv',      key:'taxinv' },
  { label:'Addendum',     key:'addendum' },
  { label:'Converted',    key:'client' },
]

const STATUSES = ['New Lead','Contacted','Consultation Scheduled','Consultation Completed',
  'Tax Inv Agreement Sent','Tax Inv Agreement Signed','Tax Inv Fee Paid',
  'Tax Investigation Active','IRS Facts Received','Addendum Sent','Addendum Signed',
  'Resolution Fee Paid','Converted to Client','Dead','Do Not Contact']

const STATUS_C = {
  'New Lead':'bb','Contacted':'bn','Consultation Scheduled':'ba','Consultation Completed':'ba',
  'Tax Inv Agreement Sent':'ba','Tax Inv Agreement Signed':'bg','Tax Inv Fee Paid':'bg',
  'Tax Investigation Active':'bg','IRS Facts Received':'bg','Addendum Sent':'ba',
  'Addendum Signed':'bg','Resolution Fee Paid':'bg','Converted to Client':'bg',
  'Dead':'br','Do Not Contact':'br'
}

const PIPELINE_STAGES = [
  { label:'Contacted',    key:'contacted' },
  { label:'Consultation', key:'consult' },
  { label:'Agr Signed',   key:'agreement' },
  { label:'Fee Paid',     key:'paid' },
  { label:'Tax Inv',      key:'taxinv' },
  { label:'Addendum',     key:'addendum' },
  { label:'Converted',    key:'client' },
]

function stagesDone(status) {
  const order = ['Contacted','Consultation Scheduled','Consultation Completed',
    'Tax Inv Agreement Sent','Tax Inv Agreement Signed','Tax Inv Fee Paid',
    'Tax Investigation Active','IRS Facts Received','Addendum Sent','Addendum Signed',
    'Resolution Fee Paid','Converted to Client']
  const idx = order.indexOf(status)
  return [idx>=0, idx>=2, idx>=5, idx>=6, idx>=8, idx>=10, idx>=11]
}

const YEARS  = Array.from({length:20},(_,i)=>2026-i)
const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

const BLANK = {
  clientType:'Individual', name:'', first:'', mi:'', last:'', phone:'', email:'',
  street:'', city:'', state:'', zip:'', county:'', source:'Referral',
  irsBalance:'', issueType:'OIC', irsOrState:'IRS Federal', taxYears:[],
  taxYearsCustom:'', notes:'', assignedTo:'', status:'New Lead', taxFee:'', taxFeeOverride:''
}

function Bdg({s}) { return <span className={`bdg ${STATUS_C[s]||'bn'}`}>{s}</span> }

function TypeBdg({t}) {
  const m = {'OIC':'bb','Installment Agreement':'bg','CNC':'bn','Penalty Abatement':'bb','Appeals':'bn','Payroll Tax':'br','Audit':'br','Liens/Levies':'br'}
  return <span className={`bdg ${m[t]||'bn'}`}>{t}</span>
}

export default function Leads() {
  const navigate = useNavigate()
  const [leads, setLeads]   = useState([])
  const [filter, setFilter] = useState('All')
  const [modal, setModal]   = useState(false)
  const [detail, setDetail] = useState(null)
  const [form, setForm]     = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [toast, setToast]   = useState('')
  const [converting, setConverting] = useState(false)
  const [showFlow, setShowFlow]     = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('leads').select('*').order('created_at', { ascending: false })
    if (data) {
      setLeads(data)
      const badge = document.getElementById('badge-leads')
      if (badge) badge.textContent = data.filter(l => l.status === 'New Lead').length || 0
      // refresh detail if open
      if (detail) setDetail(data.find(l => l.id === detail.id) || null)
    }
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3000) }
  function fld(k,v) { setForm(f=>({...f,[k]:v})) }
  function toggleYear(y) { setForm(f=>({...f, taxYears: f.taxYears.includes(y)?f.taxYears.filter(x=>x!==y):[...f.taxYears,y]})) }

  const filtered = filter === 'All' ? leads : leads.filter(l => l.status === filter)

  async function save() {
    if (!form.name.trim()) { showToast('Name is required'); return }
    setSaving(true)
    const payload = { ...form, taxYears: JSON.stringify(form.taxYears), created_at: new Date().toISOString() }
    const { error } = await supabase.from('leads').insert([payload])
    setSaving(false)
    if (error) { showToast('Error: '+error.message); return }
    showToast('Lead added!')
    setModal(false); setForm(BLANK); load()
  }

  async function deleteLead(id) {
    if (!confirm('Delete this lead?')) return
    await supabase.from('leads').delete().eq('id', id)
    showToast('Deleted'); setDetail(null); load()
  }

  async function updateStatus(id, status) {
    await supabase.from('leads').update({ status }).eq('id', id)
    showToast('Status updated!'); load()
  }

  async function convertToClient(l) {
    if (!confirm(`Convert "${l.name}" to a full client?`)) return
    setConverting(true)
    const taxYearsStr = l.taxYearsCustom || (()=>{try{return JSON.parse(l.taxYears||'[]').join(', ')}catch{return l.taxYears||''}})()
    const { error } = await supabase.from('clients').insert([{
      name: l.name, clientType: l.clientType || 'Individual',
      first: l.first, mi: l.mi, last: l.last,
      phone: l.phone, email: l.email,
      street: l.street, city: l.city, state: l.state, zip: l.zip, county: l.county,
      source: l.source, assignedTo: l.assignedTo,
      irsBalance: l.irsBalance, issueType: l.issueType, irsOrState: l.irsOrState,
      taxYears: taxYearsStr,
      notes: l.notes, status: 'Active',
      clientSince: new Date().toISOString().slice(0,10),
      created_at: new Date().toISOString()
    }])
    if (error) { showToast('Error: '+error.message); setConverting(false); return }
    // Update lead status
    await supabase.from('leads').update({ status: 'Converted to Client' }).eq('id', l.id)
    setConverting(false)
    showToast(`✅ ${l.name} converted to Client!`)
    setDetail(null); load()
  }

  // ── Detail View ──
  if (detail) {
    const l = detail
    const done = stagesDone(l.status)
    const taxYearsList = (() => { try { return JSON.parse(l.taxYears||'[]').join(', ') } catch { return l.taxYearsCustom||'—' } })()

    return (
      <div>
        {toast && <div className="toast show">{toast}</div>}
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
          <button className="btn" onClick={()=>setDetail(null)}>← Back</button>
          <span style={{color:'var(--t3)',fontSize:12}}>Leads / {l.name}</span>
        </div>

        {/* Header */}
        <div className="card">
          <div style={{display:'flex',alignItems:'flex-start',gap:14,paddingBottom:14,borderBottom:'1px solid var(--br)',marginBottom:14,flexWrap:'wrap'}}>
            <div style={{width:52,height:52,borderRadius:'50%',background:'var(--blt)',color:'var(--b2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:800,flexShrink:0}}>
              {(l.name||'?')[0].toUpperCase()}
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:20,fontWeight:800}}>{l.name}</div>
              <div style={{display:'flex',gap:6,marginTop:6,flexWrap:'wrap'}}>
                <span className="bdg bb">{l.clientType||'Individual'}</span>
                <Bdg s={l.status||'New Lead'}/>
                {l.taxFee && <span className="bdg bg">Tax Inv Fee: ${l.taxFee}</span>}
              </div>
            </div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              <button className="btn sm" onClick={()=>{setForm({...BLANK,...l,taxYears:(() => {try{return JSON.parse(l.taxYears||'[]')}catch{return []}})()});setModal('edit')}}>✏️ Edit</button>
              <button className="btn ok sm" onClick={()=>convertToClient(l)} disabled={converting}>✓ Convert to Client</button>
              <button className="btn del sm" onClick={()=>deleteLead(l.id)}>🗑 Delete</button>
            </div>
          </div>

          {/* Pipeline tracker */}
          <div style={{background:'var(--s2)',borderRadius:8,padding:12,marginBottom:14}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Pipeline Progress</div>
            <div style={{display:'flex',alignItems:'center',overflowX:'auto',gap:0}}>
              {PIPELINE_STAGES.map((s,i) => (
                <div key={s.key} style={{display:'flex',alignItems:'center',flex:1,minWidth:70}}>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',flex:1}}>
                    <div style={{width:28,height:28,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,flexShrink:0,background:done[i]?'var(--ok)':'var(--s3)',color:done[i]?'#fff':'var(--t3)',border:`2px solid ${done[i]?'var(--ok)':'var(--br)'}`}}>
                      {done[i] ? '✓' : i+1}
                    </div>
                    <div style={{fontSize:9,marginTop:4,textAlign:'center',color:done[i]?'var(--ok)':'var(--t3)',whiteSpace:'nowrap'}}>{s.label}</div>
                  </div>
                  {i < PIPELINE_STAGES.length-1 && <div style={{height:2,width:16,background:done[i]?'var(--ok)':'var(--br)',flexShrink:0,marginBottom:14}}/>}
                </div>
              ))}
            </div>
          </div>

          {/* Info grid */}
          <div className="fg2">
            <div>
              <div className="stitle">Contact Info</div>
              {[['Phone', l.phone],['Email', l.email],['Address', [l.street,l.city,l.state,l.zip].filter(Boolean).join(' ')],['County', l.county],['Source', l.source]].map(([label,val])=>(
                <div key={label} className="dr"><span className="dl">{label}</span><span className="dv">{val||'—'}</span></div>
              ))}
            </div>
            <div>
              <div className="stitle">IRS Info</div>
              {[['Est. Balance', l.irsBalance ? <span style={{fontWeight:700,color:'var(--bad)'}}>~{l.irsBalance}</span> : '—'],
                ['Issue Type', <TypeBdg t={l.issueType||'—'}/>],
                ['IRS or State', l.irsOrState],
                ['Tax Years', taxYearsList],
                ['Assigned Rep', l.assignedTo || <span style={{color:'var(--warn)'}}>Unassigned</span>],
                ['Tax Inv Fee', l.taxFee ? <span style={{fontWeight:700,color:'var(--ok)'}}>${l.taxFee}</span> : 'Not set'],
              ].map(([label,val])=>(
                <div key={label} className="dr"><span className="dl">{label}</span><span className="dv">{val||'—'}</span></div>
              ))}
            </div>
          </div>

          {/* Update Status */}
          <div style={{marginTop:14,padding:12,background:'var(--s2)',borderRadius:8}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em'}}>Update Status</div>
              <button className="btn sec" style={{padding:'3px 10px',fontSize:11}} onClick={()=>setShowFlow(true)}>📊 View Flow</button>
            </div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {STATUSES.map(s => (
                <span key={s} className={`chip${l.status===s?' on':''}`} onClick={()=>updateStatus(l.id, s)} style={{fontSize:10}}>{s}</span>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:8,marginTop:14}}>
            <button className="btn ok" style={{justifyContent:'center',flexDirection:'column',gap:3,padding:10,textAlign:'center'}} onClick={()=>generateServiceAgreement(l)}>
              <span style={{fontSize:12,fontWeight:700}}>📄 Service Agreement</span>
              <span style={{fontSize:10,opacity:.8}}>Generate & Print</span>
            </button>
            <button className="btn" style={{background:'var(--blue)',color:'#fff',borderColor:'var(--blue)',justifyContent:'center',flexDirection:'column',gap:3,padding:10,textAlign:'center'}} onClick={()=>generateEngagementLetter(l)}>
              <span style={{fontSize:12,fontWeight:700}}>✉️ Engagement Letter</span>
              <span style={{fontSize:10,opacity:.8}}>Generate & Print</span>
            </button>
            <button className="btn" style={{background:'var(--warn)',color:'#fff',borderColor:'var(--warn)',justifyContent:'center',flexDirection:'column',gap:3,padding:10,textAlign:'center'}} onClick={()=>generateAddendum(l)}>
              <span style={{fontSize:12,fontWeight:700}}>📋 Generate Addendum</span>
              <span style={{fontSize:10,opacity:.8}}>After IRS facts</span>
            </button>
            <button className="btn" style={{background:'#6c5ce7',color:'#fff',borderColor:'#6c5ce7',justifyContent:'center',flexDirection:'column',gap:3,padding:10,textAlign:'center'}} onClick={()=>generatePOACoverLetter(l)}>
              <span style={{fontSize:12,fontWeight:700}}>🔐 POA Cover Letter</span>
              <span style={{fontSize:10,opacity:.8}}>Generate & Print</span>
            </button>
            <button className="btn ok" style={{justifyContent:'center',flexDirection:'column',gap:3,padding:10,textAlign:'center'}} onClick={()=>convertToClient(l)} disabled={converting}>
              <span style={{fontSize:12,fontWeight:700}}>✓ Convert to Client</span>
              <span style={{fontSize:10,opacity:.8}}>{converting ? 'Converting…' : 'Move to Clients'}</span>
            </button>
          </div>

          {l.notes && (
            <div style={{marginTop:14}}>
              <div className="stitle">Notes</div>
              <div style={{fontSize:13,color:'var(--t2)',lineHeight:1.7,padding:'8px 0'}}>{l.notes}</div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── List View ──
  return (
    <div>
      {toast && <div className="toast show">{toast}</div>}

      <div style={{marginBottom:10,display:'flex',flexWrap:'wrap',gap:4}}>
        {['All',...STATUSES.slice(0,8)].map(s => (
          <span key={s} className={`chip${filter===s?' on':''}`} onClick={()=>setFilter(s)}>{s}</span>
        ))}
      </div>

      <div className="card">
        <div className="ch">
          <span className="ct">All Leads ({filtered.length})</span>
          <button className="btn pri" onClick={()=>{ setForm(BLANK); setModal(true) }}>+ Add Lead</button>
        </div>
        <div className="ovx">
          <table>
            <thead>
              <tr><th>Name</th><th>Type</th><th>Phone</th><th>Issue</th><th>Balance</th><th>Source</th><th>Status</th><th>Assigned</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} style={{textAlign:'center',color:'var(--t3)',padding:20}}>No leads yet — add your first one!</td></tr>
              ) : filtered.map(l => (
                <tr key={l.id} onClick={()=>setDetail(l)} style={{cursor:'pointer'}}>
                  <td style={{fontWeight:600}}>{l.name}</td>
                  <td><span className="bdg bb">{l.clientType||'Individual'}</span></td>
                  <td>{l.phone||'—'}</td>
                  <td><TypeBdg t={l.issueType||'—'}/></td>
                  <td style={{color:'var(--t2)'}}>{l.irsBalance||'—'}</td>
                  <td style={{color:'var(--t2)'}}>{l.source||'—'}</td>
                  <td><Bdg s={l.status||'New Lead'}/></td>
                  <td style={{color:'var(--t2)',fontSize:12}}>{l.assignedTo||<span style={{color:'var(--warn)'}}>Unassigned</span>}</td>
                  <td onClick={e=>e.stopPropagation()}>
                    <button className="btn del" onClick={()=>deleteLead(l.id)}>Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modal && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal" style={{width:640}}>
            <div className="mh">
              <span className="mt">{modal==='edit'?'Edit Lead':'Add Lead'}</span>
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
              <div className="field"><label>MI</label><input value={form.mi} onChange={e=>fld('mi',e.target.value)} maxLength={1}/></div>
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
                  {['OIC','Installment Agreement','CNC','Penalty Abatement','Payroll Tax','Unfiled Returns','Appeals','Audit','Liens/Levies','Tax Investigation','ACS','Notice Status','Other'].map(o=><option key={o}>{o}</option>)}
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
                  <label key={y} style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:12,cursor:'pointer',whiteSpace:'nowrap'}}>
                    <input type="checkbox" checked={form.taxYears.includes(String(y))} onChange={()=>toggleYear(String(y))} style={{width:'auto'}}/>
                    {y}
                  </label>
                ))}
              </div>
              <input value={form.taxYearsCustom} onChange={e=>fld('taxYearsCustom',e.target.value)} placeholder="Or type custom years: 2019, 2020" style={{marginTop:5}}/>
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
              {saving ? 'Saving...' : modal==='edit' ? 'Save Changes' : 'Add Lead'}
            </button>
          </div>
        </div>
      )}

      {/* ── Status Flow Modal ──────────────────────────────────────────────── */}
      {showFlow && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setShowFlow(false)}>
          <div className="modal" style={{maxWidth:820,width:'95vw'}}>
            <div className="mh">
              <span className="mt">📊 Lead Status Flow</span>
              <button className="xbtn" onClick={()=>setShowFlow(false)}>&times;</button>
            </div>
            <div style={{overflowX:'auto',padding:'8px 0'}}>
              <div style={{display:'flex',alignItems:'center',gap:0,minWidth:700,flexWrap:'wrap',rowGap:16}}>
                {[
                  {s:'New Lead',       c:'#3b82f6', doc:null},
                  {s:'Contacted',      c:'#6366f1', doc:null},
                  {s:'Consultation Scheduled', c:'#8b5cf6', doc:null},
                  {s:'Consultation Completed', c:'#a855f7', doc:null},
                  {s:'Tax Inv Agreement Sent', c:'#f59e0b', doc:'📄 Service Agreement'},
                  {s:'Tax Inv Agreement Signed', c:'#f97316', doc:'✍️ Client Signs'},
                  {s:'Tax Inv Fee Paid', c:'#10b981', doc:'💰 Fee Collected'},
                  {s:'Tax Investigation Active', c:'#059669', doc:'🔍 Transcripts'},
                  {s:'IRS Facts Received', c:'#0ea5e9', doc:'📋 Facts In'},
                  {s:'Addendum Sent', c:'#f59e0b', doc:'📄 Addendum'},
                  {s:'Addendum Signed', c:'#f97316', doc:'✍️ Client Signs'},
                  {s:'Resolution Fee Paid', c:'#10b981', doc:'💰 Fee Collected'},
                  {s:'Converted to Client', c:'#25A25A', doc:'🎉 Client!'},
                ].map((item, i, arr) => (
                  <div key={item.s} style={{display:'flex',alignItems:'center',gap:0}}>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                      <div style={{
                        background: item.c, color:'#fff', borderRadius:8,
                        padding:'6px 10px', fontSize:11, fontWeight:700,
                        textAlign:'center', whiteSpace:'nowrap', maxWidth:110,
                        lineHeight:1.3
                      }}>{item.s}</div>
                      {item.doc && <div style={{fontSize:9,color:'var(--t3)',textAlign:'center',maxWidth:110}}>{item.doc}</div>}
                    </div>
                    {i < arr.length - 1 && (
                      <div style={{color:'var(--t3)',fontSize:16,margin:'0 4px',flexShrink:0}}>→</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Off-track statuses */}
              <div style={{marginTop:16,paddingTop:12,borderTop:'1px solid var(--br)'}}>
                <div style={{fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>Off-Track</div>
                <div style={{display:'flex',gap:8}}>
                  {[{s:'Dead',c:'#ef4444'},{s:'Do Not Contact',c:'#6b7280'}].map(item=>(
                    <div key={item.s} style={{background:item.c,color:'#fff',borderRadius:8,padding:'6px 12px',fontSize:11,fontWeight:700}}>
                      {item.s}
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick legend */}
              <div style={{marginTop:12,padding:10,background:'var(--bg)',borderRadius:8,fontSize:11,color:'var(--t2)',lineHeight:1.8}}>
                <b style={{color:'var(--tx)'}}>Key Actions per Stage:</b><br/>
                🔵 <b>New → Consultation Completed</b> — Phone outreach & consult scheduling<br/>
                🟡 <b>Agreement Sent → Fee Paid</b> — Generate Service Agreement → collect $499–$699 investigation fee<br/>
                🟢 <b>Tax Investigation Active → IRS Facts</b> — File Form 2848/8821, pull transcripts<br/>
                🟠 <b>Addendum Sent → Resolution Fee Paid</b> — Present resolution plan, collect full service fee<br/>
                ✅ <b>Convert to Client</b> — Opens full client file & case management
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

