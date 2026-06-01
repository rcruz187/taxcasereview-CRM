import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Reports() {
  const [stats, setStats] = useState({ leads:0, clients:0, cases:0, tasks:0, invoices:0, payments:0, revenue:0, openCases:0, newLeads:0, overdueDl:0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const [leads, clients, cases, tasks, invoices, payments, deadlines] = await Promise.all([
      supabase.from('leads').select('id,status'),
      supabase.from('clients').select('id'),
      supabase.from('cases').select('id,status'),
      supabase.from('tasks').select('id,done'),
      supabase.from('invoices').select('id,total'),
      supabase.from('payments').select('id,amount,status'),
      supabase.from('deadlines').select('id,dueDate,status')
    ])
    const now = new Date()
    setStats({
      leads: leads.data?.length || 0,
      clients: clients.data?.length || 0,
      cases: cases.data?.length || 0,
      tasks: tasks.data?.filter(t=>!t.done).length || 0,
      invoices: invoices.data?.length || 0,
      payments: payments.data?.length || 0,
      revenue: payments.data?.filter(p=>p.status==='Cleared').reduce((s,p)=>s+parseFloat(p.amount||0),0) || 0,
      openCases: cases.data?.filter(c=>c.status==='Open'||c.status==='Pending IRS').length || 0,
      newLeads: leads.data?.filter(l=>l.status==='New Lead').length || 0,
      overdueDl: deadlines.data?.filter(d=>new Date(d.dueDate)<now&&d.status!=='Completed').length || 0,
    })
    setLoading(false)
  }

  if (loading) return <div style={{color:'var(--t3)',padding:20}}>Loading reports...</div>

  const Metric = ({label, value, sub, color}) => (
    <div className="metric">
      <div className="ml">{label}</div>
      <div className="mv" style={{color: color||'var(--tx)'}}>{value}</div>
      {sub && <div className="ms">{sub}</div>}
    </div>
  )

  return (
    <div>
      <h2 style={{fontSize:15,fontWeight:700,marginBottom:14}}>📊 Firm Overview</h2>

      <div style={{marginBottom:8,fontSize:11,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.05em'}}>Pipeline</div>
      <div className="metrics" style={{marginBottom:20}}>
        <Metric label="Total Leads"   value={stats.leads}     sub={`${stats.newLeads} new`} color="var(--b2)"/>
        <Metric label="Clients"       value={stats.clients}/>
        <Metric label="Active Cases"  value={stats.openCases} sub={`of ${stats.cases} total`} color={stats.openCases>0?'var(--warn)':'var(--ok)'}/>
        <Metric label="Open Tasks"    value={stats.tasks}     color={stats.tasks>5?'var(--warn)':'var(--tx)'}/>
      </div>

      <div style={{marginBottom:8,fontSize:11,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.05em'}}>Billing</div>
      <div className="metrics" style={{marginBottom:20}}>
        <Metric label="Total Revenue" value={'$'+stats.revenue.toLocaleString()} color="var(--ok)"/>
        <Metric label="Invoices"      value={stats.invoices}/>
        <Metric label="Payments"      value={stats.payments}/>
        <Metric label="Overdue Deadlines" value={stats.overdueDl} color={stats.overdueDl>0?'var(--bad)':'var(--ok)'}/>
      </div>

      <div className="card">
        <div className="ch"><span className="ct">Quick Summary</span></div>
        <div style={{fontSize:13,lineHeight:2.2}}>
          {[
            ['📋 Total Leads in Pipeline', stats.leads],
            ['🆕 New Leads (uncontacted)', stats.newLeads],
            ['👥 Active Clients', stats.clients],
            ['📁 Total Cases', stats.cases],
            ['🔓 Open / Pending Cases', stats.openCases],
            ['✅ Open Tasks', stats.tasks],
            ['💰 Collected Revenue', '$'+stats.revenue.toLocaleString()],
            ['🧾 Total Invoices', stats.invoices],
            ['⚠️ Overdue Deadlines', stats.overdueDl],
          ].map(([label, val]) => (
            <div key={label} style={{display:'flex',justifyContent:'space-between',borderBottom:'1px solid var(--br)',paddingRight:8}}>
              <span style={{color:'var(--t2)'}}>{label}</span>
              <span style={{fontWeight:700}}>{val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
