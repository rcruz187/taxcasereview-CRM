import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../hooks/useApi'
import { Badge, Empty, Spinner } from '../components/ui'
import { useApp } from '../context/AppContext'

export default function Clients() {
  const { showToast, openModal, closeModal } = useApp()
  const navigate = useNavigate()
  const [clients, setClients] = useState([])
  const [filter, setFilter]   = useState('All')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])
  async function load() {
    try { const r = await api.get('/api/data/clients'); setClients(r.clients || r || []) }
    catch { setClients([]) } finally { setLoading(false) }
  }

  const visible = filter === 'All' ? clients : clients.filter(c => c.client_type === filter)

  function addClient() {
    openModal('Add Client', <ClientForm onSave={async d=>{ try{ await api.post('/api/data/clients',d); showToast('Client added'); closeModal(); load() }catch(e){ showToast(e.message,'err') } }} onCancel={closeModal}/>)
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Client Roster</span>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {['All','Individual','Business'].map(t=><span key={t} className={`chip${filter===t?' active':''}`} onClick={()=>setFilter(t)}>{t}</span>)}
          <button className="btn pri" onClick={addClient}>+ Add Client</button>
        </div>
      </div>
      {loading ? <Spinner/> :
        <div className="ovx">
          <table>
            <thead><tr><th>Name</th><th>Type</th><th>Phone</th><th>Email</th><th>IRS Balance</th><th>Issue</th><th>Status</th><th>Since</th><th></th></tr></thead>
            <tbody>
              {visible.length===0 ? <tr><td colSpan={9}><Empty icon="🏢" message="No clients yet" action={addClient} actionLabel="Add Client"/></td></tr>
                : visible.map(c=>(
                <tr key={c.id} onClick={()=>navigate(`/clients/${c.id}`)}>
                  <td style={{fontWeight:600}}>{c.name}</td>
                  <td><Badge status={c.client_type||'Individual'} color="blue"/></td>
                  <td className="mono">{c.phone}</td>
                  <td style={{color:'var(--t2)'}}>{c.email}</td>
                  <td style={{color:'var(--bad)',fontWeight:600}}>{c.irs_balance?`$${Number(c.irs_balance).toLocaleString()}`:'—'}</td>
                  <td>{c.issue}</td>
                  <td><Badge status={c.status||'Active'}/></td>
                  <td style={{color:'var(--t3)'}}>{c.created_at ? new Date(c.created_at).getFullYear() : '—'}</td>
                  <td><button className="btn sm" onClick={e=>{e.stopPropagation();navigate(`/clients/${c.id}`)}}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
    </div>
  )
}

function ClientForm({ onSave, onCancel }) {
  const [f, setF] = useState({ name:'', phone:'', email:'', client_type:'Individual', issue:'', irs_balance:'' })
  const set = k => e => setF(p=>({...p,[k]:e.target.value}))
  return (
    <div>
      <div className="fg2"><div className="field"><label>Name *</label><input value={f.name} onChange={set('name')}/></div><div className="field"><label>Type</label><select value={f.client_type} onChange={set('client_type')}><option>Individual</option><option>Business</option></select></div></div>
      <div className="fg2"><div className="field"><label>Phone</label><input value={f.phone} onChange={set('phone')}/></div><div className="field"><label>Email</label><input value={f.email} onChange={set('email')} type="email"/></div></div>
      <div className="fg2"><div className="field"><label>Issue</label><input value={f.issue} onChange={set('issue')} placeholder="OIC, Levy, etc."/></div><div className="field"><label>IRS Balance</label><input value={f.irs_balance} onChange={set('irs_balance')} type="number" placeholder="0"/></div></div>
      <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:14}}>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn pri" onClick={()=>onSave(f)}>Save Client</button>
      </div>
    </div>
  )
}
