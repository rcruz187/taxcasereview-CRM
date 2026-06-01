import { useState } from 'react'

export default function Sms() {
  const [to, setTo]   = useState('')
  const [msg, setMsg] = useState('')

  return (
    <div>
      <div className="g2">
        <div className="card">
          <div className="ch"><span className="ct">SMS Messaging</span></div>
          <div className="field"><label>To (Phone Number)</label><input value={to} onChange={e=>setTo(e.target.value)} placeholder="(305) 555-0000"/></div>
          <div className="field"><label>Message</label><textarea value={msg} onChange={e=>setMsg(e.target.value)} style={{minHeight:100}} placeholder="Type your message..."/></div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn pri" style={{flex:1,justifyContent:'center',padding:10}}>Send SMS</button>
            <button className="btn" style={{flex:1,justifyContent:'center',padding:10}}>Save Template</button>
          </div>
          <div style={{marginTop:16,padding:10,background:'var(--s2)',borderRadius:7,fontSize:12,color:'var(--t3)'}}>
            💡 Connect Twilio or another SMS provider in Settings to enable sending.
          </div>
        </div>
        <div className="card">
          <div className="ch"><span className="ct">Quick Templates</span></div>
          {[
            ['Appointment Reminder','Hi {name}, this is a reminder of your appointment tomorrow at {time}. Please reply CONFIRM to confirm.'],
            ['Document Request','Hi {name}, we need the following documents to proceed with your case: {docs}. Please upload at your earliest convenience.'],
            ['Payment Due','Hi {name}, your invoice #{inv} for ${amount} is due on {date}. Please contact us with any questions.'],
          ].map(([title, text]) => (
            <div key={title} style={{padding:'10px 0',borderBottom:'1px solid var(--br)'}}>
              <div style={{fontWeight:600,fontSize:13,marginBottom:4}}>{title}</div>
              <div style={{fontSize:11,color:'var(--t3)',marginBottom:6}}>{text}</div>
              <button className="btn sm" onClick={()=>setMsg(text)}>Use Template</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
