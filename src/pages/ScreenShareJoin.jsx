// ScreenShareJoin
// Public join page for a screen-share / training session.
// URL: /screenshare?room=XXXXX
//
// Works exactly like /meet/:id — a person who receives the link (staff
// or client) enters their name and joins the WebRTC room. The host's
// screen stream arrives as a normal video track, and their own camera
// is visible to the host.
//
// Intentionally lightweight — no auth required, same pattern as MeetingRoom.

import { useState, useEffect, useRef } from 'react'
import { useSearchParams }              from 'react-router-dom'
import { FIRM, loadFirmBrandingPublic } from '../lib/firmBranding'
import { useWebRTCRoom }                from '../lib/webrtcRoom'
import VideoTile                        from '../components/VideoTile'

export default function ScreenShareJoin() {
  const [params]              = useSearchParams()
  const roomId                = (params.get('room') || '').trim().toUpperCase()

  const [brandingReady, setBrandingReady] = useState(false)
  const [name, setName]       = useState('')
  const [entered, setEntered] = useState(false)
  const [joining, setJoining] = useState(false)

  const webrtc = useWebRTCRoom('screenshare')

  useEffect(() => {
    loadFirmBrandingPublic().finally(() => setBrandingReady(true))
  }, [])

  useEffect(() => {
    return () => { webrtc.leave() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleJoin() {
    if (!name.trim() || !roomId) return
    setJoining(true)
    const result = await webrtc.join(roomId, name.trim(), true)
    setJoining(false)
    if (result.ok) setEntered(true)
  }

  const myName   = name.trim()
  const peers    = webrtc.members.filter(n => n !== myName)

  // ---- pre-join screen ----
  if (!entered) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ background: '#1e293b', borderRadius: 16, padding: '40px 48px', width: 360, boxShadow: '0 8px 40px rgba(0,0,0,.4)' }}>
          {brandingReady && FIRM.logoUrl && (
            <img src={FIRM.logoUrl} alt={FIRM.name} style={{ height: 48, objectFit: 'contain', marginBottom: 16, display: 'block' }}
              onError={e => { e.target.style.display = 'none' }} />
          )}
          <div style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', marginBottom: 4 }}>
            {brandingReady ? (FIRM.name || 'Screen share') : 'Screen share'}
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>
            {roomId ? <>Room <strong style={{ color: '#93c5fd', fontFamily: 'monospace', letterSpacing: 2 }}>{roomId}</strong></> : 'Invalid link — room code missing'}
          </div>

          {webrtc.error && (
            <div style={{ background: '#450a0a', border: '1px solid #991b1b', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#fca5a5', marginBottom: 16 }}>
              {webrtc.error}
            </div>
          )}

          <input
            value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleJoin() }}
            placeholder="Your name"
            disabled={!roomId}
            style={{ width: '100%', boxSizing: 'border-box', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '10px 14px', color: '#f8fafc', fontSize: 15, marginBottom: 14, outline: 'none' }}
            autoFocus
          />
          <button
            onClick={handleJoin}
            disabled={joining || !name.trim() || !roomId}
            style={{ width: '100%', padding: '12px 0', background: joining ? '#1d4ed8' : '#2563eb', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: (!name.trim() || !roomId) ? .5 : 1 }}>
            {joining ? 'Connecting…' : 'Join session'}
          </button>
        </div>
      </div>
    )
  }

  // ---- in-session view ----
  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column', fontFamily: 'Arial, sans-serif' }}>
      {/* Header bar */}
      <div style={{ background: '#1e293b', borderBottom: '1px solid #334155', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        {FIRM.logoUrl && (
          <img src={FIRM.logoUrl} alt="" style={{ height: 32, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none' }} />
        )}
        <span style={{ color: '#f8fafc', fontWeight: 700, fontSize: 15 }}>{FIRM.name || 'Screen share'}</span>
        <span style={{ color: '#64748b', fontSize: 12 }}>· Room {roomId}</span>
        <span style={{ color: '#22c55e', fontSize: 12, marginLeft: 'auto' }}>● Live · {webrtc.members.length} connected</span>
        <button onClick={() => { webrtc.leave(); setEntered(false) }}
          style={{ background: '#dc2626', border: 'none', borderRadius: 6, padding: '6px 14px', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          Leave
        </button>
      </div>

      {/* Main area — host screen takes top; cameras below */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20, gap: 16, overflow: 'auto' }}>

        {/* Remote participants — the first peer with a video track likely has the screen */}
        {peers.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 15 }}>
            Waiting for the host to share their screen…
          </div>
        ) : (
          <>
            {/* Primary tile — show first peer's stream large (likely the host's screen) */}
            <div style={{ flex: 1, minHeight: 300 }}>
              <VideoTile stream={webrtc.remoteStreams[peers[0]]} name={peers[0]} label={`${peers[0]}'s screen`} />
            </div>
            {/* Remaining participants in a row */}
            {peers.length > 1 && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {peers.slice(1).map(n => (
                  <div key={n} style={{ width: 200 }}>
                    <VideoTile stream={webrtc.remoteStreams[n]} name={n} label={n} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Self tile + controls — always visible */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#1e293b', borderRadius: 10, padding: '10px 14px' }}>
          <div style={{ width: 140, flexShrink: 0 }}>
            <VideoTile stream={webrtc.localStreamRef.current} name={myName} label="You" muted mirror videoEnabled={webrtc.cameraOn} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 10 }}>{myName}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={webrtc.toggleMic}
                style={{ padding: '7px 14px', background: webrtc.micOn ? '#334155' : '#dc2626', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                {webrtc.micOn ? '🎙️ Mute' : '🔇 Unmute'}
              </button>
              <button onClick={webrtc.toggleCamera}
                style={{ padding: '7px 14px', background: webrtc.cameraOn ? '#334155' : '#dc2626', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                {webrtc.cameraOn ? '📷 Cam off' : '📷 Cam on'}
              </button>
            </div>
            {webrtc.error && <div style={{ marginTop: 8, fontSize: 12, color: '#fca5a5' }}>{webrtc.error}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
