import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BLANK = { docType:'Engagement Letter', clientName:'', message:'Please review and sign at your earliest convenience.', status:'Awaiting' }

export default function Esign() {
  const [items, setItems]   = useState([])
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [toast, setToast]   = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('esigns').select('*').order('created_at', { ascending: false })
    if (data) setItems(data)
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3000) }
  function fld(k,v) { setForm(f=>({...f,[k]:v})) }

  async function save() {
    if (!form.clientName) { showToast('Client required'); return }
    setSaving(true)
    const { error } = await supabase.from('esigns').insert([{ ...form, created_at: new Date().toISOString() }])
    setSaving(false)
    if (error) { showToast('Error: '+error.message); return }
    showToast('Sent for signature!')
    setModal(false); setForm(BLANK); load()
  }

  async function del(id) {
    await supabase.from('esigns').delete().eq('id', id)
    showToast('Deleted'); load()
  }

  return (
    <div>
      {toast && <div className="toast show">{toast}</div>}
      <div className="card">
        <div className="ch">
          <span className="ct">E-Signatures ({items.length})</span>
          <button className="btn pri" onClick={()=>setModal(true)}>+ Send for Signature</button>
        </div>
        <div className="ovx">
          <table>
            <thead><tr><th>Document</th><th>Client</th><th>Sent</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {items.length === 0
                ? <tr><td colSpan={5} style={{textAlign:'center',color:'var(--t3)',padding:20}}>No e-signature requests yet</td></tr>
                : items.map(e => (
                  <tr key={e.id}>
                    <td style={{fontWeight:600}}>✍️ {e.docType}</td>
                    <td>{e.clientName}</td>
                    <td style={{color:'var(--t2)',fontSize:11}}>{e.created_at?.slice(0,10)}</td>
                    <td><span className={`bdg ${e.status==='Signed'?'bg':e.status==='Declined'?'br':'ba'}`}>{e.status}</span></td>
                    <td><button className="btn del" onClick={()=>del(e.id)}>Del</button></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal">
            <div className="mh"><span className="mt">Send for Signature</span><button className="xbtn" onClick={()=>setModal(false)}>&times;</button></div>
            <div className="field"><label>Document Type</label>
              <select value={form.docType} onChange={e=>fld('docType',e.target.value)}>
                {['Engagement Letter','Form 2848 POA','Form 8821','9465 Consent','Custom Document'].map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
            <div className="field"><label>Client *</label><input value={form.clientName} onChange={e=>fld('clientName',e.target.value)}/></div>
            <div className="field"><label>Message to Client</label><textarea value={form.message} onChange={e=>fld('message',e.target.value)}/></div>
            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={save} disabled={saving}>
              {saving?'Sending...':'Send for Signature'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
