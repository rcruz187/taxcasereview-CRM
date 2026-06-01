import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const STATUSES = ['Open','Pending IRS','Active Plan','Docs Needed','POA Sent','Under Review','Resolved','Completed','Closed']
const STATUS_C = {'Open':'bb','Pending IRS':'ba','Active Plan':'bg','Docs Needed':'ba','POA Sent':'bb','Under Review':'bn','Resolved':'bg','Completed':'bg','Closed':'bn'}
const TYPE_C   = {'OIC':'bb','Installment Agreement':'bg','CNC':'bn','Penalty Abatement':'bb','Appeals':'bn','Payroll Tax':'br','Audit':'br','Liens/Levies':'br'}

const BLANK = {
  clientName:'', caseType:'OIC', irsBalance:'', status:'Open',
  assignedTo:'Romy Cruz', deadline:'', taxYears:'', resolutionAmount:'', notes:''
}

export default function Cases() {
  const [cases, setCases]     = useState([])
  const [clients, setClients] = useState([])
  const [filter, setFilter]   = useState('All')
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(BLANK)
  const [suggestions, setSug] = useState([])
  const [saving, setSaving]   = useState(false)
  const [toast, setToast]     = useState('')
  const [detail, setDetail]   = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: cs }, { data: cl }] = await Promise.all([
      supabase.from('cases').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('id,name,irsBalance')
    ])
    if (cs) setCases(cs)
    if (cl) setClients(cl)
    const badge = document.getElementById('badge-cases')
    if (badge && cs) badge.textContent = cs.filter(c => c.status === 'Open' || c.status === 'Pending IRS').length || 0
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3000) }
  function fld(k,v) { setForm(f=>({...f,[k]:v})) }

  function searchClient(val) {
    fld('clientName', val)
    if (val.length < 2) { setSug([]); return }
    const all = [...clients]
    setSug(all.filter(c => c.name.toLowerCase().includes(val.toLowerCase())).slice(0,6))
  }

  function pickClient(c) {
    setForm(f=>({...f, clientName: c.name, irsBalance: c.irsBalance||''}))
    setSug([])
  }

  const filtered = filter === 'All' ? cases : cases.filter(c => c.status === filter)

  async function save() {
    if (!form.clientName.trim()) { showToast('Client name is required'); return }
    setSaving(true)
    const caseNum = 'C-' + Date.now().toString().slice(-6)
    const { error } = await supabase.from('cases').insert([{ ...form, caseNum, created_at: new Date().toISOString() }])
    setSaving(false)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('Case created!')
    setModal(false)
    setForm(BLANK)
    load()
  }

  async function deleteCase(id) {
    if (!confirm('Delete this case?')) return
    await supabase.from('cases').delete().eq('id', id)
    showToast('Deleted')
    load()
  }

  if (detail) {
    const c = detail
    return (
      <div>
        <button className="btn" style={{marginBottom:12}} onClick={()=>setDetail(null)}>← Back to Cases</button>
        <div className="card">
          <div className="ch">
            <div>
              <div style={{fontSize:18,fontWeight:800}}>{c.clientName}</div>
              <div style={{display:'flex',gap:6,marginTop:4,flexWrap:'wrap'}}>
                <span className={`bdg ${TYPE_C[c.caseType]||'bn'}`}>{c.caseType}</span>
                <span className={`bdg ${STATUS_C[c.status]||'bn'}`}>{c.status}</span>
                <span className="bdg bn" style={{fontSize:10}}>{c.caseNum}</span>
              </div>
            </div>
          </div>
          <div className="fg2" style={{marginTop:12}}>
            <div><div style={{color:'var(--t3)',fontSize:10,textTransform:'uppercase',marginBottom:2}}>IRS Balance</div><div>{c.irsBalance ? '$'+Number(c.irsBalance).toLocaleString() : '—'}</div></div>
            <div><div style={{color:'var(--t3)',fontSize:10,textTransform:'uppercase',marginBottom:2}}>Assigned</div><div>{c.assignedTo||'—'}</div></div>
            <div><div style={{color:'var(--t3)',fontSize:10,textTransform:'uppercase',marginBottom:2}}>Deadline</div><div>{c.deadline||'—'}</div></div>
            <div><div style={{color:'var(--t3)',fontSize:10,textTransform:'uppercase',marginBottom:2}}>Tax Years</div><div>{c.taxYears||'—'}</div></div>
            <div><div style={{color:'var(--t3)',fontSize:10,textTransform:'uppercase',marginBottom:2}}>Resolution Amt</div><div>{c.resolutionAmount ? '$'+Number(c.resolutionAmount).toLocaleString() : '—'}</div></div>
          </div>
          {c.notes && <div style={{marginTop:12,padding:10,background:'var(--s2)',borderRadius:7,fontSize:12.5}}>{c.notes}</div>}
        </div>
      </div>
    )
  }

  return (
    <div>
      {toast && <div className="toast show">{toast}</div>}

      <div style={{marginBottom:10,display:'flex',flexWrap:'wrap',gap:4}}>
        {['All',...STATUSES].map(s=>(
          <span key={s} className={`chip${filter===s?' on':''}`} onClick={()=>setFilter(s)}>{s}</span>
        ))}
      </div>

      <div className="card">
        <div className="ch">
          <span className="ct">All Cases ({filtered.length})</span>
          <button className="btn pri" onClick={()=>setModal(true)}>+ New Case</button>
        </div>
        <div className="ovx">
          <table>
            <thead>
              <tr><th>#</th><th>Client</th><th>Type</th><th>Balance</th><th>Status</th><th>Assigned</th><th>Deadline</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{textAlign:'center',color:'var(--t3)',padding:20}}>No cases yet</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} style={{cursor:'pointer'}} onClick={()=>setDetail(c)}>
                  <td style={{color:'var(--t2)',fontSize:11}}>{c.caseNum}</td>
                  <td style={{fontWeight:600}}>{c.clientName}</td>
                  <td><span className={`bdg ${TYPE_C[c.caseType]||'bn'}`}>{c.caseType}</span></td>
                  <td>{c.irsBalance ? '$'+Number(c.irsBalance).toLocaleString() : '—'}</td>
                  <td><span className={`bdg ${STATUS_C[c.status]||'bn'}`}>{c.status}</span></td>
                  <td style={{color:'var(--t2)'}}>{c.assignedTo||'—'}</td>
                  <td style={{color: c.deadline && new Date(c.deadline) < new Date() ? 'var(--bad)' : 'var(--t2)'}}>{c.deadline||'—'}</td>
                  <td onClick={e=>e.stopPropagation()}>
                    <button className="btn del" onClick={()=>deleteCase(c.id)}>Del</button>
                  </td>
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
              <span className="mt">New Case</span>
              <button className="xbtn" onClick={()=>setModal(false)}>&times;</button>
            </div>

            <div className="field" style={{position:'relative'}}>
              <label>Client Name * (search)</label>
              <input value={form.clientName} onChange={e=>searchClient(e.target.value)} placeholder="Search clients..." autoComplete="off"/>
              {suggestions.length > 0 && (
                <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--s3)',border:'1px solid var(--b2c)',borderRadius:7,zIndex:500,maxHeight:160,overflowY:'auto'}}>
                  {suggestions.map(c=>(
                    <div key={c.id} onClick={()=>pickClient(c)} style={{padding:'8px 12px',cursor:'pointer',fontSize:13}} onMouseOver={e=>e.currentTarget.style.background='var(--s2)'} onMouseOut={e=>e.currentTarget.style.background=''}>
                      {c.name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="fg2">
              <div className="field"><label>Case Type</label>
                <select value={form.caseType} onChange={e=>fld('caseType',e.target.value)}>
                  {['OIC','Installment Agreement','CNC','Penalty Abatement','Appeals','Payroll Tax','Audit','Liens/Levies'].map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
              <div className="field"><label>IRS Balance</label>
                <input type="number" value={form.irsBalance} onChange={e=>fld('irsBalance',e.target.value)} placeholder="Auto-filled from client"/>
              </div>
            </div>
            <div className="fg2">
              <div className="field"><label>Status</label>
                <select value={form.status} onChange={e=>fld('status',e.target.value)}>
                  {STATUSES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="field"><label>Assigned To</label>
                <select value={form.assignedTo} onChange={e=>fld('assignedTo',e.target.value)}>
                  <option>Romy Cruz</option><option>Dana Richard</option><option>Yesenia Gonzalez</option>
                </select>
              </div>
            </div>
            <div className="fg2">
              <div className="field"><label>IRS Deadline</label><input type="date" value={form.deadline} onChange={e=>fld('deadline',e.target.value)}/></div>
              <div className="field"><label>Tax Years</label><input value={form.taxYears} onChange={e=>fld('taxYears',e.target.value)} placeholder="2020, 2021, 2022"/></div>
            </div>
            <div className="field"><label>Resolution Amount</label><input type="number" value={form.resolutionAmount} onChange={e=>fld('resolutionAmount',e.target.value)} placeholder="Proposed settlement"/></div>
            <div className="field"><label>Case Notes</label><textarea value={form.notes} onChange={e=>fld('notes',e.target.value)}/></div>

            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Create Case'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
