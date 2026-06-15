import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const PIPELINE_STAGES = ['investigation','transcripts','analysis','proposal','negotiation','resolution','closed']
const STAGE_LABELS = { investigation:'Investigation', transcripts:'Transcripts', analysis:'Analysis', proposal:'Proposal', negotiation:'Negotiation', resolution:'Resolution', closed:'Closed' }

export default function Reports() {
  const [tab, setTab] = useState('overview')
  const today = new Date().toISOString().slice(0,10)
  const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10)
  const [dateFrom, setDateFrom] = useState(firstDay)
  const [dateTo,   setDateTo]   = useState(today)

  function exportCSV() {
    const rows = [
      ['Report','Tax Case Review — ' + new Date().toLocaleDateString()],
      ['Date Range', dateFrom + ' to ' + dateTo],
      [''],
      ['REVENUE'],
      ['Total Invoiced', '$' + (invoices.reduce((s,i)=>s+Number(i.amount||0),0)).toLocaleString()],
      ['Total Paid',     '$' + (payments.reduce((s,p)=>s+Number(p.amount||0),0)).toLocaleString()],
      [''],
      ['PIPELINE'],
      ['Total Leads', leads.length],
      ['Total Clients', clients.length],
      ['Total Cases', cases.length],
      [''],
      ['CASES BY STATUS'],
      ...Object.entries(cases.reduce((a,c)=>{a[c.status||'Open']=(a[c.status||'Open']||0)+1;return a},{})).map(([k,v])=>[k,v]),
      [''],
      ['RECENT INVOICES'],
      ['Client','Amount','Status','Date'],
      ...invoices.slice(0,50).map(i=>[i.clientName,i.amount,i.status,i.date]),
    ]
    const csv = rows.map(r=>r.map(v=>'"'+String(v||"").replace(/"/g,'""')+'"').join(",")).join("\n")
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}))
    a.download = `TCR_Report_${dateFrom}_${dateTo}.csv`
    a.click()
  }
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({
    clients: [], leads: [], cases: [], tasks: [], invoices: [],
    payments: [], deadlines: [], employees: [], notes: []
  })
  const [dateRange, setDateRange] = useState('all')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [clients, leads, cases, tasks, invoices, payments, deadlines, employees, notes] = await Promise.all([
      supabase.from('clients').select('*').order('created_at', { ascending: true }),
      supabase.from('leads').select('*').order('created_at', { ascending: true }),
      supabase.from('cases').select('*').order('created_at', { ascending: true }),
      supabase.from('tasks').select('*').order('created_at', { ascending: true }),
      supabase.from('invoices').select('*').order('created_at', { ascending: true }),
      supabase.from('payments').select('*').order('created_at', { ascending: true }),
      supabase.from('deadlines').select('*'),
      supabase.from('employees').select('*'),
      supabase.from('client_notes').select('*').order('created_at', { ascending: true }),
    ])
    setData({
      clients: clients.data || [],
      leads: leads.data || [],
      cases: cases.data || [],
      tasks: tasks.data || [],
      invoices: invoices.data || [],
      payments: payments.data || [],
      deadlines: deadlines.data || [],
      employees: employees.data || [],
      notes: notes.data || [],
    })
    setLoading(false)
  }

  function filterByRange(arr, field = 'created_at') {
    if (dateRange === 'all') return arr
    const now = new Date()
    const cutoff = new Date()
    if (dateRange === '30d') cutoff.setDate(now.getDate() - 30)
    if (dateRange === '90d') cutoff.setDate(now.getDate() - 90)
    if (dateRange === 'ytd') cutoff.setMonth(0, 1)
    return arr.filter(r => r[field] && new Date(r[field]) >= cutoff)
  }

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:300,color:'var(--t3)',fontSize:13}}>
      Loading reports…
    </div>
  )

  const { clients, leads, cases, tasks, invoices, payments, deadlines, employees } = data

  // ── OVERVIEW STATS ──
  const fClients = filterByRange(clients)
  const fLeads   = filterByRange(leads)
  const fCases   = filterByRange(cases)
  const fPayments = filterByRange(payments)
  const fInvoices = filterByRange(invoices)

  const totalRevenue = fPayments.filter(p=>p.status==='Cleared').reduce((s,p)=>s+parseFloat(p.amount||0),0)
  const pendingRevenue = fInvoices.filter(i=>i.status!=='Paid').reduce((s,i)=>s+parseFloat(i.total||0),0)
  const openCases = cases.filter(c=>c.status==='Open'||c.status==='Pending IRS').length
  const overdueDl = deadlines.filter(d=>d.dueDate&&new Date(d.dueDate)<new Date()&&d.status!=='Completed').length
  const conversionRate = leads.length ? Math.round((clients.length/leads.length)*100) : 0

  // ── PIPELINE FUNNEL ──
  const pipelineCount = {}
  PIPELINE_STAGES.forEach(s => pipelineCount[s] = 0)
  clients.forEach(c => {
    const stage = c.pipelineStage || 'investigation'
    if (pipelineCount[stage] !== undefined) pipelineCount[stage]++
  })
  const maxPipeline = Math.max(...Object.values(pipelineCount), 1)

  // ── REVENUE BY MONTH ──
  const revByMonth = {}
  for (let i = 0; i < 12; i++) revByMonth[i] = 0
  payments.filter(p=>p.status==='Cleared').forEach(p => {
    if (!p.created_at) return
    const m = new Date(p.created_at).getMonth()
    revByMonth[m] += parseFloat(p.amount || 0)
  })
  const maxRev = Math.max(...Object.values(revByMonth), 1)

  // ── LEADS BY STATUS ──
  const leadStatus = {}
  leads.forEach(l => { leadStatus[l.status||'Unknown'] = (leadStatus[l.status||'Unknown']||0)+1 })

  // ── CASES BY TYPE ──
  const caseTypes = {}
  cases.forEach(c => { caseTypes[c.caseType||'Other'] = (caseTypes[c.caseType||'Other']||0)+1 })

  // ── LEAD SOURCE ──
  const leadSources = {}
  leads.forEach(l => { leadSources[l.leadSource||'Unknown'] = (leadSources[l.leadSource||'Unknown']||0)+1 })

  // ── REP PERFORMANCE ──
  const reps = employees.length > 0 ? employees.map(e=>e.name) : ['Romy Cruz','Dana Richard','Yesenia Gonzalez']
  const repStats = reps.map(rep => {
    const repClients = clients.filter(c=>c.assignedTo===rep)
    const repCases = cases.filter(c=>c.assignedTo===rep)
    const repPayments = payments.filter(p=>p.status==='Cleared'&&repClients.some(c=>c.name===p.clientName))
    const repTasks = tasks.filter(t=>t.assignedTo===rep&&!t.done)
    const repRevenue = repPayments.reduce((s,p)=>s+parseFloat(p.amount||0),0)
    const repDone = tasks.filter(t=>t.assignedTo===rep&&t.done).length
    const repTotal = tasks.filter(t=>t.assignedTo===rep).length
    return {
      name: rep,
      clients: repClients.length,
      cases: repCases.length,
      revenue: repRevenue,
      openTasks: repTasks.length,
      taskCompletion: repTotal ? Math.round((repDone/repTotal)*100) : 0,
    }
  })
  const topRep = repStats.reduce((a,b)=>b.revenue>a.revenue?b:a, repStats[0]||{})

  // ── ISSUE TYPE BREAKDOWN ──
  const issueTypes = {}
  clients.forEach(c => { issueTypes[c.issueType||'Other'] = (issueTypes[c.issueType||'Other']||0)+1 })

  const tabs = [
    { key:'overview', label:'📊 Overview' },
    { key:'pipeline', label:'🔄 Pipeline' },
    { key:'revenue', label:'💰 Revenue' },
    { key:'reps', label:'👥 Rep Performance' },
    { key:'leads', label:'📋 Leads' },
  ]

  const StatCard = ({icon, label, value, sub, color, small}) => (
    <div className="card" style={{padding:'14px 16px'}}>
      <div style={{fontSize:small?18:22,marginBottom:4}}>{icon}</div>
      <div style={{fontSize:small?20:26,fontWeight:800,color:color||'var(--tx)',lineHeight:1,marginBottom:4}}>{value}</div>
      <div style={{fontSize:11,fontWeight:600,color:'var(--t2)',marginBottom:sub?2:0}}>{label}</div>
      {sub&&<div style={{fontSize:10,color:'var(--t3)'}}>{sub}</div>}
    </div>
  )

  const SectionTitle = ({title}) => (
    <div style={{fontWeight:700,fontSize:11,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--t3)',marginBottom:10,marginTop:4}}>{title}</div>
  )

  const BarRow = ({label, value, max, color='var(--b2c)', format}) => {
    const pct = Math.round((value/max)*100)
    return (
      <div style={{marginBottom:10}}>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4}}>
          <span style={{color:'var(--t2)',fontWeight:500}}>{label}</span>
          <span style={{fontWeight:700,color:'var(--tx)'}}>{format?format(value):value}</span>
        </div>
        <div style={{height:7,background:'var(--s3)',borderRadius:4,overflow:'hidden'}}>
          <div style={{height:'100%',width:pct+'%',background:color,borderRadius:4,transition:'width .4s ease'}}/>
        </div>
      </div>
    )
  }

  return (
    <div style={{maxWidth:1100}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:8}}>
        <h2 style={{fontSize:15,fontWeight:700,margin:0}}>📊 Reports & Analytics</h2>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          <span style={{fontSize:11,color:'var(--t3)'}}>Range:</span>
          {[['all','All Time'],['30d','30 Days'],['90d','90 Days'],['ytd','YTD']].map(([k,l])=>(
            <button key={k} className={`btn ${dateRange===k?'pri':'sec'}`}
              style={{fontSize:10,padding:'3px 10px'}} onClick={()=>setDateRange(k)}>{l}</button>
          ))}
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{display:'flex',gap:4,borderBottom:'1px solid var(--br)',marginBottom:16,overflowX:'auto'}}>
        {tabs.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            style={{padding:'7px 14px',fontSize:12,fontWeight:tab===t.key?700:400,
              borderBottom:tab===t.key?'2px solid var(--b2c)':'2px solid transparent',
              background:'none',border:'none',
              color:tab===t.key?'var(--b2c)':'var(--t2)',cursor:'pointer',whiteSpace:'nowrap',
              paddingBottom:8}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab==='overview'&&(
        <div>
          <SectionTitle title="Key Metrics"/>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:10,marginBottom:20}}>
            <StatCard icon="👥" label="Total Clients" value={clients.length} sub={`+${fClients.length} in range`} color="var(--b2c)"/>
            <StatCard icon="📋" label="Total Leads" value={leads.length} sub={`${conversionRate}% conversion`} color="var(--warn)"/>
            <StatCard icon="📁" label="Active Cases" value={openCases} sub={`of ${cases.length} total`} color={openCases>0?'var(--warn)':'var(--ok)'}/>
            <StatCard icon="💰" label="Revenue Collected" value={'$'+Math.round(totalRevenue).toLocaleString()} color="var(--ok)"/>
            <StatCard icon="⏳" label="Pending Billing" value={'$'+Math.round(pendingRevenue).toLocaleString()} color="var(--warn)" small/>
            <StatCard icon="⚠️" label="Overdue Deadlines" value={overdueDl} color={overdueDl>0?'var(--bad)':'var(--ok)'} small/>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            {/* Issue Type Breakdown */}
            <div className="card">
              <SectionTitle title="Clients by Issue Type"/>
              {Object.entries(issueTypes).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([label,val])=>(
                <BarRow key={label} label={label} value={val} max={Math.max(...Object.values(issueTypes),1)}/>
              ))}
              {Object.keys(issueTypes).length===0&&<div style={{fontSize:12,color:'var(--t3)'}}>No data yet.</div>}
            </div>

            {/* Case Status */}
            <div className="card">
              <SectionTitle title="Case Status Breakdown"/>
              {(() => {
                const caseStatus = {}
                cases.forEach(c=>{ caseStatus[c.status||'Unknown']=(caseStatus[c.status||'Unknown']||0)+1 })
                const max = Math.max(...Object.values(caseStatus),1)
                return Object.entries(caseStatus).sort((a,b)=>b[1]-a[1]).map(([label,val])=>(
                  <BarRow key={label} label={label} value={val} max={max}
                    color={label==='Closed'?'var(--ok)':label==='Open'?'var(--b2c)':'var(--warn)'}/>
                ))
              })()}
              {cases.length===0&&<div style={{fontSize:12,color:'var(--t3)'}}>No cases yet.</div>}
            </div>
          </div>

          {/* Quick Summary Table */}
          <div className="card" style={{marginTop:12}}>
            <SectionTitle title="Firm Summary"/>
            <table style={{width:'100%',fontSize:12,borderCollapse:'collapse'}}>
              <tbody>
                {[
                  ['👥 Total Clients',clients.length,'📋 Total Leads',leads.length],
                  ['🆕 New Leads (uncontacted)',leads.filter(l=>l.status==='New Lead').length,'🔄 Lead→Client Rate',conversionRate+'%'],
                  ['📁 Total Cases',cases.length,'🔓 Open / Pending',openCases],
                  ['✅ Tasks Completed',tasks.filter(t=>t.done).length,'📌 Tasks Open',tasks.filter(t=>!t.done).length],
                  ['💰 Revenue Collected','$'+Math.round(totalRevenue).toLocaleString(),'⏳ Pending Invoices','$'+Math.round(pendingRevenue).toLocaleString()],
                  ['🧾 Total Invoices',invoices.length,'💳 Total Payments',payments.length],
                  ['⚠️ Overdue Deadlines',overdueDl,'📅 Total Deadlines',deadlines.length],
                ].map(([l1,v1,l2,v2],i)=>(
                  <tr key={i} style={{borderBottom:'1px solid var(--br)'}}>
                    <td style={{padding:'7px 6px',color:'var(--t2)'}}>{l1}</td>
                    <td style={{padding:'7px 6px',fontWeight:700,textAlign:'right',paddingRight:24}}>{v1}</td>
                    <td style={{padding:'7px 6px',color:'var(--t2)'}}>{l2}</td>
                    <td style={{padding:'7px 6px',fontWeight:700,textAlign:'right'}}>{v2}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── PIPELINE TAB ── */}
      {tab==='pipeline'&&(
        <div>
          <SectionTitle title="Client Pipeline Funnel"/>
          <div className="card" style={{marginBottom:12}}>
            {PIPELINE_STAGES.map((stage, i) => {
              const count = pipelineCount[stage] || 0
              const pct = Math.round((count / Math.max(clients.length,1)) * 100)
              const width = Math.round((count / maxPipeline) * 100)
              const colors = ['#6366f1','#8b5cf6','#3b82f6','#f59e0b','#ef4444','#10b981','#64748b']
              return (
                <div key={stage} style={{marginBottom:14}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:5}}>
                    <div style={{fontWeight:600,color:'var(--tx)'}}>{i+1}. {STAGE_LABELS[stage]}</div>
                    <div style={{display:'flex',gap:12,alignItems:'center'}}>
                      <span style={{fontSize:10,color:'var(--t3)'}}>{pct}% of clients</span>
                      <span style={{fontWeight:800,fontSize:15,color:colors[i]}}>{count}</span>
                    </div>
                  </div>
                  <div style={{height:28,background:'var(--s3)',borderRadius:6,overflow:'hidden',position:'relative'}}>
                    <div style={{height:'100%',width:width+'%',background:colors[i],borderRadius:6,
                      display:'flex',alignItems:'center',paddingLeft:10,minWidth:count>0?40:0,
                      transition:'width .5s ease',opacity:.85}}/>
                  </div>
                </div>
              )
            })}
            <div style={{marginTop:14,padding:'10px 0',borderTop:'1px solid var(--br)',display:'flex',gap:20,flexWrap:'wrap'}}>
              <div style={{fontSize:11,color:'var(--t3)'}}>Total clients tracked: <strong style={{color:'var(--tx)'}}>{clients.length}</strong></div>
              <div style={{fontSize:11,color:'var(--t3)'}}>Conversion rate: <strong style={{color:'var(--ok)'}}>{conversionRate}%</strong></div>
              <div style={{fontSize:11,color:'var(--t3)'}}>Closed clients: <strong style={{color:'var(--tx)'}}>{pipelineCount['closed']||0}</strong></div>
            </div>
          </div>

          {/* Pipeline stage conversion drops */}
          <div className="card">
            <SectionTitle title="Stage-to-Stage Conversion"/>
            {PIPELINE_STAGES.slice(0,-1).map((stage, i) => {
              const curr = pipelineCount[PIPELINE_STAGES[i]] || 0
              const next = pipelineCount[PIPELINE_STAGES[i+1]] || 0
              const drop = curr ? Math.round((1 - next/curr)*100) : 0
              return (
                <div key={stage} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid var(--br)',fontSize:12}}>
                  <div style={{width:100,fontWeight:600,color:'var(--t2)'}}>{STAGE_LABELS[stage]}</div>
                  <div style={{fontSize:16,color:'var(--t3)'}}>→</div>
                  <div style={{width:120,color:'var(--t2)'}}>{STAGE_LABELS[PIPELINE_STAGES[i+1]]}</div>
                  <div style={{flex:1,height:6,background:'var(--s3)',borderRadius:4,overflow:'hidden'}}>
                    <div style={{height:'100%',width:(100-drop)+'%',background:drop>50?'var(--bad)':drop>25?'var(--warn)':'var(--ok)',borderRadius:4}}/>
                  </div>
                  <div style={{width:70,textAlign:'right',fontWeight:700,
                    color:drop>50?'var(--bad)':drop>25?'var(--warn)':'var(--ok)'}}>
                    {curr>0?`${100-drop}% pass`:'—'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── REVENUE TAB ── */}
      {tab==='revenue'&&(
        <div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:10,marginBottom:16}}>
            <StatCard icon="💰" label="Total Collected" value={'$'+Math.round(totalRevenue).toLocaleString()} color="var(--ok)"/>
            <StatCard icon="⏳" label="Pending / Open" value={'$'+Math.round(pendingRevenue).toLocaleString()} color="var(--warn)" small/>
            <StatCard icon="🧾" label="Invoices Paid" value={invoices.filter(i=>i.status==='Paid').length} sub={`of ${invoices.length} total`} small/>
            <StatCard icon="📅" label="Avg per Client" value={clients.length?'$'+Math.round(totalRevenue/Math.max(clients.length,1)).toLocaleString():'$0'} small/>
          </div>

          {/* Monthly Revenue Bar Chart */}
          <div className="card" style={{marginBottom:12}}>
            <SectionTitle title="Revenue by Month (All Time)"/>
            <div style={{display:'flex',gap:6,alignItems:'flex-end',height:120,marginBottom:8}}>
              {MONTHS.map((m, i) => {
                const val = revByMonth[i] || 0
                const h = Math.round((val/maxRev)*100)
                return (
                  <div key={m} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                    <div style={{fontSize:9,color:'var(--t3)',fontWeight:700,display:val>0?'block':'none'}}>
                      ${val>=1000?Math.round(val/1000)+'k':Math.round(val)}
                    </div>
                    <div style={{
                      width:'100%',height:Math.max(h,val>0?6:2)+'px',
                      background:val>0?'var(--b2c)':'var(--s3)',
                      borderRadius:'3px 3px 0 0',
                      opacity:val>0?0.85:0.3,
                      transition:'height .3s ease'
                    }}/>
                    <div style={{fontSize:9,color:'var(--t3)',textAlign:'center'}}>{m}</div>
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            {/* Invoice Status */}
            <div className="card">
              <SectionTitle title="Invoice Status"/>
              {(() => {
                const inv = {}
                invoices.forEach(i=>{ inv[i.status||'Unpaid']=(inv[i.status||'Unpaid']||0)+1 })
                const max = Math.max(...Object.values(inv),1)
                return Object.entries(inv).sort((a,b)=>b[1]-a[1]).map(([label,val])=>(
                  <BarRow key={label} label={label} value={val} max={max}
                    color={label==='Paid'?'var(--ok)':label==='Overdue'?'var(--bad)':'var(--warn)'}/>
                ))
              })()}
              {invoices.length===0&&<div style={{fontSize:12,color:'var(--t3)'}}>No invoices yet.</div>}
            </div>

            {/* Payment Status */}
            <div className="card">
              <SectionTitle title="Payment Status"/>
              {(() => {
                const pay = {}
                payments.forEach(p=>{ pay[p.status||'Pending']=(pay[p.status||'Pending']||0)+1 })
                const max = Math.max(...Object.values(pay),1)
                return Object.entries(pay).sort((a,b)=>b[1]-a[1]).map(([label,val])=>(
                  <BarRow key={label} label={label} value={val} max={max}
                    color={label==='Cleared'?'var(--ok)':label==='Failed'?'var(--bad)':'var(--warn)'}/>
                ))
              })()}
              {payments.length===0&&<div style={{fontSize:12,color:'var(--t3)'}}>No payments yet.</div>}
            </div>
          </div>
        </div>
      )}

      {/* ── REP PERFORMANCE TAB ── */}
      {tab==='reps'&&(
        <div>
          {topRep&&topRep.name&&(
            <div className="card" style={{marginBottom:12,background:'var(--s2)',border:'1px solid var(--b2c)33'}}>
              <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--b2c)',marginBottom:6}}>⭐ Top Performer</div>
              <div style={{fontSize:17,fontWeight:800,color:'var(--tx)',marginBottom:4}}>{topRep.name}</div>
              <div style={{fontSize:12,color:'var(--t2)',display:'flex',gap:16,flexWrap:'wrap'}}>
                <span>💰 ${Math.round(topRep.revenue).toLocaleString()} revenue</span>
                <span>👥 {topRep.clients} clients</span>
                <span>📁 {topRep.cases} cases</span>
                <span>✅ {topRep.taskCompletion}% task completion</span>
              </div>
            </div>
          )}

          {repStats.map(rep => (
            <div key={rep.name} className="card" style={{marginBottom:10}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                <div>
                  <div style={{fontWeight:700,fontSize:14,color:'var(--tx)'}}>{rep.name}</div>
                  <div style={{fontSize:11,color:'var(--t3)',marginTop:2}}>{rep.clients} clients · {rep.cases} cases · {rep.openTasks} open tasks</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontWeight:800,fontSize:18,color:'var(--ok)'}}>
                    ${Math.round(rep.revenue).toLocaleString()}
                  </div>
                  <div style={{fontSize:10,color:'var(--t3)'}}>collected</div>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div>
                  <div style={{fontSize:10,color:'var(--t3)',marginBottom:4}}>CLIENTS</div>
                  <div style={{height:6,background:'var(--s3)',borderRadius:3,overflow:'hidden'}}>
                    <div style={{height:'100%',width:Math.round((rep.clients/Math.max(clients.length,1))*100)+'%',background:'var(--b2c)',borderRadius:3}}/>
                  </div>
                  <div style={{fontSize:10,color:'var(--t2)',marginTop:2}}>{rep.clients} of {clients.length}</div>
                </div>
                <div>
                  <div style={{fontSize:10,color:'var(--t3)',marginBottom:4}}>TASK COMPLETION</div>
                  <div style={{height:6,background:'var(--s3)',borderRadius:3,overflow:'hidden'}}>
                    <div style={{height:'100%',width:rep.taskCompletion+'%',
                      background:rep.taskCompletion>75?'var(--ok)':rep.taskCompletion>40?'var(--warn)':'var(--bad)',borderRadius:3}}/>
                  </div>
                  <div style={{fontSize:10,color:'var(--t2)',marginTop:2}}>{rep.taskCompletion}%</div>
                </div>
              </div>
            </div>
          ))}

          {repStats.length===0&&<div style={{fontSize:13,color:'var(--t3)',padding:20,textAlign:'center'}}>No employee data found.</div>}
        </div>
      )}

      {/* ── LEADS TAB ── */}
      {tab==='leads'&&(
        <div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))',gap:10,marginBottom:16}}>
            <StatCard icon="📋" label="Total Leads" value={leads.length} color="var(--b2c)"/>
            <StatCard icon="🆕" label="New Leads" value={leads.filter(l=>l.status==='New Lead').length} color="var(--warn)" small/>
            <StatCard icon="🔄" label="Conversion Rate" value={conversionRate+'%'} color={conversionRate>30?'var(--ok)':'var(--warn)'} small/>
            <StatCard icon="👥" label="Became Clients" value={clients.length} color="var(--ok)" small/>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
            {/* Lead Status */}
            <div className="card">
              <SectionTitle title="Lead Status Breakdown"/>
              {Object.entries(leadStatus).sort((a,b)=>b[1]-a[1]).map(([label,val])=>(
                <BarRow key={label} label={label} value={val} max={Math.max(...Object.values(leadStatus),1)}
                  color={label==='Signed'?'var(--ok)':label==='New Lead'?'var(--b2c)':label==='No Answer'?'var(--t3)':'var(--warn)'}/>
              ))}
              {leads.length===0&&<div style={{fontSize:12,color:'var(--t3)'}}>No leads yet.</div>}
            </div>

            {/* Lead Source */}
            <div className="card">
              <SectionTitle title="Lead Source"/>
              {Object.entries(leadSources).sort((a,b)=>b[1]-a[1]).map(([label,val])=>(
                <BarRow key={label} label={label} value={val} max={Math.max(...Object.values(leadSources),1)}/>
              ))}
              {Object.keys(leadSources).length===0&&<div style={{fontSize:12,color:'var(--t3)'}}>No lead source data.</div>}
            </div>
          </div>

          {/* Case type breakdown */}
          <div className="card">
            <SectionTitle title="Case Types (from active cases)"/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 20px'}}>
              {Object.entries(caseTypes).sort((a,b)=>b[1]-a[1]).map(([label,val])=>(
                <BarRow key={label} label={label} value={val} max={Math.max(...Object.values(caseTypes),1)} color="var(--b2c)"/>
              ))}
            </div>
            {cases.length===0&&<div style={{fontSize:12,color:'var(--t3)'}}>No cases yet.</div>}
          </div>
        </div>
      )}
    </div>
  )
}
