// ScreenShareHost — host's pop-out monitor window.
// Opens at /screenshare-host?room=XXXXX&name=Romy
//
// DOES NOT join the WebRTC room. It receives all session state from the
// main CRM window via BroadcastChannel('tcr-screenshare') — the same
// channel ScreenShareContext already uses for cross-window coordination.
//
// The main window sends:
//   { type: 'state-snapshot', state: { members, remoteStreams, ... } }
//   { type: 'screen-state', host, sharing }
//   { type: 'end' }
//
// This means there is only ONE WebRTC connection no matter how many
// windows you open — no double-camera, no double-participant count.
//
// What this window shows:
//   - Host's own camera (from a separate getUserMedia call — just for
//     the host to see themselves; this video is NOT sent to participants)
//   - Screen share tile (when host is sharing)
//   - Participant count / names from the broadcast
//   - End session button (signals back via BroadcastChannel)

import { useState, useEffect, useRef } from 'react'
import { useSearchParams }              from 'react-router-dom'
import { FIRM, loadFirmBrandingPublic } from '../lib/firmBranding'

function StreamVideo({ stream, muted = false, mirror = false, contain = false }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.srcObject = stream || null }, [stream])
  return (
    <video ref={ref} autoPlay playsInline muted={muted}
      style={{ width: '100%', height: '100%', objectFit: contain ? 'contain' : 'cover',
               display: 'block', transform: mirror ? 'scaleX(-1)' : 'none', background: '#0d1526' }} />
  )
}

export default function ScreenShareHost() {
  const [params] = useSearchParams()
  const roomId   = (params.get('room') || '').trim().toUpperCase()
  const hostName = (params.get('name') || 'Host').trim()

  const [ready,        setReady]        = useState(false)
  const [screenState,  setScreenState]  = useState(null)   // { host, sharing }
  const [members,      setMembers]      = useState([])
  const [ended,        setEnded]        = useState(false)

  // Host's own camera — local preview only, NOT sent to anyone
  const [selfStream,   setSelfStream]   = useState(null)
  const [camOn,        setCamOn]        = useState(true)
  const [micOn,        setMicOn]        = useState(true)

  // The screen stream comes from the main window via BroadcastChannel
  // We can't transfer a MediaStream across windows, so we show a
  // "Screen is live in main window" indicator instead of the actual stream.
  // The pop-out is a monitoring/control panel, not a duplicate renderer.

  const bcRef = useRef(null)

  useEffect(() => { loadFirmBrandingPublic().finally(() => setReady(true)) }, [])

  // Set up BroadcastChannel
  useEffect(() => {
    const ch = new BroadcastChannel('tcr-screenshare')
    bcRef.current = ch

    ch.addEventListener('message', e => {
      const { type, ...payload } = e.data || {}
      if (type === 'end') {
        setEnded(true)
        stopSelfCam()
        setTimeout(() => window.close(), 1500)
      }
      if (type === 'screen-state') {
        setScreenState({ host: payload.host, sharing: payload.sharing })
      }
      if (type === 'state-snapshot') {
        setMembers(payload.members || [])
      }
    })

    // Request an immediate snapshot from the main window
    ch.postMessage({ type: 'request-snapshot' })

    return () => { ch.close(); bcRef.current = null }
  }, [])

  // Start self-camera (local preview only)
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => setSelfStream(stream))
      .catch(() => setCamOn(false))
    return () => stopSelfCam()
  }, [])

  function stopSelfCam() {
    setSelfStream(s => { s?.getTracks().forEach(t => t.stop()); return null })
  }

  function toggleMic() {
    setMicOn(v => {
      const next = !v
      selfStream?.getAudioTracks().forEach(t => { t.enabled = next })
      return next
    })
  }

  function toggleCam() {
    setCamOn(v => {
      const next = !v
      selfStream?.getVideoTracks().forEach(t => { t.enabled = next })
      return next
    })
  }

  function endSession() {
    bcRef.current?.postMessage({ type: 'end' })
    stopSelfCam()
    setEnded(true)
    setTimeout(() => window.close(), 800)
  }

  const participants = members.filter(n => n !== hostName + ' (host)').length

  if (ended) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', color: '#94a3b8',
                    fontSize: 16, fontFamily: 'Arial, sans-serif' }}>
        Session ended — closing…
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex',
                  flexDirection: 'column', fontFamily: 'Arial, sans-serif' }}>

      {/* Header */}
      <div style={{ background: '#1e293b', borderBottom: '1px solid #334155',
                    padding: '11px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        {ready && FIRM.logoUrl && (
          <img src={FIRM.logoUrl} alt="" style={{ height: 30, objectFit: 'contain' }}
            onError={e => { e.target.style.display = 'none' }} />
        )}
        <span style={{ color: '#f8fafc', fontWeight: 700, fontSize: 15 }}>
          {ready ? (FIRM.name || 'Training session') : 'Training session'}
        </span>
        <span style={{ color: '#64748b', fontSize: 12 }}>
          · Room <span style={{ fontFamily: 'monospace', color: '#93c5fd', letterSpacing: 2 }}>{roomId}</span>
        </span>
        <span style={{ color: '#22c55e', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, marginLeft: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}/>
          {participants} participant{participants !== 1 ? 's' : ''}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#475569', fontStyle: 'italic' }}>Host view</span>
        <button onClick={endSession}
          style={{ background: '#dc2626', border: 'none', borderRadius: 7, padding: '7px 16px',
                   color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
          End session
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20, gap: 14, overflow: 'auto' }}>

        {/* Screen share status */}
        <div style={{ borderRadius: 12, background: '#1e293b', overflow: 'hidden', minHeight: 220,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
          {screenState?.sharing ? (
            <>
              <div style={{ fontSize: 32 }}>🖥️</div>
              <div style={{ color: '#22c55e', fontWeight: 700, fontSize: 16 }}>Screen sharing active</div>
              <div style={{ color: '#64748b', fontSize: 13 }}>
                {screenState.host}'s screen is live in the main CRM window
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: '#475569' }}>
                Participants can see the screen. Camera preview below is yours only (not broadcast).
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 28, opacity: .4 }}>🖥️</div>
              <div style={{ color: '#475569', fontSize: 14 }}>
                No screen share active — use the Share screen button in the CRM
              </div>
            </>
          )}
        </div>

        {/* Host self-camera preview */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 200, borderRadius: 10, overflow: 'hidden', background: '#1e293b', flexShrink: 0 }}>
            <div style={{ aspectRatio: '4/3', position: 'relative' }}>
              {camOn && selfStream
                ? <StreamVideo stream={selfStream} muted mirror />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', background: '#1e293b', aspectRatio: '4/3' }}>
                    <span style={{ fontSize: 32, opacity: .3 }}>📷</span>
                  </div>}
              <div style={{ position: 'absolute', bottom: 6, left: 8, fontSize: 11, color: '#e2e8f0',
                            background: 'rgba(0,0,0,.55)', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>
                {hostName} (you) — preview only
              </div>
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10, lineHeight: 1.5 }}>
              Your camera preview is <strong style={{ color: '#94a3b8' }}>local only</strong> — it's not broadcast to participants from this window. Participants see your camera from the main CRM window.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={toggleMic}
                style={{ flex: 1, padding: '9px 0', background: micOn ? '#1e293b' : '#dc2626',
                         border: '1px solid #334155', borderRadius: 8, color: '#fff',
                         cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                {micOn ? '🎙️ Mute preview' : '🔇 Unmuted'}
              </button>
              <button onClick={toggleCam}
                style={{ flex: 1, padding: '9px 0', background: camOn ? '#1e293b' : '#dc2626',
                         border: '1px solid #334155', borderRadius: 8, color: '#fff',
                         cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                {camOn ? '📷 Stop preview' : '📷 Start preview'}
              </button>
            </div>
          </div>
        </div>

        {/* Participant list */}
        <div style={{ background: '#1e293b', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Participants ({participants})
          </div>
          {participants === 0 ? (
            <div style={{ color: '#475569', fontSize: 13 }}>
              No one has joined yet. Copy the link from the main CRM window and paste it in Chat.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {members.filter(n => n !== hostName + ' (host)').map(n => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e2e8f0' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}/>
                  {n}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
