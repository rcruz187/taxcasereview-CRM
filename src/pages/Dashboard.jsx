import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Dashboard() {
  const navigate = useNavigate()
  const [metrics, setMetrics] = useState({})
  const [cases,   setCases]   = useState([])
  const [tasks,   setTasks]   = useState([])
  const [deadlines, setDeadlines] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const [
      { data: leads },
      { data: clients },
      { data: cases },
      { data: tasks },
      { data: invoices },
      { data: payments },
      { data: deadlines },
    ] = await Promise.all([
      supabase.from('leads').select('id,status'),
      supabase.from('clients').select('id'),
      supabase.from('cases').select('*').order('created_at',{ascending:false}),
      supabase.from('tasks').select('*').order('created_at',{ascending:false}),
      supabase.from('invoices').select('id,total,status'),
      supabase.from('payments').select('id,amount,status'),
      supabase.from('deadlines').select('*').order('dueDate',{ascending:true}),
    ])

    const now = new Date()
    const revenueMtd = (payments?.filter(p=>p.status==='Cleared')||[]).reduce((s,p)=>s+parseFloat(p.amount||0),0)

    setMetrics({
      activeCases:   (cases||[]).filter(c=>c.status==='Open'||c.status==='Pending IRS').length,
      openLeads:     (leads||[]).filter(l=>l.status==='New Lead'||l.status==='Contacted').length,
      totalClients:  (clients||[]).length,
      revenueMtd,
      unpaidInvoices:(invoices||[]).filter(i=>i.status==='Unpaid'||i.status==='Overdue').length,
      openTasks:     (tasks||[]).filter(t=>!t.done).length,
      upcomingDl:    (deadlines||[]).filter(d=>new Date(d.dueDate)>=now&&d.status!=='Completed').length,
      overdueDl:     (deadlines||[]).filter(d=>new Date(d.dueDate)<now&&d.status!=='Completed').length,
    })
    setCases((cases||[]).slice(0,5))
    setTasks((tasks||[]).filter(t=>!t.done).slice(0,6))
    setDeadlines((deadlines||[]).filter(d=>d.status!=='Completed').slice(0,6))
    setLoading(false)
  }

  if (loading) return <div style={{textAlign:'center',padding:40,color:'var(--t3)'}}>Loading dashboard…</div>

  const M = ({label,val,sub,color,to}) => (
    <div className="metric" style={{cursor:to?'pointer':''}} onClick={()=>to&&navigate(to)}>
      <div className="ml">{label}</div>
      <div className="mv" style={{color:color||'var(--tx)'}}>{val}</div>
      {sub&&<div className="ms">{sub}</div>}
    </div>
  )

  const daysLeft = d => {
    const diff = Math.ceil((new Date(d.dueDate)-new Date())/(1000*60*60*24))
    return diff
  }

  return (
    <div>
      {/* Metrics */}
      <div className="metrics">
        <M label="Active Cases"    val={metrics.activeCases}                                  color="var(--b2)"   to="/cases"/>
        <M label="Open Leads"      val={metrics.openLeads}                                    color="var(--warn)" to="/leads"/>
        <M label="Clients"         val={metrics.totalClients}                                 color="var(--ok)"   to="/clients"/>
        <M label="Revenue MTD"     val={'$'+(metrics.revenueMtd||0).toLocaleString()}         color="var(--ok)"/>
        <M label="Unpaid Invoices" val={metrics.unpaidInvoices}                               color={metrics.unpaidInvoices>0?'var(--bad)':'var(--tx)'} to="/invoices"/>
        <M label="Open Tasks"      val={metrics.openTasks}                                    color="var(--b2)"   to="/tasks"/>
        <M label="Upcoming Deadlines" val={metrics.upcomingDl}                               color="var(--warn)" to="/deadlines"/>
        <M label="Overdue"         val={metrics.overdueDl}                                    color={metrics.overdueDl>0?'var(--bad)':'var(--ok)'} to="/deadlines"/>
      </div>

      <div className="g2" style={{alignItems:'start',gap:12,marginTop:12}}>
        {/* Left */}
        <div style={{display:'flex',flexDirection:'column',gap:12}}>

          {/* Active Cases */}
          <div className="card">
            <div className="ch">
              <span className="ct">Active Cases</span>
              <button className="btn sm" onClick={()=>navigate('/cases')}>View All →</button>
            </div>
            {cases.length===0
              ? <div style={{color:'var(--t3)',fontSize:13,padding:'8px 0'}}>No active cases</div>
              : <div className="ovx"><table>
                  <thead><tr><th>Client</th><th>Type</th><th>Balance</th><th>Status</th><th>Rep</th></tr></thead>
                  <tbody>
                    {cases.map(c=>(
                      <tr key={c.id} style={{cursor:'pointer'}} onClick={()=>navigate('/cases')}>
                        <td style={{fontWeight:600}}>{c.clientName}</td>
                        <td style={{fontSize:12,color:'var(--t2)'}}>{c.caseType}</td>
                        <td style={{fontSize:12}}>{c.irsBalance?'$'+Number(c.irsBalance).toLocaleString():'—'}</td>
                        <td><span className={`bdg ${c.status==='Open'?'bb':c.status==='Closed'?'bg':'ba'}`}>{c.status}</span></td>
                        <td style={{fontSize:12,color:'var(--t2)'}}>{c.assignedTo||'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
            }
          </div>

          {/* Pipeline summary */}
          <div className="card">
            <div className="ch"><span className="ct">Case Pipeline</span></div>
            {[
              {label:'New / Intake',   statuses:['New','Open'],           color:'var(--b2)'},
              {label:'In Progress',    statuses:['In Progress'],           color:'var(--ok)'},
              {label:'Pending IRS',    statuses:['Pending IRS','Awaiting'],color:'var(--warn)'},
              {label:'Resolved',       statuses:['Resolved'],              color:'#3DCA7E'},
              {label:'Closed',         statuses:['Closed'],                color:'var(--t3)'},
            ].map(s=>{
              const cnt=cases.filter(c=>s.statuses.includes(c.status)).length
              return (
                <div key={s.label} style={{display:'flex',alignItems:'center',gap:10,padding:'6px 0',borderBottom:'1px solid var(--br)'}}>
                  <div style={{width:8,height:8,borderRadius:'50%',background:s.color,flexShrink:0}}/>
                  <div style={{flex:1,fontSize:12}}>{s.label}</div>
                  <div style={{fontSize:13,fontWeight:700,color:s.color}}>{cnt}</div>
                  <div style={{width:80,height:6,background:'var(--s2)',borderRadius:3,overflow:'hidden'}}>
                    <div style={{width:`${Math.min(cnt*20,100)}%`,height:'100%',background:s.color,borderRadius:3}}/>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right */}
        <div style={{display:'flex',flexDirection:'column',gap:12}}>

          {/* Open Tasks */}
          <div className="card">
            <div className="ch">
              <span className="ct">Open Tasks</span>
              <button className="btn sm" onClick={()=>navigate('/tasks')}>All Tasks →</button>
            </div>
            {tasks.length===0
              ? <div style={{color:'var(--t3)',fontSize:13,padding:'8px 0'}}>No open tasks</div>
              : tasks.map(t=>(
                <div key={t.id} style={{display:'flex',gap:10,alignItems:'flex-start',padding:'6px 0',borderBottom:'1px solid var(--br)'}}>
                  <div style={{width:16,height:16,borderRadius:3,border:'1.5px solid var(--b2c)',background:'var(--s2)',flexShrink:0,marginTop:2}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:600}}>{t.title}</div>
                    <div style={{fontSize:11,color:'var(--t3)',display:'flex',gap:8,marginTop:2}}>
                      {t.clientName&&<span>{t.clientName}</span>}
                      {t.dueDate&&<span>Due: {t.dueDate}</span>}
                    </div>
                  </div>
                  <span className={`bdg ${t.priority==='High'?'br':t.priority==='Low'?'bn':'ba'}`} style={{fontSize:10}}>{t.priority||'Normal'}</span>
                </div>
              ))
            }
          </div>

          {/* Deadlines */}
          <div className="card">
            <div className="ch">
              <span className="ct">IRS Deadlines</span>
              <button className="btn sm" onClick={()=>navigate('/deadlines')}>All →</button>
            </div>
            {deadlines.length===0
              ? <div style={{color:'var(--t3)',fontSize:13,padding:'8px 0'}}>No upcoming deadlines</div>
              : deadlines.map(d=>{
                const dl=daysLeft(d)
                const overdue=dl<0
                const urgent=dl>=0&&dl<=7
                return (
                  <div key={d.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:'1px solid var(--br)'}}>
                    <div>
                      <div style={{fontSize:12,fontWeight:600}}>{d.name||d.title}</div>
                      <div style={{fontSize:11,color:'var(--t3)'}}>{d.clientName||d.client||''}</div>
                    </div>
                    <div style={{fontSize:12,fontWeight:700,color:overdue?'var(--bad)':urgent?'var(--warn)':'var(--ok)',textAlign:'right',flexShrink:0}}>
                      {overdue?'OVERDUE':dl===0?'TODAY':dl+'d left'}
                    </div>
                  </div>
                )
              })
            }
          </div>

          {/* Quick actions */}
          <div className="card">
            <div className="ch"><span className="ct">Quick Add</span></div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {[
                ['👤 New Lead',    '/leads'],
                ['🏢 New Client',  '/clients'],
                ['📁 New Case',    '/cases'],
                ['✅ New Task',    '/tasks'],
                ['🧾 New Invoice', '/invoices'],
                ['📋 Deadlines',   '/deadlines'],
              ].map(([label,to])=>(
                <button key={label} className="btn" style={{justifyContent:'flex-start',gap:8,fontSize:12}} onClick={()=>navigate(to)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
