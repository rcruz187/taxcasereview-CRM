import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../hooks/useApi'
import { Badge, Empty, Spinner } from '../components/ui'

export default function Dashboard() {
  const navigate = useNavigate()
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const res = await api.get('/api/data/dashboard')
      setData(res)
    } catch {
      setData({ metrics: {}, cases: [], tasks: [], deadlines: [], forms: [], pipeline: [] })
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner size={32}/></div>

  const m = data?.metrics || {}

  return (
    <div>
      {/* ── Metrics ── */}
      <div className="metrics">
        {[
          { label:'Active Cases',    val: m.activeCases    ?? 0, sub:'open',        color:'var(--b2)',   to:'/cases' },
          { label:'Open Leads',      val: m.openLeads      ?? 0, sub:'pending',     color:'var(--warn)', to:'/leads' },
          { label:'Revenue MTD',     val:`$${(m.revenueMtd ?? 0).toLocaleString()}`, sub:'this month',  color:'var(--ok)' },
          { label:'Unpaid Invoices', val: m.unpaidInvoices ?? 0, sub:'outstanding', color:'var(--bad)',  to:'/invoices' },
          { label:'Open Tasks',      val: m.openTasks      ?? 0, sub:'due',         color:'var(--b2)',   to:'/tasks' },
          { label:'Deadlines',       val: m.upcomingDl     ?? 0, sub:'upcoming',    color:'var(--warn)', to:'/deadlines' },
        ].map(c => (
          <div key={c.label} className="metric" onClick={() => c.to && navigate(c.to)}>
            <div className="metric-label">{c.label}</div>
            <div className="metric-value" style={{ color:c.color }}>{c.val}</div>
            <div className="metric-sub">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="g3">
        {/* Active Cases */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Active Cases</span>
            <button className="btn sm" onClick={() => navigate('/cases')}>View All</button>
          </div>
          <div className="ovx">
            <table>
              <thead><tr><th>Client</th><th>Type</th><th>Status</th><th>Assigned</th></tr></thead>
              <tbody>
                {(data?.cases||[]).length === 0
                  ? <tr><td colSpan={4}><Empty icon="📁" message="No active cases"/></td></tr>
                  : (data?.cases||[]).map(c=>(
                    <tr key={c.id} onClick={()=>navigate(`/cases/${c.id}`)}>
                      <td style={{fontWeight:600}}>{c.client_name}</td>
                      <td><Badge status={c.case_type} color="blue"/></td>
                      <td><Badge status={c.status}/></td>
                      <td style={{color:'var(--t2)'}}>{c.assigned_to}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>

        {/* Right column */}
        <div>
          <div className="card" style={{marginBottom:12}}>
            <div className="card-header">
              <span className="card-title">Open Tasks</span>
              <button className="btn sm" onClick={()=>navigate('/tasks')}>All Tasks</button>
            </div>
            {(data?.tasks||[]).length===0
              ? <Empty icon="✅" message="No open tasks"/>
              : (data?.tasks||[]).map(t=>(
                <div key={t.id} className="task-item">
                  <div className={`task-cb${t.done?' done':''}`}>{t.done?'✓':''}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:600}}>{t.title}</div>
                    <div style={{fontSize:11,color:'var(--t3)'}}>{t.due_date||'No due date'}</div>
                  </div>
                  <Badge status={t.priority||'Normal'}/>
                </div>
              ))
            }
          </div>
          <div className="card">
            <div className="card-header">
              <span className="card-title">IRS Deadlines</span>
              <button className="btn sm" onClick={()=>navigate('/deadlines')}>All</button>
            </div>
            {(data?.deadlines||[]).length===0
              ? <Empty icon="⏰" message="No upcoming deadlines"/>
              : (data?.deadlines||[]).map(d=>(
                <div key={d.id} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--br)'}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:600}}>{d.name}</div>
                    <div style={{fontSize:11,color:'var(--t3)'}}>{d.client_name}</div>
                  </div>
                  <div style={{fontSize:11,fontWeight:700,color:d.days_left<=7?'var(--bad)':'var(--warn)'}}>
                    {d.days_left<=0?'OVERDUE':`${d.days_left}d`}
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="g2">
        <div className="card">
          <div className="card-header">
            <span className="card-title">IRS Form Status</span>
            <button className="btn sm" onClick={()=>navigate('/irsforms')}>All</button>
          </div>
          {(data?.forms||[]).length===0
            ? <Empty icon="📋" message="No IRS forms tracked"/>
            : (data?.forms||[]).map(f=>(
              <div key={f.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid var(--br)'}}>
                <div>
                  <div style={{fontSize:12,fontWeight:600}}>{f.form_number}</div>
                  <div style={{fontSize:11,color:'var(--t3)'}}>{f.client_name}</div>
                </div>
                <Badge status={f.status}/>
              </div>
            ))
          }
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">Case Pipeline</span></div>
          {[
            {label:'New / Intake',  key:'new',         color:'var(--b2)'},
            {label:'In Progress',   key:'in_progress', color:'var(--ok)'},
            {label:'Awaiting IRS',  key:'awaiting',    color:'var(--warn)'},
            {label:'Resolved',      key:'resolved',    color:'#3DCA7E'},
            {label:'Closed',        key:'closed',      color:'var(--t3)'},
          ].map(s=>{
            const cnt=(data?.pipeline||[]).find(p=>p.status===s.key)?.count??0
            return (
              <div key={s.key} style={{display:'flex',alignItems:'center',gap:10,padding:'5px 0'}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:s.color,flexShrink:0}}/>
                <div style={{flex:1,fontSize:12}}>{s.label}</div>
                <div style={{fontSize:13,fontWeight:700,color:s.color}}>{cnt}</div>
                <div style={{width:80,height:6,background:'var(--s2)',borderRadius:3,overflow:'hidden'}}>
                  <div style={{width:`${Math.min(cnt*10,100)}%`,height:'100%',background:s.color,borderRadius:3}}/>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
