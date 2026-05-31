import { useState, useEffect } from 'react'
import { api } from '../hooks/useApi'
import { Badge, Empty, Spinner } from '../components/ui'
import { useApp } from '../context/AppContext'

const STATUSES = ['All','New','Contacted','Qualified','Proposal','Closed Won','Closed Lost']

export default function Leads() {
  const { showToast, openModal, closeModal } = useApp()
  const [leads, setLeads]   = useState([])
  const [filter, setFilter] = useState('All')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    try { const r = await api.get('/api/data/leads'); setLeads(r.leads || r || []) }
    catch { setLeads([]) }
    finally { setLoading(false) }
  }

  const visible = filter === 'All' ? leads : leads.filter(l => l.status === filter)

  function addLead() {
    openModal('Add Lead', <LeadForm onSave={async d => { try { await api.post('/api/data/leads', d); showToast('Lead added'); closeModal(); load() } catch(e){ showToast(e.message,'err') } }} onCancel={closeModal} />)
  }

  return (
    <div>
      <div style={{marginBottom:10}}>
        {STATUSES.map(s => <span key={s} className={`chip${filter===s?' active':''}`} onClick={()=>setFilter(s)}>{s}</span>)}
      </div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">All Leads</span>
          <button className="btn pri" onClick={addLead}>+ Add Lead</button>
        </div>
        {loading ? <Spinner/> :
          <div className="ovx">
            <table>
              <thead><tr><th>Name</th><th>Type</th><th>Phone</th><th>Issue</th><th>IRS/State</th><th>Balance</th><th>Source</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {visible.length===0 ? <tr><td colSpan={9}><Empty icon="👤" message="No leads found" action={addLead} actionLabel="Add Lead"/></td></tr>
                  : visible.map(l => (
                  <tr key={l.id}>
                    <td style={{fontWeight:600}}>{l.name}</td>
                    <td><Badge status={l.client_type||'Individual'} color="gray"/></td>
                    <td className="mono">{l.phone}</td>
                    <td>{l.issue}</td>
                    <td>{l.irs_state}</td>
                    <td style={{color:'var(--bad)',fontWeight:600}}>{l.balance ? `$${Number(l.balance).toLocaleString()}` : '—'}</td>
                    <td style={{color:'var(--t2)'}}>{l.source}</td>
                    <td><Badge status={l.status}/></td>
                    <td><button className="btn sm">Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>
  )
}

function LeadForm({ onSave, onCancel }) {
  const [f, setF] = useState({ name:'', phone:'', email:'', issue:'', status:'New', source:'' })
  const set = k => e => setF(p=>({...p,[k]:e.target.value}))
  return (
    <div>
      <div className="fg2"><div className="field"><label>Name *</label><input value={f.name} onChange={set('name')} placeholder="Full name"/></div><div className="field"><label>Phone</label><input value={f.phone} onChange={set('phone')}/></div></div>
      <div className="field"><label>Email</label><input value={f.email} onChange={set('email')} type="email"/></div>
      <div className="fg2"><div className="field"><label>Issue</label><input value={f.issue} onChange={set('issue')} placeholder="OIC, Installment, etc."/></div><div className="field"><label>Source</label><input value={f.source} onChange={set('source')} placeholder="Referral, Google…"/></div></div>
      <div className="field"><label>Status</label><select value={f.status} onChange={set('status')}>{['New','Contacted','Qualified','Proposal','Closed Won','Closed Lost'].map(s=><option key={s}>{s}</option>)}</select></div>
      <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:14}}>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn pri" onClick={()=>onSave(f)}>Save Lead</button>
      </div>
    </div>
  )
}
