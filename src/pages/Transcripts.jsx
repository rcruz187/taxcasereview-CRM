import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const YEARS = Array.from({length:21},(_,i)=>2026-i)
const BLANK = { clientName:'', transcriptType:'Tax Return (1040)', taxYears:[], taxYearsCustom:'', requestDate:'', status:'Pending', notes:'' }

export default function Transcripts() {
  const [items, setItems]     = useState([])
  const [clients, setClients] = useState([])
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(BLANK)
  const [suggestions, setSug] = useState([])
  const [saving, setSaving]   = useState(false)
  const [toast, setToast]     = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: t }, { data: c }] = await Promise.all([
      supabase.from('transcripts').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('id,name')
    ])
    if (t) setItems(t)
    if (c) setClients(c)
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3000) }
  function fld(k,v) { setForm(f=>({...f,[k]:v})) }
  function toggleYear(y) { setForm(f=>({...f, taxYears: f.taxYears.includes(y)?f.taxYears.filter(x=>x!==y):[...f.taxYears,y]})) }

  function searchClient(val) {
    fld('clientName',val)
    if (val.length < 2) { setSug([]); return }
    setSug(clients.filter(c=>c.name.toLowerCase().includes(val.toLowerCase())).slice(0,6))
  }

  async function save() {
    if (!form.clientName) { showToast('Client required'); return }
    setSaving(true)
    const { error } = await supabase.from('transcripts').insert([{ ...form, taxYears: JSON.stringify(form.taxYears), created_at: new Date().toISOString() }])
    setSaving(false)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('Transcript request submitted!')
    setModal(false)
    setForm(BLANK)
    load()
  }

  async function deleteItem(id) {
    await supabase.from('transcripts').delete().eq('id', id)
    showToast('Deleted'); load()
  }

  return (
    <div>
      {toast && <div className="toast show">{toast}</div>}
      <div className="card">
        <div className="ch">
          <span className="ct">Transcript Requests ({items.length})</span>
          <button className="btn pri" onClick={()=>setModal(true)}>+ Request Transcript</button>
        </div>
        <div className="ovx">
          <table>
            <thead><tr><th>Client</th><th>Type</th><th>Years</th><th>Requested</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={6} style={{textAlign:'center',color:'var(--t3)',padding:20}}>No transcript requests yet</td></tr>
              ) : items.map(t => (
                <tr key={t.id}>
                  <td style={{fontWeight:600}}>{t.clientName}</td>
                  <td style={{color:'var(--t2)'}}>{t.transcriptType}</td>
                  <td style={{fontSize:11}}>{(()=>{try{return JSON.parse(t.taxYears||'[]').join(', ')||t.taxYearsCustom||'—'}catch{return t.taxYearsCustom||'—'}})()}</td>
                  <td style={{color:'var(--t2)'}}>{t.requestDate||'—'}</td>
                  <td><span className={`bdg ${t.status==='Received'?'bg':t.status==='Pending'?'ba':'bb'}`}>{t.status}</span></td>
                  <td><button className="btn del" onClick={()=>deleteItem(t.id)}>Del</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal" style={{width:580}}>
            <div className="mh">
              <span className="mt">Request Transcript</span>
              <button className="xbtn" onClick={()=>setModal(false)}>&times;</button>
            </div>
            <div className="field" style={{position:'relative'}}>
              <label>Client * (search)</label>
              <input value={form.clientName} onChange={e=>searchClient(e.target.value)} placeholder="Search clients..." autoComplete="off"/>
              {suggestions.length > 0 && (
                <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--s3)',border:'1px solid var(--b2c)',borderRadius:7,zIndex:500}}>
                  {suggestions.map(c=><div key={c.id} onClick={()=>{fld('clientName',c.name);setSug([])}} style={{padding:'7px 12px',cursor:'pointer',fontSize:13}}>{c.name}</div>)}
                </div>
              )}
            </div>
            <div className="field"><label>Transcript Type</label>
              <select value={form.transcriptType} onChange={e=>fld('transcriptType',e.target.value)}>
                <optgroup label="Individual"><option>Tax Return (1040)</option><option>Account Transcript</option><option>Wage and Income (W-2/1099)</option><option>Record of Account</option><option>Verification of Non-Filing</option></optgroup>
                <optgroup label="Business"><option>Business Return (1120/1065)</option><option>Business Account Transcript</option><option>Employment Tax (941)</option></optgroup>
                <optgroup label="Penalties & Other"><option>Civil Penalty Transcript</option><option>Trust Fund Recovery Penalty</option><option>Payroll Tax Transcript (940/941)</option></optgroup>
              </select>
            </div>
            <div className="field"><label>Tax Years</label>
              <div style={{background:'var(--s2)',border:'1px solid var(--b2c)',borderRadius:7,padding:'8px 10px',maxHeight:80,overflowY:'auto',display:'flex',flexWrap:'wrap',gap:'2px 12px'}}>
                {YEARS.map(y=>(
                  <label key={y} style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:12,cursor:'pointer',whiteSpace:'nowrap'}}>
                    <input type="checkbox" checked={form.taxYears.includes(String(y))} onChange={()=>toggleYear(String(y))} style={{width:'auto'}}/>
                    {y}
                  </label>
                ))}
              </div>
              <input value={form.taxYearsCustom} onChange={e=>fld('taxYearsCustom',e.target.value)} placeholder="Or type custom years: 2019, 2018..." style={{marginTop:5}}/>
            </div>
            <div className="fg2">
              <div className="field"><label>Request Date</label><input type="date" value={form.requestDate} onChange={e=>fld('requestDate',e.target.value)}/></div>
              <div className="field"><label>Status</label>
                <select value={form.status} onChange={e=>fld('status',e.target.value)}>
                  <option>Pending</option><option>Sent to IRS</option><option>Received</option><option>Partial - More Coming</option>
                </select>
              </div>
            </div>
            <div className="field"><label>Notes</label><input value={form.notes} onChange={e=>fld('notes',e.target.value)}/></div>
            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={save} disabled={saving}>
              {saving ? 'Submitting...' : 'Submit Transcript Request'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
