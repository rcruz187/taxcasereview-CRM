// Training — screen-share / training session triage tab
// Lives under CRM Companies in the sidebar nav.
// Full self-contained session: start, screen share, participant list,
// invite link, pop-out monitor window.

import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'

const BASE = '/taxcasereview-CRM'
const PLATFORM_ADMIN_EMAIL = 'romy@taxcasereview.org'

function makeRoomId() {
  return Math.random().toString(36).slice(2, 7).toUpperCase()
}

function ScreenPreview({ stream }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.srcObject = stream || null }, [stream])
  return (
    <video ref={ref} autoPlay playsInline muted
      style={{ width: '100%', maxHeight: 360, objectFit: 'contain',
               display: 'block', background: '#0d1526', borderRadius: '10px 10px 0 0' }} />
  )
}

export default function Training() {
  const { user, showToast } = useApp()
  const allowed = (user?.email || '').toLowerCase() === PLATFORM_ADMIN_EMAIL

  const [sessionActive,    setSessionActive]    = useState(false)
  const [roomId,           setRoomId]           = useState('')
  const [sharingScreen,    setSharingScreen]    = useState(false)
  const [screenStream,     setScreenStream]     = useState(null)
  const [screenLabel,      setScreenLabel]      = useState('')
  const [members,          setMembers]          = useState([])
  const [starting,         setStarting]         = useState(false)
  const [copied,           setCopied]           = useState(false)

  const screenTrackRef = useRef(null)
  const bcRef          = useRef(null)

  useEffect(() => {
    const ch = new BroadcastChannel('tcr-screenshare')
    bcRef.current = ch
    ch.addEventListener('message', e => {
      const { type, ...payload } = e.data || {}
      if (type === 'end')            { doReset() }
      if (type === 'state-snapshot') { setMembers(payload.members || []) }
      if (type === 'screen-state')   { setSharingScreen(payload.sharing) }
    })
    return () => { ch.close(); bcRef.current = null }
  }, [])

  // Clean up on unmount
  useEffect(() => () => { stopScreenShare(false) }, [])

  function doReset() {
    stopScreenShare(false)
    setSessionActive(false)
    setRoomId('')
    setMembers([])
    setSharingScreen(false)
  }

  async function startSession() {
    setStarting(true)
    const id = makeRoomId()
    setRoomId(id)
    setSessionActive(true)
    setStarting(false)
    await doStartScreenShare(id)
  }

  async function doStartScreenShare() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, cursor: 'always' }, audio: true,
      })
      const track    = stream.getVideoTracks()[0]
      const surface  = track.getSettings?.()?.displaySurface
      setScreenLabel(
        surface === 'monitor' ? 'Entire screen' :
        surface === 'window'  ? 'Window' :
        surface === 'browser' ? 'Browser tab' :
        track.label?.slice(0, 40) || 'Screen'
      )
      screenTrackRef.current = track
      setScreenStream(stream)
      setSharingScreen(true)
      track.onended = () => stopScreenShare(true)
      bcRef.current?.postMessage({ type: 'screen-state', host: 'Me', sharing: true })
    } catch (e) {
      if (e.name !== 'NotAllowedError') showToast('Screen share unavailable')
    }
  }

  function stopScreenShare(broadcast = true) {
    if (screenTrackRef.current) {
      screenTrackRef.current.onended = null
      screenTrackRef.current.stop()
      screenTrackRef.current = null
    }
    if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); setScreenStream(null) }
    setSharingScreen(false)
    setScreenLabel('')
    if (broadcast) bcRef.current?.postMessage({ type: 'screen-state', host: 'Me', sharing: false })
  }

  function endSession() {
    stopScreenShare(false)
    bcRef.current?.postMessage({ type: 'end' })
    doReset()
  }

  function openPopout() {
    if (!roomId) return
    const url  = `${window.location.origin}${BASE}/screenshare-host?room=${roomId}&name=Me`
    const w = 960, h = 680
    const left = Math.max(0, window.screen.width - w - 20)
    const top  = Math.max(0, window.screen.height - h - 60)
    window.open(url, `tcr-training-${roomId}`, `width=${w},height=${h},left=${left},top=${top},resizable=yes`)
  }

  function copyLink() {
    const url = `${window.location.origin}${BASE}/screenshare?room=${roomId}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const joinUrl      = `${window.location.origin}${BASE}/screenshare?room=${roomId}`
  const participants = members.filter(n => n !== 'Me (host)').length

  if (!allowed) {
    return (
      <div style={{ padding: '40px 32px', maxWidth: 520 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--tx)' }}>Not available</div>
        <div style={{ color: 'var(--t3)', fontSize: 13.5 }}>This page is platform-level and isn't available from this account.</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 780 }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--tx)', marginBottom: 4 }}>
          🖥️ Training Sessions
        </div>
        <div style={{ fontSize: 13, color: 'var(--t3)' }}>
          Start a live screen-share session with client firms. Participants join via a link — no install required.
        </div>
      </div>

      {/* ── Not started ── */}
      {!sessionActive && (
        <div style={{ background: 'var(--s1)', border: '1px solid var(--br)', borderRadius: 12, padding: 32,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 48, lineHeight: 1 }}>📺</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx)' }}>Ready to train</div>
          <div style={{ fontSize: 13, color: 'var(--t3)', maxWidth: 400, lineHeight: 1.6 }}>
            Start a session, share your screen, then copy the invite link and send it to the firm's staff via Chat, email, or SMS.
          </div>
          <button onClick={startSession} disabled={starting}
            style={{ background: '#2563eb', border: 'none', borderRadius: 10, padding: '12px 28px',
                     color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
                     opacity: starting ? .6 : 1, marginTop: 8 }}>
            {starting ? 'Starting…' : '📺 Start training session'}
          </button>
        </div>
      )}

      {/* ── Active session ── */}
      {sessionActive && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Session header */}
          <div style={{ background: '#1e3a8a', borderRadius: 12, padding: '14px 20px',
                        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }}/>
            <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: 15 }}>
              {sharingScreen ? `Sharing: ${screenLabel}` : 'Session live — not sharing yet'}
            </span>
            <span style={{ fontSize: 12, color: '#93c5fd', fontFamily: 'monospace', letterSpacing: 2 }}>
              {roomId}
            </span>
            <span style={{ fontSize: 12, color: '#86efac' }}>
              · {participants} participant{participants !== 1 ? 's' : ''}
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button onClick={openPopout}
                style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)',
                         borderRadius: 7, padding: '6px 14px', color: '#e2e8f0',
                         cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                ⧉ Pop out
              </button>
              <button onClick={endSession}
                style={{ background: '#dc2626', border: 'none', borderRadius: 7,
                         padding: '6px 14px', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                End session
              </button>
            </div>
          </div>

          {/* Screen preview */}
          <div style={{ border: '1px solid var(--br)', borderRadius: 12, overflow: 'hidden',
                        background: '#0d1526', minHeight: 200 }}>
            {sharingScreen && screenStream
              ? <ScreenPreview stream={screenStream} />
              : (
                <div style={{ minHeight: 200, display: 'flex', alignItems: 'center',
                              justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
                  <span style={{ fontSize: 36, opacity: .3 }}>🖥️</span>
                  <span style={{ color: 'var(--t3)', fontSize: 13 }}>
                    {participants > 0 ? 'Start sharing your screen below' : 'Waiting for participants — share the invite link'}
                  </span>
                </div>
              )}
          </div>

          {/* Controls row */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {!sharingScreen
              ? <button onClick={doStartScreenShare}
                  style={{ background: '#2563eb', border: 'none', borderRadius: 8,
                           padding: '10px 20px', color: '#fff', fontWeight: 700,
                           fontSize: 13, cursor: 'pointer' }}>
                  🖥️ Share screen
                </button>
              : <button onClick={() => stopScreenShare(true)}
                  style={{ background: '#7c3aed', border: 'none', borderRadius: 8,
                           padding: '10px 20px', color: '#fff', fontWeight: 700,
                           fontSize: 13, cursor: 'pointer' }}>
                  ⏹ Stop sharing
                </button>
            }
          </div>

          {/* Invite link */}
          <div style={{ background: 'var(--s1)', border: '1px solid var(--br)', borderRadius: 10,
                        padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase',
                          letterSpacing: '.05em', marginBottom: 8 }}>
              Participant invite link
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, fontSize: 12, color: 'var(--t2)', fontFamily: 'monospace',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            background: 'var(--bg)', border: '1px solid var(--br)', borderRadius: 6,
                            padding: '8px 10px' }}>
                {joinUrl}
              </div>
              <button onClick={copyLink}
                style={{ background: copied ? '#16a34a' : '#2563eb', border: 'none', borderRadius: 8,
                         padding: '8px 16px', color: '#fff', fontWeight: 700,
                         fontSize: 13, cursor: 'pointer', flexShrink: 0, transition: 'background .2s' }}>
                {copied ? '✓ Copied!' : '📋 Copy'}
              </button>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--t3)' }}>
              Share this link in Chat, email, or SMS. Anyone who clicks it joins instantly — no account needed.
            </div>
          </div>

          {/* Participant list */}
          <div style={{ background: 'var(--s1)', border: '1px solid var(--br)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase',
                          letterSpacing: '.05em', marginBottom: 10 }}>
              Connected participants ({participants})
            </div>
            {participants === 0
              ? <div style={{ color: 'var(--t3)', fontSize: 13 }}>No one has joined yet.</div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {members.filter(n => n !== 'Me (host)').map(n => (
                    <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--tx)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }}/>
                      {n}
                    </div>
                  ))}
                </div>
            }
          </div>

        </div>
      )}
    </div>
  )
}
