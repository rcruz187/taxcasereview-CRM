import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const TEMPLATES = [
  { label:'Welcome Letter',    subject:'Welcome to Tax Case Review', body:'Dear {name},\n\nWelcome to Tax Case Review! We are pleased to begin working on your tax resolution case. Your dedicated case representative will be in touch shortly.\n\nPlease do not hesitate to reach out with any questions.\n\nBest regards,\nTax Case Review' },
  { label:'Document Request',  subject:'Documents Needed — Your Tax Case', body:'Dear {name},\n\nTo proceed with your case, we need the following documents:\n\n1. Last 2 years of tax returns\n2. Most recent IRS notice(s)\n3. Photo ID\n\nPlease provide these at your earliest convenience.\n\nThank you,\nTax Case Review' },
  { label:'OIC Update',        subject:'Update on Your Offer in Compromise', body:'Dear {name},\n\nWe have an update regarding your Offer in Compromise. The IRS has reviewed your submission and we are awaiting their response. We will keep you informed of all developments.\n\nBest regards,\nTax Case Review' },
  { label:'Appointment Reminder', subject:'Appointment Reminder — Tax Case Review', body:'Dear {name},\n\nThis is a reminder of your upcoming appointment. Please ensure you have all requested documents ready.\n\nIf you need to reschedule, please call us as soon as possible.\n\nThank you,\nTax Case Review' },
  { label:'Resolution Complete', subject:'Your Case Has Been Resolved', body:'Dear {name},\n\nWe are pleased to inform you that your tax resolution case has been successfully resolved. Please review the attached documents for your records.\n\nThank you for trusting Tax Case Review.\n\nBest regards,\nTax Case Review' },
]

const BLANK = { to:'', clientName:'', subject:'', body:'', status:'Sent' }

export default function Email() {
  const [sent,     setSent]     = useState([])
  const [clients,  setClients]  = useState([])
  const [form,     setForm]     = useState(BLANK)
  const [sug,      setSug]      = useState([])
  const [saving,   setSaving]   = useState(false)
  const [toast,    setToast]    = useState('')
  const [view,     setView]     = useState('compose') // 'compose' | 'sent'

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data:emails },{ data:clients }] = await Promise.all([
      supabase.from('emails').select('*').order('created_at',{ascending:false}),
      supabase.from('clients').select('id,name,email')
    ])
    if (emails) setSent(emails)
    if (clients) setClients(clients)
  }

  function showToast(msg){setToast(msg);setTimeout(()=>setToast(''),3500)}
  function fld(k,v){setForm(f=>({...f,[k]:v}))}

  function searchClient(val) {
    fld('clientName',val)
    if (val.length<2){setSug([]);return}
    const matches=clients.filter(c=>c.name.toLowerCase().includes(val.toLowerCase())).slice(0,5)
    setSug(matches)
  }

  function useTemplate(t) {
    const name=form.clientName||'{name}'
    setForm(f=>({...f, subject:t.subject, body:t.body.replace(/{name}/g,name)}))
    setView('compose')
  }

  async function send() {
    if (!form.clientName||!form.subject||!form.body){showToast('Client, subject and body required');return}
    setSaving(true)
    const {error}=await supabase.from('emails').insert([{...form,created_at:new Date().toISOString()}])
    setSaving(false)
    if (error){showToast('Error: '+error.message);return}
    showToast('✅ Email logged!')
    setForm(BLANK)
    load()
  }

  async function del(id){
    await supabase.from('emails').delete().eq('id',id)
    showToast('Deleted');load()
  }

  return (
    <div>
      {toast&&<div className="toast show">{toast}</div>}

      {/* Tabs */}
      <div style={{display:'flex',gap:6,marginBottom:12}}>
        {['compose','sent','templates'].map(t=>(
          <span key={t} className={`chip${view===t?' on':''}`} onClick={()=>setView(t)} style={{textTransform:'capitalize'}}>{t==='sent'?`Sent (${sent.length})`:t==='templates'?'Templates':'✉️ Compose'}</span>
        ))}
      </div>

      {/* Compose */}
      {view==='compose'&&(
        <div className="g2" style={{alignItems:'start'}}>
          <div className="card">
            <div className="ch"><span className="ct">Compose Email</span></div>
            <div className="field" style={{position:'relative'}}>
              <label>Client *</label>
              <input value={form.clientName} onChange={e=>searchClient(e.target.value)} placeholder="Search client..." autoComplete="off"/>
              {sug.length>0&&(
                <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--s3)',border:'1px solid var(--b2c)',borderRadius:7,zIndex:500}}>
                  {sug.map(c=>(
                    <div key={c.id} onClick={()=>{fld('clientName',c.name);fld('to',c.email||'');setSug([])}} style={{padding:'7px 12px',cursor:'pointer',fontSize:13}}>
                      <div style={{fontWeight:600}}>{c.name}</div>
                      {c.email&&<div style={{fontSize:11,color:'var(--t3)'}}>{c.email}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="field"><label>To (Email)</label><input value={form.to} onChange={e=>fld('to',e.target.value)} placeholder="client@email.com"/></div>
            <div className="field"><label>Subject</label><input value={form.subject} onChange={e=>fld('subject',e.target.value)} placeholder="Re: Your Tax Case"/></div>
            <div className="field"><label>Message</label><textarea value={form.body} onChange={e=>fld('body',e.target.value)} style={{minHeight:180}} placeholder="Dear {name},&#10;&#10;..."/></div>
            <div style={{display:'flex',gap:8}}>
              <button className="btn pri" style={{flex:1,justifyContent:'center',padding:10}} onClick={send} disabled={saving}>
                {saving?'Saving…':'📨 Log Email as Sent'}
              </button>
            </div>
            <div style={{marginTop:10,padding:10,background:'var(--s2)',borderRadius:7,fontSize:12,color:'var(--t3)'}}>
              💡 Connect SendGrid or Gmail in Settings to enable actual sending. Emails are logged for your records.
            </div>
          </div>
          <div className="card">
            <div className="ch"><span className="ct">Quick Templates</span></div>
            {TEMPLATES.map(t=>(
              <div key={t.label} style={{padding:'10px 0',borderBottom:'1px solid var(--br)'}}>
                <div style={{fontWeight:600,fontSize:13,marginBottom:4}}>{t.label}</div>
                <div style={{fontSize:11,color:'var(--t3)',marginBottom:6,lineHeight:1.5}}>{t.subject}</div>
                <button className="btn sm" onClick={()=>useTemplate(t)}>Use Template</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sent */}
      {view==='sent'&&(
        <div className="card">
          <div className="ch"><span className="ct">Sent Emails ({sent.length})</span></div>
          <div className="ovx">
            <table>
              <thead><tr><th>Client</th><th>To</th><th>Subject</th><th>Date</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {sent.length===0
                  ?<tr><td colSpan={6} style={{textAlign:'center',color:'var(--t3)',padding:20}}>No emails logged yet</td></tr>
                  :sent.map(e=>(
                    <tr key={e.id}>
                      <td style={{fontWeight:600}}>{e.clientName}</td>
                      <td style={{fontSize:12,color:'var(--t2)'}}>{e.to||'—'}</td>
                      <td style={{fontSize:12}}>{e.subject}</td>
                      <td style={{fontSize:11,color:'var(--t3)'}}>{e.created_at?.slice(0,10)}</td>
                      <td><span className="bdg bg">{e.status||'Sent'}</span></td>
                      <td><button className="btn del" onClick={()=>del(e.id)}>Del</button></td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Templates */}
      {view==='templates'&&(
        <div className="card">
          <div className="ch"><span className="ct">Email Templates</span></div>
          {TEMPLATES.map(t=>(
            <div key={t.label} style={{borderBottom:'1px solid var(--br)',padding:'12px 0'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                <div style={{fontWeight:600,fontSize:14}}>{t.label}</div>
                <button className="btn pri" style={{fontSize:11,padding:'4px 12px'}} onClick={()=>{useTemplate(t);setView('compose')}}>Use →</button>
              </div>
              <div style={{fontSize:12,color:'var(--t2)',marginBottom:4}}>Subject: {t.subject}</div>
              <div style={{fontSize:11,color:'var(--t3)',lineHeight:1.6,whiteSpace:'pre-line'}}>{t.body.slice(0,200)}…</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
