import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

const money = cents => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(cents||0)/100)
const date = value => value ? new Date(value).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'
const tone = status => ({active:'#10b981',paid:'#10b981',past_due:'#f59e0b',open:'#f59e0b',suspended:'#ef4444',uncollectible:'#ef4444',trial:'#6366f1',cancelled:'#64748b'})[status] || '#94a3b8'
const badge = status => ({display:'inline-block',fontSize:10,fontWeight:800,padding:'3px 9px',borderRadius:20,textTransform:'capitalize',color:tone(status),background:`${tone(status)}18`,border:`1px solid ${tone(status)}33`})
const card = {background:'rgba(255,255,255,.03)',border:'1px solid rgba(99,102,241,.2)',borderRadius:14,overflow:'hidden'}
const th = {padding:'10px 14px',fontSize:10,fontWeight:800,color:'#475569',textTransform:'uppercase',letterSpacing:'.05em',textAlign:'left',borderBottom:'1px solid rgba(99,102,241,.12)'}
const td = {padding:'11px 14px',fontSize:12,borderBottom:'1px solid rgba(99,102,241,.07)',color:'#94a3b8'}

export default function RomyLabsBilling() {
  const [data,setData] = useState(null)
  const [error,setError] = useState('')
  const [filter,setFilter] = useState('all')
  const [selected,setSelected] = useState(null)

  const load = useCallback(async()=>{
    setError('')
    const {data:payload,error:e} = await supabase.rpc('romylabs_billing_dashboard')
    if(e){setError(e.message);setData(null);return}
    setData(payload || {accounts:[],invoices:[],payments:[],events:[]})
  },[])
  useEffect(()=>{load()},[load])

  const accounts = data?.accounts || []
  const invoices = data?.invoices || []
  const payments = data?.payments || []
  const events = data?.events || []
  const visible = useMemo(()=>filter==='all'?accounts:accounts.filter(a=>a.status===filter),[accounts,filter])
  const accountInvoices = selected ? invoices.filter(i=>i.account_id===selected.id) : []
  const accountPayments = selected ? payments.filter(p=>p.account_id===selected.id) : []
  const accountEvents = selected ? events.filter(e=>e.account_id===selected.id) : []
  const kpis = [
    ['Monthly Recurring',money(data?.mrr_cents),'#10b981'],
    ['Past Due',money(data?.past_due_cents),'#f59e0b'],
    ['Past-Due Accounts',Number(data?.past_due_accounts||0).toLocaleString(),'#f97316'],
    ['Suspended',Number(data?.suspended_accounts||0).toLocaleString(),'#ef4444'],
  ]

  return <div style={{padding:'28px 36px',maxWidth:1200}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'flex-start',marginBottom:22}}>
      <div><div style={{fontSize:22,fontWeight:900,color:'#fff'}}>💳 RomyLabs Billing & Collections</div><div style={{fontSize:13,color:'#64748b',marginTop:5}}>RomyLabs SaaS subscriptions only — separate from each CRM's customer, patient, or client billing.</div></div>
      <button onClick={load} style={{padding:'7px 13px',borderRadius:8,border:'1px solid rgba(99,102,241,.3)',background:'rgba(99,102,241,.1)',color:'#a5b4fc',fontWeight:700,cursor:'pointer'}}>Refresh</button>
    </div>
    {error && <div style={{padding:14,borderRadius:10,background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.25)',color:'#fca5a5',marginBottom:18}}>Billing backend is not available yet: {error}</div>}
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(150px,1fr))',gap:12,marginBottom:20}}>{kpis.map(([label,value,color])=><div key={label} style={{...card,padding:'17px 18px'}}><div style={{fontSize:10,color:'#64748b',fontWeight:800,textTransform:'uppercase'}}>{label}</div><div style={{fontSize:26,color,fontWeight:900,marginTop:8}}>{data?value:'…'}</div></div>)}</div>
    <div style={{...card,padding:'13px 16px',marginBottom:18,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}><span style={{fontSize:11,fontWeight:800,color:'#64748b',textTransform:'uppercase'}}>Collection policy</span><span style={{fontSize:12,color:'#e2e8f0'}}>Invoice automatically</span><span style={{color:'#475569'}}>→</span><span style={{fontSize:12,color:'#f59e0b'}}>Day 10 notice</span><span style={{color:'#475569'}}>→</span><span style={{fontSize:12,color:'#f97316'}}>Day 15 final notice</span><span style={{color:'#475569'}}>→</span><span style={{fontSize:12,color:'#ef4444'}}>Day 20 suspend</span><span style={{marginLeft:'auto',fontSize:11,color:'#475569'}}>Per-account policy remains configurable.</span></div>
    <div style={{display:'flex',gap:8,marginBottom:12}}>{['all','active','past_due','suspended','trial'].map(v=><button key={v} onClick={()=>setFilter(v)} style={{padding:'6px 11px',borderRadius:20,border:`1px solid ${filter===v?'#6366f1':'rgba(255,255,255,.08)'}`,background:filter===v?'rgba(99,102,241,.18)':'transparent',color:filter===v?'#c7d2fe':'#64748b',cursor:'pointer',fontSize:11,fontWeight:700}}>{v==='all'?'All accounts':v.replace('_',' ')}</button>)}</div>
    {!data ? <div style={{padding:40,textAlign:'center',color:'#475569'}}>Loading billing accounts…</div> : <div style={card}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr>{['Account','Product','Status','Monthly','Billing Email','Next Billing','Auto Suspend',''].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead><tbody>{visible.length===0?<tr><td colSpan={8} style={{...td,textAlign:'center',padding:28}}>No subscription accounts in this view.</td></tr>:visible.map(a=><tr key={a.id}><td style={{...td,color:'#e2e8f0',fontWeight:700}}>{a.account_name}</td><td style={td}>{a.product_key}</td><td style={td}><span style={badge(a.status)}>{a.status.replace('_',' ')}</span></td><td style={{...td,color:'#10b981',fontWeight:800}}>{money(a.monthly_amount_cents)}/mo</td><td style={td}>{a.billing_email||'—'}</td><td style={td}>Day {a.billing_day}</td><td style={td}>{a.auto_suspend?'✓ Enabled':'Manual'}</td><td style={td}><button onClick={()=>setSelected(a)} style={{padding:'5px 10px',borderRadius:7,border:'1px solid rgba(99,102,241,.3)',background:'rgba(99,102,241,.1)',color:'#a5b4fc',cursor:'pointer',fontWeight:700}}>Details →</button></td></tr>)}</tbody></table></div>}
    {selected && <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.76)',display:'flex',justifyContent:'flex-end'}} onClick={e=>e.target===e.currentTarget&&setSelected(null)}><div style={{width:620,maxWidth:'94vw',height:'100%',overflowY:'auto',background:'#0f0e1a',borderLeft:'1px solid rgba(99,102,241,.25)',padding:26}}><div style={{display:'flex',justifyContent:'space-between',gap:12}}><div><div style={{fontSize:20,fontWeight:900,color:'#fff'}}>{selected.account_name}</div><div style={{fontSize:12,color:'#64748b',marginTop:3}}>{selected.product_key} · {selected.external_tenant_id}</div></div><button onClick={()=>setSelected(null)} style={{background:'none',border:0,color:'#64748b',fontSize:22,cursor:'pointer'}}>✕</button></div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:20}}><div style={{...card,padding:14}}><div style={{fontSize:10,color:'#64748b'}}>STATUS</div><div style={{marginTop:8}}><span style={badge(selected.status)}>{selected.status}</span></div></div><div style={{...card,padding:14}}><div style={{fontSize:10,color:'#64748b'}}>MONTHLY</div><div style={{fontSize:20,fontWeight:900,color:'#10b981',marginTop:5}}>{money(selected.monthly_amount_cents)}</div></div></div><Section title="Invoices">{accountInvoices.length?accountInvoices.map(i=><Row key={i.id} left={`${i.invoice_number} · ${money(i.amount_cents)}`} right={`${i.status} · due ${date(i.due_at)}`}/>):<Empty text="No invoices yet."/>}</Section><Section title="Payments">{accountPayments.length?accountPayments.map(p=><Row key={p.id} left={`${money(p.amount_cents)} · ${p.status}`} right={date(p.paid_at||p.created_at)}/>):<Empty text="No subscription payments yet."/>}</Section><Section title="Collection history">{accountEvents.length?accountEvents.slice(0,30).map(e=><Row key={e.id} left={e.event_type.replaceAll('_',' ')} right={date(e.created_at)}/>):<Empty text="No collection events yet."/>}</Section><div style={{marginTop:20,padding:14,borderRadius:10,background:'rgba(245,158,11,.07)',border:'1px solid rgba(245,158,11,.18)',fontSize:11,lineHeight:1.6,color:'#94a3b8'}}>Suspension controls remain server-side. This screen intentionally does not expose product service-role keys or delete customer data.</div></div></div>}
  </div>
}
function Section({title,children}){return <div style={{marginTop:22}}><div style={{fontSize:10,fontWeight:800,color:'#64748b',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:8}}>{title}</div><div style={card}>{children}</div></div>}
function Row({left,right}){return <div style={{display:'flex',justifyContent:'space-between',gap:14,padding:'10px 13px',borderBottom:'1px solid rgba(99,102,241,.08)',fontSize:12}}><span style={{color:'#e2e8f0'}}>{left}</span><span style={{color:'#64748b',textAlign:'right'}}>{right}</span></div>}
function Empty({text}){return <div style={{padding:14,color:'#475569',fontSize:12}}>{text}</div>}
