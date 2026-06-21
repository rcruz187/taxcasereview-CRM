import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useWebRTCRoom } from '../lib/webrtcRoom'
import VideoTile from '../components/VideoTile'

// Public video meeting room, no login required -- the link itself (tied
// to a calendar appointment id) is the access control, same pattern as
// /sign/:id and /portal/:id. Uses the same free, browser-to-browser
// WebRTC room the internal team Huddle uses; Supabase only relays the
// tiny signaling messages, never any audio/video.
export default function MeetingRoom() {
  const { id } = useParams()
  const [name, setName] = useState('')
  const [entered, setEntered] = useState(false)
  const [joining, setJoining] = useState(false)
  const webrtc = useWebRTCRoom('meet')

  useEffect(() => {
    return () => { webrtc.leave() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleJoin() {
    if (!name.trim()) return
    setJoining(true)
    const ok = await webrtc.join(id, name.trim(), true)
    setJoining(false)
    if (ok) setEntered(true)
  }

  async function handleLeave() {
    await webrtc.leave()
    setEntered(false)
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
      <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e293b' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Tax Case Review — Meeting</div>
        <div style={{ fontSize: 12, color: '#86efac' }}>{webrtc.members.length} in the call</div>
      </div>
      {webrtc.error && (
        <div style={{ background: '#451a03', color: '#fdba74', fontSize: 12, padding: '8px 20px' }}>{webrtc.error}</div>
      )}
      <div style={{
        flex: 1, display: 'grid', gap: 12, padding: 20,
        gridTemplateColumns: `repeat(${Math.min(Math.max(webrtc.members.length, 1), 3)}, minmax(220px, 1fr))`,
        alignContent: 'start',
      }}>
        <VideoTile stream={webrtc.localStreamRef.current} name={name} label={`${name} (you)`} muted mirror videoEnabled={webrtc.cameraOn} />
        {webrtc.members.filter(n => n !== name).map(n => (
          <VideoTile key={n} stream={webrtc.remoteStreams[n]} name={n} />
        ))}
      </div>
      <div style={{ padding: 18, display: 'flex', justifyContent: 'center', gap: 10, borderTop: '1px solid #1e293b' }}>
        <button onClick={webrtc.toggleMic} style={styles.controlBtn(webrtc.micOn)}>{webrtc.micOn ? '🎤 Mic On' : '🔇 Muted'}</button>
        <button onClick={webrtc.toggleCamera} style={styles.controlBtn(webrtc.cameraOn)}>{webrtc.cameraOn ? '📹 Camera On' : '📷 Off'}</button>
        <button onClick={handleLeave} style={{ padding: '10px 22px', borderRadius: 8, background: '#dc2626', border: 'none', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Leave Meeting</button>
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
