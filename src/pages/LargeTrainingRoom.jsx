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

const SPEAKER_PERMISSIONS = [
  'room.self.audio_mute','room.self.audio_unmute',
  'room.self.video_mute','room.self.video_unmute',
  'room.self.screenshare','room.list_available_layouts',
]

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
  const [memberList, setMemberList] = useState([])
  const [micOn, setMicOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(true)
  const [sharing, setSharing] = useState(false)
  const [recording, setRecording] = useState(false)
  const [showPeople, setShowPeople] = useState(true)
  const [actingOn, setActingOn] = useState('')
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

  async function refreshMembers(room = roomRef.current) {
    if (!room) return
    try {
      const result = await room.getMembers()
      setMemberList(Array.isArray(result?.members) ? result.members : [])
    } catch (_) {}
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
      room.on('room.joined', () => { setJoined(true); refreshMembers(room) })
      room.on('member.joined', () => refreshMembers(room))
      room.on('member.left', () => refreshMembers(room))
      room.on('member.updated', () => refreshMembers(room))
      room.on('room.ended', () => { setJoined(false); setMemberList([]); setError('This training session has ended.') })
      await room.join()
      setJoined(true)
      await refreshMembers(room)
    } catch (e) {
      console.error('Large training join failed', e)
      setError(e?.message || String(e))
    } finally { setJoining(false) }
  }

  async function toggleMic() {
    const room = roomRef.current
    if (!room || !isHost) return
    try { if (micOn) await room.audioMute(); else await room.audioUnmute(); setMicOn(v => !v); await refreshMembers(room) } catch (e) { setError(e?.message || 'Microphone control failed') }
  }
  async function toggleCamera() {
    const room = roomRef.current
    if (!room || !isHost) return
    try { if (cameraOn) await room.videoMute(); else await room.videoUnmute(); setCameraOn(v => !v); await refreshMembers(room) } catch (e) { setError(e?.message || 'Camera control failed') }
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

  async function runMemberAction(member, action) {
    const room = roomRef.current
    if (!room || !isHost || !member?.id) return
    setActingOn(`${member.id}:${action}`); setError('')
    try {
      if (action === 'promote') {
        await room.promote({ memberId: member.id, mediaAllowed:'all', joinAudioMuted:true, joinVideoMuted:true, permissions:SPEAKER_PERMISSIONS })
      } else if (action === 'demote') {
        await room.demote({ memberId: member.id, mediaAllowed:'all' })
      } else if (action === 'mute') {
        await room.audioMute({ memberId: member.id })
      } else if (action === 'camera') {
        await room.videoMute({ memberId: member.id })
      }
      await refreshMembers(room)
    } catch (e) {
      setError(e?.message || `Could not ${action} participant`)
    } finally { setActingOn('') }
  }

  async function leaveRoom() {
    try { if (screenRef.current) await screenRef.current.leave() } catch (_) {}
    try { if (recordingRef.current) await recordingRef.current.stop() } catch (_) {}
    try { await roomRef.current?.leave?.() } catch (_) {}
    roomRef.current = null; screenRef.current = null; recordingRef.current = null
    setJoined(false); setSharing(false); setRecording(false); setMemberList([])
    if (isHost) sessionStorage.removeItem(`romylabs_training_host_${id}`)
  }

  const localMemberId = roomRef.current?.memberId
  const remoteMembers = memberList.filter(m => m.id !== localMemberId)
  const audienceCount = memberList.filter(m => m.type === 'audience').length
  const speakerCount = memberList.filter(m => m.type === 'member').length

  return (
    <div style={{ minHeight:'100vh', background:'#080b14', color:'#e2e8f0', display:'flex', flexDirection:'column' }}>
      <header style={{ minHeight:66, padding:'0 22px', borderBottom:'1px solid rgba(99,102,241,.22)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, background:'rgba(10,15,28,.96)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}><img src="/romylabs-logo.png" alt="RomyLabs" style={{ height:34, maxWidth:150, objectFit:'contain' }} onError={e => { e.currentTarget.style.display='none' }} /><div><div style={{ fontSize:15, fontWeight:900 }}>RomyLabs Live Training</div><div style={{ fontSize:10, color:'#64748b' }}>{isHost ? 'HOST / PRESENTER' : 'ATTENDEE'} · Room {id}</div></div></div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {isHost && joined && <div style={{ fontSize:10, color:'#94a3b8' }}>{speakerCount} speakers · {audienceCount} audience</div>}
          <div style={{ fontSize:12, color:'#86efac', fontWeight:700 }}>● {memberList.length || 0} connected</div>
        </div>
      </header>

      <div style={{ flex:1, minHeight:0, position:'relative', display:'flex' }}>
        <div style={{ flex:1, minWidth:0, position:'relative' }}>
          <div ref={videoRootRef} style={{ display:joined?'block':'none', position:'absolute', inset:14, background:'#020617', border:'1px solid rgba(148,163,184,.14)', borderRadius:14, overflow:'hidden' }} />
          {!joined && <main style={{ minHeight:'calc(100vh - 66px)', display:'grid', placeItems:'center', padding:24 }}>
            <div style={{ width:'100%', maxWidth:460, background:'linear-gradient(145deg,rgba(99,102,241,.14),rgba(15,23,42,.9))', border:'1px solid rgba(99,102,241,.3)', borderRadius:18, padding:26, boxShadow:'0 24px 80px rgba(0,0,0,.35)' }}>
              <div style={{ fontSize:11, color:'#C6FF00', fontWeight:900, letterSpacing:'.08em', marginBottom:7 }}>ROMYLABS TRAINING</div>
              <div style={{ fontSize:24, fontWeight:900, color:'#fff', marginBottom:8 }}>{isHost ? 'Start the live session' : 'Join the live training'}</div>
              <div style={{ fontSize:13, color:'#94a3b8', lineHeight:1.6, marginBottom:18 }}>{isHost ? 'You join as the presenter with camera, microphone, screen sharing, recording, and participant controls.' : 'You will join in watch/listen mode. Your camera and microphone stay off unless the host promotes you to speak.'}</div>
              {!isHost && <><label style={{ display:'block', fontSize:11, color:'#94a3b8', fontWeight:800, marginBottom:6 }}>YOUR NAME</label><input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&joinRoom()} placeholder="Enter your name" style={{ width:'100%', boxSizing:'border-box', background:'#0b1220', border:'1px solid #25344d', color:'#fff', borderRadius:9, padding:'11px 12px', fontSize:14, marginBottom:12 }} /></>}
              {error && <div style={{ fontSize:12, color:'#fca5a5', background:'rgba(127,29,29,.22)', border:'1px solid rgba(248,113,113,.2)', borderRadius:8, padding:'9px 11px', marginBottom:12 }}>{error}</div>}
              <button onClick={joinRoom} disabled={joining || (!isHost && !name.trim())} style={{ width:'100%', border:0, borderRadius:10, padding:'12px 16px', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', fontWeight:900, fontSize:14, cursor:'pointer', opacity: joining ? .7 : 1 }}>{joining ? 'Connecting…' : isHost ? 'Start Training' : 'Join Training'}</button>
            </div>
          </main>}
        </div>

        {joined && isHost && showPeople && <aside style={{ width:330, flexShrink:0, borderLeft:'1px solid rgba(99,102,241,.2)', background:'#0b1020', padding:14, overflowY:'auto' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}><div><div style={{ fontWeight:900, fontSize:14 }}>Participants</div><div style={{ fontSize:10, color:'#64748b' }}>{memberList.length} connected</div></div><button onClick={()=>refreshMembers()} style={miniBtn}>↻</button></div>
          {remoteMembers.length === 0 ? <div style={{ color:'#64748b', fontSize:11, padding:'18px 6px' }}>Invite attendees to see them here.</div> : remoteMembers.map(member => {
            const audience = member.type === 'audience'
            const busy = actingOn.startsWith(member.id)
            return <div key={member.id} style={{ background:'rgba(255,255,255,.035)', border:'1px solid rgba(148,163,184,.12)', borderRadius:9, padding:10, marginBottom:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:8, marginBottom:8 }}><div style={{ minWidth:0 }}><div style={{ fontSize:12, fontWeight:800, color:'#e2e8f0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{member.name || 'Guest'}</div><div style={{ fontSize:9, color:audience?'#94a3b8':'#86efac', textTransform:'uppercase', fontWeight:800 }}>{audience?'Audience':'Speaker'}{!audience && member.audio_muted?' · muted':''}</div></div><span style={{ fontSize:16 }}>{audience?'👤':'🎙️'}</span></div>
              <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                {audience ? <button disabled={busy} onClick={()=>runMemberAction(member,'promote')} style={actionBtn('#16a34a')}>Promote</button> : <><button disabled={busy||member.audio_muted} onClick={()=>runMemberAction(member,'mute')} style={actionBtn('#d97706')}>Mute</button><button disabled={busy||member.video_muted} onClick={()=>runMemberAction(member,'camera')} style={actionBtn('#475569')}>Camera Off</button><button disabled={busy} onClick={()=>runMemberAction(member,'demote')} style={actionBtn('#7c3aed')}>Audience</button></>}
              </div>
            </div>
          })}
        </aside>}
      </div>

      {joined && <footer style={{ padding:'12px 18px 16px', display:'flex', justifyContent:'center', gap:9, flexWrap:'wrap', borderTop:'1px solid rgba(99,102,241,.18)', background:'#0a0f1c' }}>
        {isHost && <><button onClick={toggleMic} style={ctrl(micOn)}>{micOn ? '🎤 Mic On' : '🔇 Muted'}</button><button onClick={toggleCamera} style={ctrl(cameraOn)}>{cameraOn ? '📹 Camera On' : '📷 Camera Off'}</button><button onClick={toggleShare} style={ctrl(sharing)}>{sharing ? '🛑 Stop Share' : '🖥️ Share Screen'}</button><button onClick={toggleRecording} style={ctrl(recording)}>{recording ? '⏹ Stop Recording' : '⏺ Record'}</button><button onClick={()=>setShowPeople(v=>!v)} style={ctrl(showPeople)}>👥 People ({memberList.length})</button></>}
        <button onClick={leaveRoom} style={{ ...ctrl(false), background:'#991b1b', borderColor:'#dc2626', color:'#fff' }}>{isHost ? 'End / Leave' : 'Leave Training'}</button>
      </footer>}
      {joined && error && <div style={{ position:'fixed', bottom:76, left:'50%', transform:'translateX(-50%)', background:'#7f1d1d', border:'1px solid #ef4444', color:'#fff', borderRadius:8, padding:'9px 14px', fontSize:11, zIndex:20 }}>{error}</div>}
    </div>
  )
}

const ctrl = (active) => ({ padding:'9px 14px', borderRadius:8, border:`1px solid ${active?'#6366f1':'#334155'}`, background:active?'rgba(99,102,241,.18)':'#111827', color:'#e2e8f0', fontWeight:700, fontSize:12, cursor:'pointer' })
const miniBtn = { width:28, height:28, borderRadius:7, border:'1px solid #334155', background:'#111827', color:'#cbd5e1', cursor:'pointer' }
const actionBtn = color => ({ border:`1px solid ${color}`, background:`${color}22`, color:'#e2e8f0', borderRadius:6, padding:'5px 7px', fontSize:9, fontWeight:800, cursor:'pointer' })
