import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'

const EMOJIS = ['👍','✅','🔥','❤️','👀']

function fmt(v) { try { return new Date(v).toLocaleString() } catch { return '' } }

export default function TeamChatProBridge() {
  const { role } = useApp()
  const [visible,setVisible] = useState(window.location.pathname === '/chat')
  const [open,setOpen] = useState(false)
  const [tab,setTab] = useState('activity')
  const [actor,setActor] = useState('')
  const [messages,setMessages] = useState([])
  const [reactions,setReactions] = useState([])
  const [pins,setPins] = useState([])
  const [saved,setSaved] = useState([])
  const [reads,setReads] = useState([])
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')

  useEffect(()=>{ const t=setInterval(()=>setVisible(window.location.pathname==='/chat'),400); return()=>clearInterval(t)},[])

  async function load() {
    setLoading(true); setError('')
    const { data:a, error:ae } = await supabase.rpc('chat_current_actor')
    if (ae) { setLoading(false); setError(ae.message); return }
    const who = a || ''
    setActor(who)
    const [m,r,p,s,rd] = await Promise.all([
      supabase.from('chat_messages').select('id,channel,sender,text,created_at,edited_at,deleted_at,attachment_name').order('created_at',{ascending:false}).limit(200),
      supabase.from('chat_reactions').select('message_id,user_name,emoji,created_at').order('created_at',{ascending:false}).limit(1000),
      supabase.from('chat_pins').select('message_id,channel,pinned_by,created_at').order('created_at',{ascending:false}).limit(300),
      supabase.from('chat_saved_items').select('message_id,user_name,created_at').eq('user_name',who).order('created_at',{ascending:false}).limit(300),
      supabase.from('chat_read_state').select('conv_id,last_read_at,last_read_message_id').eq('viewer_name',who),
    ])
    setLoading(false)
    const firstErr = m.error||r.error||p.error||s.error||rd.error
    if (firstErr) { setError(firstErr.message); return }
    setMessages(m.data||[]); setReactions(r.data||[]); setPins(p.data||[]); setSaved(s.data||[]); setReads(rd.data||[])
  }

  async function show(){ setOpen(true); await load() }
  async function react(id,emoji){ await supabase.rpc('chat_toggle_reaction',{p_message_id:id,p_emoji:emoji}); await load() }
  async function pin(id){ await supabase.rpc('chat_toggle_pin',{p_message_id:id}); await load() }
  async function save(id){ await supabase.rpc('chat_toggle_saved',{p_message_id:id}); await load() }
  async function markRead(channel){ await supabase.rpc('chat_mark_read',{p_conv_id:channel}); await load() }
  async function edit(m){ const next=window.prompt('Edit message',m.text||''); if(next===null||next.trim()===''||next===m.text)return; const {error}=await supabase.rpc('chat_edit_message',{p_message_id:m.id,p_new_text:next.trim()}); if(error){setError(error.message);return} await load() }
  async function del(m){ if(!window.confirm('Delete this message? The original text will remain in the audit history.'))return; const {error}=await supabase.rpc('chat_delete_message',{p_message_id:m.id}); if(error){setError(error.message);return} await load() }

  const reactionMap = useMemo(()=>{
    const out={}
    for(const r of reactions){ if(!out[r.message_id])out[r.message_id]={}; out[r.message_id][r.emoji]=(out[r.message_id][r.emoji]||0)+1 }
    return out
  },[reactions])
  const pinSet = useMemo(()=>new Set(pins.map(x=>x.message_id)),[pins])
  const savedSet = useMemo(()=>new Set(saved.map(x=>x.message_id)),[saved])
  const readMap = useMemo(()=>Object.fromEntries(reads.map(x=>[x.conv_id,x.last_read_at])),[reads])
  const unreadByChannel = useMemo(()=>{
    const out={}
    for(const m of messages){ const last=readMap[m.channel]; if(!last||new Date(m.created_at)>new Date(last))out[m.channel]=(out[m.channel]||0)+1 }
    return out
  },[messages,readMap])
  const shown = tab==='saved' ? messages.filter(m=>savedSet.has(m.id)) : tab==='pins' ? messages.filter(m=>pinSet.has(m.id)) : messages

  if(!visible)return null

  return <>
    <button className="btn" onClick={show} style={{position:'fixed',right:24,bottom:72,zIndex:1200,fontWeight:800,boxShadow:'0 8px 24px rgba(0,0,0,.2)'}}>⚡ Team Chat Pro</button>
    {open&&<div className="modal-bg open" style={{zIndex:5000}} onClick={e=>e.target===e.currentTarget&&setOpen(false)}>
      <div className="modal" style={{width:'min(1050px,94vw)',maxHeight:'88vh',display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div className="mh"><div><div className="mt">⚡ Team Chat Pro</div><div style={{fontSize:11,color:'var(--t3)',marginTop:3}}>Persistent reactions · pins · saved items · unread state · edit history</div></div><button className="xbtn" onClick={()=>setOpen(false)}>&times;</button></div>
        <div style={{padding:'0 16px 10px',display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          {['activity','saved','pins'].map(t=><button key={t} className={`btn ${tab===t?'pri':'sec'}`} onClick={()=>setTab(t)}>{t[0].toUpperCase()+t.slice(1)}</button>)}
          <button className="btn sec" onClick={load} disabled={loading}>{loading?'Refreshing…':'↻ Refresh'}</button>
          <span style={{marginLeft:'auto',fontSize:11,color:'var(--t3)'}}>Signed in as {actor||'—'}</span>
        </div>
        <div style={{padding:'0 16px 8px',display:'flex',gap:6,flexWrap:'wrap'}}>
          {Object.entries(unreadByChannel).filter(([,n])=>n>0).map(([c,n])=><button key={c} className="btn sec" onClick={()=>markRead(c)} title="Mark channel read">#{c} · {n} unread ✓</button>)}
        </div>
        {error&&<div style={{margin:'0 16px 8px',padding:10,color:'var(--bad)',border:'1px solid var(--br)',borderRadius:8}}>{error}</div>}
        <div style={{overflow:'auto',padding:'0 16px 16px'}}>
          {shown.length===0?<div style={{padding:30,textAlign:'center',color:'var(--t3)'}}>Nothing here yet.</div>:shown.map(m=><div key={m.id} style={{padding:'10px 0',borderBottom:'1px solid var(--br)'}}>
            <div style={{display:'flex',gap:8,alignItems:'baseline',flexWrap:'wrap'}}><strong>{m.sender}</strong><span style={{fontSize:11,color:'var(--t3)'}}>#{m.channel} · {fmt(m.created_at)}{m.edited_at?' · edited':''}</span>{pinSet.has(m.id)&&<span>📌</span>}{savedSet.has(m.id)&&<span>🔖</span>}</div>
            <div style={{margin:'5px 0 7px',whiteSpace:'pre-wrap',opacity:m.deleted_at ? .8 : 1}}>{m.text||m.attachment_name||'Attachment'}</div>
            <div style={{display:'flex',gap:5,flexWrap:'wrap',alignItems:'center'}}>
              {EMOJIS.map(e=><button key={e} className="btn sec" style={{padding:'3px 7px',fontSize:11}} onClick={()=>react(m.id,e)}>{e}{reactionMap[m.id]?.[e]?` ${reactionMap[m.id][e]}`:''}</button>)}
              <button className="btn sec" style={{padding:'3px 7px',fontSize:11}} onClick={()=>pin(m.id)}>{pinSet.has(m.id)?'Unpin':'📌 Pin'}</button>
              <button className="btn sec" style={{padding:'3px 7px',fontSize:11}} onClick={()=>save(m.id)}>{savedSet.has(m.id)?'Unsave':'🔖 Save'}</button>
              {!m.deleted_at&&(m.sender===actor||['Admin','Super Admin'].includes(role))&&<><button className="btn sec" style={{padding:'3px 7px',fontSize:11}} onClick={()=>edit(m)}>✏️ Edit</button><button className="btn sec" style={{padding:'3px 7px',fontSize:11}} onClick={()=>del(m)}>🗑 Delete</button></>}
            </div>
          </div>)}
        </div>
      </div>
    </div>}
  </>
}
