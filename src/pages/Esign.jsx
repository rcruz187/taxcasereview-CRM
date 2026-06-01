import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const DOC_TYPES = ['Engagement Letter','Form 2848 — Power of Attorney','Form 8821 — Tax Info Auth','9465 Installment Agreement Consent','OIC Application (656)','Form 433-A Collection Info','Form 433-B Business Collection Info','CDP Hearing Request','Service Agreement','Fee Agreement Addendum','Custom Document']
const BLANK = { docType:'Engagement Letter', clientName:'', clientEmail:'', message:'Please review and sign the attached document at your earliest convenience. Contact us with any questions.', status:'Awaiting', priority:'Normal', dueDate:'' }

export default function Esign() {
  const [items,    setItems]    = useState([])
  const [clients,  setClients]  = useState([])
  const [modal,    setModal]    = useState(false)
  const [form,     setForm]     = useState(BLANK)
  const [saving,   setSaving]   = useState(false)
  const [toast,    setToast]    = useState('')
  const [search,   setSearch]   = useState('')
  const [filterStatus, setFilterStatus] = useState('All')
  const [suggestions, setSug]   = useState([])
  const [showSug,  setShowSug]  = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data:e },{ data:c }] = await Promise.all([
      supabase.from('esigns').select('*').order('created_at',{ascending:false}),
      supabase.from('clients').select('id,name,email'),
    ])
    if (e) setItems(e)
    if (c) setClients(c)
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3000) }
  function fld(k,v) { setForm(f=>({...f,[k]:v})) }

  function searchClient(val) {
    fld('clientName',val)
    if (val.length<2) { setSug([]); setShowSug(false); return }
    const matches = clients.filter(c=>c.name.toLowerCase().includes(val.toLowerCase())).slice(0,6)
    setSug(matches); setShowSug(matches.length>0)
  }

  function selectClient(c) {
    fld('clientName',c.name)
    if (c.email) fld('clientEmail',c.email)
    setSug([]); setShowSug(false)
  }

  async function save() {
    if (!form.clientName) { showToast('Client required'); return }
    setSaving(true)
    const {error} = await supabase.from('esigns').insert([{...form, sentAt:new Date().toISOString(), created_at:new Date().toISOString()}])
    setSaving(false)
    if (error) { showToast('Error: '+error.message); return }
    showToast('✅ Sent for signature!')
    setModal(false); setForm(BLANK); load()
  }

  async function updateStatus(id, status) {
    const update = { status, updated_at:new Date().toISOString() }
    if (status==='Signed') update.signedAt = new Date().toISOString()
    await supabase.from('esigns').update(update).eq('id',id)
    showToast(`✅ Marked as ${status}`)
    load()
  }

  async function resend(item) {
    await supabase.from('esigns').update({status:'Awaiting', sentAt:new Date().toISOString(), updated_at:new Date().toISOString()}).eq('id',item.id)
    showToast('✅ Resent!')
    load()
  }

  async function del(id) {
    if (!confirm('Delete this e-signature request?')) return
    await supabase.from('esigns').delete().eq('id',id)
    showToast('Deleted'); load()
  }

  const filtered = items.filter(i=>{
    const q = search.toLowerCase()
    const ms = !q || i.clientName?.toLowerCase().includes(q) || i.docType?.toLowerCase().includes(q)
    const mst = filterStatus==='All' || i.status===filterStatus
    return ms && mst
  })

  const awaiting = items.filter(i=>i.status==='Awaiting').length
  const signed   = items.filter(i=>i.status==='Signed').length

  return (
    <div>
      {toast&&<div className="toast show">{toast}</div>}

      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
        <h2 style={{fontSize:15,fontWeight:700,margin:0}}>✍️ E-Signatures</h2>
        <button className="btn pri" onClick={()=>{setForm(BLANK);setModal(true)}}>+ Send for Signature</button>
      </div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(110px,1fr))',gap:8,marginBottom:14}}>
        {[
          ['Total Sent',items.length,'var(--tx)'],
          ['Awaiting',awaiting,'var(--warn)'],
          ['Signed',signed,'var(--ok)'],
          ['Declined',items.filter(i=>i.status==='Declined').length,'var(--bad)'],
          ['Sign Rate',items.length?Math.round((signed/items.length)*100)+'%':'—','var(--b2c)'],
        ].map(([label,val,color])=>(
          <div key={label} className="card" style={{padding:'10px 12px',textAlign:'center'}}>
            <div style={{fontWeight:800,fontSize:18,color,lineHeight:1}}>{val}</div>
            <div style={{fontSize:10,color:'var(--t3)',marginTop:3}}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search client or document type…"
          style={{flex:1,minWidth:160,padding:'7px 12px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',fontSize:12}}/>
        {['All','Awaiting','Signed','Declined','Expired'].map(s=>(
          <button key={s} className={`btn ${filterStatus===s?'pri':'sec'}`}
            style={{fontSize:10,padding:'4px 10px'}} onClick={()=>setFilterStatus(s)}>{s}</button>
        ))}
      </div>

      {/* Cards view */}
      {filtered.length===0 ? (
        <div className="card" style={{padding:24,textAlign:'center',color:'var(--t3)',fontSize:13}}>
          {items.length===0?'No e-signature requests yet.':'No requests match your filters.'}
        </div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:10}}>
          {filtered.map(item=>{
            const isOverdue = item.dueDate && new Date(item.dueDate)<new Date() && item.status==='Awaiting'
            const daysSince = item.sentAt ? Math.floor((new Date()-new Date(item.sentAt))/(1000*60*60*24)) : 0
            return (
              <div key={item.id} className="card" style={{border:isOverdue?'1px solid var(--bad)':item.status==='Signed'?'1px solid var(--ok)33':'1px solid var(--br)'}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:8}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:'var(--tx)',marginBottom:2}}>✍️ {item.docType}</div>
                    <div style={{fontSize:12,color:'var(--b2c)',fontWeight:600}}>{item.clientName}</div>
                    {item.clientEmail&&<div style={{fontSize:10,color:'var(--t3)',marginTop:1}}>{item.clientEmail}</div>}
                  </div>
                  <span className={`bdg ${item.status==='Signed'?'bg':item.status==='Declined'?'br':item.status==='Expired'?'bw':'ba'}`}>{item.status}</span>
                </div>

                {item.message&&<div style={{fontSize:11,color:'var(--t2)',lineHeight:1.5,marginBottom:8,padding:'6px 8px',background:'var(--s3)',borderRadius:5,borderLeft:'2px solid var(--br)'}}>{item.message.slice(0,100)}{item.message.length>100?'…':''}</div>}

                <div style={{display:'flex',gap:12,fontSize:10,color:'var(--t3)',marginBottom:10,flexWrap:'wrap'}}>
                  {item.sentAt&&<span>Sent: {new Date(item.sentAt).toLocaleDateString()}</span>}
                  {item.status==='Awaiting'&&daysSince>0&&<span style={{color:daysSince>7?'var(--bad)':'var(--t3)'}}>⏱ {daysSince}d ago</span>}
                  {item.signedAt&&<span style={{color:'var(--ok)'}}>✓ Signed: {new Date(item.signedAt).toLocaleDateString()}</span>}
                  {item.dueDate&&<span style={{color:isOverdue?'var(--bad)':'var(--t3)'}}>Due: {item.dueDate}</span>}
                </div>

                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {item.status==='Awaiting'&&(
                    <>
                      <button className="btn" style={{fontSize:10,padding:'4px 10px',background:'var(--ok)',color:'#fff',border:'none',borderRadius:5,cursor:'pointer'}} onClick={()=>updateStatus(item.id,'Signed')}>✓ Mark Signed</button>
                      <button className="btn sec" style={{fontSize:10,padding:'4px 8px'}} onClick={()=>resend(item)}>↻ Resend</button>
                      <button className="btn sec" style={{fontSize:10,padding:'4px 8px'}} onClick={()=>updateStatus(item.id,'Declined')}>✗ Declined</button>
                    </>
                  )}
                  {item.status==='Signed'&&<span style={{fontSize:11,color:'var(--ok)',fontWeight:600}}>✓ Complete</span>}
                  <button className="btn del" style={{fontSize:10,padding:'4px 8px',marginLeft:'auto'}} onClick={()=>del(item.id)}>Del</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {modal&&(
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal" style={{width:560}}>
            <div className="mh">
              <span className="mt">Send for Signature</span>
              <button className="xbtn" onClick={()=>setModal(false)}>&times;</button>
            </div>

            <div className="field"><label>Document Type</label>
              <select value={form.docType} onChange={e=>fld('docType',e.target.value)}>
                {DOC_TYPES.map(o=><option key={o}>{o}</option>)}
              </select>
            </div>

            <div className="field" style={{position:'relative'}}>
              <label>Client *</label>
              <input value={form.clientName} onChange={e=>searchClient(e.target.value)}
                placeholder="Search client…" autoComplete="off"
                onBlur={()=>setTimeout(()=>setShowSug(false),150)}/>
              {showSug&&suggestions.length>0&&(
                <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--s3)',border:'1px solid var(--b2c)',borderRadius:7,zIndex:500}}>
                  {suggestions.map(c=>(
                    <div key={c.id} onClick={()=>selectClient(c)}
                      style={{padding:'8px 12px',cursor:'pointer',fontSize:13,borderBottom:'1px solid var(--br)'}}>
                      <div style={{fontWeight:600}}>{c.name}</div>
                      {c.email&&<div style={{fontSize:11,color:'var(--t3)'}}>{c.email}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="field"><label>Client Email</label>
              <input type="email" value={form.clientEmail||''} onChange={e=>fld('clientEmail',e.target.value)} placeholder="client@email.com"/>
            </div>

            <div className="fg2">
              <div className="field"><label>Priority</label>
                <select value={form.priority||'Normal'} onChange={e=>fld('priority',e.target.value)}>
                  {['Low','Normal','High','Urgent'].map(p=><option key={p}>{p}</option>)}
                </select>
              </div>
              <div className="field"><label>Due Date (optional)</label>
                <input type="date" value={form.dueDate||''} onChange={e=>fld('dueDate',e.target.value)}/>
              </div>
            </div>

            <div className="field"><label>Message to Client</label>
              <textarea value={form.message} onChange={e=>fld('message',e.target.value)} rows={3}/>
            </div>

            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={save} disabled={saving}>
              {saving?'Sending…':'📤 Send for Signature'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
