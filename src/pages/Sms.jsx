import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'

const TEMPLATES = [
  {
    label: 'Appointment Reminder',
    icon: '📅',
    body: `Hi {name}, this is the Tax Case Review team reaching out to remind you of your upcoming appointment with us. We're looking forward to speaking with you! If you need to reschedule or have any questions beforehand, please don't hesitate to call or text us back at (888) 334-5052. We're here to help. See you soon! — Tax Case Review`
  },
  {
    label: 'Document Request',
    icon: '📋',
    body: `Hi {name}, hope you're doing well! This is Tax Case Review following up on your case. In order to move forward, we need a few documents from you. Please give us a call at (888) 334-5052 or reply to this message and we'll send you a list of what we need. We appreciate your cooperation and are working hard to get the best resolution for you!`
  },
  {
    label: 'Payment Due',
    icon: '💳',
    body: `Hi {name}, this is a friendly reminder from Tax Case Review that a balance is currently due on your account. We have flexible payment options available and want to make this as easy as possible for you. Please give us a call at (888) 334-5052 at your convenience so we can assist you. Thank you for trusting us with your case!`
  },
  {
    label: 'Resolution Update',
    icon: '📊',
    body: `Hi {name}, great news — we have an update on your IRS case and we'd love to go over the details with you! Please call us at your earliest convenience at (888) 334-5052 or reply to this message to schedule a time to chat. We're committed to keeping you informed every step of the way. — Tax Case Review`
  },
  {
    label: 'Welcome Text',
    icon: '👋',
    body: `Hi {name}, welcome to Tax Case Review! We're so glad to have you as a client and we're already hard at work on your case. Your dedicated case rep will be reaching out to you shortly to introduce themselves and walk you through next steps. In the meantime, feel free to call or text us anytime at (888) 334-5052. We're in your corner!`
  },
  {
    label: 'Missing Information',
    icon: '⚠️',
    body: `Hi {name}, this is Tax Case Review checking in. We noticed we may be missing some information needed to continue working on your case. Could you please give us a call at (888) 334-5052 when you get a chance? We want to make sure we have everything we need to get you the best possible outcome. Thank you!`
  },
  {
    label: 'IRS Notice Received',
    icon: '📬',
    body: `Hi {name}, we received a notice from the IRS regarding your case and we want to make sure we address it right away. Please call us as soon as possible at (888) 334-5052 so we can review the notice together and discuss next steps. Don't worry — we're on it! — Tax Case Review`
  },
  {
    label: 'Case Resolved',
    icon: '✅',
    body: `Hi {name}, we have some wonderful news — your IRS case has been successfully resolved! It's been our pleasure working with you, and we're thrilled with the outcome. Please call us at (888) 334-5052 so we can go over the final details together. Thank you for choosing Tax Case Review!`
  },
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

  useEffect(()=>{
    load()
    // Auto-log inbound SMS to client activity when they arrive via SignalWire
    const ch = supabase.channel('sms-inbound-note-logger')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sms_messages' }, ({ new: msg }) => {
        if (msg.direction === 'inbound' && msg.clientName) {
          const preview = (msg.body || '').slice(0, 120).trim()
          supabase.from('client_notes').insert({
            client_name: msg.clientName,
            content: `💬 SMS Received — ${preview}${msg.body?.length > 120 ? '…' : ''}`,
            note_type: 'SMS',
            created_by: msg.clientName,
            created_at: msg.created_at || new Date().toISOString(),
          })
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  },[] )

  async function load(){
    const [{data:sms},{data:cls},{data:s}]=await Promise.all([
      supabase.from('sms_messages').select('*').order('created_at',{ascending:false}),
      supabase.from('clients').select('id,name,phone'),
      supabase.from('settings').select('sw_space_url,sw_inbound_did').limit(1).maybeSingle(),
    ])
    if(sms)setSent(sms)
    if(cls)setClients(cls)
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

    if (settings?.sw_space_url) {
      try {
        const { data: resData, error: invokeErr } = await supabase.functions.invoke('send-sms', {
          body: { to: toNum, body: form.body }
        })
        if (!invokeErr && resData?.success) {
          sw_id = resData.sid || null
        } else {
          status = 'Failed'
          errMsg = resData?.error || invokeErr?.message || 'SignalWire send failed'
        }
      } catch (e) {
        status = 'Failed'
        errMsg = e.message
      }
    } else {
      status = 'Logged (not sent)'
    }

    const {error}=await supabase.from('sms_messages').insert([{
      ...form, phone: toNum, status,
      signalwire_sms_id: sw_id, sent_by: user?.email || 'Unknown',
      error_msg: errMsg, created_at:new Date().toISOString()
    }])
    setSaving(false)
    if(error){showToast('Error: '+error.message);return}

    // Auto-log outbound SMS to client activity history
    if (form.clientName && status !== 'Failed') {
      const preview = (form.body || '').slice(0, 120).trim()
      await supabase.from('client_notes').insert({
        client_name: form.clientName,
        content: `💬 SMS Sent — ${preview}${form.body?.length > 120 ? '…' : ''}`,
        note_type: 'SMS',
        created_by: user?.email || 'Staff',
        created_at: new Date().toISOString(),
      })
    }

    if (status === 'Sent') showToast('✅ SMS sent via SignalWire!')
    else if (status === 'Failed') showToast('SignalWire error: ' + (errMsg||'send failed'))
    else showToast('Logged — add SignalWire credentials in Settings to send for real')
    setForm(BLANK);load()
  }

  async function del(id){
    await supabase.from('sms_messages').delete().eq('id',id)
    showToast('Deleted');load()
  }

  const charCount = form.body.length
  const smsCount  = Math.ceil(charCount/160)||0

  return (
    <div style={{padding:'20px 24px',maxWidth:1100,margin:'0 auto'}}>
      {toast&&<div className="toast show">{toast}</div>}

      {/* Tab bar */}
      <div style={{display:'flex',gap:6,marginBottom:18}}>
        {['compose','sent','templates'].map(t=>(
          <span key={t} className={`chip${view===t?' on':''}`} onClick={()=>setView(t)}
            style={{textTransform:'capitalize',fontSize:13,padding:'6px 16px',fontWeight:600,cursor:'pointer'}}>
            {t==='sent'?`Messages (${sent.length})`:t==='templates'?'Templates':'💬 Compose'}
          </span>
        ))}
      </div>

      {/* COMPOSE VIEW */}
      {view==='compose'&&(
        <div className="g2" style={{alignItems:'start',gap:16}}>
          {/* Left — Send form */}
          <div className="card" style={{padding:'20px 24px'}}>
            <h3 style={{fontSize:17,fontWeight:800,margin:'0 0 18px'}}>Send SMS</h3>

            <div className="field" style={{position:'relative'}}>
              <label style={{fontSize:12,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--t3)'}}>Client *</label>
              <input value={form.clientName} onChange={e=>searchClient(e.target.value)} placeholder="Search client..." autoComplete="off"
                style={{fontSize:14,padding:'10px 14px'}}/>
              {sug.length>0&&(
                <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--sf)',border:'1px solid var(--br)',borderRadius:8,zIndex:500,boxShadow:'0 4px 20px rgba(0,0,0,.3)'}}>
                  {sug.map(c=>(
                    <div key={c.id} onClick={()=>{ fld('clientName',c.name); fld('phone',c.phone||''); setSug([]); setForm(f => ({ ...f, clientName: c.name, phone: c.phone||'', body: f.body.replace(/{name}/g, c.name) })) }}
                      style={{padding:'10px 14px',cursor:'pointer',fontSize:14}}
                      onMouseEnter={e=>e.currentTarget.style.background='var(--s2)'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <div style={{fontWeight:700}}>{c.name}</div>
                      {c.phone&&<div style={{fontSize:11,color:'var(--t3)'}}>{c.phone}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="field">
              <label style={{fontSize:12,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--t3)'}}>To (Phone #)</label>
              <input value={form.phone} onChange={e=>fld('phone',e.target.value)} placeholder="(305) 555-0000"
                style={{fontSize:14,padding:'10px 14px'}}/>
            </div>

            <div className="field">
              <label style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:12,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--t3)'}}>Message *</span>
                <span style={{fontSize:11,color:charCount>160?'var(--warn)':'var(--t3)',fontWeight:600}}>{charCount} chars · {smsCount} SMS</span>
              </label>
              <textarea value={form.body} onChange={e=>fld('body',e.target.value)}
                style={{minHeight:150,fontSize:14,padding:'12px 14px',lineHeight:1.6}} placeholder="Type your message..."/>
            </div>

            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:'12px',fontSize:15,fontWeight:700,marginBottom:12}} onClick={send} disabled={saving}>
              {saving?'Sending…':(settings?.sw_space_url?'📱 Send SMS':'📱 Log SMS')}
            </button>

            <div style={{padding:'10px 14px',background:'var(--s2)',borderRadius:8,fontSize:12,color:'var(--t3)',lineHeight:1.6}}>
              {settings?.sw_space_url
                ? '✅ SignalWire is connected — messages send for real and get logged here.'
                : '💡 Add SignalWire credentials in Settings to enable real sending.'}
            </div>
          </div>

          {/* Right — Quick Templates */}
          <div className="card" style={{padding:'20px 24px'}}>
            <h3 style={{fontSize:17,fontWeight:800,margin:'0 0 18px'}}>Quick Templates</h3>
            {TEMPLATES.map(t=>(
              <div key={t.label} style={{padding:'12px 0',borderBottom:'1px solid var(--br)'}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>{t.icon} {t.label}</div>
                <div style={{fontSize:12,color:'var(--t3)',marginBottom:8,lineHeight:1.6}}>{t.body.slice(0,100)}…</div>
                <button className="btn sm" style={{fontSize:12,padding:'5px 14px',fontWeight:600}} onClick={()=>useTemplate(t)}>Use</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MESSAGES VIEW */}
      {view==='sent'&&(
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{padding:'16px 20px',borderBottom:'1px solid var(--br)'}}>
            <h3 style={{margin:0,fontSize:17,fontWeight:800}}>Messages ({sent.length})</h3>
          </div>
          <div className="ovx">
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:14}}>
              <thead>
                <tr style={{borderBottom:'1px solid var(--br)',background:'var(--s2)'}}>
                  {['','Client','Phone','Message','Date','Status',''].map(h=>(
                    <th key={h} style={{padding:'11px 14px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sent.length===0
                  ?<tr><td colSpan={7} style={{textAlign:'center',color:'var(--t3)',padding:'40px 20px'}}><div style={{fontSize:32,marginBottom:8}}>💬</div><div style={{fontWeight:600,fontSize:14,color:'var(--tx)',marginBottom:4}}>No messages yet</div><div style={{fontSize:12}}>Send an SMS to see it here.</div></td></tr>
                  :sent.map(s=>(
                    <tr key={s.id} style={{borderBottom:'1px solid var(--br)'}}
                      onMouseEnter={e=>e.currentTarget.style.background='var(--s2)'}
                      onMouseLeave={e=>e.currentTarget.style.background=''}>
                      <td style={{padding:'12px 14px',fontSize:18}}>{s.direction==='inbound'?<span style={{color:'var(--blue)'}}>📥</span>:<span style={{color:'var(--t3)'}}>📤</span>}</td>
                      <td style={{padding:'12px 14px',fontWeight:700,fontSize:14}}>{s.clientName}</td>
                      <td style={{padding:'12px 14px',fontSize:13,color:'var(--t2)',fontFamily:'monospace'}}>{s.phone||'—'}</td>
                      <td style={{padding:'12px 14px',fontSize:13,maxWidth:240,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--t2)'}}>{s.body}</td>
                      <td style={{padding:'12px 14px',fontSize:12,color:'var(--t3)',whiteSpace:'nowrap'}}>{s.created_at?.slice(0,10)}</td>
                      <td style={{padding:'12px 14px'}}><span className="bdg bg" style={{fontSize:12,padding:'3px 10px',fontWeight:700}}>{s.status||'Sent'}</span></td>
                      <td style={{padding:'12px 14px'}}><button className="btn del" style={{fontSize:11,padding:'4px 10px'}} onClick={()=>del(s.id)}>Del</button></td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TEMPLATES VIEW */}
      {view==='templates'&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:12}}>
          {TEMPLATES.map(t=>(
            <div key={t.label} className="card" style={{padding:'18px 20px'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                <div style={{fontWeight:800,fontSize:15}}>{t.icon} {t.label}</div>
                <button className="btn pri" style={{fontSize:12,padding:'5px 14px',fontWeight:700}} onClick={()=>{useTemplate(t);setView('compose')}}>Use →</button>
              </div>
              <div style={{fontSize:13,color:'var(--t2)',lineHeight:1.7}}>{t.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
