// ScreenShareJoin — public join page at /screenshare?room=XXXXX

import { useState, useEffect, useRef } from 'react'
import { useSearchParams }              from 'react-router-dom'
import { FIRM, loadFirmBrandingPublic } from '../lib/firmBranding'
import { useWebRTCRoom }                from '../lib/webrtcRoom'

function StreamVideo({ stream, muted = false, mirror = false, contain = true }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.srcObject = stream || null }, [stream])
  return (
    <video ref={ref} autoPlay playsInline muted={muted}
      style={{ width: '100%', height: '100%', objectFit: contain ? 'contain' : 'cover',
               display: 'block', transform: mirror ? 'scaleX(-1)' : 'none', background: '#0d1526' }} />
  )
}

function CamTile({ stream, name, muted = false, mirror = false }) {
  const hasVideo = (stream?.getVideoTracks()?.length || 0) > 0
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden',
                  background: '#1e293b', aspectRatio: '4/3' }}>
      {hasVideo
        ? <StreamVideo stream={stream} muted={muted} mirror={mirror} contain={false} />
        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#2563eb',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 16, fontWeight: 700, color: '#fff' }}>{initials}</div>
          </div>}
      <div style={{ position: 'absolute', bottom: 5, left: 7, fontSize: 11, color: '#e2e8f0',
                    background: 'rgba(0,0,0,.55)', borderRadius: 4, padding: '1px 5px', fontWeight: 600 }}>
        {name}{muted ? ' 🔇' : ''}
      </div>
    </div>
  )
}

export default function ScreenShareJoin() {
  const [params] = useSearchParams()
  const roomId   = (params.get('room') || '').trim().toUpperCase()
  const urlFirm  = params.get('firm') || ''
  const urlLogo  = params.get('logo') || ''

  const [ready,       setReady]       = useState(false)
  const displayName = ready ? (FIRM.name || urlFirm || 'TaxRes CRM') : (urlFirm || '')
  const displayLogo = ready ? (FIRM.logoUrl || urlLogo || `${window.location.origin}/assets/taxrescrm-logo.png`) : (urlLogo || '')
  const [name,        setName]        = useState('')
  const [entered,     setEntered]     = useState(false)
  const [joining,     setJoining]     = useState(false)
  const [screenState, setScreenState] = useState(null)

  // Chat
  const [showChat,  setShowChat]  = useState(false)
  const [chatMsgs,  setChatMsgs]  = useState([])
  const [chatInput, setChatInput] = useState('')
  const [unread,    setUnread]    = useState(0)
  const chatEndRef  = useRef(null)

  const webrtc = useWebRTCRoom('screenshare')

  useEffect(() => { loadFirmBrandingPublic(params.get('t')).finally(() => setReady(true)) }, [])
  useEffect(() => () => { webrtc.leave() }, []) // eslint-disable-line
  useEffect(() => { if (showChat) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMsgs, showChat])
  useEffect(() => { if (showChat) setUnread(0) }, [showChat])

  async function handleJoin() {
    if (!name.trim() || !roomId) return
    setJoining(true)
    const result = await webrtc.join(roomId, name.trim(), true)
    setJoining(false)
    if (!result.ok) return

    webrtc.channelRef.current?.on('broadcast', { event: 'screen-state' }, ({ payload }) => {
      setScreenState(payload)
    })
    webrtc.channelRef.current?.send({
      type: 'broadcast', event: 'request-screen-state', payload: { from: name.trim() }
    })
    // Subscribe to chat messages from host
    webrtc.channelRef.current?.on('broadcast', { event: 'chat' }, ({ payload }) => {
      setChatMsgs(m => [...m, { ...payload, self: false }])
      setUnread(u => u + 1)
    })
    setEntered(true)
  }

  function sendChat() {
    const text = chatInput.trim()
    if (!text || !webrtc.channelRef.current) return
    const msg = { name: name.trim(), text, ts: Date.now(), self: true }
    setChatMsgs(m => [...m, msg])
    setChatInput('')
    webrtc.channelRef.current.send({
      type: 'broadcast', event: 'chat', payload: { name: name.trim(), text, ts: msg.ts }
    }).catch(() => {})
  }

  const myName   = name.trim()
  const peers    = webrtc.members.filter(n => n !== myName)
  const hostName = screenState?.host || ''
  const hostStream = screenState?.sharing && hostName
    ? (webrtc.remoteScreenStreams[hostName] || webrtc.remoteStreams[hostName] || null)
    : null

  // ── Pre-join ──────────────────────────────────────────────────────────────
  if (!entered) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ background: '#1e293b', borderRadius: 16, padding: '40px 48px',
                      width: 360, boxShadow: '0 8px 40px rgba(0,0,0,.5)' }}>
          {displayLogo && (
            <img src={displayLogo} alt={displayName}
              style={{ height: 44, objectFit: 'contain', marginBottom: 14, display: 'block' }}
              onError={e => { e.target.style.display = 'none' }} />
          )}
          <div style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', marginBottom: 4 }}>
            {displayName}
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 28 }}>
            {roomId
              ? <>Room <span style={{ color: '#93c5fd', fontFamily: 'monospace', letterSpacing: 3, fontWeight: 800 }}>{roomId}</span></>
              : 'No room code in this link.'}
          </div>
          {webrtc.error && (
            <div style={{ background: '#450a0a', border: '1px solid #991b1b', borderRadius: 8,
                          padding: '10px 14px', color: '#fca5a5', fontSize: 13, marginBottom: 16 }}>
              {webrtc.error}
            </div>
          )}
          <input value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleJoin() }}
            placeholder="Your name" disabled={!roomId} autoFocus
            style={{ width: '100%', boxSizing: 'border-box', background: '#0f172a',
                     border: '1px solid #334155', borderRadius: 10, padding: '11px 14px',
                     color: '#f8fafc', fontSize: 15, marginBottom: 14, outline: 'none' }} />
          <button onClick={handleJoin} disabled={joining || !name.trim() || !roomId}
            style={{ width: '100%', padding: '13px 0', background: '#2563eb', border: 'none',
                     borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 15,
                     cursor: 'pointer', opacity: (!name.trim() || !roomId) ? .5 : 1 }}>
            {joining ? 'Connecting…' : 'Join session →'}
          </button>
          <div style={{ marginTop: 16, fontSize: 12, color: '#475569', textAlign: 'center' }}>
            Your camera and mic will be shared when you join.
          </div>
        </div>
      </div>
    )
  }

  // ── In-session ────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100vh', background: '#0f172a', display: 'flex',
                  flexDirection: 'column', fontFamily: 'Arial, sans-serif', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: '#1e293b', borderBottom: '1px solid #334155',
                    padding: '11px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        {displayLogo && (
          <img src={displayLogo} alt="" style={{ height: 30, objectFit: 'contain' }}
            onError={e => { e.target.style.display = 'none' }} />
        )}
        <span style={{ color: '#f8fafc', fontWeight: 700, fontSize: 15 }}>{displayName}</span>
        <span style={{ color: '#64748b', fontSize: 12 }}>
          · Room <span style={{ fontFamily: 'monospace', color: '#93c5fd', letterSpacing: 2 }}>{roomId}</span>
        </span>
        <span style={{ color: '#22c55e', fontSize: 12, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}/>
          Live · {webrtc.members.length} connected
        </span>
        <button onClick={() => { webrtc.leave(); setEntered(false) }}
          style={{ background: '#dc2626', border: 'none', borderRadius: 7, padding: '7px 16px',
                   color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
          Leave
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Video column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, gap: 12, overflow: 'hidden' }}>

          {hostStream ? (
            <div style={{ flex: 1, minHeight: 0, borderRadius: 12, overflow: 'hidden', background: '#0d1526', display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, minHeight: 0 }}>
                <StreamVideo stream={hostStream} />
              </div>
              <div style={{ padding: '6px 12px', background: '#1e293b', fontSize: 12, color: '#94a3b8',
                            display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                <span style={{ color: '#22c55e', fontSize: 10 }}>●</span>
                {screenState.host}'s screen
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center',
                          justifyContent: 'center', color: '#475569', fontSize: 15,
                          background: '#1e293b', borderRadius: 12 }}>
              {peers.length === 0 ? 'Waiting for the host to join…' : 'Waiting for host to share their screen…'}
            </div>
          )}

          {/* Camera strip */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flexShrink: 0, maxHeight: 180, overflow: 'hidden' }}>
            <div style={{ width: 160, flexShrink: 0 }}>
              <CamTile stream={webrtc.localStreamRef.current} name={`${myName} (you)`} muted mirror />
            </div>
            {peers.map(pName => (
              <div key={pName} style={{ width: 160, flexShrink: 0 }}>
                <CamTile stream={webrtc.remoteStreams[pName]} name={pName} />
              </div>
            ))}
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={webrtc.toggleMic}
              style={{ flex: 1, padding: '10px 0', background: webrtc.micOn ? '#1e293b' : '#dc2626',
                       border: '1px solid #334155', borderRadius: 8, color: '#fff',
                       cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              {webrtc.micOn ? '🎙️ Mute' : '🔇 Unmute'}
            </button>
            <button onClick={webrtc.toggleCamera}
              style={{ flex: 1, padding: '10px 0', background: webrtc.cameraOn ? '#1e293b' : '#dc2626',
                       border: '1px solid #334155', borderRadius: 8, color: '#fff',
                       cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              {webrtc.cameraOn ? '📷 Stop cam' : '📷 Start cam'}
            </button>
            <button onClick={() => setShowChat(v => !v)}
              style={{ flex: 1, padding: '10px 0', position: 'relative',
                       background: showChat ? 'rgba(34,197,94,.2)' : '#1e293b',
                       border: `1px solid ${showChat ? '#22c55e' : '#334155'}`,
                       borderRadius: 8, color: showChat ? '#86efac' : '#fff',
                       cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              💬 Chat
              {unread > 0 && !showChat && (
                <span style={{ position:'absolute',top:6,right:8,background:'#ef4444',color:'#fff',
                               borderRadius:'50%',fontSize:10,fontWeight:800,width:16,height:16,
                               display:'flex',alignItems:'center',justifyContent:'center' }}>{unread}</span>
              )}
            </button>
          </div>
          {webrtc.error && <div style={{ fontSize: 12, color: '#fca5a5' }}>{webrtc.error}</div>}
        </div>

        {/* Chat sidebar */}
        {showChat && (
          <div style={{ width: 300, borderLeft: '1px solid #1e293b', display: 'flex',
                        flexDirection: 'column', background: '#0f172a', flexShrink: 0 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b',
                          fontSize: 13, fontWeight: 700, color: '#94a3b8',
                          textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Session Chat
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px',
                          display: 'flex', flexDirection: 'column', gap: 10 }}>
              {chatMsgs.length === 0 && (
                <div style={{ color: '#334155', fontSize: 13, textAlign: 'center', marginTop: 24 }}>
                  No messages yet — type a question below.
                </div>
              )}
              {chatMsgs.map((m, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column',
                                      alignItems: m.self ? 'flex-end' : 'flex-start' }}>
                  <div style={{ fontSize: 10, color: '#475569', marginBottom: 3, fontWeight: 600 }}>{m.name}</div>
                  <div style={{ maxWidth: 220, padding: '8px 12px', borderRadius: 10,
                                background: m.self ? '#1d4ed8' : '#1e293b',
                                color: '#f1f5f9', fontSize: 13, lineHeight: 1.5,
                                borderBottomRightRadius: m.self ? 2 : 10,
                                borderBottomLeftRadius: m.self ? 10 : 2 }}>
                    {m.text}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div style={{ padding: '10px 12px', borderTop: '1px solid #1e293b', display: 'flex', gap: 8 }}>
              <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendChat() }}
                placeholder="Ask a question…"
                style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 8,
                         padding: '8px 10px', color: '#f1f5f9', fontSize: 13, outline: 'none' }} />
              <button onClick={sendChat} disabled={!chatInput.trim()}
                style={{ background: '#2563eb', border: 'none', borderRadius: 8, padding: '8px 14px',
                         color: '#fff', fontWeight: 700, fontSize: 13,
                         cursor: chatInput.trim() ? 'pointer' : 'not-allowed',
                         opacity: chatInput.trim() ? 1 : .4 }}>
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
