// ScreenShareOverlay — Zoom-quality training / screen-share tool.
// Persists in Shell so it survives CRM navigation.
// Features: gallery view, active-speaker highlight, screen-share with
// source label, participant cameras always visible, mic/cam toggles,
// copyable room link, minimize to pill, end session.

import { useState, useRef, useEffect, useCallback } from 'react'
import { useScreenShare } from '../context/ScreenShareContext'
import { useApp }         from '../context/AppContext'

const BASE = '/taxcasereview-CRM'
const ACCENT = '#2563eb'

// ── Tiny video element that auto-attaches a MediaStream ──────────────────────
function StreamVideo({ stream, muted = false, mirror = false, style = {} }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.srcObject = stream || null }, [stream])
  return (
    <video ref={ref} autoPlay playsInline muted={muted}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block',
               transform: mirror ? 'scaleX(-1)' : 'none', background: '#0d1526', ...style }} />
  )
}

// ── One participant tile ──────────────────────────────────────────────────────
function Tile({ stream, name, muted = false, mirror = false, isScreen = false, isSpeaking = false, label }) {
  const hasVideo = (stream?.getVideoTracks()?.length || 0) > 0
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div style={{ position: 'relative', background: '#1e293b', borderRadius: 10, overflow: 'hidden',
                  aspectRatio: isScreen ? '16/9' : '4/3',
                  boxShadow: isSpeaking ? '0 0 0 2px #22c55e' : 'none', flexShrink: 0 }}>
      {hasVideo
        ? <StreamVideo stream={stream} muted={muted} mirror={mirror} />
        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', background: '#1e293b' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: ACCENT,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 20, fontWeight: 700, color: '#fff' }}>{initials}</div>
          </div>
      }
      <div style={{ position: 'absolute', bottom: 6, left: 8, fontSize: 11, color: '#e2e8f0',
                    background: 'rgba(0,0,0,.55)', borderRadius: 4, padding: '2px 6px',
                    fontWeight: 600, backdropFilter: 'blur(4px)' }}>
        {label || name}{muted ? ' 🔇' : ''}
      </div>
      {isScreen && (
        <div style={{ position: 'absolute', top: 6, left: 8, fontSize: 10, color: '#93c5fd',
                      background: 'rgba(0,0,0,.6)', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>
          SCREEN
        </div>
      )}
    </div>
  )
}

// ── Main overlay ──────────────────────────────────────────────────────────────
export default function ScreenShareOverlay() {
  const ss = useScreenShare()
  const { employeeName, showToast } = useApp()

  const [starting,       setStarting]       = useState(false)
  const [joining,        setJoining]        = useState(false)
  const [joinCode,       setJoinCode]       = useState('')
  const [showJoin,       setShowJoin]       = useState(false)
  const [screenLabel,    setScreenLabel]    = useState('')   // e.g. "Monitor 1" or tab title
  const [speakers,       setSpeakers]       = useState({})  // { name: bool } — crude VAD

  const myName = employeeName || 'Me'

  // ── Active-speaker detection via Web Audio analyser ──────────────────────
  const analyserRef = useRef(null)
  const vadRef      = useRef(null)
  useEffect(() => {
    if (!ss.active || !ss.webrtc.localStreamRef.current) return
    try {
      const ctx  = new AudioContext()
      const src  = ctx.createMediaStreamSource(ss.webrtc.localStreamRef.current)
      const an   = ctx.createAnalyser()
      an.fftSize = 512
      src.connect(an)
      analyserRef.current = an
      const buf = new Uint8Array(an.frequencyBinCount)
      vadRef.current = setInterval(() => {
        an.getByteFrequencyData(buf)
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length
        setSpeakers(prev => ({ ...prev, [myName]: avg > 18 }))
      }, 200)
      return () => { clearInterval(vadRef.current); ctx.close() }
    } catch { /* AudioContext blocked in some browsers — no VAD, no crash */ }
  }, [ss.active, myName])

  // ── Capture the screen source label from the track settings ──────────────
  useEffect(() => {
    if (ss.sharingScreen && ss.screenStream) {
      const track = ss.screenStream.getVideoTracks()[0]
      const label = track?.label || ''   // e.g. "screen:0:0", "window:12345", or tab title
      if (label.startsWith('screen:')) setScreenLabel('Entire screen')
      else if (label.startsWith('window:') || label.startsWith('application:')) setScreenLabel('Window')
      else if (label) setScreenLabel(label.slice(0, 40))
      else setScreenLabel('Screen')
    } else {
      setScreenLabel('')
    }
  }, [ss.sharingScreen, ss.screenStream])

  const joinUrl = `${window.location.origin}${BASE}/screenshare?room=${ss.roomId}`
  const peers   = ss.webrtc.members.filter(n => n !== myName)

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
      <div onClick={() => ss.setMinimized(false)}
        style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9990,
                 background: '#1e3a8a', color: '#fff', borderRadius: 20,
                 padding: '10px 20px', cursor: 'pointer',
                 display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600,
                 boxShadow: '0 4px 20px rgba(0,0,0,.4)' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }}/>
        {ss.sharingScreen ? '🖥️' : '📷'}
        {peers.length + 1} in session · {ss.roomId}
        <span style={{ opacity: .6, fontSize: 11, marginLeft: 4 }}>click to expand</span>
      </div>
    )
  }

  // ── Expanded — full Zoom-style panel ─────────────────────────────────────
  const totalParticipants = peers.length + 1   // includes self
  const showGallery = !ss.sharingScreen         // gallery when no screen share

  return (
    <div style={{ position: 'fixed', bottom: 0, right: 0, zIndex: 9990,
                  width: 480, maxHeight: '92vh', background: '#0f172a',
                  borderRadius: '14px 14px 0 0',
                  boxShadow: '0 -6px 40px rgba(0,0,0,.6)',
                  display: 'flex', flexDirection: 'column', fontFamily: 'Arial, sans-serif' }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 8,
                    borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }}/>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', flex: 1 }}>
          {ss.sharingScreen ? `Sharing: ${screenLabel}` : 'Training session'}
          <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8, fontWeight: 400 }}>
            · {totalParticipants} participant{totalParticipants !== 1 ? 's' : ''}
          </span>
        </span>
        <button onClick={() => ss.setMinimized(true)} title="Minimize"
          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer',
                   fontSize: 18, lineHeight: 1, padding: '2px 6px' }}>−</button>
        <button onClick={() => window.confirm('End session for everyone?') && ss.endSession()}
          style={{ background: '#dc2626', border: 'none', borderRadius: 6,
                   padding: '5px 12px', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
          End
        </button>
      </div>

      {/* ── Video area ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12,
                    display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Screen share — full width when active */}
        {ss.sharingScreen && ss.screenStream && (
          <Tile stream={ss.screenStream} name={myName}
            label={`Your screen · ${screenLabel}`} isScreen muted />
        )}

        {/* Remote screen stream — first peer who has a screen track */}
        {!ss.sharingScreen && peers.map(name => {
          const rs = ss.webrtc.remoteStreams[name]
          if (!rs) return null
          const tracks = rs.getVideoTracks()
          if (!tracks.length) return null
          // A screen share sends a track with a high resolution — heuristic:
          // if width > 1200 treat as screen rather than camera
          const settings = tracks[0].getSettings?.() || {}
          if (settings.width > 1200) {
            return (
              <Tile key={name + '_screen'} stream={rs} name={name}
                label={`${name}'s screen`} isScreen />
            )
          }
          return null
        })}

        {/* Gallery — participant cameras */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: totalParticipants === 1 ? '1fr'
            : totalParticipants === 2 ? '1fr 1fr'
            : totalParticipants <= 4 ? '1fr 1fr'
            : '1fr 1fr 1fr',
          gap: 8
        }}>
          {/* Self */}
          <Tile stream={ss.webrtc.localStreamRef.current} name={myName}
            label={`${myName} (you)`} muted mirror
            isSpeaking={speakers[myName]}
            videoEnabled={ss.webrtc.cameraOn} />

          {/* Peers */}
          {peers.map(name => {
            const rs = ss.webrtc.remoteStreams[name]
            const settings = rs?.getVideoTracks()[0]?.getSettings?.() || {}
            const isScreen = settings.width > 1200
            if (isScreen) return null   // already rendered above
            return (
              <Tile key={name} stream={rs} name={name}
                isSpeaking={speakers[name]} />
            )
          })}
        </div>

        {/* Empty state */}
        {peers.length === 0 && (
          <div style={{ padding: '14px 0 4px', textAlign: 'center', color: '#475569', fontSize: 13 }}>
            Share the link below — participants will appear here when they join.
          </div>
        )}
      </div>

      {/* ── Controls ────────────────────────────────────────────────────── */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid #1e293b',
                    display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
        <CtrlBtn active={ss.webrtc.micOn} offColor="#dc2626"
          onClick={ss.webrtc.toggleMic}>
          {ss.webrtc.micOn ? '🎙️ Mute' : '🔇 Unmute'}
        </CtrlBtn>
        <CtrlBtn active={ss.webrtc.cameraOn} offColor="#dc2626"
          onClick={ss.webrtc.toggleCamera}>
          {ss.webrtc.cameraOn ? '📷 Stop cam' : '📷 Start cam'}
        </CtrlBtn>
        {!ss.sharingScreen
          ? <CtrlBtn active color={ACCENT} onClick={doShareScreen}>🖥️ Share screen</CtrlBtn>
          : <CtrlBtn active color="#7c3aed" onClick={ss.stopScreenShare}>⏹ Stop sharing</CtrlBtn>
        }
      </div>

      {/* ── Room link / copy bar ────────────────────────────────────────── */}
      <div style={{ padding: '10px 12px 14px', borderTop: '1px solid #1e293b',
                    display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Room code
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#93c5fd',
                        fontFamily: 'monospace', letterSpacing: 4 }}>{ss.roomId}</div>
        </div>
        <button onClick={() => { navigator.clipboard.writeText(joinUrl); showToast('Join link copied — paste it in Chat') }}
          style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8,
                   padding: '8px 14px', color: '#e2e8f0', cursor: 'pointer',
                   fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
          📋 Copy invite link
        </button>
      </div>
    </div>
  )

  async function doStart() {
    setStarting(true)
    const result = await ss.startSession(myName)
    setStarting(false)
    if (!result.ok) { showToast(result.reason || 'Could not start session'); return }
    // Immediately prompt for screen share
    const sResult = await ss.startScreenShare()
    if (!sResult.ok) showToast(sResult.reason || 'Screen share unavailable — you can start it from the controls')
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
    const result = await ss.startScreenShare()
    if (!result.ok) showToast(result.reason || 'Screen share unavailable')
  }
}

function CtrlBtn({ children, onClick, active, color = '#1e293b', offColor = '#1e293b' }) {
  return (
    <button onClick={onClick}
      style={{ flex: 1, minWidth: 80, padding: '8px 4px', borderRadius: 8,
               border: '1px solid #334155', cursor: 'pointer', fontSize: 12, fontWeight: 600,
               background: active ? color : offColor, color: '#f8fafc',
               transition: 'background .15s' }}>
      {children}
    </button>
  )
}
