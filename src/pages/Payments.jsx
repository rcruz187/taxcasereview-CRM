import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BLANK = { clientName:'', invNum:'', amount:'', method:'Credit Card', checkNum:'', date:'', status:'Cleared', notes:'' }
const METHODS = ['Credit Card','ACH / Bank Transfer','Check','Cash','Zelle','Venmo','PayPal','Money Order','Wire Transfer','Other']

export default function Payments() {
  const [items,    setItems]    = useState([])
  const [invoices, setInvoices] = useState([])
  const [clients,  setClients]  = useState([])
  const [modal,    setModal]    = useState(false)
  const [editId,   setEditId]   = useState(null)
  const [form,     setForm]     = useState(BLANK)
  const [saving,   setSaving]   = useState(false)
  const [toast,    setToast]    = useState('')
  const [search,   setSearch]   = useState('')
  const [filterMethod, setFilterMethod] = useState('All')
  const [filterStatus, setFilterStatus] = useState('All')
  const [suggestions, setSug]   = useState([])
  const [showSug,  setShowSug]  = useState(false)
  const [invSug,   setInvSug]   = useState([])

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data:p },{ data:inv },{ data:cl }] = await Promise.all([
      supabase.from('payments').select('*').order('created_at',{ascending:false}),
      supabase.from('invoices').select('id,invNum,clientName,total,paid,status'),
      supabase.from('clients').select('id,name'),
    ])
    if (p)   setItems(p)
    if (inv) setInvoices(inv)
    if (cl)  setClients(cl)
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3000) }
  function fld(k,v) { setForm(f=>({...f,[k]:v})) }

  function searchClient(val) {
    fld('clientName',val)
    setSug(val.length<2?[]:clients.filter(c=>c.name.toLowerCase().includes(val.toLowerCase())).slice(0,6))
    setShowSug(true)
    // Update invoice suggestions
    if (val.length>=2) {
      setInvSug(invoices.filter(i=>i.clientName?.toLowerCase().includes(val.toLowerCase())&&i.status!=='Paid').slice(0,4))
    }
  }

  function selectInvoice(inv) {
    fld('invNum', inv.invNum)
    fld('clientName', inv.clientName)
    const balance = parseFloat(inv.total||0) - parseFloat(inv.paid||0)
    if (balance > 0) fld('amount', String(balance.toFixed(2)))
    setInvSug([])
    setSug([]); setShowSug(false)
  }

  async function save() {
    if (!form.clientName || !form.amount) { showToast('Client and amount required'); return }
    setSaving(true)
    const payload = { ...form, date: form.date||new Date().toISOString().slice(0,10) }
    let error
    if (editId) {
      ;({error} = await supabase.from('payments').update({...payload, updated_at:new Date().toISOString()}).eq('id',editId))
    } else {
      ;({error} = await supabase.from('payments').insert([{...payload, created_at:new Date().toISOString()}]))
    }
    setSaving(false)
    if (error) { showToast('Error: '+error.message); return }

    // Auto-update invoice balance if invNum matched
    if (form.invNum) {
      const inv = invoices.find(i=>i.invNum===form.invNum)
      if (inv) {
        const newPaid = parseFloat(inv.paid||0) + parseFloat(form.amount||0)
        const newTotal = parseFloat(inv.total||0)
        const newStatus = newPaid >= newTotal ? 'Paid' : newPaid > 0 ? 'Partial' : 'Unpaid'
        await supabase.from('invoices').update({paid:String(newPaid), status:newStatus}).eq('id',inv.id)
      }
    }

    showToast('✅ Payment recorded!')
    setModal(false); setForm(BLANK); setEditId(null); load()
  }

  function openEdit(p) {
    setForm({...BLANK,...p}); setEditId(p.id); setModal(true)
  }

  async function deleteItem(id) {
    if (!confirm('Delete this payment?')) return
    await supabase.from('payments').delete().eq('id',id)
    showToast('Deleted'); load()
  }

  const cleared = items.filter(p=>p.status==='Cleared').reduce((s,p)=>s+parseFloat(p.amount||0),0)
  const pending = items.filter(p=>p.status==='Pending').reduce((s,p)=>s+parseFloat(p.amount||0),0)

  const filtered = items.filter(p=>{
    const q = search.toLowerCase()
    const ms = !q || p.clientName?.toLowerCase().includes(q) || p.invNum?.includes(q)
    const mm = filterMethod==='All' || p.method===filterMethod
    const ms2 = filterStatus==='All' || p.status===filterStatus
    return ms && mm && ms2
  })

  // Group by method for breakdown
  const byMethod = {}
  items.filter(p=>p.status==='Cleared').forEach(p=>{ byMethod[p.method||'Other']=(byMethod[p.method||'Other']||0)+parseFloat(p.amount||0) })

  return (
    <div>
      {toast&&<div className="toast show">{toast}</div>}

      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
        <h2 style={{fontSize:15,fontWeight:700,margin:0}}>💳 Payments</h2>
        <button className="btn pri" onClick={()=>{setForm(BLANK);setEditId(null);setModal(true)}}>+ Record Payment</button>
      </div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))',gap:8,marginBottom:14}}>
        {[
          ['Total Collected','$'+Math.round(cleared).toLocaleString(),'var(--ok)'],
          ['Pending','$'+Math.round(pending).toLocaleString(),'var(--warn)'],
          ['Payments',items.length,'var(--b2c)'],
          ['Failed',items.filter(p=>p.status==='Failed').length,'var(--bad)'],
        ].map(([label,val,color])=>(
          <div key={label} className="card" style={{padding:'10px 12px',textAlign:'center'}}>
            <div style={{fontWeight:800,fontSize:18,color,lineHeight:1}}>{val}</div>
            <div style={{fontSize:10,color:'var(--t3)',marginTop:3}}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:12,marginBottom:12,alignItems:'start'}}>
        {/* Filters */}
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search client or invoice #…"
            style={{flex:1,minWidth:160,padding:'7px 12px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',fontSize:12}}/>
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
            style={{padding:'7px 10px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',fontSize:12}}>
            <option value="All">All Statuses</option>
            {['Cleared','Pending','Failed'].map(s=><option key={s}>{s}</option>)}
          </select>
          <select value={filterMethod} onChange={e=>setFilterMethod(e.target.value)}
            style={{padding:'7px 10px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',fontSize:12}}>
            <option value="All">All Methods</option>
            {METHODS.map(m=><option key={m}>{m}</option>)}
          </select>
        </div>

        {/* Method breakdown mini */}
        {Object.keys(byMethod).length > 0 && (
          <div className="card" style={{padding:'8px 12px',fontSize:11,minWidth:180}}>
            <div style={{fontWeight:700,fontSize:10,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:6}}>By Method</div>
            {Object.entries(byMethod).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([m,v])=>(
              <div key={m} style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                <span style={{color:'var(--t2)'}}>{m}</span>
                <span style={{fontWeight:700}}>${Math.round(v).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="card" style={{padding:0,overflow:'hidden'}}>
        {filtered.length===0 ? (
          <div style={{padding:24,textAlign:'center',color:'var(--t3)',fontSize:13}}>
            {items.length===0?'No payments recorded yet.':'No payments match your filters.'}
          </div>
        ) : (
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{borderBottom:'1px solid var(--br)',background:'var(--s2)'}}>
                {['Client','Invoice #','Amount','Method','Check #','Date','Status',''].map(h=>(
                  <th key={h} style={{padding:'9px 12px',textAlign:'left',fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.05em'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p=>(
                <tr key={p.id} style={{borderBottom:'1px solid var(--br)'}}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--s2)'}
                  onMouseLeave={e=>e.currentTarget.style.background=''}>
                  <td style={{padding:'9px 12px',fontWeight:600}}>{p.clientName}</td>
                  <td style={{padding:'9px 12px',color:'var(--b2c)',fontSize:11,fontWeight:600}}>{p.invNum||'—'}</td>
                  <td style={{padding:'9px 12px',fontWeight:700,color:'var(--ok)',fontSize:13}}>${parseFloat(p.amount||0).toLocaleString()}</td>
                  <td style={{padding:'9px 12px'}}><span className="bdg bn" style={{fontSize:10}}>{p.method}</span></td>
                  <td style={{padding:'9px 12px',color:'var(--t3)',fontSize:11}}>{p.checkNum||'—'}</td>
                  <td style={{padding:'9px 12px',color:'var(--t2)'}}>{p.date||'—'}</td>
                  <td style={{padding:'9px 12px'}}><span className={`bdg ${p.status==='Cleared'?'bg':p.status==='Failed'?'br':'ba'}`}>{p.status}</span></td>
                  <td style={{padding:'9px 12px'}}>
                    <div style={{display:'flex',gap:5}}>
                      <button className="btn sec" style={{fontSize:10,padding:'3px 8px'}} onClick={()=>openEdit(p)}>Edit</button>
                      <button className="btn del" style={{fontSize:10,padding:'3px 8px'}} onClick={()=>deleteItem(p.id)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modal&&(
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&(setModal(false),setEditId(null))}>
          <div className="modal" style={{width:560}}>
            <div className="mh">
              <span className="mt">{editId?'Edit Payment':'Record Payment'}</span>
              <button className="xbtn" onClick={()=>{setModal(false);setEditId(null)}}>&times;</button>
            </div>

            {/* Invoice quick-link */}
            {invSug.length>0&&(
              <div style={{background:'var(--s3)',borderRadius:7,padding:10,marginBottom:10}}>
                <div style={{fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',marginBottom:6}}>Open Invoices for this Client</div>
                {invSug.map(inv=>{
                  const bal = parseFloat(inv.total||0)-parseFloat(inv.paid||0)
                  return (
                    <div key={inv.id} onClick={()=>selectInvoice(inv)}
                      style={{padding:'6px 10px',cursor:'pointer',borderRadius:5,fontSize:12,display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:3,background:'var(--s2)'}}
                      onMouseEnter={e=>e.currentTarget.style.background='var(--s3)'}
                      onMouseLeave={e=>e.currentTarget.style.background='var(--s2)'}>
                      <span style={{fontWeight:600}}>{inv.invNum}</span>
                      <span style={{color:'var(--warn)',fontWeight:700}}>Balance: ${bal.toLocaleString()}</span>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="field" style={{position:'relative'}}>
              <label>Client *</label>
              <input value={form.clientName} onChange={e=>searchClient(e.target.value)}
                placeholder="Search client…" autoComplete="off"
                onBlur={()=>setTimeout(()=>setShowSug(false),150)}/>
              {showSug&&suggestions.length>0&&(
                <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--s3)',border:'1px solid var(--b2c)',borderRadius:7,zIndex:500}}>
                  {suggestions.map(c=>(
                    <div key={c.id} onClick={()=>{fld('clientName',c.name);setSug([]);setShowSug(false);setInvSug(invoices.filter(i=>i.clientName===c.name&&i.status!=='Paid').slice(0,4))}}
                      style={{padding:'8px 12px',cursor:'pointer',fontSize:13}}>{c.name}</div>
                  ))}
                </div>
              )}
            </div>

            <div className="field">
              <label>Invoice # (optional)</label>
              <input value={form.invNum} onChange={e=>fld('invNum',e.target.value)} placeholder="INV-XXXXXX"/>
            </div>

            <div className="fg2">
              <div className="field">
                <label>Amount *</label>
                <div style={{position:'relative'}}>
                  <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--t3)'}}>$</span>
                  <input type="number" value={form.amount} onChange={e=>fld('amount',e.target.value)} style={{paddingLeft:22}} placeholder="0.00"/>
                </div>
              </div>
              <div className="field"><label>Date</label><input type="date" value={form.date} onChange={e=>fld('date',e.target.value)}/></div>
            </div>

            <div className="fg2">
              <div className="field"><label>Method</label>
                <select value={form.method} onChange={e=>fld('method',e.target.value)}>
                  {METHODS.map(m=><option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="field"><label>Check # (if check)</label><input value={form.checkNum||''} onChange={e=>fld('checkNum',e.target.value)} placeholder="Optional"/></div>
            </div>

            <div className="fg2">
              <div className="field"><label>Status</label>
                <select value={form.status} onChange={e=>fld('status',e.target.value)}>
                  {['Cleared','Pending','Failed'].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="field"><label>Notes</label><input value={form.notes||''} onChange={e=>fld('notes',e.target.value)}/></div>
            </div>

            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={save} disabled={saving}>
              {saving?'Saving…':editId?'Update Payment':'Record Payment'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
