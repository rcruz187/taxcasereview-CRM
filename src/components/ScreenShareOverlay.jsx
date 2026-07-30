// ScreenShareOverlay
// Persistent floating overlay for the screen-share / training tool.
// Lives in Shell (App.jsx) alongside ActiveCallBar — mounts once and
// stays mounted so the session survives navigation between CRM pages.
//
// Three UI states:
//   hidden     — no active session
//   minimized  — compact pill at bottom-right (click to expand)
//   expanded   — full overlay panel with participants + controls
//
// The host's screen stream is rendered in a large tile; everyone's
// camera tiles appear in a scrollable row underneath. Session join
// link is copyable so the host can paste it into Chat.

import { useState, useRef, useEffect } from 'react'
import { useScreenShare }    from '../context/ScreenShareContext'
import { useApp }            from '../context/AppContext'
import VideoTile             from './VideoTile'

const BASE = '/taxcasereview-CRM'

export default function ScreenShareOverlay() {
  const ss = useScreenShare()
  const { employeeName, showToast } = useApp()

  const [joining, setJoining]     = useState(false)
  const [joinCode, setJoinCode]   = useState('')
  const [showJoinInput, setShowJoinInput] = useState(false)
  const [starting, setStarting]   = useState(false)

  // ------- not active — show a launcher pill in the bottom-right corner --------
  // (only shown to staff; public pages never render Shell, so this never
  //  shows up on sign pages, portals, etc.)

  if (!ss.active) {
    return (
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9990, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>

        {showJoinInput && (
          <div style={{ background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 10, padding: '12px 14px', boxShadow: '0 4px 20px rgba(0,0,0,.25)', display: 'flex', gap: 8 }}>
            <input
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={async e => { if (e.key === 'Enter') { await doJoin() } }}
              placeholder="Room code (e.g. AB3XY)"
              style={{ background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 6, padding: '6px 10px', color: 'var(--tx)', fontSize: 13, width: 160, outline: 'none' }}
              autoFocus
            />
            <button onClick={doJoin} disabled={joining || !joinCode.trim()}
              style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {joining ? '…' : 'Join'}
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { setShowJoinInput(v => !v); setJoinCode('') }}
            style={{ background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 20, padding: '8px 16px', cursor: 'pointer', fontSize: 13, color: 'var(--tx)', boxShadow: '0 2px 8px rgba(0,0,0,.2)', fontWeight: 500 }}>
            🔗 Join session
          </button>
          <button
            onClick={doStart}
            disabled={starting}
            style={{ background: '#2563eb', border: 'none', borderRadius: 20, padding: '8px 16px', cursor: 'pointer', fontSize: 13, color: '#fff', boxShadow: '0 2px 8px rgba(37,99,235,.4)', fontWeight: 600 }}>
            {starting ? '…' : '📺 Share screen'}
          </button>
        </div>
      </div>
    )
  }

  // ------- minimized pill --------
  if (ss.minimized) {
    return (
      <div
        onClick={() => ss.setMinimized(false)}
        style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9990, background: '#1e3a8a', color: '#fff', borderRadius: 20, padding: '10px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,.35)' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}/>
        {ss.sharingScreen ? '🖥️' : '📷'} Session · {ss.webrtc.members.length} participant{ss.webrtc.members.length !== 1 ? 's' : ''}
        <span style={{ opacity: .7, fontSize: 11 }}>click to expand</span>
      </div>
    )
  }

  // ------- expanded overlay --------
  const myName  = employeeName || 'Me'
  const peers   = ss.webrtc.members.filter(n => n !== myName)
  const joinUrl = `${window.location.origin}${BASE}/screenshare?room=${ss.roomId}`

  return (
    <div style={{
      position: 'fixed', bottom: 0, right: 0, zIndex: 9990,
      width: 420, maxHeight: '90vh',
      background: '#0f172a', borderRadius: '12px 12px 0 0',
      boxShadow: '0 -4px 32px rgba(0,0,0,.5)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>

      {/* Header */}
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #1e293b' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }}/>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', flex: 1 }}>
          Screen share · Room {ss.roomId}
        </span>
        <button onClick={() => ss.setMinimized(true)}
          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16, padding: 4, lineHeight: 1 }} title="Minimize">−</button>
        <button onClick={() => { if (window.confirm('End session for everyone?')) ss.endSession() }}
          style={{ background: '#dc2626', border: 'none', color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 12, padding: '3px 8px', fontWeight: 600 }}>End</button>
      </div>

      {/* Screen / main video area */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Big screen-share tile (host view) */}
        {ss.sharingScreen && ss.screenStream ? (
          <div style={{ borderRadius: 8, overflow: 'hidden', background: '#0d1526' }}>
            <ScreenPreview stream={ss.screenStream} />
            <div style={{ padding: '5px 10px', fontSize: 11, color: '#94a3b8', background: '#0d1526' }}>🖥️ Your screen</div>
          </div>
        ) : (
          // Remote screen shares — if a peer is sharing their screen,
          // their video stream will contain the screen track
          peers.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
              Waiting for others to join…
              <div style={{ marginTop: 6, fontSize: 12, color: '#475569' }}>Share the room code so they can connect</div>
            </div>
          ) : null
        )}

        {/* Participant camera tiles */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ width: 'calc(50% - 4px)', minWidth: 140 }}>
            <VideoTile
              stream={ss.webrtc.localStreamRef.current}
              name={myName} label={`${myName} (you)`}
              muted mirror videoEnabled={ss.webrtc.cameraOn} />
          </div>
          {peers.map(name => (
            <div key={name} style={{ width: 'calc(50% - 4px)', minWidth: 140 }}>
              <VideoTile stream={ss.webrtc.remoteStreams[name]} name={name} label={name} />
            </div>
          ))}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={ss.webrtc.toggleMic}
            style={{ flex: 1, minWidth: 70, padding: '7px 0', borderRadius: 8, border: '1px solid #334155', background: ss.webrtc.micOn ? '#1e293b' : '#dc2626', color: '#f8fafc', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            {ss.webrtc.micOn ? '🎙️ Mute' : '🔇 Unmute'}
          </button>
          <button onClick={ss.webrtc.toggleCamera}
            style={{ flex: 1, minWidth: 70, padding: '7px 0', borderRadius: 8, border: '1px solid #334155', background: ss.webrtc.cameraOn ? '#1e293b' : '#dc2626', color: '#f8fafc', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            {ss.webrtc.cameraOn ? '📷 Cam off' : '📷 Cam on'}
          </button>
          {!ss.sharingScreen ? (
            <button onClick={doShareScreen}
              style={{ flex: 1, minWidth: 100, padding: '7px 0', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              🖥️ Share screen
            </button>
          ) : (
            <button onClick={ss.stopScreenShare}
              style={{ flex: 1, minWidth: 100, padding: '7px 0', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              ⏹ Stop sharing
            </button>
          )}
        </div>

        {/* Room link — for sharing */}
        <div style={{ background: '#1e293b', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Room code &amp; link</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: '#93c5fd', letterSpacing: 3, fontFamily: 'monospace' }}>{ss.roomId}</span>
            <button onClick={() => { navigator.clipboard.writeText(joinUrl); showToast('Link copied') }}
              style={{ marginLeft: 'auto', background: '#334155', border: 'none', borderRadius: 6, padding: '5px 10px', color: '#e2e8f0', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
              Copy link
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  async function doStart() {
    setStarting(true)
    const result = await ss.startSession(myName)
    setStarting(false)
    if (!result.ok) { showToast(result.reason || 'Could not start session'); return }
    // Start screen share immediately after joining
    const shareResult = await ss.startScreenShare()
    if (!shareResult.ok) showToast(shareResult.reason || 'Screen share unavailable')
  }

  async function doJoin() {
    const code = joinCode.trim().toUpperCase()
    if (!code) return
    setJoining(true)
    const result = await ss.joinSession(code, myName)
    setJoining(false)
    if (!result.ok) { showToast(result.reason || 'Could not join session'); return }
    setShowJoinInput(false)
    setJoinCode('')
  }

  async function doShareScreen() {
    const result = await ss.startScreenShare()
    if (!result.ok) showToast(result.reason || 'Screen share unavailable')
  }
}

// Raw screen preview — no aspect-ratio constraint, just fills the container.
function ScreenPreview({ stream }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.srcObject = stream || null }, [stream])
  return (
    <video ref={ref} autoPlay playsInline muted
      style={{ width: '100%', maxHeight: 220, objectFit: 'contain', background: '#0d1526', display: 'block' }} />
  )
}
