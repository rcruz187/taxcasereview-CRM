// ScreenShareJoin — public join page at /screenshare?room=XXXXX
// Exactly like /meet/:id but built for viewing a host's screen share.
// No auth required. Tenant-branded.

import { useState, useEffect, useRef } from 'react'
import { useSearchParams }              from 'react-router-dom'
import { FIRM, loadFirmBrandingPublic } from '../lib/firmBranding'
import { useWebRTCRoom }                from '../lib/webrtcRoom'

function StreamVideo({ stream, muted = false, mirror = false, cover = false }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.srcObject = stream || null }, [stream])
  return (
    <video ref={ref} autoPlay playsInline muted={muted}
      style={{ width: '100%', height: '100%', objectFit: cover ? 'cover' : 'contain',
               display: 'block', transform: mirror ? 'scaleX(-1)' : 'none', background: '#0d1526' }} />
  )
}

function CamTile({ stream, name, muted = false, mirror = false, speaking = false }) {
  const hasVideo = (stream?.getVideoTracks()?.length || 0) > 0
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: '#1e293b',
                  aspectRatio: '4/3', boxShadow: speaking ? '0 0 0 2px #22c55e' : 'none' }}>
      {hasVideo
        ? <StreamVideo stream={stream} muted={muted} mirror={mirror} cover />
        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center',
                        justifyContent: 'center' }}>
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
  const [params]  = useSearchParams()
  const roomId    = (params.get('room') || '').trim().toUpperCase()

  const [ready,    setReady]    = useState(false)
  const [name,     setName]     = useState('')
  const [entered,  setEntered]  = useState(false)
  const [joining,  setJoining]  = useState(false)

  const webrtc = useWebRTCRoom('screenshare')

  useEffect(() => { loadFirmBrandingPublic().finally(() => setReady(true)) }, [])
  useEffect(() => () => { webrtc.leave() }, [])   // eslint-disable-line

  async function handleJoin() {
    if (!name.trim() || !roomId) return
    setJoining(true)
    const result = await webrtc.join(roomId, name.trim(), true)
    setJoining(false)
    if (result.ok) setEntered(true)
  }

  const myName = name.trim()
  const peers  = webrtc.members.filter(n => n !== myName)

  // Identify the host's screen stream — highest-resolution video track among peers
  const hostScreenStream = (() => {
    for (const peerName of peers) {
      const rs = webrtc.remoteStreams[peerName]
      if (!rs) continue
      const track = rs.getVideoTracks()[0]
      if (!track) continue
      const { width = 0 } = track.getSettings?.() || {}
      if (width > 1200) return { stream: rs, name: peerName }
    }
    return null
  })()

  // ── Pre-join ──────────────────────────────────────────────────────────────
  if (!entered) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ background: '#1e293b', borderRadius: 16, padding: '40px 48px',
                      width: 360, boxShadow: '0 8px 40px rgba(0,0,0,.5)' }}>
          {ready && FIRM.logoUrl && (
            <img src={FIRM.logoUrl} alt={FIRM.name} style={{ height: 44, objectFit: 'contain', marginBottom: 14, display: 'block' }}
              onError={e => { e.target.style.display = 'none' }} />
          )}
          <div style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', marginBottom: 4 }}>
            {ready ? (FIRM.name || 'Training session') : 'Training session'}
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
            placeholder="Your name"
            disabled={!roomId}
            autoFocus
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
            Your camera and mic will turn on when you join.
          </div>
        </div>
      </div>
    )
  }

  // ── In-session ────────────────────────────────────────────────────────────
  const totalPeers = peers.length
  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex',
                  flexDirection: 'column', fontFamily: 'Arial, sans-serif' }}>

      {/* Header */}
      <div style={{ background: '#1e293b', borderBottom: '1px solid #334155',
                    padding: '11px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        {FIRM.logoUrl && (
          <img src={FIRM.logoUrl} alt="" style={{ height: 30, objectFit: 'contain' }}
            onError={e => { e.target.style.display = 'none' }} />
        )}
        <span style={{ color: '#f8fafc', fontWeight: 700, fontSize: 15 }}>{FIRM.name || 'Training session'}</span>
        <span style={{ color: '#64748b', fontSize: 12 }}>· Room <span style={{ fontFamily: 'monospace', color: '#93c5fd', letterSpacing: 2 }}>{roomId}</span></span>
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

      {/* Main video area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, gap: 12, overflow: 'auto' }}>

        {/* Host screen — full width */}
        {hostScreenStream ? (
          <div style={{ borderRadius: 12, overflow: 'hidden', background: '#0d1526', flex: 1, minHeight: 260 }}>
            <StreamVideo stream={hostScreenStream.stream} />
            <div style={{ padding: '6px 12px', background: '#1e293b', fontSize: 12,
                          color: '#94a3b8', display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ color: '#22c55e', fontSize: 10 }}>●</span>
              {hostScreenStream.name}'s screen
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 200, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', color: '#475569', fontSize: 15,
                        background: '#1e293b', borderRadius: 12 }}>
            {totalPeers === 0
              ? 'Waiting for the host to join…'
              : 'Waiting for host to share their screen…'}
          </div>
        )}

        {/* Camera strip — all participants */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {/* Self */}
          <div style={{ width: 160 }}>
            <CamTile stream={webrtc.localStreamRef.current} name={`${myName} (you)`}
              muted mirror />
          </div>
          {/* Peers (camera streams only) */}
          {peers.map(pName => {
            const rs = webrtc.remoteStreams[pName]
            const settings = rs?.getVideoTracks()[0]?.getSettings?.() || {}
            if (settings.width > 1200) return null  // skip screen stream, shown above
            return (
              <div key={pName} style={{ width: 160 }}>
                <CamTile stream={rs} name={pName} />
              </div>
            )
          })}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 8 }}>
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
          {webrtc.error && (
            <div style={{ fontSize: 12, color: '#fca5a5', padding: '10px 0', flex: 2 }}>{webrtc.error}</div>
          )}
        </div>
      </div>
    </div>
  )
}
