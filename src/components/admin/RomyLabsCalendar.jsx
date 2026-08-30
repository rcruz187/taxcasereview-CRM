import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { PRODUCT_BADGE_COLORS } from '../../lib/productBookingConfig'

const PRODUCTS = [
  { id:'romylabs', label:'RomyLabs' },
  { id:'all', label:'All Products' },
  { id:'taxres_crm', label:'TaxRes CRM' },
  { id:'camvella', label:'Camvella' },
  { id:'arcvena', label:'Arcvena' },
  { id:'bocasync', label:'BocaSync' },
]

const fmtTime = (t) => {
  if (!t) return 'Time not set'
  const [hRaw,m='00'] = String(t).split(':')
  const h = Number(hRaw)
  if (!Number.isFinite(h)) return String(t)
  const ap = h >= 12 ? 'PM' : 'AM'
  return `${((h + 11) % 12) + 1}:${m.slice(0,2)} ${ap}`
}

const isoDate = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth()+1).padStart(2,'0')
  const day = String(d.getDate()).padStart(2,'0')
  return `${y}-${m}-${day}`
}

export default function RomyLabsCalendar(){
  const [product,setProduct] = useState('romylabs')
  const [events,setEvents] = useState([])
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState('')
  const [cursor,setCursor] = useState(() => new Date())
  const [selectedDate,setSelectedDate] = useState(() => isoDate(new Date()))

  async function load(){
    setLoading(true)
    setError('')
    const { data, error: rpcError } = await supabase.rpc('admin_product_calendar_events', {
      p_product_id: product,
    })
    if (rpcError) {
      setEvents([])
      setError(rpcError.message || 'Could not load RomyLabs calendar')
    } else {
      setEvents(data || [])
    }
    setLoading(false)
  }

  useEffect(()=>{ load() },[product])

  const monthName = cursor.toLocaleDateString('en-US',{month:'long',year:'numeric'})
  const first = new Date(cursor.getFullYear(),cursor.getMonth(),1)
  const last = new Date(cursor.getFullYear(),cursor.getMonth()+1,0)
  const cells = []
  for(let i=0;i<first.getDay();i++) cells.push(null)
  for(let d=1;d<=last.getDate();d++) cells.push(new Date(cursor.getFullYear(),cursor.getMonth(),d))
  while(cells.length % 7) cells.push(null)

  const byDate = useMemo(()=>{
    const out = new Map()
    for(const e of events){
      const key = e.event_date
      if(!out.has(key)) out.set(key,[])
      out.get(key).push(e)
    }
    return out
  },[events])

  const selectedEvents = byDate.get(selectedDate) || []
  const upcoming = events.filter(e => e.event_date >= isoDate(new Date())).slice(0,8)

  const badgeFor = (id) => PRODUCT_BADGE_COLORS[id] || {bg:'#1e293b',text:'#94a3b8',label:id||'Unknown'}

  return (
    <div className="rl-real-calendar" style={{padding:'24px 28px',maxWidth:1240,margin:'0 auto',boxSizing:'border-box'}}>
      <style>{`
        .rl-cal-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px}
        .rl-cal-title{font-size:24px;font-weight:900;color:#fff}
        .rl-cal-sub{font-size:12px;color:#64748b;margin-top:4px}
        .rl-cal-filter{background:#111827;color:#e2e8f0;border:1px solid rgba(99,102,241,.28);border-radius:9px;padding:9px 12px;font-size:13px;min-width:170px}
        .rl-cal-grid-wrap{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px;align-items:start}
        .rl-cal-card{background:rgba(255,255,255,.03);border:1px solid rgba(99,102,241,.18);border-radius:14px;overflow:hidden}
        .rl-cal-monthbar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(99,102,241,.14)}
        .rl-cal-monthbar button{border:1px solid rgba(99,102,241,.22);background:rgba(99,102,241,.08);color:#c7d2fe;border-radius:8px;min-width:38px;height:36px;cursor:pointer}
        .rl-cal-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));padding:8px 10px 0;color:#475569;font-size:10px;font-weight:800;text-transform:uppercase;text-align:center}
        .rl-cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));padding:8px 10px 12px;gap:5px}
        .rl-cal-day{min-height:86px;border:1px solid rgba(255,255,255,.05);border-radius:9px;background:rgba(255,255,255,.018);padding:7px;cursor:pointer;overflow:hidden}
        .rl-cal-day.selected{border-color:rgba(198,255,0,.55);box-shadow:inset 0 0 0 1px rgba(198,255,0,.15)}
        .rl-cal-day.today .rl-cal-num{color:#C6FF00}
        .rl-cal-num{font-size:11px;font-weight:800;color:#94a3b8;margin-bottom:5px}
        .rl-cal-dot{font-size:9px;line-height:1.25;padding:3px 5px;border-radius:5px;margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .rl-cal-side{padding:16px}
        .rl-cal-side h3{margin:0 0 12px;color:#fff;font-size:14px}
        .rl-cal-event{border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:11px 12px;margin-bottom:9px;background:rgba(255,255,255,.018)}
        .rl-cal-event-title{font-size:12px;font-weight:800;color:#e2e8f0;line-height:1.35}
        .rl-cal-meta{font-size:11px;color:#64748b;margin-top:5px;line-height:1.45}
        .rl-cal-badge{display:inline-block;font-size:9px;font-weight:800;border-radius:999px;padding:3px 7px;margin-bottom:6px}
        .rl-cal-empty{padding:26px 16px;text-align:center;color:#64748b;font-size:12px}
        @media(max-width:768px){
          .rl-real-calendar{padding:16px 12px!important}
          .rl-cal-grid-wrap{grid-template-columns:1fr!important}
          .rl-cal-title{font-size:20px}
          .rl-cal-filter{width:100%;font-size:16px;min-height:42px}
          .rl-cal-day{min-height:62px;padding:5px}
          .rl-cal-dot{font-size:0;width:7px;height:7px;padding:0;border-radius:50%;display:inline-block;margin:2px}
          .rl-cal-num{font-size:10px}
          .rl-cal-week{font-size:9px;padding-left:4px;padding-right:4px}
          .rl-cal-grid{gap:3px;padding-left:4px;padding-right:4px}
        }
      `}</style>

      <div className="rl-cal-toolbar">
        <div>
          <div className="rl-cal-title">📅 RomyLabs Calendar</div>
          <div className="rl-cal-sub">Real product bookings only — no demo or sample calendar data.</div>
        </div>
        <select className="rl-cal-filter" value={product} onChange={e=>setProduct(e.target.value)}>
          {PRODUCTS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>

      {error && <div style={{padding:12,borderRadius:9,background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.25)',color:'#fca5a5',fontSize:12,marginBottom:14}}>{error}</div>}

      <div className="rl-cal-grid-wrap">
        <div className="rl-cal-card">
          <div className="rl-cal-monthbar">
            <button onClick={()=>setCursor(new Date(cursor.getFullYear(),cursor.getMonth()-1,1))}>‹</button>
            <div style={{fontSize:14,fontWeight:800,color:'#fff'}}>{monthName}</div>
            <button onClick={()=>setCursor(new Date(cursor.getFullYear(),cursor.getMonth()+1,1))}>›</button>
          </div>
          <div className="rl-cal-week">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=><div key={d}>{d}</div>)}</div>
          <div className="rl-cal-grid">
            {cells.map((d,i)=>{
              if(!d) return <div key={`blank-${i}`} />
              const key = isoDate(d)
              const dayEvents = byDate.get(key) || []
              const today = key===isoDate(new Date())
              const selected = key===selectedDate
              return <div key={key} onClick={()=>setSelectedDate(key)} className={`rl-cal-day${today?' today':''}${selected?' selected':''}`}>
                <div className="rl-cal-num">{d.getDate()}</div>
                {dayEvents.slice(0,3).map(e=>{const b=badgeFor(e.product_id);return <div key={e.id} className="rl-cal-dot" style={{background:b.bg,color:b.text}} title={e.title}>{fmtTime(e.event_time)} · {e.title}</div>})}
                {dayEvents.length>3 && <div style={{fontSize:9,color:'#64748b'}}>+{dayEvents.length-3} more</div>}
              </div>
            })}
          </div>
        </div>

        <div className="rl-cal-card rl-cal-side">
          <h3>{new Date(selectedDate+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</h3>
          {loading ? <div className="rl-cal-empty">Loading real calendar…</div> : selectedEvents.length ? selectedEvents.map(e=>{
            const b=badgeFor(e.product_id)
            return <div key={e.id} className="rl-cal-event">
              <span className="rl-cal-badge" style={{background:b.bg,color:b.text}}>{b.label}</span>
              <div className="rl-cal-event-title">{e.title}</div>
              <div className="rl-cal-meta">{fmtTime(e.event_time)}{e.client_name?` · ${e.client_name}`:''}{e.contact_email?<><br/>{e.contact_email}</>:null}{e.event_type?<><br/>{e.event_type}</>:null}</div>
            </div>
          }) : <div className="rl-cal-empty">No real {product==='all'?'product':PRODUCTS.find(p=>p.id===product)?.label} events on this day.</div>}

          <h3 style={{marginTop:20}}>Upcoming</h3>
          {loading ? null : upcoming.length ? upcoming.map(e=>{
            const b=badgeFor(e.product_id)
            return <div key={`up-${e.id}`} className="rl-cal-event" onClick={()=>{setSelectedDate(e.event_date);const d=new Date(e.event_date+'T12:00:00');setCursor(new Date(d.getFullYear(),d.getMonth(),1))}} style={{cursor:'pointer'}}>
              <span className="rl-cal-badge" style={{background:b.bg,color:b.text}}>{b.label}</span>
              <div className="rl-cal-event-title">{e.title}</div>
              <div className="rl-cal-meta">{new Date(e.event_date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})} · {fmtTime(e.event_time)}</div>
            </div>
          }) : <div className="rl-cal-empty">No upcoming real bookings for this filter.</div>}
        </div>
      </div>
    </div>
  )
}
