// ScreenShareHost — host's pop-out monitor window.
// Reads the screen stream DIRECTLY from window.opener (same-origin) so
// there is no WebRTC join, no double-participant, no relay needed.
// Camera preview + mic controls mirror the main window's real session stream.
// Virtual backgrounds apply here and transmit to participants via replaceTrack.
// Chat syncs via the opener's Supabase Realtime broadcast channel.

import { useState, useEffect, useRef } from 'react'
import { useSearchParams }              from 'react-router-dom'
import { FIRM, loadFirmBrandingPublic } from '../lib/firmBranding'
import { useVideoBackground }           from '../lib/videoBackground'
import VirtualBackground                from '../components/VirtualBackground'

function StreamVideo({ stream, muted = false, contain = false, mirror = false }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.srcObject = stream || null }, [stream])
  return (
    <video ref={ref} autoPlay playsInline muted={muted}
      style={{ width: '100%', height: '100%', objectFit: contain ? 'contain' : 'cover',
               display: 'block', transform: mirror ? 'scaleX(-1)' : 'none', background: '#0d1526' }} />
  )
}

export default function ScreenShareHost() {
  const [params]  = useSearchParams()
  const roomId    = (params.get('room') || '').trim().toUpperCase()
  const hostName  = (params.get('name') || 'Host').trim()
  const urlFirm   = params.get('firm') || ''
  const urlLogo   = params.get('logo') || ''

  const [ready,        setReady]        = useState(false)
  const [ended,        setEnded]        = useState(false)
  const [screenStream, setScreenStream] = useState(null)
  const [sharing,      setSharing]      = useState(false)
  const [surfaceType,  setSurfaceType]  = useState(null)
  const [participants, setParticipants] = useState(0)

  const [selfStream,    setSelfStream]    = useState(null)
  const [remoteStreams, setRemoteStreams] = useState({})
  const [micOn,      setMicOn]       = useState(true)
  const [camOn,      setCamOn]       = useState(true)
  const [showBgPanel, setShowBgPanel] = useState(false)
  const [showChat,    setShowChat]    = useState(false)
  const [chatMsgs,    setChatMsgs]    = useState([])
  const [chatInput,   setChatInput]   = useState('')
  const [unread,      setUnread]      = useState(0)
  const chatEndRef = useRef(null)

  const vbg          = useVideoBackground()
  const rawStreamRef  = useRef(null)
  const processedRef  = useRef(null)
  const [displayStream, setDisplayStream] = useState(null)
  const selfStreamRef = useRef(null)
  const bcRef         = useRef(null)

  useEffect(() => { loadFirmBrandingPublic(params.get('t')).finally(() => setReady(true)) }, [])

  // Scroll chat to bottom on new messages
  useEffect(() => {
    if (showChat) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMsgs, showChat])

  // Clear unread when chat is opened
  useEffect(() => { if (showChat) setUnread(0) }, [showChat])

  function syncScreenStream() {
    try {
      const ctx = window.opener?._tcrScreenShare
      if (ctx?.sharingScreen && ctx?.screenStream) {
        setScreenStream(ctx.screenStream)
        setSharing(true)
        const track = ctx.screenStream.getVideoTracks?.()[0]
        setSurfaceType(track?.getSettings?.().displaySurface || null)
      } else {
        setScreenStream(null)
        setSharing(false)
        setSurfaceType(null)
      }
      if (ctx?.memberCount !== undefined) setParticipants(ctx.memberCount)
      if (ctx?.localStream !== undefined) {
        const incoming = ctx.localStream || null
        if (incoming && incoming !== rawStreamRef.current) {
          rawStreamRef.current = incoming
          if (vbg.bgMode !== 'none') {
            vbg.changeBackground(incoming, vbg.bgMode, vbg.bgPreset, null).then(out => {
              if (out) { processedRef.current = out; setDisplayStream(out) }
            })
          } else {
            setDisplayStream(incoming)
          }
        } else if (!incoming) {
          rawStreamRef.current = null
          setDisplayStream(null)
        }
        setSelfStream(incoming)
      }
      if (ctx?.remoteStreams !== undefined) setRemoteStreams(ctx.remoteStreams || {})
      if (ctx?.micOn    !== undefined) setMicOn(ctx.micOn)
      if (ctx?.cameraOn !== undefined) setCamOn(ctx.cameraOn)
    } catch {}
  }

  useEffect(() => {
    const ch = new BroadcastChannel('tcr-screenshare')
    bcRef.current = ch

    ch.addEventListener('message', e => {
      if (e.data?.type === 'end') { cleanup(); setTimeout(() => window.close(), 800) }
      if (e.data?.type === 'screen-state') setTimeout(syncScreenStream, 50)
      if (e.data?.type === 'state-snapshot') {
        const count = (e.data.members || []).filter(n => !n.endsWith('(view)')).length - 1
        setParticipants(Math.max(0, count))
      }
      // Chat messages relayed via BroadcastChannel from main window
      if (e.data?.type === 'chat-msg') {
        setChatMsgs(m => [...m, e.data.msg])
        setUnread(u => u + 1)
      }
    })

    syncScreenStream()
    ch.postMessage({ type: 'request-snapshot' })
    const poll = setInterval(syncScreenStream, 500)
    return () => { ch.close(); bcRef.current = null; clearInterval(poll) }
  }, [])

  useEffect(() => () => vbg.stopLoop(), [])

  function stopSelf() { selfStreamRef.current = null; setSelfStream(null) }
  function cleanup()  { stopSelf(); setEnded(true) }

  function endSession() {
    bcRef.current?.postMessage({ type: 'end' })
    cleanup()
    setTimeout(() => window.close(), 600)
  }

  function toggleMic() {
    try { window.opener?._tcrScreenShare?.toggleMic?.() } catch {}
    setTimeout(syncScreenStream, 60)
  }
  function toggleCam() {
    try { window.opener?._tcrScreenShare?.toggleCamera?.() } catch {}
    setTimeout(syncScreenStream, 60)
  }

  async function handleBgSelect(mode, presetId, customUrl) {
    const raw = rawStreamRef.current
    if (!raw) return
    if (mode === 'none') {
      vbg.stopLoop(); processedRef.current = null; setDisplayStream(raw)
      try {
        const origTrack = raw.getVideoTracks()[0]
        if (origTrack) {
          const pcs = Object.values(window.opener?._tcrScreenShare?.peerConnsRef?.current || {})
          for (const pc of pcs) {
            const sender = pc.getSenders().find(s => s.track?.kind === 'video')
            if (sender) sender.replaceTrack(origTrack).catch(() => {})
          }
        }
      } catch {}
      return
    }
    const out = await vbg.changeBackground(raw, mode, presetId, customUrl)
    if (!out) return
    processedRef.current = out; setDisplayStream(out)
    try {
      const newTrack = out.getVideoTracks()[0]
      if (newTrack) {
        const pcs = Object.values(window.opener?._tcrScreenShare?.peerConnsRef?.current || {})
        for (const pc of pcs) {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video')
          if (sender) sender.replaceTrack(newTrack).catch(() => {})
        }
      }
    } catch {}
  }

  function sendChat() {
    const text = chatInput.trim()
    if (!text) return
    const msg = { name: hostName, text, ts: Date.now(), self: true }
    setChatMsgs(m => [...m, msg])
    setChatInput('')
    // Send via opener's Realtime channel so participants see it
    try {
      const ch = window.opener?._tcrScreenShare?.channelRef?.current
      if (ch) ch.send({ type: 'broadcast', event: 'chat', payload: { name: hostName, text, ts: msg.ts } }).catch(() => {})
    } catch {}
    // Also relay via BroadcastChannel in case another pop-out is open
    bcRef.current?.postMessage({ type: 'chat-msg', msg })
  }

  if (ended) return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', color: '#94a3b8',
                  fontSize: 16, fontFamily: 'Arial, sans-serif' }}>
      Session ended — closing…
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0f172a', display: 'flex',
                  flexDirection: 'column', fontFamily: 'Arial, sans-serif', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: '#1e293b', borderBottom: '1px solid #334155',
                    padding: '11px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        {(urlLogo || (ready && FIRM.logoUrl)) && (
          <img src={urlLogo || FIRM.logoUrl} alt="" style={{ height: 30, objectFit: 'contain' }}
            onError={e => { e.target.style.display = 'none' }} />
        )}
        <span style={{ color: '#f8fafc', fontWeight: 700, fontSize: 15 }}>
          {urlFirm || (ready ? (FIRM.name || 'Training') : 'Training')}
        </span>
        <span style={{ color: '#64748b', fontSize: 12 }}>
          · Room <span style={{ fontFamily: 'monospace', color: '#93c5fd', letterSpacing: 2 }}>{roomId}</span>
        </span>
        <span style={{ color: '#22c55e', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}/>
          Live · {participants} participant{participants !== 1 ? 's' : ''}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#475569', fontStyle: 'italic' }}>Host view</span>
        <button onClick={endSession}
          style={{ background: '#dc2626', border: 'none', borderRadius: 7, padding: '7px 16px',
                   color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
          End session
        </button>
      </div>

      {/* Body — video area + optional chat sidebar */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Main video column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, gap: 12, overflow: 'hidden' }}>

          {/* Screen share tile */}
          {sharing && screenStream && (
            <div style={{ flex: 1, minHeight: 0, borderRadius: 12, overflow: 'hidden',
                          background: '#0d1526', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column' }}>
              {surfaceType !== 'monitor' ? (
                <div style={{ flex: 1, minHeight: 0 }}><StreamVideo stream={screenStream} muted /></div>
              ) : (
                <div style={{ width: '100%', height: '100%', minHeight: 300, display: 'flex',
                              alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
                              gap: 12, padding: 24, textAlign: 'center' }}>
                  <span style={{ fontSize: 40 }}>🟢</span>
                  <span style={{ color: '#f8fafc', fontSize: 17, fontWeight: 700 }}>You're sharing your entire screen</span>
                  <span style={{ color: '#94a3b8', fontSize: 13, maxWidth: 420, lineHeight: 1.6 }}>
                    Live preview hidden to prevent infinite capture loop.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Camera grid */}
          {(() => {
            const remoteEntries = Object.entries(remoteStreams)
            const allParticipants = [
              { key: '__self__', name: hostName + ' (you)', stream: displayStream || selfStream, muted: true, mirror: true },
              ...remoteEntries.map(([name, stream]) => ({ key: name, name, stream, muted: false, mirror: false }))
            ]
            const count = allParticipants.length
            const isStrip = sharing && screenStream

            if (isStrip) {
              return (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
                  {allParticipants.map(({ key, name, stream, muted, mirror }) => (
                    <div key={key} style={{ width: 220, aspectRatio: '4/3', borderRadius: 10,
                                            overflow: 'hidden', background: '#1e293b', position: 'relative', flexShrink: 0 }}>
                      {stream ? <StreamVideo stream={stream} muted={muted} mirror={mirror} />
                        : <div style={{ width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center' }}>
                            <span style={{ fontSize: 28, opacity: .3 }}>📷</span>
                          </div>}
                      <div style={{ position:'absolute',bottom:5,left:8,fontSize:11,color:'#e2e8f0',
                                    background:'rgba(0,0,0,.6)',borderRadius:4,padding:'2px 6px',fontWeight:600 }}>{name}</div>
                    </div>
                  ))}
                </div>
              )
            }

            const gridCols = count === 1 ? '1fr' : count === 2 ? '1fr 1fr' : count <= 4 ? '1fr 1fr' : '1fr 1fr 1fr'
            return (
              <div style={{ display: 'grid', gridTemplateColumns: gridCols, gridAutoRows: '1fr', gap: 10, flex: 1 }}>
                {allParticipants.map(({ key, name, stream, muted, mirror }) => (
                  <div key={key} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden',
                                          background: '#1e293b', minHeight: 120 }}>
                    {stream ? <StreamVideo stream={stream} muted={muted} mirror={mirror} />
                      : <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',
                                      justifyContent:'center',flexDirection:'column',gap:8 }}>
                          <span style={{ fontSize: 40, opacity: .25 }}>📷</span>
                          {key === '__self__' && !camOn && <span style={{ fontSize:12,color:'#475569' }}>Camera off</span>}
                          {key !== '__self__' && <span style={{ fontSize:12,color:'#475569' }}>Connecting…</span>}
                        </div>}
                    <div style={{ position:'absolute',bottom:8,left:10,fontSize:12,color:'#e2e8f0',
                                  background:'rgba(0,0,0,.65)',borderRadius:5,padding:'3px 8px',fontWeight:600 }}>{name}</div>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* Controls */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={toggleMic}
              style={{ flex: 1, padding: '10px 0', background: micOn ? '#1e293b' : '#dc2626',
                       border: '1px solid #334155', borderRadius: 8, color: '#fff',
                       cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              {micOn ? '🎙️ Mute' : '🔇 Unmute'}
            </button>
            <button onClick={toggleCam}
              style={{ flex: 1, padding: '10px 0', background: camOn ? '#1e293b' : '#dc2626',
                       border: '1px solid #334155', borderRadius: 8, color: '#fff',
                       cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              {camOn ? '📷 Stop cam' : '📷 Start cam'}
            </button>
            <button onClick={() => setShowBgPanel(v => !v)}
              style={{ flex: 1, padding: '10px 0',
                       background: showBgPanel ? 'rgba(99,102,241,.3)' : '#1e293b',
                       border: `1px solid ${showBgPanel ? '#6366f1' : '#334155'}`,
                       borderRadius: 8, color: showBgPanel ? '#a5b4fc' : '#fff',
                       cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              🎨 Background{vbg.bgMode !== 'none' ? ' ●' : ''}
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

          {showBgPanel && (
            <VirtualBackground bgMode={vbg.bgMode} bgPreset={vbg.bgPreset}
              segStatus={vbg.segStatus} onSelect={handleBgSelect} />
          )}

          {participants === 0 && (
            <div style={{ color: '#475569', fontSize: 13, textAlign: 'center' }}>
              No participants yet — copy the invite link from the Training tab and share it.
            </div>
          )}
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
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex',
                          flexDirection: 'column', gap: 10 }}>
              {chatMsgs.length === 0 && (
                <div style={{ color: '#334155', fontSize: 13, textAlign: 'center', marginTop: 24 }}>
                  No messages yet. Participants can type here if they're muted.
                </div>
              )}
              {chatMsgs.map((m, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column',
                                      alignItems: m.self ? 'flex-end' : 'flex-start' }}>
                  <div style={{ fontSize: 10, color: '#475569', marginBottom: 3, fontWeight: 600 }}>
                    {m.name}
                  </div>
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
                placeholder="Message participants…"
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
