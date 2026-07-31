// ScreenShareOverlay — Zoom-quality training / screen-share tool.
// Persists in Shell so it survives CRM navigation.
//
// Pop-out: "Open in window" opens /screenshare?room=XXXXX in a native
// browser window (window.open with size/position hints) so the host can
// keep the CRM in their main window and monitor the session in a separate
// floating window — exactly like Zoom's separate meeting window.

import { useState, useRef, useEffect } from 'react'
import { useScreenShare } from '../context/ScreenShareContext'
import { useApp }         from '../context/AppContext'

const BASE   = '/taxcasereview-CRM'
const ACCENT = '#2563eb'

function StreamVideo({ stream, muted = false, mirror = false, contain = false }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.srcObject = stream || null }, [stream])
  return (
    <video ref={ref} autoPlay playsInline muted={muted}
      style={{ width: '100%', height: '100%', display: 'block', background: '#0d1526',
               objectFit: contain ? 'contain' : 'cover',
               transform: mirror ? 'scaleX(-1)' : 'none' }} />
  )
}

function Tile({ stream, name, muted = false, mirror = false, isScreen = false, isSpeaking = false, label }) {
  const hasVideo = (stream?.getVideoTracks()?.length || 0) > 0
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div style={{ position: 'relative', background: '#1e293b', borderRadius: 10,
                  overflow: 'hidden', aspectRatio: isScreen ? '16/9' : '4/3',
                  boxShadow: isSpeaking ? '0 0 0 2px #22c55e' : 'none' }}>
      {hasVideo
        ? <StreamVideo stream={stream} muted={muted} mirror={mirror} contain={isScreen} />
        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: ACCENT,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 18, fontWeight: 700, color: '#fff' }}>{initials}</div>
          </div>}
      <div style={{ position: 'absolute', bottom: 6, left: 8, fontSize: 11, color: '#e2e8f0',
                    background: 'rgba(0,0,0,.55)', borderRadius: 4, padding: '2px 6px',
                    fontWeight: 600, backdropFilter: 'blur(4px)' }}>
        {label || name}{muted ? ' 🔇' : ''}
      </div>
      {isScreen && (
        <div style={{ position: 'absolute', top: 6, left: 8, fontSize: 10, color: '#22c55e',
                      background: 'rgba(0,0,0,.65)', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>
          ● LIVE
        </div>
      )}
    </div>
  )
}

export default function ScreenShareOverlay() {
  const ss = useScreenShare()
  const { employeeName, showToast } = useApp()

  const [starting,     setStarting]     = useState(false)
  const [joining,      setJoining]      = useState(false)
  const [joinCode,     setJoinCode]     = useState('')
  const [showJoin,     setShowJoin]     = useState(false)
  const [screenLabel,  setScreenLabel]  = useState('')
  const [speakers,     setSpeakers]     = useState({})
  const popoutRef = useRef(null)

  const myName = employeeName || 'Me'

  // Handle "Start training session" button from CRM Companies page
  useEffect(() => {
    const ch = new BroadcastChannel('tcr-screenshare')
    async function onMsg(e) {
      if (e.data?.type === 'start-from-companies' && !ss.active) {
        await doStart()
      }
    }
    ch.addEventListener('message', onMsg)
    return () => ch.close()
  }, [ss.active])
  useEffect(() => {
    if (!ss.active || !ss.webrtc.localStreamRef.current) return
    let ctx, interval
    try {
      ctx = new AudioContext()
      const src = ctx.createMediaStreamSource(ss.webrtc.localStreamRef.current)
      const an  = ctx.createAnalyser(); an.fftSize = 512
      src.connect(an)
      const buf = new Uint8Array(an.frequencyBinCount)
      interval = setInterval(() => {
        an.getByteFrequencyData(buf)
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length
        setSpeakers(p => ({ ...p, [myName]: avg > 18 }))
      }, 200)
    } catch { /* no VAD, no crash */ }
    return () => { clearInterval(interval); ctx?.close() }
  }, [ss.active, myName])

  // Screen source label from track metadata
  useEffect(() => {
    if (!ss.sharingScreen || !ss.screenStream) { setScreenLabel(''); return }
    const track   = ss.screenStream.getVideoTracks()[0]
    const surface = track?._surface || track?.getSettings?.()?.displaySurface
    if (surface === 'monitor')  setScreenLabel('Entire screen')
    else if (surface === 'window')  setScreenLabel('Window')
    else if (surface === 'browser') setScreenLabel('Browser tab')
    else setScreenLabel(track?.label?.slice(0, 40) || 'Screen')
  }, [ss.sharingScreen, ss.screenStream])

  // Keep popout in sync — close it when session ends
  useEffect(() => {
    if (!ss.active && popoutRef.current && !popoutRef.current.closed) {
      popoutRef.current.close()
      popoutRef.current = null
    }
  }, [ss.active])

  const joinUrl = `${window.location.origin}${BASE}/screenshare?room=${ss.roomId}`
  const peers   = ss.webrtc.members.filter(n => n !== myName)
  const total   = peers.length + 1

  function openPopout() {
    const w = 960, h = 680
    const left = Math.max(0, window.screen.width  - w - 20)
    const top  = Math.max(0, window.screen.height - h - 60)
    const hostUrl = `${window.location.origin}${BASE}/screenshare-host?room=${ss.roomId}&name=${encodeURIComponent(myName)}`
    const win = window.open(
      hostUrl,
      `tcr-host-${ss.roomId}`,
      `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=no`
    )
    popoutRef.current = win
  }

  // ── Not active — launcher ─────────────────────────────────────────────────
  if (!ss.active) {
    return (
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9990,
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        {showJoin && (
          <div style={{ background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 12,
                        padding: '14px 16px', boxShadow: '0 6px 24px rgba(0,0,0,.3)',
                        display: 'flex', flexDirection: 'column', gap: 8, width: 240 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)' }}>Enter room code</div>
            <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter') doJoin() }}
              placeholder="e.g. AB3XY"
              style={{ background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 8,
                       padding: '8px 12px', color: 'var(--tx)', fontSize: 14, outline: 'none',
                       fontFamily: 'monospace', letterSpacing: 2, textTransform: 'uppercase' }}
              autoFocus />
            <button onClick={doJoin} disabled={joining || !joinCode.trim()}
              style={{ padding: '9px 0', background: ACCENT, border: 'none', borderRadius: 8,
                       color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                       opacity: !joinCode.trim() ? .5 : 1 }}>
              {joining ? 'Connecting…' : 'Join session'}
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setShowJoin(v => !v); setJoinCode('') }}
            style={{ background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 20,
                     padding: '9px 16px', cursor: 'pointer', fontSize: 13, color: 'var(--tx)',
                     boxShadow: '0 2px 8px rgba(0,0,0,.15)', fontWeight: 500 }}>
            🔗 Join
          </button>
          <button onClick={doStart} disabled={starting}
            style={{ background: ACCENT, border: 'none', borderRadius: 20,
                     padding: '9px 18px', cursor: 'pointer', fontSize: 13, color: '#fff',
                     boxShadow: '0 2px 10px rgba(37,99,235,.45)', fontWeight: 700 }}>
            {starting ? '…' : '📺 Start session'}
          </button>
        </div>
      </div>
    )
  }

  // ── Minimized pill ────────────────────────────────────────────────────────
  if (ss.minimized) {
    return (
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9990,
                    display: 'flex', gap: 8, alignItems: 'center' }}>
        <div onClick={() => ss.setMinimized(false)}
          style={{ background: '#1e3a8a', color: '#fff', borderRadius: 20,
                   padding: '10px 20px', cursor: 'pointer',
                   display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600,
                   boxShadow: '0 4px 20px rgba(0,0,0,.4)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }}/>
          {ss.sharingScreen ? '🖥️' : '📷'} {total} in session · {ss.roomId}
          <span style={{ opacity: .6, fontSize: 11 }}>expand</span>
        </div>
        <button onClick={openPopout} title="Open in separate window"
          style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10,
                   padding: '9px 12px', cursor: 'pointer', color: '#93c5fd', fontSize: 16 }}>
          ⧉
        </button>
      </div>
    )
  }

  // ── Expanded panel ────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', bottom: 0, right: 0, zIndex: 9990,
                  width: 480, maxHeight: '92vh', background: '#0f172a',
                  borderRadius: '14px 14px 0 0',
                  boxShadow: '0 -6px 40px rgba(0,0,0,.6)',
                  display: 'flex', flexDirection: 'column', fontFamily: 'Arial, sans-serif' }}>

      {/* Header */}
      <div style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 8,
                    borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }}/>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ss.sharingScreen ? `🖥️ ${screenLabel}` : 'Training session'}
          <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8, fontWeight: 400 }}>
            · {total} participant{total !== 1 ? 's' : ''}
          </span>
        </span>
        {/* Pop-out button — opens session in a separate window */}
        <button onClick={openPopout} title="Open in separate window"
          style={{ background: 'none', border: 'none', color: '#93c5fd', cursor: 'pointer',
                   fontSize: 16, padding: '2px 6px', lineHeight: 1 }}>⧉</button>
        <button onClick={() => ss.setMinimized(true)} title="Minimize"
          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer',
                   fontSize: 18, lineHeight: 1, padding: '2px 6px' }}>−</button>
        <button onClick={() => window.confirm('End session for everyone?') && ss.endSession(myName)}
          style={{ background: '#dc2626', border: 'none', borderRadius: 6,
                   padding: '5px 12px', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
          End
        </button>
      </div>

      {/* Video area */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12,
                    display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Host's own screen share — full-width tile */}
        {ss.sharingScreen && ss.screenStream && (
          <Tile stream={ss.screenStream} name={myName}
            label={`Your screen · ${screenLabel}`} isScreen muted />
        )}

        {/* Participant camera grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: total <= 1 ? '1fr' : total <= 3 ? '1fr 1fr' : '1fr 1fr 1fr',
          gap: 8
        }}>
          <Tile stream={ss.webrtc.localStreamRef.current} name={myName}
            label={`${myName} (you)`} muted mirror
            isSpeaking={speakers[myName]}
            videoEnabled={ss.webrtc.cameraOn} />
          {peers.map(name => (
            <Tile key={name} stream={ss.webrtc.remoteStreams[name]}
              name={name} isSpeaking={speakers[name]} />
          ))}
        </div>

        {peers.length === 0 && (
          <div style={{ textAlign: 'center', color: '#475569', fontSize: 13, padding: '8px 0' }}>
            Copy the invite link and paste it in Chat — participants appear here when they join.
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid #1e293b',
                    display: 'flex', gap: 8, flexShrink: 0 }}>
        <CtrlBtn active={ss.webrtc.micOn}    offColor="#dc2626" onClick={ss.webrtc.toggleMic}>
          {ss.webrtc.micOn ? '🎙️ Mute' : '🔇 Unmute'}
        </CtrlBtn>
        <CtrlBtn active={ss.webrtc.cameraOn} offColor="#dc2626" onClick={ss.webrtc.toggleCamera}>
          {ss.webrtc.cameraOn ? '📷 Stop cam' : '📷 Start cam'}
        </CtrlBtn>
        {!ss.sharingScreen
          ? <CtrlBtn active color={ACCENT}    onClick={doShareScreen}>🖥️ Share screen</CtrlBtn>
          : <CtrlBtn active color="#7c3aed"   onClick={() => ss.stopScreenShare(myName)}>⏹ Stop sharing</CtrlBtn>
        }
      </div>

      {/* Room link bar */}
      <div style={{ padding: '10px 12px 14px', borderTop: '1px solid #1e293b',
                    display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '.06em' }}>Room</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#93c5fd', fontFamily: 'monospace', letterSpacing: 4 }}>{ss.roomId}</div>
        </div>
        <button onClick={openPopout}
          style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8,
                   padding: '8px 12px', color: '#93c5fd', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
          ⧉ Pop out
        </button>
        <button onClick={() => { navigator.clipboard.writeText(joinUrl); showToast('Invite link copied') }}
          style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8,
                   padding: '8px 12px', color: '#e2e8f0', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
          📋 Copy link
        </button>
      </div>
    </div>
  )

  async function doStart() {
    setStarting(true)
    const result = await ss.startSession(myName)
    setStarting(false)
    if (!result.ok) { showToast(result.reason || 'Could not start session'); return }
    const sResult = await ss.startScreenShare(myName)
    if (!sResult.ok) showToast(sResult.reason || 'Screen share unavailable — use the Share screen button')
  }

  async function doJoin() {
    const code = joinCode.trim().toUpperCase()
    if (!code) return
    setJoining(true)
    const result = await ss.joinSession(code, myName)
    setJoining(false)
    if (!result.ok) { showToast(result.reason || 'Could not join — check the room code'); return }
    setShowJoin(false); setJoinCode('')
  }

  async function doShareScreen() {
    const result = await ss.startScreenShare(myName)
    if (!result.ok) showToast(result.reason || 'Screen share unavailable')
  }
}

function CtrlBtn({ children, onClick, active, color = '#1e293b', offColor = '#1e293b' }) {
  return (
    <button onClick={onClick}
      style={{ flex: 1, padding: '9px 4px', borderRadius: 8, border: '1px solid #334155',
               cursor: 'pointer', fontSize: 12, fontWeight: 600,
               background: active ? color : offColor, color: '#f8fafc' }}>
      {children}
    </button>
  )
}
