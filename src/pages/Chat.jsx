import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'

const CHANNELS = [
  { id: 'general',  label: 'general',  desc: 'All staff announcements' },
  { id: 'cases',    label: 'cases',    desc: 'Case updates and notes' },
  { id: 'billing',  label: 'billing',  desc: 'Invoices, payments, collections' },
  { id: 'irs',      label: 'irs',      desc: 'IRS notices and resolutions' },
  { id: 'hr',       label: 'hr',       desc: 'HR and internal ops' },
]

const DMS = [
  { id: 'dm_romy',    name: 'Romy Cruz',        initials: 'RC', color: '#4f8ef7' },
  { id: 'dm_dana',    name: 'Dana Richard',     initials: 'DR', color: '#a855f7' },
  { id: 'dm_yesenia', name: 'Yesenia Gonzalez', initials: 'YG', color: '#22c55e' },
]

const AVATAR_COLORS = ['#4f8ef7','#a855f7','#22c55e','#f59e0b','#ec4899','#06b6d4','#ef4444','#8b5cf6']
function colorFor(name) {
  if (!name) return '#64748b'
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
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
function dateLabel(ts) {
  if (!ts) return ''
  const d = new Date(ts), today = new Date()
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
}

export default function Chat() {
  const { user } = useApp()
  const [active, setActive]     = useState(CHANNELS[0])
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [sending, setSending]   = useState(false)
  const [loading, setLoading]   = useState(false)
  const [huddle, setHuddle]     = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)
  const fileRef   = useRef(null)
  const pollerRef = useRef(null)

  const myName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'You'
  const channelId = active.id
  const isChannel = !active.id.startsWith('dm_')

  const loadMessages = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('channel', channelId)
      .order('created_at', { ascending: true })
      .limit(300)
    if (!silent) setLoading(false)
    if (error) {
      if (!silent) setMessages([{ id: 'sys', isSystem: true, text:
        error.code === '42P01'
          ? 'Run this SQL:\n\nCREATE TABLE IF NOT EXISTS chat_messages (\n  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,\n  channel text NOT NULL,\n  sender text NOT NULL,\n  text text,\n  attachment_url text,\n  attachment_name text,\n  created_at timestamptz DEFAULT now()\n);\nALTER TABLE chat_messages DISABLE ROW LEVEL SECURITY;'
          : 'Error: ' + error.message
      }])
      return
    }
    setMessages(data || [])
  }, [channelId])

  useEffect(() => {
    loadMessages()
    inputRef.current?.focus()
    clearInterval(pollerRef.current)
    pollerRef.current = setInterval(() => loadMessages(true), 4000)
    return () => clearInterval(pollerRef.current)
  }, [loadMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    await supabase.from('chat_messages').insert([{
      channel: channelId, sender: myName, text,
      created_at: new Date().toISOString()
    }])
    setSending(false)
    setInput('')
    loadMessages(true)
  }

  async function sendFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const path = `chat/${Date.now()}_${file.name}`
    const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
    if (upErr) { alert('Upload failed: ' + upErr.message); return }
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
    await supabase.from('chat_messages').insert([{
      channel: channelId, sender: myName,
      text: null,
      attachment_url: urlData.publicUrl,
      attachment_name: file.name,
      created_at: new Date().toISOString()
    }])
    loadMessages(true)
    e.target.value = ''
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  function switchTo(item) {
    setActive(item)
    setShowEmoji(false)
  }

  const EMOJIS = ['👍','✅','🔥','💯','😊','🎉','👀','⚠️','📌','❤️','😂','🙏']

  // Group by date
  const grouped = []
  let lastDate = null
  for (const m of messages) {
    const label = dateLabel(m.created_at)
    if (label !== lastDate) { grouped.push({ type: 'divider', label }); lastDate = label }
    grouped.push({ type: 'msg', ...m })
  }

  return (
    <div style={{
      display: 'flex',
      height: 'calc(100vh - 56px)',
      overflow: 'hidden',
      background: 'var(--bg)',
      margin: '-16px',         // escape .page-content padding
    }}>

      {/* ── Sidebar ── */}
      <div style={{
        width: 240, flexShrink: 0,
        background: 'var(--nav)',
        borderRight: '1px solid var(--br)',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto'
      }}>
        {/* Workspace */}
        <div style={{
          padding: '14px 16px 12px',
          borderBottom: '1px solid var(--br)',
          display: 'flex', alignItems: 'center', gap: 10
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'var(--blue)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 800, color: '#fff', flexShrink: 0
          }}>TC</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Tax Case Review</div>
            <div style={{ fontSize: 11, color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ok)', display: 'inline-block' }}/>
              {myName}
            </div>
          </div>
        </div>

        {/* Huddle button */}
        <div style={{ padding: '10px 12px 6px' }}>
          <button
            onClick={() => setHuddle(h => !h)}
            style={{
              width: '100%', padding: '7px 12px',
              borderRadius: 8, border: 'none', cursor: 'pointer',
              background: huddle ? 'var(--ok)' : 'var(--s2)',
              color: huddle ? '#fff' : 'var(--tx)',
              display: 'flex', alignItems: 'center', gap: 8,
              fontWeight: 600, fontSize: 13, transition: 'all .15s'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.7A2 2 0 012.18 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.15a16 16 0 006.29 6.29l1.51-1.52a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
            </svg>
            {huddle ? '🔴 In Huddle' : 'Start Huddle'}
          </button>
        </div>

        {/* Channels */}
        <div style={{ padding: '8px 0 4px' }}>
          <div style={{
            padding: '4px 16px 6px',
            fontSize: 11, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '.07em',
            color: 'var(--t3)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <span>Channels</span>
            <span style={{ fontSize: 16, cursor: 'pointer', color: 'var(--t3)', lineHeight: 1 }} title="Add channel">+</span>
          </div>
          {CHANNELS.map(ch => {
            const isActive = active.id === ch.id
            return (
              <div key={ch.id} onClick={() => switchTo(ch)} style={{
                padding: '5px 16px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                background: isActive ? 'rgba(79,142,247,.18)' : 'transparent',
                borderRadius: 6, margin: '1px 8px',
                color: isActive ? 'var(--blue)' : 'var(--t2)',
                fontWeight: isActive ? 700 : 400,
                fontSize: 14,
                borderLeft: isActive ? '3px solid var(--blue)' : '3px solid transparent',
                transition: 'all .1s'
              }}>
                <span style={{ fontSize: 15, opacity: .6, marginLeft: -2 }}>#</span>
                <span style={{ flex: 1 }}>{ch.label}</span>
              </div>
            )
          })}
        </div>

        <div style={{ height: 1, background: 'var(--br)', margin: '8px 0' }} />

        {/* Direct Messages */}
        <div style={{ padding: '4px 0 12px' }}>
          <div style={{
            padding: '4px 16px 6px',
            fontSize: 11, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '.07em',
            color: 'var(--t3)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <span>Direct Messages</span>
            <span style={{ fontSize: 16, cursor: 'pointer', color: 'var(--t3)', lineHeight: 1 }} title="New DM">+</span>
          </div>
          {DMS.map(dm => {
            const isActive = active.id === dm.id
            return (
              <div key={dm.id} onClick={() => switchTo(dm)} style={{
                padding: '5px 16px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10,
                background: isActive ? 'rgba(79,142,247,.18)' : 'transparent',
                borderRadius: 6, margin: '1px 8px',
                borderLeft: isActive ? '3px solid var(--blue)' : '3px solid transparent',
                transition: 'all .1s'
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: dm.color, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 800, color: '#fff',
                  flexShrink: 0, position: 'relative'
                }}>
                  {dm.initials}
                  <span style={{
                    position: 'absolute', bottom: -1, right: -1,
                    width: 8, height: 8, borderRadius: '50%',
                    background: 'var(--ok)', border: '2px solid var(--nav)'
                  }}/>
                </div>
                <span style={{
                  fontSize: 14, color: isActive ? 'var(--blue)' : 'var(--t2)',
                  fontWeight: isActive ? 700 : 400
                }}>{dm.name}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Main chat area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg)' }}>

        {/* Huddle banner */}
        {huddle && (
          <div style={{
            background: 'linear-gradient(90deg, #16a34a, #15803d)',
            padding: '8px 20px',
            display: 'flex', alignItems: 'center', gap: 12,
            fontSize: 13, color: '#fff', flexShrink: 0
          }}>
            <span style={{ fontWeight: 700 }}>🔴 Huddle active</span>
            <span style={{ opacity: .8 }}>Voice call in progress with your team</span>
            <button onClick={() => setHuddle(false)} style={{
              marginLeft: 'auto', padding: '3px 12px', borderRadius: 6,
              background: 'rgba(255,255,255,.2)', border: 'none',
              color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 12
            }}>Leave</button>
          </div>
        )}

        {/* Channel header */}
        <div style={{
          height: 52, borderBottom: '1px solid var(--br)',
          display: 'flex', alignItems: 'center',
          padding: '0 20px', gap: 12, flexShrink: 0,
          background: 'var(--sf)'
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--tx)', display: 'flex', alignItems: 'center', gap: 6 }}>
              {isChannel
                ? <><span style={{ color: 'var(--t3)', fontWeight: 400 }}>#</span> {active.label}</>
                : <>{active.name}</>
              }
            </div>
            {isChannel && (
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 1 }}>{active.desc}</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <button
              onClick={() => setHuddle(h => !h)}
              style={{
                padding: '5px 12px', borderRadius: 6, border: '1px solid var(--br)',
                background: huddle ? 'var(--ok)' : 'var(--s2)',
                color: huddle ? '#fff' : 'var(--tx)',
                cursor: 'pointer', fontSize: 12, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 5
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.7A2 2 0 012.18 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.15a16 16 0 006.29 6.29l1.51-1.52a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
              </svg>
              Huddle
            </button>
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>
              {messages.filter(m => !m.isSystem).length} msgs
            </span>
            <button className="btn sm" onClick={() => loadMessages()} style={{ fontSize: 11 }}>⟳</button>
          </div>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: '16px 20px 8px',
          display: 'flex', flexDirection: 'column'
        }}>
          {loading && (
            <div style={{ textAlign: 'center', color: 'var(--t3)', padding: 40, fontSize: 14 }}>Loading…</div>
          )}

          {!loading && messages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--t3)', padding: '60px 20px' }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'var(--s2)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: 28, margin: '0 auto 16px'
              }}>
                {isChannel ? '#' : '💬'}
              </div>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6, color: 'var(--tx)' }}>
                {isChannel ? `Welcome to #${active.label}` : `DM with ${active.name}`}
              </div>
              <div style={{ fontSize: 14, maxWidth: 340, margin: '0 auto' }}>
                {isChannel ? active.desc + ' — start the conversation!' : 'Send a direct message.'}
              </div>
            </div>
          )}

          {!loading && grouped.map((item, i) => {
            if (item.type === 'divider') return (
              <div key={'div-' + i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                margin: '20px 0 12px', color: 'var(--t3)', fontSize: 12
              }}>
                <div style={{ flex: 1, height: 1, background: 'var(--br)' }} />
                <span style={{ fontWeight: 600, background: 'var(--bg)', padding: '2px 10px', borderRadius: 20, border: '1px solid var(--br)' }}>{item.label}</span>
                <div style={{ flex: 1, height: 1, background: 'var(--br)' }} />
              </div>
            )

            if (item.isSystem) return (
              <div key={item.id} style={{
                background: 'var(--s2)', borderRadius: 8,
                padding: '12px 16px', margin: '4px 0',
                border: '1px solid var(--br)'
              }}>
                <pre style={{ fontSize: 12, color: 'var(--t2)', whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'monospace' }}>
                  {item.text}
                </pre>
              </div>
            )

            const prev = grouped[i - 1]
            const isContinuation = prev && prev.type === 'msg' && prev.sender === item.sender
              && !prev.isSystem && (new Date(item.created_at) - new Date(prev.created_at)) < 5 * 60 * 1000

            return (
              <div key={item.id} style={{
                display: 'flex', gap: 12,
                padding: isContinuation ? '1px 0 1px 48px' : '8px 0 1px',
                alignItems: 'flex-start',
                borderRadius: 6,
              }}>
                {!isContinuation && (
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: colorFor(item.sender),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 800, color: '#fff',
                    flexShrink: 0, marginTop: 1
                  }}>
                    {initialsFor(item.sender)}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {!isContinuation && (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx)' }}>{item.sender}</span>
                      <span style={{ fontSize: 11, color: 'var(--t3)' }}>{fmtTime(item.created_at)}</span>
                    </div>
                  )}
                  {item.text && (
                    <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--tx)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {item.text}
                    </div>
                  )}
                  {item.attachment_url && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 10,
                      background: 'var(--s2)', border: '1px solid var(--br)',
                      borderRadius: 8, padding: '8px 14px', marginTop: 4,
                      maxWidth: 340
                    }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <a href={item.attachment_url} target="_blank" rel="noreferrer" style={{
                        fontSize: 13, color: 'var(--blue)', fontWeight: 600,
                        textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }}>
                        {item.attachment_name || 'Attachment'}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div style={{
          padding: '10px 16px 14px',
          borderTop: '1px solid var(--br)',
          background: 'var(--sf)', flexShrink: 0
        }}>
          {/* Emoji picker */}
          {showEmoji && (
            <div style={{
              display: 'flex', gap: 6, flexWrap: 'wrap',
              background: 'var(--s2)', border: '1px solid var(--br)',
              borderRadius: 10, padding: '8px 10px', marginBottom: 8
            }}>
              {EMOJIS.map(e => (
                <span key={e} onClick={() => { setInput(i => i + e); setShowEmoji(false); inputRef.current?.focus() }}
                  style={{ fontSize: 20, cursor: 'pointer', padding: '2px 4px', borderRadius: 4, transition: 'background .1s' }}
                  onMouseEnter={ev => ev.target.style.background = 'var(--br)'}
                  onMouseLeave={ev => ev.target.style.background = 'transparent'}
                >{e}</span>
              ))}
            </div>
          )}

          <div style={{
            display: 'flex', gap: 0, alignItems: 'flex-end',
            background: 'var(--s2)', border: '1px solid var(--br)',
            borderRadius: 12, overflow: 'hidden',
          }}>
            {/* Attach */}
            <button
              onClick={() => fileRef.current?.click()}
              title="Attach file"
              style={{
                padding: '0 12px', height: 44, background: 'transparent',
                border: 'none', cursor: 'pointer', color: 'var(--t3)',
                display: 'flex', alignItems: 'center', flexShrink: 0
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>
            <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={sendFile} />

            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={`Message ${isChannel ? '#' + active.label : active.name}…`}
              rows={1}
              style={{
                flex: 1, resize: 'none', border: 'none', outline: 'none',
                background: 'transparent', color: 'var(--tx)',
                fontSize: 14, lineHeight: 1.5, padding: '12px 8px',
                fontFamily: 'inherit', minHeight: 44, maxHeight: 160,
              }}
            />

            {/* Emoji toggle */}
            <button
              onClick={() => setShowEmoji(s => !s)}
              style={{
                padding: '0 10px', height: 44, background: 'transparent',
                border: 'none', cursor: 'pointer',
                fontSize: 18, display: 'flex', alignItems: 'center', flexShrink: 0
              }}
            >😊</button>

            {/* Send */}
            <button
              onClick={send}
              disabled={sending || !input.trim()}
              style={{
                padding: '0 16px', height: 44,
                background: input.trim() ? 'var(--blue)' : 'transparent',
                color: input.trim() ? '#fff' : 'var(--t3)',
                border: 'none', cursor: input.trim() ? 'pointer' : 'default',
                fontSize: 16, transition: 'all .15s', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '0 10px 10px 0'
              }}
            >
              {sending ? '…' : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2 21l21-9L2 3v7l15 2-15 2z"/>
                </svg>
              )}
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 5, paddingLeft: 4 }}>
            Enter to send · Shift+Enter for new line · 📎 to attach files
          </div>
        </div>
      </div>
    </div>
  )
}
