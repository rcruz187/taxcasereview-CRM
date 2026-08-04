// ScreenShareHost — host's pop-out monitor window.
// Reads the screen stream DIRECTLY from window.opener (same-origin) so
// there is no WebRTC join, no double-participant, no relay needed.
// Camera preview + mic controls mirror the main window's real session stream.

import { useState, useEffect, useRef } from 'react'
import { useSearchParams }              from 'react-router-dom'
import { FIRM, loadFirmBrandingPublic } from '../lib/firmBranding'

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

  // Local camera preview — NEVER sent to anyone
  const [selfStream, setSelfStream]  = useState(null)
  const [micOn,      setMicOn]       = useState(true)
  const [camOn,      setCamOn]       = useState(true)
  const selfStreamRef = useRef(null)
  const bcRef         = useRef(null)

  useEffect(() => { loadFirmBrandingPublic().finally(() => setReady(true)) }, [])

  // Pull screen stream from window.opener (same-origin, set by ScreenShareContext)
  function syncScreenStream() {
    try {
      const ctx = window.opener?._tcrScreenShare
      if (ctx?.sharingScreen && ctx?.screenStream) {
        setScreenStream(ctx.screenStream)
        setSharing(true)
        // 'monitor' = entire screen. Showing the live feed here would capture
        // this very window, producing an infinite hall-of-mirrors.
        const track = ctx.screenStream.getVideoTracks?.()[0]
        setSurfaceType(track?.getSettings?.().displaySurface || null)
      } else {
        setScreenStream(null)
        setSharing(false)
        setSurfaceType(null)
      }
      if (ctx?.memberCount !== undefined) setParticipants(ctx.memberCount)
      // Mirror the REAL session camera + mic state from the main window.
      if (ctx?.localStream !== undefined) setSelfStream(ctx.localStream || null)
      if (ctx?.micOn    !== undefined) setMicOn(ctx.micOn)
      if (ctx?.cameraOn !== undefined) setCamOn(ctx.cameraOn)
    } catch { /* cross-origin guard, should never happen */ }
  }

  // BroadcastChannel for end signal and screen-state changes
  useEffect(() => {
    const ch = new BroadcastChannel('tcr-screenshare')
    bcRef.current = ch

    ch.addEventListener('message', e => {
      if (e.data?.type === 'end') {
        cleanup()
        setTimeout(() => window.close(), 800)
      }
      if (e.data?.type === 'screen-state') {
        // Re-read from opener whenever screen state changes
        setTimeout(syncScreenStream, 50)
      }
      if (e.data?.type === 'state-snapshot') {
        const count = (e.data.members || []).filter(n => !n.endsWith('(view)')).length - 1
        setParticipants(Math.max(0, count))
      }
    })

    // Initial sync + request snapshot from parent
    syncScreenStream()
    ch.postMessage({ type: 'request-snapshot' })

    // Poll for screen stream every 500ms while not sharing (handles timing edge cases)
    const poll = setInterval(syncScreenStream, 500)

    return () => { ch.close(); bcRef.current = null; clearInterval(poll) }
  }, [])

  // No getUserMedia here — the pop-out shows the SAME stream the session is
  // already sending. Opening a second camera/mic would give the host two
  // captures and a mute button that controls the wrong one.
  function stopSelf() {
    selfStreamRef.current = null
    setSelfStream(null)
  }

  function cleanup() {
    stopSelf()
    setEnded(true)
  }

  function endSession() {
    bcRef.current?.postMessage({ type: 'end' })
    cleanup()
    setTimeout(() => window.close(), 600)
  }

  // Drive the real session tracks in the opener window, then re-read state.
  function toggleMic() {
    try { window.opener?._tcrScreenShare?.toggleMic?.() } catch {}
    setTimeout(syncScreenStream, 60)
  }

  function toggleCam() {
    try { window.opener?._tcrScreenShare?.toggleCamera?.() } catch {}
    setTimeout(syncScreenStream, 60)
  }

  if (ended) return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', color: '#94a3b8',
                  fontSize: 16, fontFamily: 'Arial, sans-serif' }}>
      Session ended — closing…
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex',
                  flexDirection: 'column', fontFamily: 'Arial, sans-serif' }}>

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

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, gap: 12, overflow: 'auto' }}>

        {/* Screen share — main tile */}
        <div style={{ flex: 1, minHeight: 300, borderRadius: 12, overflow: 'hidden',
                      background: '#0d1526', border: '1px solid #1e293b' }}>
          {sharing && screenStream && surfaceType !== 'monitor' ? (
            <StreamVideo stream={screenStream} muted contain />
          ) : sharing && screenStream ? (
            <div style={{ width: '100%', height: '100%', minHeight: 300, display: 'flex',
                          alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
                          gap: 12, padding: 24, textAlign: 'center' }}>
              <span style={{ fontSize: 40 }}>🟢</span>
              <span style={{ color: '#f8fafc', fontSize: 17, fontWeight: 700 }}>
                You're sharing your entire screen
              </span>
              <span style={{ color: '#94a3b8', fontSize: 13, maxWidth: 420, lineHeight: 1.6 }}>
                Participants can see everything on your monitor. The live preview is hidden
                here on purpose — showing it would capture this window inside itself.
              </span>
              <span style={{ color: '#64748b', fontSize: 12, maxWidth: 420, lineHeight: 1.6 }}>
                To see exactly what participants see, share a single window or browser tab
                instead of the entire screen.
              </span>
            </div>
          ) : (
            <div style={{ width: '100%', height: '100%', minHeight: 300, display: 'flex',
                          alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontSize: 36, opacity: .3 }}>🖥️</span>
              <span style={{ color: '#475569', fontSize: 14 }}>
                Waiting for screen share — click Share screen in the Training tab
              </span>
            </div>
          )}
        </div>

        {/* Camera strip — self preview only (no remote streams) */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ width: 180, borderRadius: 10, overflow: 'hidden',
                        background: '#1e293b', position: 'relative', aspectRatio: '4/3', flexShrink: 0 }}>
            {camOn && selfStream
              ? <StreamVideo stream={selfStream} muted mirror />
              : <div style={{ width: '100%', height: '100%', display: 'flex',
                              alignItems: 'center', justifyContent: 'center', background: '#1e293b' }}>
                  <span style={{ fontSize: 28, opacity: .3 }}>📷</span>
                </div>}
            <div style={{ position: 'absolute', bottom: 5, left: 8, fontSize: 11, color: '#e2e8f0',
                          background: 'rgba(0,0,0,.6)', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>
              {hostName} (you)
            </div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 8 }}>
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
        </div>

        {participants === 0 && (
          <div style={{ color: '#475569', fontSize: 13, textAlign: 'center' }}>
            No participants yet — copy the invite link from the Training tab and share it.
          </div>
        )}
      </div>
    </div>
  )
}
