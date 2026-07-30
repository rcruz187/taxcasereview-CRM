// ScreenShareHost — host's pop-out window view.
// Opened by the ⧉ Pop out button on the overlay with:
//   /screenshare-host?room=XXXXX&name=Romy+Cruz
//
// Auto-joins immediately with no name prompt — the host is already
// identified. Shows the full Zoom-style session: screen share tile,
// camera gallery, mic/cam/stop-sharing controls, participant list.
// This window is purely a view — the actual WebRTC session state
// lives in the main CRM window's ScreenShareContext. This page runs
// its own WebRTC join so it can see and hear everyone (same as any
// other participant), but the host's screen track comes from the
// main window and arrives here as a remote stream.

import { useState, useEffect, useRef } from 'react'
import { useSearchParams }              from 'react-router-dom'
import { FIRM, loadFirmBrandingPublic } from '../lib/firmBranding'
import { useWebRTCRoom }                from '../lib/webrtcRoom'

function StreamVideo({ stream, muted = false, mirror = false, contain = false }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.srcObject = stream || null }, [stream])
  return (
    <video ref={ref} autoPlay playsInline muted={muted}
      style={{ width: '100%', height: '100%', objectFit: contain ? 'contain' : 'cover',
               display: 'block', transform: mirror ? 'scaleX(-1)' : 'none', background: '#0d1526' }} />
  )
}

function Tile({ stream, name, muted = false, mirror = false, isScreen = false, label }) {
  const hasVideo = (stream?.getVideoTracks()?.length || 0) > 0
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div style={{ position: 'relative', background: '#1e293b', borderRadius: 10,
                  overflow: 'hidden', aspectRatio: isScreen ? '16/9' : '4/3' }}>
      {hasVideo
        ? <StreamVideo stream={stream} muted={muted} mirror={mirror} contain={isScreen} />
        : <div style={{ width: '100%', height: '100%', display: 'flex',
                        alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#2563eb',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 18, fontWeight: 700, color: '#fff' }}>{initials}</div>
          </div>}
      <div style={{ position: 'absolute', bottom: 6, left: 8, fontSize: 11, color: '#e2e8f0',
                    background: 'rgba(0,0,0,.55)', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>
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

export default function ScreenShareHost() {
  const [params] = useSearchParams()
  const roomId   = (params.get('room') || '').trim().toUpperCase()
  const hostName = (params.get('name') || 'Host').trim()

  const [ready,       setReady]       = useState(false)
  const [joined,      setJoined]      = useState(false)
  const [connecting,  setConnecting]  = useState(false)
  const [screenState, setScreenState] = useState(null)  // { host, sharing }

  const webrtc = useWebRTCRoom('screenshare')
  const bcRef  = useRef(null)

  useEffect(() => { loadFirmBrandingPublic().finally(() => setReady(true)) }, [])

  // BroadcastChannel — listens for 'end' from main window, also receives screen-state
  useEffect(() => {
    const ch = new BroadcastChannel('tcr-screenshare')
    bcRef.current = ch
    ch.addEventListener('message', e => {
      if (e.data?.type === 'end') {
        // Main window ended the session — leave and close this pop-out
        webrtc.leave().finally(() => window.close())
      }
      if (e.data?.type === 'screen-state') {
        setScreenState({ host: e.data.host, sharing: e.data.sharing })
      }
    })
    return () => { ch.close(); bcRef.current = null }
  }, [])

  // Auto-join as soon as the page loads and branding is ready
  useEffect(() => {
    if (!ready || !roomId || joined || connecting) return
    setConnecting(true)
    webrtc.join(roomId, hostName + ' (host)', true).then(result => {
      setConnecting(false)
      if (result.ok) {
        setJoined(true)
        // Also listen via Supabase Realtime channel for screen-state
        // (BroadcastChannel handles it from the main CRM window already)
        webrtc.channelRef.current?.on('broadcast', { event: 'screen-state' }, ({ payload }) => {
          setScreenState(payload)
        })
      }
    })
  }, [ready, roomId, hostName, joined, connecting])

  useEffect(() => () => { webrtc.leave() }, []) // eslint-disable-line

  const peers = webrtc.members.filter(n => n !== hostName + ' (host)')

  // The screen stream — identified by the screen-state broadcast
  const screenStream = screenState?.sharing && screenState?.host
    ? webrtc.remoteStreams[screenState.host] || null
    : null

  const total = webrtc.members.length

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
        {connecting && (
          <span style={{ color: '#f59e0b', fontSize: 12 }}>Connecting…</span>
        )}
        {joined && (
          <span style={{ color: '#22c55e', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}/>
            Live · {total} connected
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>Host view</span>
        <button onClick={() => {
          // Signal main window to end the session (which also closes this window via BroadcastChannel)
          bcRef.current?.postMessage({ type: 'end' })
          webrtc.leave().finally(() => window.close())
        }}
          style={{ background: '#dc2626', border: 'none', borderRadius: 7, padding: '7px 16px',
                   color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
          End session
        </button>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, gap: 12, overflow: 'auto' }}>

        {/* Screen share main tile */}
        {screenStream ? (
          <div style={{ flex: 1, minHeight: 260, borderRadius: 12, overflow: 'hidden', background: '#0d1526' }}>
            <StreamVideo stream={screenStream} contain />
            <div style={{ padding: '6px 12px', background: '#1e293b', fontSize: 12, color: '#94a3b8',
                          display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ color: '#22c55e', fontSize: 10 }}>●</span>
              {screenState.host}'s screen
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 200, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', color: '#475569', fontSize: 15,
                        background: '#1e293b', borderRadius: 12 }}>
            {!joined ? (connecting ? 'Connecting to session…' : 'Starting…')
              : peers.length === 0 ? 'No participants yet — share the link from the CRM'
              : 'Waiting for screen share to start…'}
          </div>
        )}

        {/* Camera strip */}
        {joined && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ width: 160 }}>
              <Tile stream={webrtc.localStreamRef.current}
                name={hostName} label={`${hostName} (you)`} muted mirror />
            </div>
            {peers.map(pName => (
              <div key={pName} style={{ width: 160 }}>
                <Tile stream={webrtc.remoteStreams[pName]} name={pName} />
              </div>
            ))}
          </div>
        )}

        {/* Mic/cam controls */}
        {joined && (
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
          </div>
        )}

        {webrtc.error && (
          <div style={{ fontSize: 12, color: '#fca5a5', padding: '8px 12px',
                        background: '#450a0a', borderRadius: 8 }}>{webrtc.error}</div>
        )}
      </div>
    </div>
  )
}
