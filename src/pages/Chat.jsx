import { validateFile, maybeCompressImage } from '../lib/uploadUtils'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useWebRTCRoom } from '../lib/webrtcRoom'
import { useVideoBackground } from '../lib/videoBackground'
import VirtualBackground from '../components/VirtualBackground'
import VideoTile from '../components/VideoTile'

const CHANNELS = [
  { id: 'general',  label: 'general',  desc: 'All staff announcements' },
  { id: 'cases',    label: 'cases',    desc: 'Case updates and notes' },
  { id: 'billing',  label: 'billing',  desc: 'Invoices, payments, collections' },
  { id: 'irs',      label: 'irs',      desc: 'IRS notices and resolutions' },
  { id: 'hr',       label: 'hr',       desc: 'HR and internal ops' },
]

// TEAM is now loaded dynamically from employees table — see useEffect in Chat()

const QUICK_EMOJIS = ['👍','✅','🔥','💯','😊','🎉','👀','⚠️','📌','❤️','😂','🙏','💪','🤝','⏰','📋']
const ALL_EMOJIS   = ['👍','👎','❤️','🔥','✅','❌','⚠️','📌','📋','💯','🎉','😊','😂','🙏','💪','🤝','⏰','🕐','📞','📧','💬','🗒️','📁','💰','🏦','⚖️','📊','📈','📉','🔑','🔒','✉️','📨','📩','🚀','⭐','💡','🔔','🔕','👀','🤔','😅','🥳']

function colorFor(name) {
  if (!name) return 'var(--t3)'
  const palette = ['#4f8ef7','#a855f7','#22c55e','#f59e0b','#ec4899','#06b6d4','#ef4444','#8b5cf6','#f97316','#14b8a6']
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return palette[Math.abs(h) % palette.length]
}
function initialsFor(name) {
  if (!name) return '?'
  const p = name.trim().split(' ')
  return p.length >= 2 ? p[0][0] + p[p.length-1][0] : name[0].toUpperCase()
}
function fmtTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
function fmtDate(ts) {
  if (!ts) return ''
  const d = new Date(ts), today = new Date()
  const yesterday = new Date(today); yesterday.setDate(today.getDate()-1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { weekday:'long', month:'short', day:'numeric' })
}

function Avatar({ name, size = 36, color }) {
  const bg = color || colorFor(name)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.33, fontWeight: 800, color: '#fff', flexShrink: 0
    }}>{initialsFor(name)}</div>
  )
}

export default function Chat() {
  const { user } = useApp()
  const [active, setActive]       = useState(CHANNELS[0])
  const [messages, setMessages]   = useState([])
  const [input, setInput]         = useState('')
  const [sending, setSending]     = useState(false)
  const [loading, setLoading]     = useState(false)
  const [huddleId, setHuddleId]         = useState(null)  // unique room ID
  const [showHuddleInvite, setShowHuddleInvite] = useState(false)
  const [incomingHuddle, setIncomingHuddle] = useState(null) // { from, huddleId }
  const webrtc = useWebRTCRoom('huddle')
  const peerConnsRef = webrtc.peerConnsRef
  const huddle = webrtc.joined
  const huddleMembers = webrtc.members
  const micOn = webrtc.micOn
  const cameraOn = webrtc.cameraOn
  const vbg = useVideoBackground()
  const rawHuddleRef = useRef(null)
  const [huddleProcessedStream, setHuddleProcessedStream] = useState(null)
  const [showBgPanel, setShowBgPanel] = useState(false)
  const [chatToast, setChatToast] = useState('')
  function showToast(msg) { setChatToast(msg); setTimeout(() => setChatToast(''), 4000) }
  const [showEmoji, setShowEmoji]   = useState(false)
  const [showAllEmoji, setShowAllEmoji] = useState(false)
  const [hoverMsg, setHoverMsg]   = useState(null)
  const [reacting, setReacting]   = useState(null) // msg id
  const [reactions, setReactions] = useState({})   // { msgId: { emoji: count } }
  const [showMembers, setShowMembers] = useState(false)
  const [showChannelsMobile, setShowChannelsMobile] = useState(false)
  const [newChanName, setNewChanName] = useState('')
  const [showNewChan, setShowNewChan] = useState(false)
  const [extraChans, setExtraChans]   = useState([])
  const [thread, setThread]     = useState(null)  // message being replied to
  const [searchQ, setSearchQ]   = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [TEAM, setTEAM] = useState([])
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)
  const fileRef   = useRef(null)
  const pollerRef = useRef(null)

  const myName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'You'
  const allChannels = [...CHANNELS, ...extraChans]
  const channelId = active.id
  const isChannel = !active.id.startsWith('dm_')

  // ── escape page-content padding ──
  useEffect(() => {
    const el = document.querySelector('.page-content')
    if (!el) return
    const op = el.style.padding, oo = el.style.overflow, oh = el.style.height, opos = el.style.position
    el.style.padding = '0'; el.style.overflow = 'hidden'; el.style.height = '100%'; el.style.position = 'relative'
    return () => { el.style.padding = op; el.style.overflow = oo; el.style.height = oh; el.style.position = opos }
  }, [])

  // ── fetch all employees for DM list ──
  useEffect(() => {
    supabase.from('employees').select('id, name, role').order('name').then(({ data }) => {
      if (!data) return
      setTEAM(data.map(e => ({
        id: 'dm_' + e.id,
        name: e.name,
        role: e.role || '',
        color: colorFor(e.name),
      })))
    })
  }, [])

  const loadMessages = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const { data, error } = await supabase
      .from('chat_messages').select('*').eq('channel', channelId)
      .order('created_at', { ascending: true }).limit(300)
    if (!silent) setLoading(false)
    if (error) {
      if (!silent) setMessages([{ id: 'sys', isSystem: true, text:
        error.code === '42P01'
          ? 'Run this SQL first:\n\nCREATE TABLE IF NOT EXISTS chat_messages (\n  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,\n  channel text NOT NULL,\n  sender text NOT NULL,\n  text text,\n  attachment_url text,\n  attachment_name text,\n  created_at timestamptz DEFAULT now()\n);\nALTER TABLE chat_messages DISABLE ROW LEVEL SECURITY;'
          : 'Error: ' + error.message
      }])
      return
    }
    setMessages(data || [])
  }, [channelId])

  useEffect(() => {
    loadMessages(); inputRef.current?.focus()
    clearInterval(pollerRef.current)
    pollerRef.current = setInterval(() => loadMessages(true), 4000)
    return () => clearInterval(pollerRef.current)
  }, [loadMessages])

  useEffect(() => {
    if (!showSearch) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    const payload = { channel: channelId, sender: myName, text, created_at: new Date().toISOString() }
    if (thread) payload.reply_to = thread.id
    await supabase.from('chat_messages').insert([payload])
    setSending(false); setInput(''); setThread(null)
    loadMessages(true)
  }

  async function sendFile(e) {
    const file = e.target.files[0]; if (!file) return
    const _v = validateFile(file)
    if (!_v.ok) { alert('❌ ' + _v.error); return }
    if (_v.warn) showToast('⚠️ ' + _v.warn)
    const path = `chat/${Date.now()}_${file.name}`
    const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
    if (upErr) { alert('Upload failed: ' + upErr.message); return }
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
    await supabase.from('chat_messages').insert([{
      channel: channelId, sender: myName, text: null,
      attachment_url: urlData.publicUrl, attachment_name: file.name,
      created_at: new Date().toISOString()
    }])
    loadMessages(true); e.target.value = ''
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  function switchTo(item) {
    setActive(item); setShowEmoji(false); setThread(null)
    setReacting(null); setShowSearch(false); setSearchQ('')
    setShowChannelsMobile(false)
  }

  function addReaction(msgId, emoji) {
    setReactions(r => {
      const cur = r[msgId] || {}
      return { ...r, [msgId]: { ...cur, [emoji]: (cur[emoji] || 0) + 1 } }
    })
    setReacting(null)
  }

  // ── Huddle (video/audio call) — actual WebRTC logic lives in the
  // shared useWebRTCRoom hook now, used here and by the public client
  // Meeting Room. These are just the Chat-specific bits: generating a
  // room id, posting the "someone started a huddle" nudge into chat.
  async function startHuddle() {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2,7)}`
    setShowHuddleInvite(false)
    const result = await webrtc.join(id, myName, true)
    if (!result.ok) { showToast(result.reason || 'Could not start huddle'); return }
    rawHuddleRef.current = webrtc.localStreamRef.current
    setHuddleId(id)
    await supabase.from('chat_messages').insert([{
      channel: 'general', sender: '🔔 System',
      text: `📞 ${myName} started a Huddle! Click "Join Huddle" to join the call.`,
      huddle_id: id, created_at: new Date().toISOString()
    }])
  }

  async function joinHuddle(id) {
    setIncomingHuddle(null)
    const result = await webrtc.join(id, myName, true)
    if (!result.ok) { showToast(result.reason || 'Could not join huddle'); return }
    rawHuddleRef.current = webrtc.localStreamRef.current
    setHuddleId(id)
  }

  async function inviteToHuddle(name) {
    if (!huddleMembers.includes(name)) {
      await supabase.from('chat_messages').insert([{
        channel: 'general', sender: '🔔 System',
        text: `📞 ${myName} invited ${name} to join the Huddle!`,
        huddle_id: huddleId, created_at: new Date().toISOString()
      }])
    }
  }

  async function leaveHuddle() {
    vbg.stopLoop()
    setHuddleProcessedStream(null)
    setShowBgPanel(false)
    await webrtc.leave()
    setHuddleId(null)
    setShowHuddleInvite(false)
  }

  async function handleHuddleBgSelect(mode, presetId, customUrl) {
    const raw = rawHuddleRef.current
    if (!raw) return
    if (mode === 'none') {
      vbg.stopLoop()
      webrtc.localStreamRef.current = raw
      setHuddleProcessedStream(null)
      return
    }
    const out = await vbg.changeBackground(raw, mode, presetId, customUrl)
    if (!out) return
    webrtc.localStreamRef.current = out
    setHuddleProcessedStream(new MediaStream(out.getTracks()))
    try {
      const newTrack = out.getVideoTracks()[0]
      if (newTrack) {
        const pcs = Object.values(webrtc.peerConnsRef?.current || {})
        for (const pc of pcs) {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video')
          if (sender) sender.replaceTrack(newTrack).catch(() => {})
        }
      }
    } catch (_) {}
  }

  // Listen for incoming huddle invites via chat messages
  useEffect(() => {
    const ch = supabase.channel('huddle-notify')
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, ({ new: msg }) => {
      if (msg.huddle_id && msg.sender === '🔔 System' && !huddle) {
        setIncomingHuddle({ from: msg.text, huddleId: msg.huddle_id })
      }
    }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [huddle])

  // Huddles are scoped to this page (unlike phone calls, which persist
  // via CallContext at the Shell level) -- navigating away from Chat
  // ends the huddle, same as the original implementation always did.
  useEffect(() => {
    return () => { webrtc.leave() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function addChannel() {
    const name = newChanName.trim().toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'')
    if (!name) return
    setExtraChans(c => [...c, { id: 'ch_'+name, label: name, desc: '' }])
    setNewChanName(''); setShowNewChan(false)
  }

  // Group messages
  const displayMsgs = showSearch && searchQ
    ? messages.filter(m => m.text?.toLowerCase().includes(searchQ.toLowerCase()) || m.sender?.toLowerCase().includes(searchQ.toLowerCase()))
    : messages

  const grouped = []
  let lastDate = null
  for (const m of displayMsgs) {
    const label = fmtDate(m.created_at)
    if (label !== lastDate) { grouped.push({ type: 'divider', label }); lastDate = label }
    grouped.push({ type: 'msg', ...m })
  }

  const s = {
    sidebar: { width: 240, flexShrink: 0, background: 'var(--nav)', borderRight: '1px solid var(--br)', display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden' },
    sectionHeader: { padding: '8px 16px 4px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--t3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    chanRow: (active) => ({ padding: '4px 12px 4px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 6, margin: '1px 6px', background: active ? 'rgba(79,142,247,.18)' : 'transparent', color: active ? 'var(--tx)' : 'var(--t2)', fontWeight: active ? 600 : 400, fontSize: 14, transition: 'background .1s' }),
  }

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', background: 'var(--bg)', overflow: 'hidden', flexDirection: 'column' }}>

      {chatToast && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', background: 'var(--s2)', border: '1px solid #f87171', color: '#fca5a5', padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 1100, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>{chatToast}</div>
      )}

      {/* ── Incoming Huddle Alert ── */}
      {incomingHuddle && !huddle && (
        <div style={{ background: 'linear-gradient(90deg,#14532d,#15803d)', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 14, fontSize: 13, color: '#dcfce7', flexShrink: 0, zIndex: 100 }}>
          <span style={{ fontSize: 20 }}>📞</span>
          <span style={{ fontWeight: 700, flex: 1 }}>Incoming Huddle — someone started a call. Join to talk!</span>
          <button onClick={() => joinHuddle(incomingHuddle.huddleId)}
            style={{ padding: '6px 18px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
            Join Call
          </button>
          <button onClick={() => setIncomingHuddle(null)}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,.15)', color: '#dcfce7', cursor: 'pointer', fontSize: 13 }}>
            Dismiss
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

      {/* ── LEFT SIDEBAR ── */}
      {showChannelsMobile && <div className="chat-sidebar-backdrop" onClick={() => setShowChannelsMobile(false)} />}
      <div style={s.sidebar} className={`chat-channel-sidebar${showChannelsMobile ? ' mobile-open' : ''}`}>
        <button onClick={() => setShowChannelsMobile(false)} className="chat-sidebar-close-btn" aria-label="Close">×</button>

        {/* Workspace header */}
        <div style={{ padding: '14px 14px 12px', borderBottom: '1px solid var(--br)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff', flexShrink: 0 }}>TC</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Tax Case Review</div>
            <div style={{ fontSize: 11, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}/>
              {myName}
            </div>
          </div>
        </div>

        {/* Huddle button */}
        <div style={{ padding: '10px 10px 6px', flexShrink: 0 }}>
          {!huddle ? (
            <button onClick={startHuddle} style={{ width: '100%', padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--s2)', color: 'var(--tx)', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13, transition: 'background .15s' }}
              onMouseEnter={e => e.currentTarget.style.background='var(--s3)'}
              onMouseLeave={e => e.currentTarget.style.background='var(--s2)'}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.18 1h3a2 2 0 012 1.72 12.05 12.05 0 00.7 2.81 2 2 0 01-.45 2.11L4.91 8.15a16 16 0 006.29 6.29l1.51-1.52a2 2 0 012.11-.45 12.05 12.05 0 002.81.7A2 2 0 0122 16.92z"/>
              </svg>
              Start Huddle
            </button>
          ) : (
            <div style={{ background: '#052e16', border: '1px solid #16a34a', borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#4ade80' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', display: 'inline-block', animation: 'pulse 2s infinite' }}/>
                  Huddle Active
                </div>
                <div style={{ display:'flex', gap:4 }}>
                  <button onClick={webrtc.toggleMic} style={{ background: 'none', border: 'none', color: micOn ? '#4ade80' : '#f87171', fontSize: 11, cursor: 'pointer', fontWeight: 700, padding: '1px 5px' }} title={micOn ? 'Mute mic' : 'Unmute mic'}>
                    {micOn ? '🎤' : '🔇'}
                  </button>
                  <button onClick={webrtc.toggleCamera} style={{ background: 'none', border: 'none', color: cameraOn ? '#4ade80' : '#f87171', fontSize: 11, cursor: 'pointer', fontWeight: 700, padding: '1px 5px' }} title={cameraOn ? 'Turn camera off' : 'Turn camera on'}>
                    {cameraOn ? '📹' : '📷'}
                  </button>
                  <button onClick={leaveHuddle} style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 11, cursor: 'pointer', fontWeight: 700, padding: '1px 5px' }}>Leave</button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
                {huddleMembers.map(name => (
                  <div key={name} title={name} style={{ position: 'relative' }}>
                    <Avatar name={name} size={24}/>
                    <span style={{ position: 'absolute', bottom: -1, right: -1, width: 7, height: 7, borderRadius: '50%', background: '#4ade80', border: '1px solid #052e16' }}/>
                  </div>
                ))}
                <button onClick={() => setShowHuddleInvite(h => !h)} style={{ width: 24, height: 24, borderRadius: '50%', border: '1px dashed #16a34a', background: 'none', color: '#4ade80', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
              </div>
              {showHuddleInvite && (
                <div style={{ background: 'var(--sf)', border: '1px solid var(--br)', borderRadius: 6, overflow: 'hidden' }}>
                  {TEAM.filter(t => !huddleMembers.includes(t.name)).map(t => (
                    <div key={t.id} onClick={() => inviteToHuddle(t.name)} style={{ padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--t2)' }}
                      onMouseEnter={e => e.currentTarget.style.background='var(--s2)'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      <Avatar name={t.name} size={20} color={t.color}/>
                      {t.name}
                    </div>
                  ))}
                  {TEAM.every(t => huddleMembers.includes(t.name)) && (
                    <div style={{ padding: '6px 10px', fontSize: 12, color: 'var(--t3)' }}>Everyone's in!</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Channels */}
        <div style={{ marginTop: 8, flexShrink: 0 }}>
          <div style={s.sectionHeader}>
            <span>Channels</span>
            <span onClick={() => setShowNewChan(v => !v)} style={{ fontSize: 17, cursor: 'pointer', color: 'var(--t3)', lineHeight: 1, padding: '0 2px' }} title="Add channel">+</span>
          </div>
          {showNewChan && (
            <div style={{ display: 'flex', gap: 4, padding: '4px 10px 4px' }}>
              <input value={newChanName} onChange={e => setNewChanName(e.target.value)}
                onKeyDown={e => e.key==='Enter' && addChannel()}
                placeholder="channel-name" style={{ flex: 1, background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 5, color: 'var(--tx)', fontSize: 12, padding: '4px 8px', outline: 'none' }}/>
              <button onClick={addChannel} style={{ background: '#1d4ed8', border: 'none', color: '#fff', borderRadius: 5, padding: '4px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>Add</button>
            </div>
          )}
          {allChannels.map(ch => {
            const isAct = active.id === ch.id
            return (
              <div key={ch.id} onClick={() => switchTo(ch)} style={s.chanRow(isAct)}
                onMouseEnter={e => { if (!isAct) e.currentTarget.style.background = 'var(--s2)' }}
                onMouseLeave={e => { if (!isAct) e.currentTarget.style.background = 'transparent' }}>
                <span style={{ fontSize: 16, color: isAct ? '#93c5fd' : 'var(--t3)', lineHeight: 1 }}>#</span>
                <span style={{ flex: 1 }}>{ch.label}</span>
              </div>
            )
          })}
        </div>

        <div style={{ height: 1, background: 'var(--s2)', margin: '10px 0', flexShrink: 0 }}/>

        {/* Direct Messages */}
        <div style={{ flexShrink: 0 }}>
          <div style={s.sectionHeader}>
            <span>Direct Messages</span>
          </div>
          {TEAM.map(dm => {
            const isAct = active.id === dm.id
            return (
              <div key={dm.id} onClick={() => switchTo(dm)} style={{ ...s.chanRow(isAct), gap: 10 }}
                onMouseEnter={e => { if (!isAct) e.currentTarget.style.background = 'var(--s2)' }}
                onMouseLeave={e => { if (!isAct) e.currentTarget.style.background = 'transparent' }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <Avatar name={dm.name} size={26} color={dm.color}/>
                  <span style={{ position: 'absolute', bottom: -1, right: -1, width: 8, height: 8, borderRadius: '50%', background: '#22c55e', border: '2px solid #0d1526' }}/>
                </div>
                <span style={{ fontSize: 14 }}>{dm.name}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── MAIN AREA ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--sf)' }}>

        {/* Huddle banner */}
        {huddle && (
          <div>
          <div style={{ background: 'linear-gradient(90deg,#14532d,#15803d)', padding: '7px 20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, fontSize: 13, color: '#dcfce7', flexShrink: 0, borderBottom: '1px solid #16a34a' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }}/>
            <span style={{ fontWeight: 700 }}>Huddle</span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {huddleMembers.map(n => <Avatar key={n} name={n} size={22}/>)}
            </div>
            <span style={{ color: '#86efac', fontSize: 12 }}>{huddleMembers.join(', ')}</span>
            <button onClick={() => setShowHuddleInvite(h=>!h)} style={{ marginLeft: 4, padding: '2px 10px', borderRadius: 5, border: '1px solid #16a34a', background: 'rgba(255,255,255,.1)', color: '#dcfce7', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>+ Invite</button>
            {showHuddleInvite && (
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', top: 24, left: 0, background: 'var(--sf)', border: '1px solid var(--br)', borderRadius: 8, padding: 4, zIndex: 50, minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,.5)' }}>
                  {TEAM.filter(t => !huddleMembers.includes(t.name)).map(t => (
                    <div key={t.id} onClick={() => inviteToHuddle(t.name)} style={{ padding: '7px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--tx)', borderRadius: 5 }}
                      onMouseEnter={e => e.currentTarget.style.background='var(--s2)'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      <Avatar name={t.name} size={24} color={t.color}/>{t.name}
                    </div>
                  ))}
                  {TEAM.every(t => huddleMembers.includes(t.name)) && <div style={{ padding: '7px 12px', fontSize: 12, color: 'var(--t3)' }}>Everyone's in!</div>}
                </div>
              </div>
            )}
            <button onClick={webrtc.toggleMic} style={{ padding: '3px 12px', borderRadius: 5, background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)', color: '#dcfce7', cursor: 'pointer', fontWeight: 600, fontSize: 12 }} title={micOn ? 'Mute' : 'Unmute'}>
              {micOn ? '🎤 Mic On' : '🔇 Muted'}
            </button>
            <button onClick={webrtc.toggleCamera} style={{ padding: '3px 12px', borderRadius: 5, background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)', color: '#dcfce7', cursor: 'pointer', fontWeight: 600, fontSize: 12 }} title={cameraOn ? 'Turn camera off' : 'Turn camera on'}>
              {cameraOn ? '📹 Camera On' : '📷 Off'}
            </button>
            <button onClick={() => setShowBgPanel(p => !p)} style={{ padding: '3px 12px', borderRadius: 5, background: showBgPanel ? 'rgba(59,130,246,.3)' : 'rgba(255,255,255,.15)', border: showBgPanel ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,.3)', color: showBgPanel ? '#93c5fd' : '#dcfce7', cursor: 'pointer', fontWeight: 600, fontSize: 12 }} title="Virtual Background">
              🖼️ BG
            </button>
            <button onClick={leaveHuddle} style={{ marginLeft: 4, padding: '3px 12px', borderRadius: 5, background: 'rgba(239,68,68,.2)', border: '1px solid #ef4444', color: '#fca5a5', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>Leave Huddle</button>
          </div>
          {webrtc.error && (
            <div style={{ background: '#451a03', color: '#fdba74', fontSize: 12, padding: '6px 20px', borderBottom: '1px solid #92400e' }}>{webrtc.error}</div>
          )}
          {/* Virtual background panel */}
          {showBgPanel && (
            <VirtualBackground
              bgMode={vbg.bgMode} bgPreset={vbg.bgPreset} segStatus={vbg.segStatus}
              onSelect={handleHuddleBgSelect}
            />
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: 14, background: 'var(--bg)', borderBottom: '1px solid var(--br)', maxHeight: 340, overflowY: 'auto', flexShrink: 0 }}>
            <div className="chat-huddle-tile" style={{ width: 340, flexShrink: 0 }}>
              <VideoTile stream={huddleProcessedStream || webrtc.localStreamRef.current} name={myName} label={`${myName} (you)`} muted mirror videoEnabled={cameraOn} />
            </div>
            {huddleMembers.filter(n => n !== myName).map(n => (
              <div key={n} className="chat-huddle-tile" style={{ width: 340, flexShrink: 0 }}>
                <VideoTile stream={webrtc.remoteStreams[n]} name={n} />
              </div>
            ))}
          </div>
          </div>
        )}

        {/* Channel header */}
        <div style={{ height: 52, borderBottom: '1px solid var(--br)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0, background: 'var(--sf)' }}>
          <button onClick={() => setShowChannelsMobile(true)} title="Channels" className="chat-channel-toggle-btn"
            style={{ width: 32, height: 32, background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 6, color: 'var(--t2)', cursor: 'pointer', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--tx)', display: 'flex', alignItems: 'center', gap: 6 }}>
              {isChannel ? <><span style={{ color: 'var(--t3)', fontWeight: 400, fontSize: 18 }}>#</span>{active.label}</> : active.name}
            </div>
            {isChannel && active.desc && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 1 }}>{active.desc}</div>}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            {/* Search */}
            {showSearch ? (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input value={searchQ} onChange={e => setSearchQ(e.target.value)} autoFocus
                  placeholder="Search messages…"
                  style={{ background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 6, color: 'var(--tx)', fontSize: 12, padding: '5px 10px', outline: 'none', width: 180 }}/>
                <button onClick={() => { setShowSearch(false); setSearchQ('') }} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 16 }}>×</button>
              </div>
            ) : (
              <button onClick={() => setShowSearch(true)} title="Search" style={{ width: 32, height: 32, background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 6, color: 'var(--t2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              </button>
            )}
            <button onClick={() => setShowMembers(m => !m)} title="Members" style={{ width: 32, height: 32, background: showMembers ? '#1d4ed8' : 'var(--s2)', border: '1px solid var(--br)', borderRadius: 6, color: 'var(--t2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            </button>
            <button onClick={() => loadMessages()} title="Refresh" style={{ width: 32, height: 32, background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 6, color: 'var(--t2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>⟳</button>
          </div>
        </div>

        {/* Body = messages + optional members panel */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 4px', display: 'flex', flexDirection: 'column' }}>
            {loading && <div style={{ textAlign: 'center', color: 'var(--t3)', padding: 40, fontSize: 14 }}>Loading…</div>}
            {!loading && messages.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--t3)', padding: '60px 20px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--s2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, marginBottom: 16 }}>
                  {isChannel ? '#' : '💬'}
                </div>
                <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 6, color: 'var(--tx)' }}>{isChannel ? `Welcome to #${active.label}` : `DM with ${active.name}`}</div>
                <div style={{ fontSize: 14 }}>{isChannel ? active.desc + ' — be the first to say something!' : 'Send a direct message.'}</div>
              </div>
            )}

            {!loading && grouped.map((item, i) => {
              if (item.type === 'divider') return (
                <div key={'div'+i} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 10px', color: 'var(--t3)', fontSize: 12 }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--s2)' }}/>
                  <span style={{ fontWeight: 600, background: 'var(--sf)', padding: '2px 10px', borderRadius: 20, border: '1px solid var(--br)' }}>{item.label}</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--s2)' }}/>
                </div>
              )
              if (item.isSystem) return (
                <div key={item.id} style={{ background: 'var(--s2)', borderRadius: 8, padding: '12px 16px', margin: '4px 0', border: '1px solid var(--br)' }}>
                  <pre style={{ fontSize: 12, color: 'var(--t2)', whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'monospace' }}>{item.text}</pre>
                </div>
              )

              const prev = grouped[i-1]
              const cont = prev && prev.type === 'msg' && prev.sender === item.sender && !prev.isSystem
                && (new Date(item.created_at) - new Date(prev.created_at)) < 5*60*1000
              const msgReactions = reactions[item.id] || {}
              const isHovered = hoverMsg === item.id

              return (
                <div key={item.id}
                  onMouseEnter={() => setHoverMsg(item.id)}
                  onMouseLeave={() => { setHoverMsg(null); if (reacting === item.id) setReacting(null) }}
                  style={{ display: 'flex', gap: 12, padding: cont ? '1px 0 1px 48px' : '7px 0 1px', alignItems: 'flex-start', position: 'relative', borderRadius: 6, background: isHovered ? 'rgba(255,255,255,.02)' : 'transparent' }}>

                  {/* Hover toolbar */}
                  {isHovered && (
                    <div style={{ position: 'absolute', right: 0, top: -4, display: 'flex', gap: 2, background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 8, padding: '3px 4px', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,.4)' }}>
                      {QUICK_EMOJIS.slice(0,5).map(e => (
                        <span key={e} onClick={() => addReaction(item.id, e)} style={{ fontSize: 16, cursor: 'pointer', padding: '2px 4px', borderRadius: 4, transition: 'background .1s' }}
                          onMouseEnter={ev => ev.target.style.background='var(--b2c)'}
                          onMouseLeave={ev => ev.target.style.background='transparent'}>{e}</span>
                      ))}
                      <span onClick={() => setReacting(id => id === item.id ? null : item.id)} style={{ fontSize: 14, cursor: 'pointer', padding: '2px 6px', borderRadius: 4, color: 'var(--t2)', display: 'flex', alignItems: 'center' }}
                        onMouseEnter={ev => ev.target.style.background='var(--b2c)'}
                        onMouseLeave={ev => ev.target.style.background='transparent'}>＋</span>
                      <div style={{ width: 1, background: 'var(--b2c)', margin: '2px 2px' }}/>
                      <span onClick={() => setThread(item)} title="Reply in thread" style={{ fontSize: 13, cursor: 'pointer', padding: '2px 6px', borderRadius: 4, color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: 3 }}
                        onMouseEnter={ev => ev.target.style.background='var(--b2c)'}
                        onMouseLeave={ev => ev.target.style.background='transparent'}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 00-4-4H4"/></svg>
                        Reply
                      </span>
                    </div>
                  )}

                  {/* Avatar */}
                  {!cont && <Avatar name={item.sender} size={36}/>}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {!cont && (
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx)' }}>{item.sender}</span>
                        <span style={{ fontSize: 11, color: 'var(--t3)' }}>{fmtTime(item.created_at)}</span>
                      </div>
                    )}
                    {item.reply_to && (
                      <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 3, paddingLeft: 8, borderLeft: '2px solid #334155' }}>↩ Reply</div>
                    )}
                    {item.text && (
                      <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--tx)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{item.text}</div>
                    )}
                    {item.attachment_url && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 8, padding: '8px 14px', marginTop: 4, maxWidth: 340 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4f8ef7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        <a href={item.attachment_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#4f8ef7', fontWeight: 600, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.attachment_name || 'Attachment'}</a>
                      </div>
                    )}
                    {/* Reactions */}
                    {Object.entries(msgReactions).length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                        {Object.entries(msgReactions).map(([emoji, count]) => (
                          <span key={emoji} onClick={() => addReaction(item.id, emoji)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(79,142,247,.12)', border: '1px solid rgba(79,142,247,.3)', borderRadius: 12, padding: '1px 8px', fontSize: 13, cursor: 'pointer', color: '#93c5fd' }}>
                            {emoji} <span style={{ fontSize: 11, fontWeight: 700 }}>{count}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Full emoji picker */}
                    {reacting === item.id && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 10, padding: '8px 10px', marginTop: 6, maxWidth: 320 }}>
                        {ALL_EMOJIS.map(e => (
                          <span key={e} onClick={() => addReaction(item.id, e)} style={{ fontSize: 18, cursor: 'pointer', padding: '2px 3px', borderRadius: 4 }}
                            onMouseEnter={ev => ev.target.style.background='var(--b2c)'}
                            onMouseLeave={ev => ev.target.style.background='transparent'}>{e}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef}/>
          </div>

          {/* Members panel */}
          {showMembers && (
            <div className="chat-members-panel" style={{ width: 220, flexShrink: 0, borderLeft: '1px solid var(--br)', background: 'var(--nav)', padding: '16px 0', overflowY: 'auto' }}>
              <div style={{ padding: '0 16px 10px', fontSize: 12, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Members — {TEAM.length}</div>
              {TEAM.map(m => (
                <div key={m.id} onClick={() => { switchTo(m); setShowMembers(false) }} style={{ padding: '7px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background='var(--s2)'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <Avatar name={m.name} size={30} color={m.color}/>
                    <span style={{ position: 'absolute', bottom: 0, right: 0, width: 8, height: 8, borderRadius: '50%', background: '#22c55e', border: '2px solid #0d1526' }}/>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)' }}>{m.role}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Thread reply notice */}
        {thread && (
          <div style={{ padding: '6px 20px', background: 'var(--sf)', borderTop: '1px solid var(--br)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--t2)', flexShrink: 0 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 00-4-4H4"/></svg>
            Replying to <strong style={{ color: 'var(--tx)' }}>{thread.sender}</strong>: <span style={{ color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>{thread.text?.slice(0, 60)}{thread.text?.length > 60 ? '…' : ''}</span>
            <button onClick={() => setThread(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--t3)', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        )}

        {/* Input bar */}
        <div style={{ padding: '10px 16px 14px', borderTop: '1px solid var(--br)', background: 'var(--sf)', flexShrink: 0 }}>
          {showEmoji && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 10, padding: '8px 10px', marginBottom: 8 }}>
              {ALL_EMOJIS.map(e => (
                <span key={e} onClick={() => { setInput(i => i+e); setShowEmoji(false); inputRef.current?.focus() }}
                  style={{ fontSize: 18, cursor: 'pointer', padding: '2px 3px', borderRadius: 4 }}
                  onMouseEnter={ev => ev.target.style.background='var(--b2c)'}
                  onMouseLeave={ev => ev.target.style.background='transparent'}>{e}</span>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 0, alignItems: 'flex-end', background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 12, overflow: 'hidden' }}>
            <button onClick={() => fileRef.current?.click()} title="Attach file" style={{ padding: '0 12px', height: 44, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--t3)', display: 'flex', alignItems: 'center', flexShrink: 0 }}
              onMouseEnter={e => e.currentTarget.style.color='var(--t2)'}
              onMouseLeave={e => e.currentTarget.style.color='var(--t3)'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            </button>
            <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={sendFile}/>
            <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
              placeholder={`Message ${isChannel ? '#'+active.label : active.name}…`}
              rows={1}
              style={{ flex: 1, resize: 'none', border: 'none', outline: 'none', background: 'transparent', color: 'var(--tx)', fontSize: 14, lineHeight: 1.5, padding: '12px 8px', fontFamily: 'inherit', minHeight: 44, maxHeight: 160 }}/>
            <button onClick={() => setShowEmoji(s => !s)} style={{ padding: '0 10px', height: 44, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', flexShrink: 0 }}>😊</button>
            <button onClick={send} disabled={sending || !input.trim()} style={{ padding: '0 16px', height: 44, background: input.trim() ? '#1d4ed8' : 'transparent', color: input.trim() ? '#fff' : 'var(--t3)', border: 'none', cursor: input.trim() ? 'pointer' : 'default', fontSize: 16, transition: 'all .15s', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '0 10px 10px 0' }}>
              {sending ? '…' : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>}
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 5, paddingLeft: 4 }}>Enter to send · Shift+Enter for new line · 📎 to attach</div>
        </div>
      </div>
      </div>
    </div>
  )
}

