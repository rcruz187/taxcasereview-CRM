// ScreenShareContext — app-level training/screen-share session state.
//
// KEY FIX: When the host starts/stops screen sharing, we broadcast a
// 'screen-state' event over the Supabase Realtime channel so joiners
// know which peer's video track is the screen — no resolution guessing.
// The joining page subscribes to the same channel and gets a { host, sharing }
// payload it can use to route the right stream to the main tile.

import { createContext, useContext, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
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
  // { hostName, sharing } — received from broadcast, used by overlay too
  const [remoteScreenState, setRemoteScreenState] = useState(null)

  const webrtc         = useWebRTCRoom('screenshare')
  const screenTrackRef = useRef(null)
  const roomIdRef      = useRef('')

  // stateRef lets plain functions read current state without stale closures
  const stateRef = useRef({})
  stateRef.current = { webrtc, screenStream, roomId }

  // ── Broadcast that we started/stopped sharing so joiners can route correctly ──
  function broadcastScreenState(sharing, myName) {
    const ch = stateRef.current.webrtc.channelRef?.current
    if (!ch) return
    ch.send({
      type: 'broadcast',
      event: 'screen-state',
      payload: { host: myName, sharing },
    }).catch(() => {})
  }

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

  function doStopScreenShare(myName) {
    if (screenTrackRef.current) {
      screenTrackRef.current.stop()
      screenTrackRef.current = null
    }
    const ss = stateRef.current.screenStream
    if (ss) { ss.getTracks().forEach(t => t.stop()); setScreenStream(null) }
    setSharingScreen(false)
    replacePeerTracks(null)
    if (myName) broadcastScreenState(false, myName)
  }

  async function startSession(myName) {
    const id = makeRoomId()
    roomIdRef.current = id
    setRoomId(id)
    setActive(true)
    setMinimized(false)
    const result = await webrtc.join(id, myName, true)
    if (!result.ok) { setActive(false); return { ok: false, reason: result.reason } }

    // Also listen for incoming screen-state broadcasts (so the host panel
    // can react if a remote participant starts sharing)
    webrtc.channelRef?.current?.on('broadcast', { event: 'screen-state' }, ({ payload }) => {
      setRemoteScreenState(payload)
    })

    return { ok: true, roomId: id }
  }

  async function joinSession(id, myName) {
    roomIdRef.current = id
    setRoomId(id)
    setActive(true)
    setMinimized(false)
    const result = await webrtc.join(id, myName, true)
    if (!result.ok) { setActive(false); return { ok: false, reason: result.reason } }
    return { ok: true }
  }

  async function startScreenShare(myName) {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, cursor: 'always', displaySurface: 'monitor' },
        audio: true,
      })
      const track = stream.getVideoTracks()[0]
      // Read actual surface type for the label
      const settings   = track.getSettings?.() || {}
      const surface    = settings.displaySurface  // 'monitor' | 'window' | 'browser'
      track._surface   = surface  // stash for the label reader in the overlay

      screenTrackRef.current = track
      setScreenStream(stream)
      setSharingScreen(true)
      track.onended = () => doStopScreenShare(myName)
      replacePeerTracks(track)
      broadcastScreenState(true, myName)
      return { ok: true }
    } catch (e) {
      if (e.name === 'NotAllowedError') return { ok: false, reason: 'Permission denied' }
      return { ok: false, reason: e.message }
    }
  }

  async function endSession(myName) {
    doStopScreenShare(myName)
    await webrtc.leave()
    setActive(false); setMinimized(false); setRoomId(''); setSharingScreen(false)
    setRemoteScreenState(null)
  }

  const value = {
    active, minimized, setMinimized, roomId, webrtc,
    screenStream, sharingScreen, remoteScreenState,
    startSession, joinSession,
    startScreenShare, stopScreenShare: doStopScreenShare, endSession,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
