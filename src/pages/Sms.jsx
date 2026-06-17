import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'

const TEMPLATES = [
  { label:'Appointment Reminder', body:'Hi {name}, this is Tax Case Review reminding you of your upcoming appointment. Reply CONFIRM to confirm or call us to reschedule.' },
  { label:'Document Request',     body:'Hi {name}, we need a few documents to move forward on your case. Please call or email us at your earliest convenience. - Tax Case Review' },
  { label:'Payment Due',          body:'Hi {name}, a balance is due on your account with Tax Case Review. Please call our office to discuss payment options. Thank you.' },
  { label:'Resolution Update',    body:'Hi {name}, we have an update on your IRS case. Please call our office at your earliest convenience. - Tax Case Review' },
  { label:'Welcome Text',         body:'Hi {name}, welcome to Tax Case Review! Your dedicated rep will be in touch soon. Questions? Call or text us anytime.' },
]

const BLANK = { phone:'', clientName:'', body:'', status:'Sent' }

export default function Sms() {
  const { user } = useApp()
  const [sent,    setSent]    = useState([])
  const [clients, setClients] = useState([])
  const [form,    setForm]    = useState(BLANK)
  const [sug,     setSug]     = useState([])
  const [saving,  setSaving]  = useState(false)
  const [toast,   setToast]   = useState('')
  const [view,    setView]    = useState('compose')

  const [settings, setSettings] = useState({})

  useEffect(()=>{load()},[])

  async function load(){
    const [{data:sms},{data:clients},{data:s}]=await Promise.all([
      supabase.from('sms_messages').select('*').order('created_at',{ascending:false}),
      supabase.from('clients').select('id,name,phone'),
      supabase.from('settings').select('signalwire_backend,sw_inbound_did').limit(1).maybeSingle(),
    ])
    if(sms)setSent(sms)
    if(clients)setClients(clients)
    if(s)setSettings(s)
  }

  function showToast(msg){setToast(msg);setTimeout(()=>setToast(''),3500)}
  function fld(k,v){setForm(f=>({...f,[k]:v}))}

  function searchClient(val){
    fld('clientName',val)
    if(val.length<2){setSug([]);return}
    setSug(clients.filter(c=>c.name.toLowerCase().includes(val.toLowerCase())).slice(0,5))
  }

  function useTemplate(t){
    const name=form.clientName||'{name}'
    fld('body',t.body.replace(/{name}/g,name))
    setView('compose')
  }

  async function send(){
    if(!form.clientName||!form.body){showToast('Client and message required');return}
    if(!form.phone){showToast('Recipient phone number required');return}
    setSaving(true)

    const toNum = '+1' + form.phone.replace(/\D/g,'').slice(-10)
    let status = 'Sent', sw_id = null, errMsg = null

    if (settings?.signalwire_backend) {
      try {
        const res = await fetch(settings.signalwire_backend + '/sms/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: toNum, body: form.body, from: settings.sw_inbound_did || undefined })
        })
        const resData = await res.json()
        if (res.ok && resData?.success) {
          sw_id = resData.sid || null
        } else {
          status = 'Failed'
          errMsg = resData?.error || 'SignalWire send failed'
        }
      } catch (e) {
        status = 'Failed'
        errMsg = e.message
      }
    } else {
      // No backend configured yet — log only, same as before
      status = 'Logged (not sent)'
    }

    const {error}=await supabase.from('sms_messages').insert([{
      ...form, phone: toNum, status,
      signalwire_sms_id: sw_id, sent_by: user?.email || 'Unknown',
      error_msg: errMsg, created_at:new Date().toISOString()
    }])
    setSaving(false)
    if(error){showToast('Error: '+error.message);return}
    if (status === 'Sent') showToast('✅ SMS sent via SignalWire!')
    else if (status === 'Failed') showToast('SignalWire error: ' + (errMsg||'send failed'))
    else showToast('Logged — add your SignalWire backend URL in Settings to actually send')
    setForm(BLANK);load()
  }

  async function del(id){
    await supabase.from('sms_messages').delete().eq('id',id)
    showToast('Deleted');load()
  }

  const charCount = form.body.length
  const smsCount  = Math.ceil(charCount/160)||0

  return (
    <div>
      {toast&&<div className="toast show">{toast}</div>}
      <div style={{display:'flex',gap:6,marginBottom:12}}>
        {['compose','sent','templates'].map(t=>(
          <span key={t} className={`chip${view===t?' on':''}`} onClick={()=>setView(t)} style={{textTransform:'capitalize'}}>
            {t==='sent'?`Sent (${sent.length})`:t==='templates'?'Templates':'💬 Compose'}
          </span>
        ))}
      </div>

      {view==='compose'&&(
        <div className="g2" style={{alignItems:'start'}}>
          <div className="card">
            <div className="ch"><span className="ct">Send SMS</span></div>
            <div className="field" style={{position:'relative'}}>
              <label>Client *</label>
              <input value={form.clientName} onChange={e=>searchClient(e.target.value)} placeholder="Search client..." autoComplete="off"/>
              {sug.length>0&&(
                <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--s3)',border:'1px solid var(--b2c)',borderRadius:7,zIndex:500}}>
                  {sug.map(c=>(
                    <div key={c.id} onClick={()=>{fld('clientName',c.name);fld('phone',c.phone||'');setSug([])}} style={{padding:'7px 12px',cursor:'pointer',fontSize:13}}>
                      <div style={{fontWeight:600}}>{c.name}</div>
                      {c.phone&&<div style={{fontSize:11,color:'var(--t3)'}}>{c.phone}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="field"><label>To (Phone #)</label><input value={form.phone} onChange={e=>fld('phone',e.target.value)} placeholder="(305) 555-0000"/></div>
            <div className="field">
              <label style={{display:'flex',justifyContent:'space-between'}}>
                <span>Message *</span>
                <span style={{fontSize:11,color:charCount>160?'var(--warn)':'var(--t3)'}}>{charCount} chars · {smsCount} SMS</span>
              </label>
              <textarea value={form.body} onChange={e=>fld('body',e.target.value)} style={{minHeight:120}} placeholder="Type your message..."/>
            </div>
            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={send} disabled={saving}>
              {saving?'Sending…':(settings?.signalwire_backend?'📱 Send SMS':'📱 Log SMS as Sent')}
            </button>
            <div style={{marginTop:10,padding:10,background:'var(--s2)',borderRadius:7,fontSize:12,color:'var(--t3)'}}>
              {settings?.signalwire_backend
                ? '✅ SignalWire is connected — messages send for real and get logged here.'
                : '💡 Add your SignalWire backend URL in Settings → SignalWire to enable actual sending. Until then, messages are only logged for records.'}
            </div>
          </div>
          <div className="card">
            <div className="ch"><span className="ct">Quick Templates</span></div>
            {TEMPLATES.map(t=>(
              <div key={t.label} style={{padding:'10px 0',borderBottom:'1px solid var(--br)'}}>
                <div style={{fontWeight:600,fontSize:13,marginBottom:4}}>{t.label}</div>
                <div style={{fontSize:11,color:'var(--t3)',marginBottom:6,lineHeight:1.5}}>{t.body.slice(0,80)}…</div>
                <button className="btn sm" onClick={()=>useTemplate(t)}>Use</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {view==='sent'&&(
        <div className="card">
          <div className="ch"><span className="ct">Sent Messages ({sent.length})</span></div>
          <div className="ovx">
            <table>
              <thead><tr><th>Client</th><th>To</th><th>Message</th><th>Date</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {sent.length===0
                  ?<tr><td colSpan={6} style={{textAlign:'center',color:'var(--t3)',padding:20}}>No messages logged yet</td></tr>
                  :sent.map(s=>(
                    <tr key={s.id}>
                      <td style={{fontWeight:600}}>{s.clientName}</td>
                      <td style={{fontSize:12,color:'var(--t2)'}}>{s.phone||'—'}</td>
                      <td style={{fontSize:12,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.body}</td>
                      <td style={{fontSize:11,color:'var(--t3)'}}>{s.created_at?.slice(0,10)}</td>
                      <td><span className="bdg bg">{s.status||'Sent'}</span></td>
                      <td><button className="btn del" onClick={()=>del(s.id)}>Del</button></td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view==='templates'&&(
        <div className="card">
          <div className="ch"><span className="ct">SMS Templates</span></div>
          {TEMPLATES.map(t=>(
            <div key={t.label} style={{borderBottom:'1px solid var(--br)',padding:'12px 0'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                <div style={{fontWeight:600,fontSize:14}}>{t.label}</div>
                <button className="btn pri" style={{fontSize:11,padding:'4px 12px'}} onClick={()=>{useTemplate(t);setView('compose')}}>Use →</button>
              </div>
              <div style={{fontSize:12,color:'var(--t2)',lineHeight:1.6}}>{t.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
