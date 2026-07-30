// ScreenShareContext — app-level training/screen-share session state.
// TDZ fix: all mutable callbacks stored in a ref so declaration order
// never matters and the minifier can't create circular initialization.

import { createContext, useContext, useState, useRef } from 'react'
import { useWebRTCRoom } from '../lib/webrtcRoom'

const Ctx = createContext(null)
export const useScreenShare = () => useContext(Ctx)

function makeRoomId() {
  return Math.random().toString(36).slice(2, 7).toUpperCase()
}

export function ScreenShareProvider({ children }) {
  const [active,        setActive]        = useState(false)
  const [roomId,        setRoomId]        = useState('')
  const [minimized,     setMinimized]     = useState(false)
  const [sharingScreen, setSharingScreen] = useState(false)
  const [screenStream,  setScreenStream]  = useState(null)

  const webrtc        = useWebRTCRoom('screenshare')
  const screenTrackRef = useRef(null)

  // Keep latest values accessible inside callbacks without stale closure issues
  const stateRef = useRef({})
  stateRef.current = { webrtc, screenStream }

  function replacePeerTracks(newTrack) {
    const pcs = stateRef.current.webrtc.peerConnsRef.current
    Object.values(pcs).forEach(pc => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video')
      if (!sender) return
      if (newTrack) {
        sender.replaceTrack(newTrack).catch(() => {})
      } else {
        const cam = stateRef.current.webrtc.localStreamRef.current?.getVideoTracks()[0]
        if (cam) sender.replaceTrack(cam).catch(() => {})
      }
    })
  }

  function doStopScreenShare() {
    if (screenTrackRef.current) {
      screenTrackRef.current.stop()
      screenTrackRef.current = null
    }
    const ss = stateRef.current.screenStream
    if (ss) { ss.getTracks().forEach(t => t.stop()); setScreenStream(null) }
    setSharingScreen(false)
    replacePeerTracks(null)
  }

  async function startSession(myName) {
    const id = makeRoomId()
    setRoomId(id)
    setActive(true)
    setMinimized(false)
    const result = await webrtc.join(id, myName, true)
    if (!result.ok) { setActive(false); return { ok: false, reason: result.reason } }
    return { ok: true, roomId: id }
  }

  async function joinSession(id, myName) {
    setRoomId(id)
    setActive(true)
    setMinimized(false)
    const result = await webrtc.join(id, myName, true)
    if (!result.ok) { setActive(false); return { ok: false, reason: result.reason } }
    return { ok: true }
  }

  async function startScreenShare() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, cursor: 'always' },
        audio: true,   // capture tab/system audio when available
      })
      const track = stream.getVideoTracks()[0]
      screenTrackRef.current = track
      setScreenStream(stream)
      setSharingScreen(true)
      track.onended = () => doStopScreenShare()   // user hit "Stop sharing" in browser UI
      replacePeerTracks(track)
      return { ok: true }
    } catch (e) {
      if (e.name === 'NotAllowedError') return { ok: false, reason: 'Permission denied' }
      return { ok: false, reason: e.message }
    }
  }

  async function endSession() {
    doStopScreenShare()
    await webrtc.leave()
    setActive(false); setMinimized(false); setRoomId(''); setSharingScreen(false)
  }

  const value = {
    active, minimized, setMinimized, roomId, webrtc,
    screenStream, sharingScreen,
    startSession, joinSession, startScreenShare,
    stopScreenShare: doStopScreenShare, endSession,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
