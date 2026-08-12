import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams }              from 'react-router-dom'
import { FIRM, loadFirmBrandingPublic } from '../lib/firmBranding'
import { useVideoBackground }           from '../lib/videoBackground'
import VirtualBackground                from '../components/VirtualBackground'

function StreamVideo({ stream, muted = false, mirror = false, fit = 'contain' }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.srcObject = stream || null }, [stream])
  return (
    <video ref={ref} autoPlay playsInline muted={muted}
      style={{ width: '100%', height: '100%', objectFit: fit,
               display: 'block', transform: mirror ? 'scaleX(-1)' : 'none', background: '#000' }} />
  )
}

export default function ScreenShareHost() {
  const [params]   = useSearchParams()
  const roomId     = (params.get('room') || '').trim().toUpperCase()
  const hostName   = (params.get('name') || 'Host').trim()
  const urlFirm    = params.get('firm') || ''
  const urlLogo    = params.get('logo') || ''

  const [ready,         setReady]         = useState(false)
  const [ended,         setEnded]         = useState(false)
  const [screenStream,  setScreenStream]  = useState(null)
  const [sharing,       setSharing]       = useState(false)
  const [participants,  setParticipants]  = useState(0)
  const [selfStream,    setSelfStream]    = useState(null)
  const [remoteStreams,  setRemoteStreams] = useState({})
  const [micOn,         setMicOn]         = useState(true)
  const [camOn,         setCamOn]         = useState(true)
  const [showBgPanel,   setShowBgPanel]   = useState(false)
  const [showChat,      setShowChat]      = useState(false)
  const [chatMsgs,      setChatMsgs]      = useState([])
  const [chatInput,     setChatInput]     = useState('')
  const [unread,        setUnread]        = useState(0)
  const [recording,     setRecording]     = useState(false)
  const [recDuration,   setRecDuration]   = useState(0)

  const chatEndRef   = useRef(null)
  const bcRef        = useRef(null)
  const vbg          = useVideoBackground()
  const rawStreamRef = useRef(null)
  const [displayStream, setDisplayStream] = useState(null)

  // Recording refs — plain refs, no stale closures
  const mediaRecRef  = useRef(null)
  const recChunksRef = useRef([])
  const recTimerRef  = useRef(null)
  const recStartRef  = useRef(null)
  const recordingRef = useRef(false)   // mirrors recording state for callbacks

  useEffect(() => { loadFirmBrandingPublic(params.get('t')).finally(() => setReady(true)) }, [])
  useEffect(() => { if (showChat) { setUnread(0); chatEndRef.current?.scrollIntoView({ behavior:'smooth' }) } }, [chatMsgs, showChat])
  useEffect(() => () => { vbg.stopLoop(); clearInterval(recTimerRef.current) }, [])

  function syncFromOpener() {
    try {
      const ctx = window.opener?._tcrScreenShare
      if (!ctx) return
      if (ctx.sharingScreen && ctx.screenStream) {
        setScreenStream(ctx.screenStream); setSharing(true)
      } else {
        setScreenStream(null); setSharing(false)
        // Stop recording if screen share ended
        if (recordingRef.current) stopRecording()
      }
      setParticipants(Math.max(0, ctx.memberCount || 0))
      const incoming = ctx.localStream || null
      if (incoming && incoming !== rawStreamRef.current) {
        rawStreamRef.current = incoming
        if (vbg.bgMode !== 'none') {
          vbg.changeBackground(incoming, vbg.bgMode, vbg.bgPreset, null)
            .then(out => { if (out) setDisplayStream(out) })
        } else { setDisplayStream(incoming) }
      } else if (!incoming) { rawStreamRef.current = null; setDisplayStream(null) }
      setSelfStream(incoming)
      setRemoteStreams(ctx.remoteStreams || {})
      setMicOn(ctx.micOn ?? true)
      setCamOn(ctx.cameraOn ?? true)
    } catch {}
  }

  useEffect(() => {
    const ch = new BroadcastChannel('tcr-screenshare')
    bcRef.current = ch
    ch.addEventListener('message', e => {
      if (e.data?.type === 'end')      { stopRecording(); setEnded(true); setTimeout(() => window.close(), 800) }
      if (e.data?.type === 'screen-state') setTimeout(syncFromOpener, 50)
      if (e.data?.type === 'chat-msg') { setChatMsgs(m => [...m, e.data.msg]); setUnread(u => u + 1) }
    })
    syncFromOpener()
    ch.postMessage({ type: 'request-snapshot' })
    const poll = setInterval(syncFromOpener, 200)
    return () => { ch.close(); clearInterval(poll) }
  }, [])

  // ── Recording ──────────────────────────────────────────────────────────────
  function startRecording() {
    const stream = window.opener?._tcrScreenShare?.screenStream
    if (!stream) return
    recChunksRef.current = []
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9' : 'video/webm'
    try {
      const mr = new MediaRecorder(stream, { mimeType })
      mr.ondataavailable = e => { if (e.data?.size > 0) recChunksRef.current.push(e.data) }
      mr.onstop = saveRecording
      mr.start(1000)
      mediaRecRef.current = mr
      recStartRef.current = Date.now()
      recordingRef.current = true
      setRecording(true)
      setRecDuration(0)
      recTimerRef.current = setInterval(() => {
        setRecDuration(Math.floor((Date.now() - recStartRef.current) / 1000))
      }, 1000)
    } catch (err) { console.error('Recording start failed:', err) }
  }

  function stopRecording() {
    if (!recordingRef.current) return
    recordingRef.current = false
    clearInterval(recTimerRef.current)
    setRecording(false)
    try { mediaRecRef.current?.stop() } catch {}
  }

  async function saveRecording() {
    const chunks = recChunksRef.current
    if (!chunks.length) return
    const blob     = new Blob(chunks, { type: 'video/webm' })
    const ts       = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `training-${roomId}-${ts}.webm`
    // Auto-download
    const url = URL.createObjectURL(blob)
    const a   = Object.assign(document.createElement('a'), { href: url, download: filename })
    a.click(); URL.revokeObjectURL(url)
    // Upload to Supabase storage
    try {
      const { supabase } = await import('../lib/supabase')
      await supabase.storage.from('training-recordings')
        .upload(filename, new File([blob], filename, { type: 'video/webm' }), { upsert: true })
    } catch (err) { console.error('Upload failed:', err) }
  }

  // ── Session controls ───────────────────────────────────────────────────────
  function endSession() {
    stopRecording()
    bcRef.current?.postMessage({ type: 'end' })
    setEnded(true); setTimeout(() => window.close(), 600)
  }
  function toggleMic() { try { window.opener?._tcrScreenShare?.toggleMic?.()    } catch {} }
  function toggleCam() { try { window.opener?._tcrScreenShare?.toggleCamera?.() } catch {} }

  async function handleBgSelect(mode, presetId, customUrl) {
    const raw = rawStreamRef.current; if (!raw) return
    if (mode === 'none') {
      vbg.stopLoop(); setDisplayStream(raw)
      try {
        const t = raw.getVideoTracks()[0]
        if (t) Object.values(window.opener?._tcrScreenShare?.peerConnsRef?.current || {})
          .forEach(pc => pc.getSenders().find(s => s.track?.kind==='video')?.replaceTrack(t).catch(()=>{}))
      } catch {}; return
    }
    const out = await vbg.changeBackground(raw, mode, presetId, customUrl)
    if (!out) return; setDisplayStream(out)
    try {
      const t = out.getVideoTracks()[0]
      if (t) Object.values(window.opener?._tcrScreenShare?.peerConnsRef?.current || {})
        .forEach(pc => pc.getSenders().find(s => s.track?.kind==='video')?.replaceTrack(t).catch(()=>{}))
    } catch {}
  }

  function sendChat() {
    const text = chatInput.trim(); if (!text) return
    const msg = { name: hostName, text, ts: Date.now(), self: true }
    setChatMsgs(m => [...m, msg]); setChatInput('')
    try {
      window.opener?._tcrScreenShare?.channelRef?.current
        ?.send({ type:'broadcast', event:'chat', payload:{ name:hostName, text, ts:msg.ts } }).catch(()=>{})
    } catch {}
    bcRef.current?.postMessage({ type:'chat-msg', msg })
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (ended) return (
    <div style={{ minHeight:'100vh', background:'#000', display:'flex', alignItems:'center',
                  justifyContent:'center', color:'#94a3b8', fontSize:16, fontFamily:'Arial,sans-serif' }}>
      Session ended — closing…
    </div>
  )

  const allCams = [
    { key:'__self__', name:`${hostName} (you)`, stream: displayStream || selfStream, muted:true,  mirror:true  },
    ...Object.entries(remoteStreams).map(([name, stream]) => ({ key:name, name, stream, muted:false, mirror:false }))
  ]

  const fmtTime = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { width: 100%; height: 100%; overflow: hidden; background: #000; }
      `}</style>

      <div style={{ width:'100%', height:'100%', background:'#000', position:'relative',
                    display:'flex', flexDirection:'column', overflow:'hidden', fontFamily:'Arial,sans-serif' }}>

        {/* Screen share area */}
        <div style={{ flex:1, minHeight:0, position:'relative', background:'#000' }}>
          {sharing && screenStream
            ? <StreamVideo stream={screenStream} muted fit="contain" />
            : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center',
                            justifyContent:'center', flexDirection:'column', gap:12, color:'#334155' }}>
                <span style={{ fontSize:48, opacity:.3 }}>🖥️</span>
                <span style={{ fontSize:14 }}>Click "Share screen" in the Training tab</span>
              </div>
          }

          {/* Room info — top left */}
          <div style={{ position:'absolute', top:12, left:12, display:'flex', alignItems:'center', gap:8,
                        background:'rgba(0,0,0,.65)', borderRadius:8, padding:'6px 12px', backdropFilter:'blur(8px)' }}>
            {(urlLogo || (ready && FIRM.logoUrl)) && (
              <img src={urlLogo || FIRM.logoUrl} alt="" style={{ height:22, objectFit:'contain' }}
                onError={e => e.target.style.display='none'} />
            )}
            <span style={{ color:'#f8fafc', fontWeight:700, fontSize:13 }}>
              {urlFirm || (ready ? FIRM.name : 'TaxRes CRM')}
            </span>
            <span style={{ color:'#64748b', fontSize:11 }}>· Room</span>
            <span style={{ color:'#93c5fd', fontFamily:'monospace', fontSize:11, letterSpacing:2 }}>{roomId}</span>
            <span style={{ width:7, height:7, borderRadius:'50%', background:'#22c55e', display:'inline-block' }}/>
            <span style={{ color:'#86efac', fontSize:11 }}>{participants} participant{participants!==1?'s':''}</span>
            {recording && (
              <span style={{ display:'flex', alignItems:'center', gap:5, marginLeft:8 }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:'#ef4444',
                               animation:'pulse 1s infinite', display:'inline-block' }}/>
                <span style={{ color:'#fca5a5', fontSize:11, fontWeight:700 }}>REC {fmtTime(recDuration)}</span>
              </span>
            )}
          </div>

          {/* End session — top right */}
          <button onClick={endSession}
            style={{ position:'absolute', top:12, right:12, background:'#dc2626', border:'none',
                     borderRadius:7, padding:'7px 16px', color:'#fff', cursor:'pointer', fontWeight:700, fontSize:13 }}>
            End session
          </button>

          {/* Background picker */}
          {showBgPanel && (
            <div style={{ position:'absolute', bottom:10, right: showChat ? 316 : 12,
                          width:340, zIndex:100, boxShadow:'0 8px 32px rgba(0,0,0,.8)' }}>
              <VirtualBackground bgMode={vbg.bgMode} bgPreset={vbg.bgPreset}
                segStatus={vbg.segStatus} onSelect={handleBgSelect} />
            </div>
          )}
        </div>

        {/* Camera strip — dynamic tile size based on count */}
        {(() => {
          const count = allCams.length
          const tileW = count <= 2 ? 280 : count <= 4 ? 200 : 160
          const tileH = count <= 2 ? 210 : count <= 4 ? 150 : 120
          return (
            <div style={{ display:'flex', gap:8, padding:'8px 12px', background:'rgba(0,0,0,.85)',
                          flexShrink:0, overflowX:'auto', borderTop:'1px solid rgba(255,255,255,.06)' }}>
              {allCams.map(({ key, name, stream, muted, mirror }) => (
                <div key={key} style={{ width:tileW, height:tileH, borderRadius:8, overflow:'hidden',
                                        background:'#1e293b', position:'relative', flexShrink:0 }}>
                  {stream
                    ? <StreamVideo stream={stream} muted={muted} mirror={mirror} fit="cover" />
                    : <div style={{ width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center' }}>
                        <span style={{ fontSize:22, opacity:.3 }}>📷</span>
                      </div>}
                  <div style={{ position:'absolute',bottom:4,left:6,fontSize:10,color:'#e2e8f0',
                                background:'rgba(0,0,0,.65)',borderRadius:3,padding:'1px 5px',fontWeight:600 }}>
                    {name}
                  </div>
                </div>
              ))}
            </div>
          )
        })()}

        {/* Controls bar */}
        <div style={{ height:60, background:'rgba(15,23,42,.95)', borderTop:'1px solid rgba(255,255,255,.08)',
                      display:'flex', alignItems:'center', gap:8, padding:'0 16px',
                      flexShrink:0, backdropFilter:'blur(12px)' }}>
          {[
            { label: micOn ? '🎙️ Mute'     : '🔇 Unmute',    active: !micOn,     onClick: toggleMic },
            { label: camOn ? '📷 Stop cam' : '📷 Start cam', active: !camOn,     onClick: toggleCam },
            { label: `🎨 Background${vbg.bgMode!=='none'?' ●':''}`, active: showBgPanel, onClick: ()=>setShowBgPanel(v=>!v) },
          ].map(({ label, active, onClick }) => (
            <button key={label} onClick={onClick}
              style={{ flex:1, height:40, background: active ? '#dc2626' : 'rgba(255,255,255,.08)',
                       border:`1px solid ${active ? '#dc2626' : 'rgba(255,255,255,.15)'}`,
                       borderRadius:8, color:'#fff', cursor:'pointer', fontSize:13, fontWeight:700 }}>
              {label}
            </button>
          ))}
          <button onClick={() => recording ? stopRecording() : startRecording()}
            disabled={!sharing}
            style={{ flex:1, height:40,
                     background: recording ? 'rgba(239,68,68,.25)' : 'rgba(255,255,255,.08)',
                     border:`1px solid ${recording ? '#ef4444' : 'rgba(255,255,255,.15)'}`,
                     borderRadius:8, color: recording ? '#fca5a5' : (!sharing ? '#475569' : '#fff'),
                     cursor: sharing ? 'pointer' : 'not-allowed', fontSize:13, fontWeight:700 }}>
            {recording ? `⏹ Stop · ${fmtTime(recDuration)}` : '⏺ Record'}
          </button>
          <button onClick={() => setShowChat(v => !v)}
            style={{ flex:1, height:40, position:'relative',
                     background: showChat ? 'rgba(34,197,94,.2)' : 'rgba(255,255,255,.08)',
                     border:`1px solid ${showChat ? '#22c55e' : 'rgba(255,255,255,.15)'}`,
                     borderRadius:8, color: showChat ? '#86efac' : '#fff',
                     cursor:'pointer', fontSize:13, fontWeight:700 }}>
            💬 Chat
            {unread > 0 && !showChat && (
              <span style={{ position:'absolute',top:6,right:8,background:'#ef4444',color:'#fff',
                             borderRadius:'50%',fontSize:10,fontWeight:800,width:16,height:16,
                             display:'flex',alignItems:'center',justifyContent:'center' }}>{unread}</span>
            )}
          </button>
        </div>

        {/* Chat panel */}
        {showChat && (
          <div style={{ position:'absolute', top:0, right:0, bottom:0, width:300,
                        background:'rgba(15,23,42,.96)', borderLeft:'1px solid rgba(255,255,255,.1)',
                        display:'flex', flexDirection:'column', zIndex:200, backdropFilter:'blur(12px)' }}>
            <div style={{ padding:'14px 16px', borderBottom:'1px solid rgba(255,255,255,.08)',
                          display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:13, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.05em' }}>
                Session Chat
              </span>
              <button onClick={() => setShowChat(false)}
                style={{ background:'none', border:'none', color:'#64748b', cursor:'pointer', fontSize:18, lineHeight:1 }}>×</button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'12px 16px', display:'flex', flexDirection:'column', gap:10 }}>
              {chatMsgs.length === 0 && (
                <div style={{ color:'#334155', fontSize:13, textAlign:'center', marginTop:24 }}>No messages yet.</div>
              )}
              {chatMsgs.map((m, i) => (
                <div key={i} style={{ display:'flex', flexDirection:'column', alignItems: m.self ? 'flex-end' : 'flex-start' }}>
                  <div style={{ fontSize:10, color:'#475569', marginBottom:3, fontWeight:600 }}>{m.name}</div>
                  <div style={{ maxWidth:220, padding:'8px 12px', borderRadius:10, lineHeight:1.5,
                                background: m.self ? '#1d4ed8' : '#1e293b', color:'#f1f5f9', fontSize:13,
                                borderBottomRightRadius: m.self ? 2 : 10, borderBottomLeftRadius: m.self ? 10 : 2 }}>
                    {m.text}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div style={{ padding:'10px 12px', borderTop:'1px solid rgba(255,255,255,.08)', display:'flex', gap:8 }}>
              <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key==='Enter') sendChat() }}
                placeholder="Message participants…"
                style={{ flex:1, background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.15)',
                         borderRadius:8, padding:'8px 10px', color:'#f1f5f9', fontSize:13, outline:'none' }} />
              <button onClick={sendChat} disabled={!chatInput.trim()}
                style={{ background:'#2563eb', border:'none', borderRadius:8, padding:'8px 14px',
                         color:'#fff', fontWeight:700, fontSize:13,
                         cursor: chatInput.trim() ? 'pointer' : 'not-allowed',
                         opacity: chatInput.trim() ? 1 : .4 }}>Send</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
