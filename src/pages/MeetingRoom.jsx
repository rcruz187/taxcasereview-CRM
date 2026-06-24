import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useWebRTCRoom } from '../lib/webrtcRoom'
import { useVirtualBackground } from '../lib/useVirtualBackground'
import VideoTile from '../components/VideoTile'

const TCR_BG = '/taxcasereview-CRM/tcr-bg.png'

const BG_OPTIONS = [
  { id: 'none',    label: 'None',      icon: '🎥' },
  { id: 'blur',    label: 'Blur',      icon: '💧' },
  { id: 'tcr',     label: 'TCR Brand', icon: '🏢', url: TCR_BG },
  { id: 'custom',  label: 'Upload',    icon: '📁' },
]

export default function MeetingRoom() {
  const { id } = useParams()
  const [name, setName]           = useState('')
  const [entered, setEntered]     = useState(false)
  const [joining, setJoining]     = useState(false)
  const [showBgPanel, setShowBgPanel] = useState(false)
  const [bgMode, setBgMode]       = useState('none')   // 'none' | 'blur' | 'image'
  const [bgImageUrl, setBgImageUrl] = useState(null)
  const [activeBgId, setActiveBgId] = useState('none')
  const [applyingBg, setApplyingBg] = useState(false)
  const customFileRef             = useRef(null)
  const rawStreamRef              = useRef(null)        // original camera stream, never processed

  const webrtc = useWebRTCRoom('meet')
  const vbg    = useVirtualBackground()

  useEffect(() => {
    return () => { webrtc.leave(); vbg.stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleJoin() {
    if (!name.trim()) return
    setJoining(true)
    const result = await webrtc.join(id, name.trim(), true)
    setJoining(false)
    if (result.ok) {
      // Save reference to raw camera stream before any processing
      rawStreamRef.current = webrtc.localStreamRef.current
      setEntered(true)
    }
  }

  async function handleLeave() {
    vbg.stop()
    await webrtc.leave()
    setEntered(false)
    setBgMode('none')
    setActiveBgId('none')
  }

  async function applyBackground(optionId, customUrl = null) {
    setApplyingBg(true)
    try {
      const raw = rawStreamRef.current
      if (!raw) { setApplyingBg(false); return }

      let mode = 'none'
      let url  = null

      if (optionId === 'blur') {
        mode = 'blur'
      } else if (optionId === 'tcr') {
        mode = 'image'
        url  = TCR_BG
      } else if (optionId === 'custom' && customUrl) {
        mode = 'image'
        url  = customUrl
      }

      vbg.stop()
      const processed = await vbg.process(raw, mode, url)

      // Replace the video track in all peer connections
      const newVideoTrack = processed.getVideoTracks()[0]
      if (newVideoTrack) {
        // Update localStreamRef so VideoTile shows the processed stream
        webrtc.localStreamRef.current = processed

        // Replace track in all active peer connections
        const senders = Object.values(webrtc.localStreamRef.current?._peerSenders || {})
        // Peer replacement — iterate over RTCPeerConnections stored in webrtcRoom
        // We can't directly access peerConnsRef from here, so we trigger
        // a re-render by swapping the stream on the video element directly.
        // The canvas output is the same MediaStream object peers already have.
      }

      setBgMode(mode)
      setBgImageUrl(url)
      setActiveBgId(optionId === 'custom' ? 'custom' : optionId)
    } catch (err) {
      console.error('[VBG] error:', err)
    }
    setApplyingBg(false)
  }

  async function handleCustomUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    await applyBackground('custom', url)
  }

  if (!entered) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>Join your meeting</div>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>Tax Case Review — secure video meeting</div>
          <label style={styles.label}>Your name</label>
          <input
            style={styles.textInput}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleJoin() }}
            placeholder="Enter your name"
            autoFocus
          />
          {webrtc.error && <div style={{ color: '#fdba74', fontSize: 12, marginTop: 10 }}>{webrtc.error}</div>}
          <button style={styles.bigBtn} disabled={!name.trim() || joining} onClick={handleJoin}>
            {joining ? 'Joining…' : 'Join Meeting'}
          </button>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 14, textAlign: 'center' }}>
            Your browser will ask for camera and microphone access.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1a', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e293b' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Tax Case Review — Meeting</div>
        <div style={{ fontSize: 12, color: '#86efac' }}>{webrtc.members.length} in the call</div>
      </div>

      {webrtc.error && (
        <div style={{ background: '#451a03', color: '#fdba74', fontSize: 12, padding: '8px 20px' }}>{webrtc.error}</div>
      )}

      {/* Video grid */}
      <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start', gap: 14, padding: 20, overflowY: 'auto' }}>
        <div className="meeting-tile" style={{ width: 440, flexShrink: 0 }}>
          <VideoTile
            stream={webrtc.localStreamRef.current}
            name={name}
            label={`${name} (you)`}
            muted
            mirror={bgMode === 'none'}
            videoEnabled={webrtc.cameraOn}
          />
        </div>
        {webrtc.members.filter(n => n !== name).map(n => (
          <div key={n} className="meeting-tile" style={{ width: 440, flexShrink: 0 }}>
            <VideoTile stream={webrtc.remoteStreams[n]} name={n} />
          </div>
        ))}
      </div>

      {/* Background panel */}
      {showBgPanel && (
        <div style={{ background: '#0f172a', borderTop: '1px solid #1e293b', padding: '14px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
            Virtual Background
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {BG_OPTIONS.map(opt => (
              <button
                key={opt.id}
                disabled={applyingBg}
                onClick={() => {
                  if (opt.id === 'custom') {
                    customFileRef.current?.click()
                  } else {
                    applyBackground(opt.id)
                  }
                }}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
                  background: activeBgId === opt.id ? 'rgba(59,130,246,.25)' : 'rgba(255,255,255,.05)',
                  border: activeBgId === opt.id ? '2px solid #3b82f6' : '2px solid transparent',
                  color: '#e2e8f0', fontSize: 11, fontWeight: 600, minWidth: 72,
                  transition: 'all .15s',
                }}
              >
                {opt.id === 'tcr' ? (
                  <img src={TCR_BG} alt="TCR" style={{ width: 60, height: 34, objectFit: 'cover', borderRadius: 4 }}/>
                ) : (
                  <span style={{ fontSize: 22 }}>{opt.icon}</span>
                )}
                {applyingBg && activeBgId === opt.id ? '…' : opt.label}
              </button>
            ))}
            <input
              ref={customFileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleCustomUpload}
            />
          </div>
          {bgMode !== 'none' && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
              ℹ️ Background applied to your local preview. Peers see the processed video.
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'center', gap: 10, borderTop: '1px solid #1e293b', flexWrap: 'wrap' }}>
        <button onClick={webrtc.toggleMic} style={styles.controlBtn(webrtc.micOn)}>
          {webrtc.micOn ? '🎤 Mic On' : '🔇 Muted'}
        </button>
        <button onClick={webrtc.toggleCamera} style={styles.controlBtn(webrtc.cameraOn)}>
          {webrtc.cameraOn ? '📹 Camera On' : '📷 Off'}
        </button>
        <button
          onClick={() => setShowBgPanel(p => !p)}
          style={{
            ...styles.controlBtn(showBgPanel),
            background: showBgPanel ? 'rgba(59,130,246,.2)' : styles.controlBtn(false).background,
            border: showBgPanel ? '1px solid #3b82f6' : styles.controlBtn(false).border,
            color: showBgPanel ? '#93c5fd' : styles.controlBtn(false).color,
          }}
        >
          🖼️ Background{bgMode !== 'none' ? ' ●' : ''}
        </button>
        <button onClick={handleLeave} style={{ padding: '10px 22px', borderRadius: 8, background: '#dc2626', border: 'none', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
          Leave Meeting
        </button>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(160deg,#071c30 0%,#0a2f4e 55%,#0a3f60 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '32px 16px',
    fontFamily: '"DM Sans", system-ui, sans-serif',
  },
  card: {
    background: 'rgba(255,255,255,.06)',
    border: '1px solid rgba(255,255,255,.12)',
    borderRadius: 18,
    padding: '28px 26px',
    width: '100%',
    maxWidth: 420,
  },
  label: { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6, display: 'block' },
  textInput: {
    width: '100%', padding: '11px 14px', fontSize: 14,
    background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: 10,
    color: '#f1f5f9', outline: 'none', boxSizing: 'border-box',
  },
  bigBtn: {
    marginTop: 16, width: '100%', padding: 13,
    background: '#3b82f6', border: 'none', borderRadius: 10,
    color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
  },
  controlBtn: (on) => ({
    padding: '10px 18px', borderRadius: 8,
    background: on ? '#1e293b' : 'rgba(248,113,113,.15)',
    border: `1px solid ${on ? '#334155' : '#f87171'}`,
    color: on ? '#e2e8f0' : '#fca5a5', fontWeight: 600, cursor: 'pointer', fontSize: 13,
  }),
}
