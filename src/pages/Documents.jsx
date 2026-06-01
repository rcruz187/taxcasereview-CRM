import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BLANK = { name:'', client:'', caseNum:'', docType:'IRS Notice', notes:'' }
const DOC_TYPES = ['IRS Notice','IRS Form','Transcript','Agreement','W2 / 1099','Tax Return','Financial Statement','Bank Statement','Correspondence','Engagement Letter','Other']

export default function Documents() {
  const [items, setItems]     = useState([])
  const [clients, setClients] = useState([])
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(BLANK)
  const [suggestions, setSug] = useState([])
  const [filter, setFilter]   = useState('All')
  const [saving, setSaving]   = useState(false)
  const [toast, setToast]     = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: d }, { data: c }] = await Promise.all([
      supabase.from('documents').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('id,name')
    ])
    if (d) setItems(d)
    if (c) setClients(c)
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3000) }
  function fld(k,v) { setForm(f=>({...f,[k]:v})) }

  function searchClient(val) {
    fld('client',val)
    if (val.length < 2) { setSug([]); return }
    setSug(clients.filter(c=>c.name.toLowerCase().includes(val.toLowerCase())).slice(0,6))
  }

  const filtered = filter === 'All' ? items : items.filter(d => d.docType === filter)

  async function save() {
    if (!form.name) { showToast('Document name required'); return }
    setSaving(true)
    const { error } = await supabase.from('documents').insert([{ ...form, created_at: new Date().toISOString() }])
    setSaving(false)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('Document saved!')
    setModal(false)
    setForm(BLANK)
    load()
  }

  async function deleteItem(id) {
    await supabase.from('documents').delete().eq('id', id)
    showToast('Deleted'); load()
  }

  return (
    <div>
      {toast && <div className="toast show">{toast}</div>}
      <div style={{marginBottom:10,display:'flex',flexWrap:'wrap',gap:4}}>
        {['All',...DOC_TYPES.slice(0,6)].map(t=>(
          <span key={t} className={`chip${filter===t?' on':''}`} onClick={()=>setFilter(t)}>{t}</span>
        ))}
      </div>
      <div className="card">
        <div className="ch">
          <span className="ct">Document Storage ({filtered.length})</span>
          <button className="btn pri" onClick={()=>setModal(true)}>+ Add Document</button>
        </div>
        <div className="ovx">
          <table>
            <thead><tr><th>Document</th><th>Client</th><th>Case #</th><th>Type</th><th>Notes</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} style={{textAlign:'center',color:'var(--t3)',padding:20}}>No documents yet</td></tr>
              ) : filtered.map(d => (
                <tr key={d.id}>
                  <td style={{fontWeight:600}}>📄 {d.name}</td>
                  <td>{d.client||'—'}</td>
                  <td style={{color:'var(--t2)'}}>{d.caseNum||'—'}</td>
                  <td><span className="bdg bn">{d.docType}</span></td>
                  <td style={{color:'var(--t2)',fontSize:12}}>{d.notes||'—'}</td>
                  <td style={{color:'var(--t2)',fontSize:11}}>{d.created_at?.slice(0,10)||'—'}</td>
                  <td><button className="btn del" onClick={()=>deleteItem(d.id)}>Del</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal">
            <div className="mh">
              <span className="mt">Add Document</span>
              <button className="xbtn" onClick={()=>setModal(false)}>&times;</button>
            </div>
            <div className="fg2">
              <div className="field"><label>Document Name *</label><input value={form.name} onChange={e=>fld('name',e.target.value)} placeholder="e.g. 2022 W2 - John Smith"/></div>
              <div className="field" style={{position:'relative'}}>
                <label>Client</label>
                <input value={form.client} onChange={e=>searchClient(e.target.value)} placeholder="Type client name..." autoComplete="off"/>
                {suggestions.length > 0 && (
                  <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--s3)',border:'1px solid var(--b2c)',borderRadius:7,zIndex:500}}>
                    {suggestions.map(c=><div key={c.id} onClick={()=>{fld('client',c.name);setSug([])}} style={{padding:'7px 12px',cursor:'pointer',fontSize:13}}>{c.name}</div>)}
                  </div>
                )}
              </div>
            </div>
            <div className="fg2">
              <div className="field"><label>Case #</label><input value={form.caseNum} onChange={e=>fld('caseNum',e.target.value)}/></div>
              <div className="field"><label>Type</label>
                <select value={form.docType} onChange={e=>fld('docType',e.target.value)}>
                  {DOC_TYPES.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="field"><label>Notes</label><input value={form.notes} onChange={e=>fld('notes',e.target.value)} placeholder="Brief description"/></div>
            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save Document'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
