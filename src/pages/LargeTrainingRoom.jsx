import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

let sdkPromise = null
function loadSignalWireSdk() {
  if (window.SignalWire?.Video?.RoomSession) return Promise.resolve(window.SignalWire)
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-romylabs-signalwire-video]')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.SignalWire), { once: true })
      existing.addEventListener('error', () => reject(new Error('Could not load video SDK')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = 'https://cdn.signalwire.com/@signalwire/js'
    script.async = true
    script.dataset.romylabsSignalwireVideo = '1'
    script.onload = () => window.SignalWire?.Video?.RoomSession ? resolve(window.SignalWire) : reject(new Error('Video SDK did not initialize'))
    script.onerror = () => reject(new Error('Could not load video SDK'))
    document.head.appendChild(script)
  })
  return sdkPromise
}

export default function LargeTrainingRoom() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const invite = params.get('invite') || ''
  const hostToken = sessionStorage.getItem(`romylabs_training_host_${id}`) || ''
  const isHost = !!hostToken
  const [name, setName] = useState(isHost ? 'RomyLabs Host' : '')
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)
  const [error, setError] = useState('')
  const [members, setMembers] = useState(0)
  const [micOn, setMicOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(true)
  const [sharing, setSharing] = useState(false)
  const [recording, setRecording] = useState(false)
  const roomRef = useRef(null)
  const screenRef = useRef(null)
  const recordingRef = useRef(null)
  const videoRootRef = useRef(null)

  useEffect(() => () => {
    try { screenRef.current?.leave?.() } catch (_) {}
    try { recordingRef.current?.stop?.() } catch (_) {}
    try { roomRef.current?.leave?.() } catch (_) {}
  }, [])

  async function getAttendeeToken() {
    const { data, error: fnError } = await supabase.functions.invoke('turn-credentials', { body: { action: 'training-join', invite, name: name.trim() } })
    if (fnError || data?.error || !data?.token) throw new Error(data?.error || fnError?.message || 'Could not join training')
    return data.token
  }

  async function joinRoom() {
    if (!isHost && !name.trim()) return
    if (!isHost && !invite) { setError('This training link is missing its invite token.'); return }
    setJoining(true); setError('')
    try {
      const SignalWire = await loadSignalWireSdk()
      const token = isHost ? hostToken : await getAttendeeToken()
      if (!videoRootRef.current) throw new Error('Training video surface is not ready')
      const room = new SignalWire.Video.RoomSession({ token, rootElement: videoRootRef.current })
      roomRef.current = room
      room.on('room.joined', () => { setJoined(true); setMembers(m => Math.max(1, m)) })
      room.on('member.joined', () => setMembers(m => m + 1))
      room.on('member.left', () => setMembers(m => Math.max(1, m - 1)))
      room.on('room.ended', () => { setJoined(false); setError('This training session has ended.') })
      await room.join()
      setJoined(true)
      setMembers(m => Math.max(1, m))
    } catch (e) {
      console.error('Large training join failed', e)
      setError(e?.message || String(e))
    } finally { setJoining(false) }
  }

  async function toggleMic() {
    const room = roomRef.current
    if (!room || !isHost) return
    try { if (micOn) await room.audioMute(); else await room.audioUnmute(); setMicOn(v => !v) } catch (e) { setError(e?.message || 'Microphone control failed') }
  }
  async function toggleCamera() {
    const room = roomRef.current
    if (!room || !isHost) return
    try { if (cameraOn) await room.videoMute(); else await room.videoUnmute(); setCameraOn(v => !v) } catch (e) { setError(e?.message || 'Camera control failed') }
  }
  async function toggleShare() {
    const room = roomRef.current
    if (!room || !isHost) return
    try {
      if (screenRef.current) { await screenRef.current.leave(); screenRef.current = null; setSharing(false) }
      else { screenRef.current = await room.startScreenShare({ audio: true, video: true }); setSharing(true) }
    } catch (e) { setError(e?.message || 'Screen sharing failed') }
  }
  async function toggleRecording() {
    const room = roomRef.current
    if (!room || !isHost) return
    try {
      if (recordingRef.current) { await recordingRef.current.stop(); recordingRef.current = null; setRecording(false) }
      else { recordingRef.current = await room.startRecording(); setRecording(true) }
    } catch (e) { setError(e?.message || 'Recording control failed') }
  }
  async function leaveRoom() {
    try { if (screenRef.current) await screenRef.current.leave() } catch (_) {}
    try { if (recordingRef.current) await recordingRef.current.stop() } catch (_) {}
    try { await roomRef.current?.leave?.() } catch (_) {}
    roomRef.current = null; screenRef.current = null; recordingRef.current = null
    setJoined(false); setSharing(false); setRecording(false); setMembers(0)
    if (isHost) sessionStorage.removeItem(`romylabs_training_host_${id}`)
  }

  return (
    <div style={{ minHeight:'100vh', background:'#080b14', color:'#e2e8f0', display:'flex', flexDirection:'column' }}>
      <header style={{ minHeight:66, padding:'0 22px', borderBottom:'1px solid rgba(99,102,241,.22)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, background:'rgba(10,15,28,.96)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}><img src="/romylabs-logo.png" alt="RomyLabs" style={{ height:34, maxWidth:150, objectFit:'contain' }} onError={e => { e.currentTarget.style.display='none' }} /><div><div style={{ fontSize:15, fontWeight:900 }}>RomyLabs Live Training</div><div style={{ fontSize:10, color:'#64748b' }}>{isHost ? 'HOST / PRESENTER' : 'ATTENDEE'} · Room {id}</div></div></div>
        <div style={{ fontSize:12, color:'#86efac', fontWeight:700 }}>● {members || 0} connected</div>
      </header>

      <div style={{ flex:1, minHeight:0, position:'relative' }}>
        <div ref={videoRootRef} style={{ display:joined?'block':'none', position:'absolute', inset:14, background:'#020617', border:'1px solid rgba(148,163,184,.14)', borderRadius:14, overflow:'hidden' }} />
        {!joined && <main style={{ minHeight:'calc(100vh - 66px)', display:'grid', placeItems:'center', padding:24 }}>
          <div style={{ width:'100%', maxWidth:460, background:'linear-gradient(145deg,rgba(99,102,241,.14),rgba(15,23,42,.9))', border:'1px solid rgba(99,102,241,.3)', borderRadius:18, padding:26, boxShadow:'0 24px 80px rgba(0,0,0,.35)' }}>
            <div style={{ fontSize:11, color:'#C6FF00', fontWeight:900, letterSpacing:'.08em', marginBottom:7 }}>ROMYLABS TRAINING</div>
            <div style={{ fontSize:24, fontWeight:900, color:'#fff', marginBottom:8 }}>{isHost ? 'Start the live session' : 'Join the live training'}</div>
            <div style={{ fontSize:13, color:'#94a3b8', lineHeight:1.6, marginBottom:18 }}>{isHost ? 'You join as the presenter with camera, microphone, screen sharing, and recording controls.' : 'You will join in watch/listen mode. Your camera and microphone stay off unless the host promotes you to speak.'}</div>
            {!isHost && <><label style={{ display:'block', fontSize:11, color:'#94a3b8', fontWeight:800, marginBottom:6 }}>YOUR NAME</label><input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&joinRoom()} placeholder="Enter your name" style={{ width:'100%', boxSizing:'border-box', background:'#0b1220', border:'1px solid #25344d', color:'#fff', borderRadius:9, padding:'11px 12px', fontSize:14, marginBottom:12 }} /></>}
            {error && <div style={{ fontSize:12, color:'#fca5a5', background:'rgba(127,29,29,.22)', border:'1px solid rgba(248,113,113,.2)', borderRadius:8, padding:'9px 11px', marginBottom:12 }}>{error}</div>}
            <button onClick={joinRoom} disabled={joining || (!isHost && !name.trim())} style={{ width:'100%', border:0, borderRadius:10, padding:'12px 16px', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', fontWeight:900, fontSize:14, cursor:'pointer', opacity:joining?.7:1 }}>{joining ? 'Connecting…' : isHost ? 'Start Training' : 'Join Training'}</button>
          </div>
        </main>}
      </div>

      {joined && <footer style={{ padding:'12px 18px 16px', display:'flex', justifyContent:'center', gap:9, flexWrap:'wrap', borderTop:'1px solid rgba(99,102,241,.18)', background:'#0a0f1c' }}>
        {isHost && <><button onClick={toggleMic} style={ctrl(micOn)}>{micOn ? '🎤 Mic On' : '🔇 Muted'}</button><button onClick={toggleCamera} style={ctrl(cameraOn)}>{cameraOn ? '📹 Camera On' : '📷 Camera Off'}</button><button onClick={toggleShare} style={ctrl(sharing)}>{sharing ? '🛑 Stop Share' : '🖥️ Share Screen'}</button><button onClick={toggleRecording} style={ctrl(recording)}>{recording ? '⏹ Stop Recording' : '⏺ Record'}</button></>}
        <button onClick={leaveRoom} style={{ ...ctrl(false), background:'#991b1b', borderColor:'#dc2626', color:'#fff' }}>{isHost ? 'End / Leave' : 'Leave Training'}</button>
      </footer>}
    </div>
  )
}

const ctrl = (active) => ({ padding:'9px 14px', borderRadius:8, border:`1px solid ${active?'#6366f1':'#334155'}`, background:active?'rgba(99,102,241,.18)':'#111827', color:'#e2e8f0', fontWeight:700, fontSize:12, cursor:'pointer' })
