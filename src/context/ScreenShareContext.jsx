// ScreenShareContext
// App-level screen-share / training session state. Lives alongside CallContext
// so the overlay persists while the user navigates anywhere in the CRM.
//
// A session is a WebRTC peer-to-peer room (same useWebRTCRoom hook already
// used by Huddle and MeetingRoom). Screen capture is added on top: the host
// replaces their video track on every peer connection with a getDisplayMedia
// stream, and viewers see it as normal remote video.
//
// Free, no timeout, no per-minute cost — same model as the existing Huddle.
// TURN relay covers corporate firewalls (Metered Open Relay Project, already
// configured). Sessions are identified by a short room ID the host copies and
// shares (same pattern as /meet/:id).

import { createContext, useContext, useState, useRef, useCallback } from 'react'
import { useWebRTCRoom } from '../lib/webrtcRoom'

const Ctx = createContext(null)
export const useScreenShare = () => useContext(Ctx)

export function ScreenShareProvider({ children }) {
  const [active, setActive]           = useState(false)
  const [roomId, setRoomId]           = useState('')
  const [minimized, setMinimized]     = useState(false)
  const [screenStream, setScreenStream] = useState(null)   // local getDisplayMedia stream
  const [sharingScreen, setSharingScreen] = useState(false)

  const webrtc = useWebRTCRoom('screenshare')
  const screenTrackRef = useRef(null)

  // Generate a short human-readable room code
  function makeRoomId() {
    return Math.random().toString(36).slice(2, 7).toUpperCase()
  }

  // Replace the video track on all open peer connections.
  // Called when the host starts/stops screen share.
  function replacePeerVideoTracks(newTrack) {
    const pcs = webrtc.peerConnsRef.current
    Object.values(pcs).forEach(pc => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video')
      if (sender && newTrack) sender.replaceTrack(newTrack).catch(() => {})
      else if (sender && !newTrack) {
        // No new track — fall back to camera track from localStream
        const camTrack = webrtc.localStreamRef.current?.getVideoTracks()[0]
        if (camTrack) sender.replaceTrack(camTrack).catch(() => {})
      }
    })
  }

  const startSession = useCallback(async (myName) => {
    const id = makeRoomId()
    setRoomId(id)
    setActive(true)
    setMinimized(false)
    const result = await webrtc.join(id, myName, true)
    if (!result.ok) {
      setActive(false)
      return { ok: false, reason: result.reason }
    }
    return { ok: true, roomId: id }
  }, [webrtc])

  const joinSession = useCallback(async (id, myName) => {
    setRoomId(id)
    setActive(true)
    setMinimized(false)
    const result = await webrtc.join(id, myName, true)
    if (!result.ok) {
      setActive(false)
      return { ok: false, reason: result.reason }
    }
    return { ok: true }
  }, [webrtc])

  const startScreenShare = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, cursor: 'always' },
        audio: false,   // system audio often unavailable; camera mic stays active
      })
      const track = stream.getVideoTracks()[0]
      screenTrackRef.current = track
      setScreenStream(stream)
      setSharingScreen(true)

      // When the user clicks "Stop sharing" in the browser's own UI
      track.onended = () => stopScreenShare()

      // Push the screen track to all current peers
      replacePeerVideoTracks(track)

      return { ok: true }
    } catch (e) {
      if (e.name === 'NotAllowedError') return { ok: false, reason: 'Screen share permission denied' }
      return { ok: false, reason: e.message }
    }
  }, [webrtc])

  const stopScreenShare = useCallback(() => {
    if (screenTrackRef.current) {
      screenTrackRef.current.stop()
      screenTrackRef.current = null
    }
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop())
      setScreenStream(null)
    }
    setSharingScreen(false)
    // Restore camera track for all peers
    replacePeerVideoTracks(null)
  }, [screenStream, webrtc])

  const endSession = useCallback(async () => {
    stopScreenShare()
    await webrtc.leave()
    setActive(false)
    setMinimized(false)
    setRoomId('')
    setSharingScreen(false)
  }, [webrtc, stopScreenShare])

  const value = {
    active, minimized, setMinimized,
    roomId,
    webrtc,
    screenStream, sharingScreen,
    startSession, joinSession, startScreenShare, stopScreenShare, endSession,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
