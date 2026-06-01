import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'

const TEAM = [
  { id: 'romy',    name: 'Romy Cruz',        initials: 'RC', color: '#4f8ef7' },
  { id: 'dana',    name: 'Dana Richard',     initials: 'DR', color: '#a855f7' },
  { id: 'yesenia', name: 'Yesenia Gonzalez', initials: 'YG', color: '#22c55e' },
  { id: 'general', name: '# General',        initials: '#',  color: '#f59e0b' },
  { id: 'cases',   name: '# Cases',          initials: '#',  color: '#06b6d4' },
  { id: 'billing', name: '# Billing',        initials: '#',  color: '#ec4899' },
]

export default function Chat() {
  const { user } = useApp()
  const [channel,  setChannel]  = useState(TEAM[3]) // default: General
  const [messages, setMessages] = useState([])
  const [input,    setInput]    = useState('')
  const [sending,  setSending]  = useState(false)
  const [toast,    setToast]    = useState('')
  const bottomRef = useRef(null)

  useEffect(() => { loadMessages() }, [channel])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function loadMessages() {
    setMessages([])
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('channel', channel.id)
      .order('created_at', { ascending: true })
      .limit(200)
    if (error) {
      // Table may not exist yet — show placeholder
      if (error.message.includes('does not exist') || error.code === '42P01') {
        setMessages([{ id: 'sys', sender: 'System', text: '⚠️ Run this SQL in Supabase to enable chat:\n\nCREATE TABLE IF NOT EXISTS chat_messages (\n  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,\n  channel text NOT NULL,\n  sender text NOT NULL,\n  text text NOT NULL,\n  created_at timestamptz DEFAULT now()\n);\nALTER TABLE chat_messages DISABLE ROW LEVEL SECURITY;', isSystem: true }])
      } else {
        showToast('Error: ' + error.message)
      }
      return
    }
    setMessages(data || [])
  }

  async function send() {
    const text = input.trim()
    if (!text) return
    setSending(true)
    const senderName = user?.name || user?.email || 'You'
    const { error } = await supabase.from('chat_messages').insert([{
      channel: channel.id,
      sender: senderName,
      text,
      created_at: new Date().toISOString()
    }])
    setSending(false)
    if (error) { showToast('Send error: ' + error.message); return }
    setInput('')
    loadMessages()
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),4000) }

  const senderColor = name => {
    const found = TEAM.find(t => t.name === name)
    return found ? found.color : '#94a3b8'
  }
  const senderInitial = name => name ? name[0].toUpperCase() : '?'

  const myName = user?.name || user?.email || 'You'

  return (
    <div style={{display:'flex',height:'calc(100vh - 56px)',gap:0,overflow:'hidden'}}>
      {toast && <div className="toast show">{toast}</div>}

      {/* Sidebar: channels + DMs */}
      <div style={{width:200,background:'var(--s2)',borderRight:'1px solid var(--br)',display:'flex',flexDirection:'column',flexShrink:0,overflowY:'auto'}}>
        <div style={{padding:'12px 12px 6px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em',color:'var(--t3)'}}>Channels</div>
        {TEAM.slice(3).map(ch=>(
          <div key={ch.id}
            onClick={()=>setChannel(ch)}
            style={{padding:'7px 14px',cursor:'pointer',fontSize:13,fontWeight:channel.id===ch.id?700:400,color:channel.id===ch.id?'var(--tx)':'var(--t2)',background:channel.id===ch.id?'var(--s3)':'transparent',borderRadius:4,margin:'1px 6px'}}>
            {ch.name}
          </div>
        ))}
        <div style={{padding:'12px 12px 6px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em',color:'var(--t3)',marginTop:8}}>Direct Messages</div>
        {TEAM.slice(0,3).map(person=>(
          <div key={person.id}
            onClick={()=>setChannel(person)}
            style={{padding:'7px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:8,background:channel.id===person.id?'var(--s3)':'transparent',borderRadius:4,margin:'1px 6px'}}>
            <div style={{width:22,height:22,borderRadius:'50%',background:person.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800,color:'#fff',flexShrink:0}}>
              {person.initials}
            </div>
            <span style={{fontSize:13,fontWeight:channel.id===person.id?700:400,color:channel.id===person.id?'var(--tx)':'var(--t2)'}}>{person.name}</span>
          </div>
        ))}
      </div>

      {/* Main chat area */}
      <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,background:'var(--bg)'}}>
        {/* Header */}
        <div style={{height:48,borderBottom:'1px solid var(--br)',display:'flex',alignItems:'center',padding:'0 16px',gap:10,flexShrink:0}}>
          <div style={{width:28,height:28,borderRadius:'50%',background:channel.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:'#fff'}}>
            {channel.initials}
          </div>
          <span style={{fontWeight:700,fontSize:15}}>{channel.name}</span>
          <button className="btn sec" style={{marginLeft:'auto',fontSize:11,padding:'3px 10px'}} onClick={loadMessages}>↺ Refresh</button>
        </div>

        {/* Messages */}
        <div style={{flex:1,overflowY:'auto',padding:'16px',display:'flex',flexDirection:'column',gap:12}}>
          {messages.length === 0 && (
            <div style={{textAlign:'center',color:'var(--t3)',padding:40}}>
              <div style={{fontSize:28,marginBottom:8}}>💬</div>
              <div style={{fontWeight:600}}>No messages yet</div>
              <div style={{fontSize:13,marginTop:4}}>Be the first to say something!</div>
            </div>
          )}
          {messages.map(m => {
            if (m.isSystem) return (
              <div key={m.id} style={{background:'var(--s3)',borderRadius:8,padding:12}}>
                <pre style={{fontSize:11,color:'var(--t2)',whiteSpace:'pre-wrap',margin:0,fontFamily:'monospace'}}>{m.text}</pre>
              </div>
            )
            const isMe = m.sender === myName
            return (
              <div key={m.id} style={{display:'flex',gap:10,flexDirection: isMe ? 'row-reverse' : 'row',alignItems:'flex-start'}}>
                <div style={{width:32,height:32,borderRadius:'50%',background:senderColor(m.sender),display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:800,color:'#fff',flexShrink:0}}>
                  {senderInitial(m.sender)}
                </div>
                <div style={{maxWidth:'70%'}}>
                  <div style={{fontSize:10,color:'var(--t3)',marginBottom:3, textAlign: isMe ? 'right' : 'left'}}>
                    {isMe ? 'You' : m.sender} · {m.created_at ? new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : ''}
                  </div>
                  <div style={{
                    background: isMe ? 'var(--blue)' : 'var(--s2)',
                    color: isMe ? '#fff' : 'var(--tx)',
                    padding:'9px 13px',
                    borderRadius: isMe ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                    fontSize:13,
                    lineHeight:1.5,
                    whiteSpace:'pre-wrap',
                    wordBreak:'break-word'
                  }}>
                    {m.text}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef}/>
        </div>

        {/* Input */}
        <div style={{borderTop:'1px solid var(--br)',padding:'12px 16px',display:'flex',gap:8,flexShrink:0,background:'var(--sf)'}}>
          <textarea
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={`Message ${channel.name}… (Enter to send, Shift+Enter for newline)`}
            style={{flex:1,resize:'none',minHeight:40,maxHeight:120,padding:'8px 12px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:8,color:'var(--tx)',fontSize:13,lineHeight:1.5,fontFamily:'inherit'}}
            rows={1}
          />
          <button className="btn pri" style={{padding:'8px 16px',alignSelf:'flex-end'}} onClick={send} disabled={sending||!input.trim()}>
            {sending ? '…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
