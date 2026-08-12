// ScreenShareHost — host's pop-out window.
// Joins the WebRTC room as a silent viewer (no camera/mic broadcast)
// so it receives the screen share stream directly via WebRTC — the only
// reliable way to get it across windows. Camera/mic are off so it does
// NOT add a second participant visible to others.
//
// Uses audio:false, video:false for getUserMedia — so localStream is null
// and no track is added to peer connections. The participant count stays
// correct because webrtcRoom only adds you to the members list, but
// participants don't see a second camera feed.

import { useState, useEffect, useRef } from 'react'
import { useSearchParams }              from 'react-router-dom'
import { FIRM, loadFirmBrandingPublic } from '../lib/firmBranding'
import { useWebRTCRoom }                from '../lib/webrtcRoom'

function StreamVideo({ stream, muted = false, contain = false }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.srcObject = stream || null }, [stream])
  return (
    <video ref={ref} autoPlay playsInline muted={muted}
      style={{ width: '100%', height: '100%', objectFit: contain ? 'contain' : 'cover',
               display: 'block', background: '#0d1526' }} />
  )
}

export default function ScreenShareHost() {
  const [params]  = useSearchParams()
  const roomId    = (params.get('room') || '').trim().toUpperCase()
  const hostName  = (params.get('name') || 'Host').trim()

  const [ready,       setReady]       = useState(false)
  const [joined,      setJoined]      = useState(false)
  const [screenState, setScreenState] = useState(null)
  const [ended,       setEnded]       = useState(false)

  const bcRef  = useRef(null)

  // Join viewer-only: pass video:false, audio:false so no local stream
  // is created and nothing is sent to peers — purely receiving
  const webrtc = useWebRTCRoom('screenshare', { videoEnabled: false, audioEnabled: false })

  useEffect(() => { loadFirmBrandingPublic().finally(() => setReady(true)) }, [])

  useEffect(() => {
    const ch = new BroadcastChannel('tcr-screenshare')
    bcRef.current = ch
    ch.addEventListener('message', e => {
      if (e.data?.type === 'end') {
        setEnded(true)
        webrtc.leave()
        setTimeout(() => window.close(), 1200)
      }
      if (e.data?.type === 'screen-state') {
        setScreenState({ host: e.data.host, sharing: e.data.sharing })
      }
    })
    return () => { ch.close(); bcRef.current = null }
  }, [])

  // Auto-join as a silent viewer
  useEffect(() => {
    if (!roomId || joined) return
    // Join with viewer suffix so host can distinguish in participant list
    webrtc.join(roomId, hostName + ' (view)', 'viewerOnly').then(result => {
      if (result.ok) {
        setJoined(true)
        // Also subscribe to screen-state from Realtime channel
        webrtc.channelRef?.current?.on('broadcast', { event: 'screen-state' }, ({ payload }) => {
          setScreenState(payload)
        })
      }
    })
  }, [roomId])

  useEffect(() => () => { webrtc.leave() }, [])

  function endSession() {
    bcRef.current?.postMessage({ type: 'end' })
    webrtc.leave()
    setEnded(true)
    setTimeout(() => window.close(), 600)
  }

  // Find the host's screen stream — identified by screen-state broadcast
  const screenStream = screenState?.sharing && screenState?.host
    ? webrtc.remoteStreams[screenState.host] || null
    : null

  // Camera streams — all peers except the viewer suffix entries
  const cameraPeers = webrtc.members.filter(n => !n.endsWith('(view)') && n !== hostName + ' (view)')
  const participants = cameraPeers.length

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
        {ready && FIRM.logoUrl && (
          <img src={FIRM.logoUrl} alt="" style={{ height: 30, objectFit: 'contain' }}
            onError={e => { e.target.style.display = 'none' }} />
        )}
        <span style={{ color: '#f8fafc', fontWeight: 700, fontSize: 15 }}>
          {ready ? (FIRM.name || 'Training') : 'Training'}
        </span>
        <span style={{ color: '#64748b', fontSize: 12 }}>
          · Room <span style={{ fontFamily: 'monospace', color: '#93c5fd', letterSpacing: 2 }}>{roomId}</span>
        </span>
        {joined && (
          <span style={{ color: '#22c55e', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}/>
            Live · {participants} participant{participants !== 1 ? 's' : ''}
          </span>
        )}
        {!joined && <span style={{ color: '#f59e0b', fontSize: 12 }}>Connecting…</span>}
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
          {screenStream ? (
            <StreamVideo stream={screenStream} muted contain />
          ) : (
            <div style={{ width: '100%', height: '100%', minHeight: 300, display: 'flex',
                          alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontSize: 36, opacity: .3 }}>🖥️</span>
              <span style={{ color: '#475569', fontSize: 14 }}>
                {!joined ? 'Connecting…'
                  : participants === 0 ? 'Waiting for participants…'
                  : 'Waiting for screen share to start…'}
              </span>
            </div>
          )}
        </div>

        {/* Camera strip */}
        {participants > 0 && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {cameraPeers.map(name => (
              <div key={name} style={{ width: 180, borderRadius: 10, overflow: 'hidden',
                                       background: '#1e293b', position: 'relative', aspectRatio: '4/3' }}>
                <StreamVideo stream={webrtc.remoteStreams[name]} />
                <div style={{ position: 'absolute', bottom: 5, left: 8, fontSize: 11, color: '#e2e8f0',
                              background: 'rgba(0,0,0,.55)', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>
                  {name}
                </div>
              </div>
            ))}
          </div>
        )}

        {participants === 0 && joined && (
          <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: '8px 0' }}>
            No participants yet — copy the invite link from the Training page and share it.
          </div>
        )}
      </div>
    </div>
  )
}
