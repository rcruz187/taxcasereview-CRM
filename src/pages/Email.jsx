import { useState } from 'react'

export default function Email() {
  const [to, setTo]       = useState('')
  const [subject, setSub] = useState('')
  const [body, setBody]   = useState('')

  return (
    <div>
      <div className="g2">
        <div className="card">
          <div className="ch"><span className="ct">Compose Email</span></div>
          <div className="field"><label>To</label><input value={to} onChange={e=>setTo(e.target.value)} placeholder="client@email.com"/></div>
          <div className="field"><label>Subject</label><input value={subject} onChange={e=>setSub(e.target.value)} placeholder="Re: Your Tax Case"/></div>
          <div className="field"><label>Message</label><textarea value={body} onChange={e=>setBody(e.target.value)} style={{minHeight:140}} placeholder="Dear {name},&#10;&#10;..."/></div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn pri" style={{flex:1,justifyContent:'center',padding:10}}>Send Email</button>
            <button className="btn" style={{flex:1,justifyContent:'center',padding:10}}>Save Draft</button>
          </div>
          <div style={{marginTop:16,padding:10,background:'var(--s2)',borderRadius:7,fontSize:12,color:'var(--t3)'}}>
            💡 Connect SendGrid or Gmail in Settings to enable sending.
          </div>
        </div>
        <div className="card">
          <div className="ch"><span className="ct">Email Templates</span></div>
          {[
            ['Welcome Letter','Dear {name},\n\nWelcome to Tax Case Review! We are pleased to begin working on your tax resolution case...'],
            ['Document Request','Dear {name},\n\nTo proceed with your case, we need the following documents:\n\n1. {doc1}\n2. {doc2}\n\nPlease provide these at your earliest convenience.'],
            ['OIC Update','Dear {name},\n\nWe have an update regarding your Offer in Compromise. The IRS has...'],
          ].map(([title, text]) => (
            <div key={title} style={{padding:'10px 0',borderBottom:'1px solid var(--br)'}}>
              <div style={{fontWeight:600,fontSize:13,marginBottom:4}}>{title}</div>
              <button className="btn sm" onClick={()=>setBody(text)}>Use Template</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
