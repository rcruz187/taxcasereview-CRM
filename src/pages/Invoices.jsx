import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BLANK = { clientName:'', caseNum:'', lineItems:'', total:'', paid:'0', dueDate:'', taxRate:'0', status:'Unpaid', notes:'' }
const SERVICE_TEMPLATES = [
  'OIC Representation Services',
  'Installment Agreement Setup',
  'IRS Transcript Analysis',
  'Penalty Abatement Filing',
  'Audit Representation',
  'Tax Return Preparation',
  'Power of Attorney Filing',
  'CDP Hearing Representation',
  'Lien Discharge/Subordination',
  'Wage Garnishment Release',
]

function SBdg({s}) {
  const m = {Paid:'bg',Partial:'ba',Overdue:'br',Unpaid:'bn'}
  return <span className={`bdg ${m[s]||'bn'}`}>{s}</span>
}

export default function Invoices() {
  const [items,    setItems]    = useState([])
  const [clients,  setClients]  = useState([])
  const [modal,    setModal]    = useState(false)
  const [editId,   setEditId]   = useState(null)
  const [form,     setForm]     = useState(BLANK)
  const [saving,   setSaving]   = useState(false)
  const [toast,    setToast]    = useState('')
  const [search,   setSearch]   = useState('')
  const [filterStatus, setFilterStatus] = useState('All')
  const [suggestions, setSug]   = useState([])
  const [showSug,  setShowSug]  = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data:inv },{ data:cl }] = await Promise.all([
      supabase.from('invoices').select('*').order('created_at',{ascending:false}),
      supabase.from('clients').select('id,name,assignedTo')
    ])
    if (inv) setItems(inv)
    if (cl)  setClients(cl)
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3000) }
  function fld(k,v) { setForm(f=>({...f,[k]:v})) }

  function searchClient(val) {
    fld('clientName',val)
    if (val.length < 2) { setSug([]); setShowSug(false); return }
    const matches = clients.filter(c=>c.name.toLowerCase().includes(val.toLowerCase())).slice(0,6)
    setSug(matches); setShowSug(matches.length > 0)
  }

  function selectClient(c) {
    fld('clientName', c.name)
    setSug([]); setShowSug(false)
  }

  const subtotal = parseFloat(form.total||0)
  const paid     = parseFloat(form.paid||0)
  const tax      = subtotal * (parseFloat(form.taxRate||0)/100)
  const balance  = (subtotal + tax) - paid

  async function save() {
    if (!form.clientName || !form.total) { showToast('Client and total required'); return }
    setSaving(true)
    const statusCalc = paid >= (subtotal+tax) ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid'
    if (editId) {
      const {error} = await supabase.from('invoices').update({...form, status:statusCalc, updated_at:new Date().toISOString()}).eq('id',editId)
      if (error) { showToast('Error: '+error.message); setSaving(false); return }
      showToast('✅ Invoice updated!')
    } else {
      const invNum = 'INV-' + Date.now().toString().slice(-6)
      const {error} = await supabase.from('invoices').insert([{...form, invNum, status:statusCalc, created_at:new Date().toISOString()}])
      if (error) { showToast('Error: '+error.message); setSaving(false); return }
      showToast('✅ Invoice created!')
    }
    setSaving(false); setModal(false); setForm(BLANK); setEditId(null); load()
  }

  function openEdit(inv) {
    setForm({...BLANK,...inv})
    setEditId(inv.id)
    setModal(true)
  }

  async function markPaid(inv) {
    const total = parseFloat(inv.total||0)
    const {error} = await supabase.from('invoices').update({paid:String(total), status:'Paid', updated_at:new Date().toISOString()}).eq('id',inv.id)
    if (!error) { showToast('✅ Marked as Paid!'); load() }
  }

  async function deleteItem(id) {
    if (!window.confirm('Delete this invoice?')) return
    await supabase.from('invoices').delete().eq('id',id)
    showToast('Deleted'); load()
  }

  const totalInvoiced = items.reduce((s,i)=>s+parseFloat(i.total||0),0)
  const totalPaid     = items.reduce((s,i)=>s+parseFloat(i.paid||0),0)
  const totalOwed     = totalInvoiced - totalPaid
  const overdue       = items.filter(i=>i.status==='Overdue'||( i.dueDate && new Date(i.dueDate)<new Date() && i.status!=='Paid')).length

  const filtered = items.filter(i => {
    const q = search.toLowerCase()
    const matchSearch = !q || i.clientName?.toLowerCase().includes(q) || i.invNum?.includes(q)
    const matchStatus = filterStatus==='All' || i.status===filterStatus
    return matchSearch && matchStatus
  })

  return (
    <div style={{maxWidth:1000}}>
      {toast && <div className="toast show">{toast}</div>}

      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
        <h2 style={{fontSize:15,fontWeight:700,margin:0}}>🧾 Invoices</h2>
        <button className="btn pri" onClick={()=>{setForm(BLANK);setEditId(null);setModal(true)}}>+ New Invoice</button>
      </div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:8,marginBottom:14}}>
        {[
          ['Total Invoiced','$'+Math.round(totalInvoiced).toLocaleString(),'var(--tx)'],
          ['Collected','$'+Math.round(totalPaid).toLocaleString(),'var(--ok)'],
          ['Outstanding','$'+Math.round(totalOwed).toLocaleString(),totalOwed>0?'var(--warn)':'var(--t2)'],
          ['Overdue',overdue,overdue>0?'var(--bad)':'var(--t2)'],
          ['Paid',items.filter(i=>i.status==='Paid').length,'var(--ok)'],
          ['Unpaid',items.filter(i=>i.status==='Unpaid').length,'var(--warn)'],
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
          placeholder="Search client or invoice #…"
          style={{flex:1,minWidth:160,padding:'7px 12px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',fontSize:12}}/>
        {['All','Unpaid','Partial','Paid','Overdue'].map(s=>(
          <button key={s} className={`btn ${filterStatus===s?'pri':'sec'}`}
            style={{fontSize:10,padding:'4px 10px'}} onClick={()=>setFilterStatus(s)}>{s}</button>
        ))}
      </div>

      {/* Table */}
      <div className="card" style={{padding:0,overflow:'hidden'}}>
        {filtered.length===0 ? (
          <div style={{padding:24,textAlign:'center',color:'var(--t3)',fontSize:13}}>
            {items.length===0 ? 'No invoices yet. Click "+ New Invoice" to get started.' : 'No invoices match your filters.'}
          </div>
        ) : (
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{borderBottom:'1px solid var(--br)',background:'var(--s2)'}}>
                {['Invoice #','Client','Total','Paid','Balance','Due Date','Status','Actions'].map(h=>(
                  <th key={h} style={{padding:'9px 12px',textAlign:'left',fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.05em'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv=>{
                const t=parseFloat(inv.total||0), p=parseFloat(inv.paid||0), bal=t-p
                const isOverdue = inv.dueDate && new Date(inv.dueDate)<new Date() && inv.status!=='Paid'
                return (
                  <tr key={inv.id} style={{borderBottom:'1px solid var(--br)'}}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--s2)'}
                    onMouseLeave={e=>e.currentTarget.style.background=''}>
                    <td style={{padding:'9px 12px',fontWeight:700,color:'var(--b2c)',fontSize:11}}>{inv.invNum}</td>
                    <td style={{padding:'9px 12px',fontWeight:600}}>{inv.clientName}</td>
                    <td style={{padding:'9px 12px',fontWeight:600}}>${t.toLocaleString()}</td>
                    <td style={{padding:'9px 12px',color:'var(--ok)'}}>${p.toLocaleString()}</td>
                    <td style={{padding:'9px 12px',fontWeight:bal>0?700:400,color:bal>0?'var(--warn)':'var(--t2)'}}>${bal.toLocaleString()}</td>
                    <td style={{padding:'9px 12px',color:isOverdue?'var(--bad)':'var(--t2)',fontWeight:isOverdue?700:400}}>{inv.dueDate||'—'}</td>
                    <td style={{padding:'9px 12px'}}><SBdg s={isOverdue&&inv.status!=='Paid'?'Overdue':inv.status||'Unpaid'}/></td>
                    <td style={{padding:'9px 12px'}}>
                      <div style={{display:'flex',gap:5}}>
                        <button className="btn sec" style={{fontSize:10,padding:'3px 8px'}} onClick={()=>openEdit(inv)}>Edit</button>
                        {inv.status!=='Paid'&&<button className="btn" style={{fontSize:10,padding:'3px 8px',background:'var(--ok)',color:'#fff',border:'none',borderRadius:5,cursor:'pointer'}} onClick={()=>markPaid(inv)}>Paid ✓</button>}
                        <button className="btn del" style={{fontSize:10,padding:'3px 8px'}} onClick={()=>deleteItem(inv.id)}>Del</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modal&&(
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&(setModal(false),setEditId(null))}>
          <div className="modal" style={{width:600}}>
            <div className="mh">
              <span className="mt">{editId?'Edit Invoice':'New Invoice'}</span>
              <button className="xbtn" onClick={()=>{setModal(false);setEditId(null)}}>&times;</button>
            </div>

            {/* Client search */}
            <div className="field" style={{position:'relative'}}>
              <label>Client *</label>
              <input value={form.clientName} onChange={e=>searchClient(e.target.value)}
                placeholder="Search client name…" autoComplete="off"
                onBlur={()=>setTimeout(()=>setShowSug(false),150)}
                onFocus={()=>form.clientName.length>=2&&setShowSug(suggestions.length>0)}/>
              {showSug&&suggestions.length>0&&(
                <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--s3)',border:'1px solid var(--b2c)',borderRadius:7,zIndex:500,maxHeight:160,overflowY:'auto'}}>
                  {suggestions.map(c=>(
                    <div key={c.id} onClick={()=>selectClient(c)}
                      style={{padding:'8px 12px',cursor:'pointer',fontSize:13,borderBottom:'1px solid var(--br)'}}
                      onMouseEnter={e=>e.currentTarget.style.background='var(--s2)'}
                      onMouseLeave={e=>e.currentTarget.style.background=''}>{c.name}</div>
                  ))}
                </div>
              )}
            </div>

            <div className="fg2">
              <div className="field"><label>Case #</label><input value={form.caseNum} onChange={e=>fld('caseNum',e.target.value)} placeholder="C-XXXXXX"/></div>
              <div className="field"><label>Due Date</label><input type="date" value={form.dueDate} onChange={e=>fld('dueDate',e.target.value)}/></div>
            </div>

            {/* Line items with templates */}
            <div className="field">
              <label style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span>Services / Line Items</span>
                <select onChange={e=>{if(e.target.value)fld('lineItems',(form.lineItems?form.lineItems+'\n':'')+e.target.value);e.target.value=''}}
                  style={{fontSize:10,padding:'2px 6px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:4,color:'var(--tx)'}}>
                  <option value="">+ Add Template</option>
                  {SERVICE_TEMPLATES.map(t=><option key={t}>{t}</option>)}
                </select>
              </label>
              <textarea value={form.lineItems} onChange={e=>fld('lineItems',e.target.value)}
                rows={4} placeholder="e.g. OIC Representation Services - $2,500&#10;IRS Transcript Request - $150"
                style={{minHeight:80,resize:'vertical'}}/>
            </div>

            <div className="fg2">
              <div className="field">
                <label>Total Amount *</label>
                <div style={{position:'relative'}}>
                  <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--t3)'}}>$</span>
                  <input type="number" value={form.total} onChange={e=>fld('total',e.target.value)} style={{paddingLeft:22}} placeholder="0.00"/>
                </div>
              </div>
              <div className="field">
                <label>Amount Paid</label>
                <div style={{position:'relative'}}>
                  <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--t3)'}}>$</span>
                  <input type="number" value={form.paid} onChange={e=>fld('paid',e.target.value)} style={{paddingLeft:22}} placeholder="0.00"/>
                </div>
              </div>
            </div>

            <div className="fg2">
              <div className="field"><label>Tax Rate %</label><input type="number" value={form.taxRate} onChange={e=>fld('taxRate',e.target.value)} placeholder="0"/></div>
              <div className="field"><label>Status</label>
                <select value={form.status} onChange={e=>fld('status',e.target.value)}>
                  {['Unpaid','Partial','Paid','Overdue'].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Live preview */}
            {(parseFloat(form.total)||0) > 0 && (
              <div style={{background:'var(--s3)',borderRadius:7,padding:'10px 14px',marginBottom:10,fontSize:12.5}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><span style={{color:'var(--t2)'}}>Subtotal</span><span>${subtotal.toLocaleString()}</span></div>
                {parseFloat(form.taxRate||0)>0&&<div style={{display:'flex',justifyContent:'space-between',marginBottom:4,color:'var(--t3)'}}><span>Tax ({form.taxRate}%)</span><span>${tax.toFixed(2)}</span></div>}
                {paid>0&&<div style={{display:'flex',justifyContent:'space-between',marginBottom:4,color:'var(--ok)'}}><span>Paid</span><span>-${paid.toLocaleString()}</span></div>}
                <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,borderTop:'1px solid var(--br)',paddingTop:6}}>
                  <span>Balance Due</span>
                  <span style={{color:balance>0?'var(--warn)':'var(--ok)',fontSize:15}}>${balance.toFixed(2)}</span>
                </div>
              </div>
            )}

            <div className="field"><label>Notes</label><input value={form.notes||''} onChange={e=>fld('notes',e.target.value)} placeholder="Internal notes…"/></div>

            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={save} disabled={saving}>
              {saving?'Saving…':editId?'Update Invoice':'Create Invoice'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
