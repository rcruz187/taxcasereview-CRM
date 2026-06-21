import { useState, useRef, useCallback } from 'react'
import { supabase } from './supabase'

// Shared peer-to-peer WebRTC room logic, used by both the internal team
// Huddle (Chat.jsx) and the public client Meeting Room (MeetingRoom.jsx).
// Browser-to-browser audio/video -- Supabase Realtime only relays the
// small signaling messages (who's here, SDP offers/answers, ICE
// candidates), never the actual media. No third-party calling service,
// no per-minute or per-seat cost. This is the exact same approach
// Chat.jsx's original audio-only Huddle already used in production,
// pulled out here so it isn't duplicated between two screens, and
// extended to carry video too.
//
// Signaling pattern (preserved exactly from the original Huddle):
// only members ALREADY in the room create an offer toward a new joiner
// when they see that joiner's "joined" broadcast -- the new joiner never
// initiates offers themselves, only answers. Keeping it one-directional
// like this avoids two sides racing to offer each other at once.

const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] }

export function useWebRTCRoom(channelPrefix) {
  const [members, setMembers] = useState([])
  const [remoteStreams, setRemoteStreams] = useState({}) // { name: MediaStream }
  const [micOn, setMicOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(true)
  const [joined, setJoined] = useState(false)
  const [error, setError] = useState('')

  const localStreamRef = useRef(null)
  const peerConnsRef = useRef({})
  const channelRef = useRef(null)
  const myNameRef = useRef('')

  function createPC(peerName) {
    if (peerConnsRef.current[peerName]) peerConnsRef.current[peerName].close()
    const pc = new RTCPeerConnection(ICE)
    peerConnsRef.current[peerName] = pc
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current))
    }
    pc.ontrack = (e) => {
      setRemoteStreams(prev => ({ ...prev, [peerName]: e.streams[0] }))
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        channelRef.current?.send({
          type: 'broadcast', event: 'signal',
          payload: { from: myNameRef.current, to: peerName, type: 'ice', candidate: e.candidate }
        })
      }
    }
    return pc
  }

  async function createOffer(peerName) {
    const pc = createPC(peerName)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    channelRef.current?.send({
      type: 'broadcast', event: 'signal',
      payload: { from: myNameRef.current, to: peerName, type: 'offer', sdp: offer.sdp }
    })
  }

  async function handleSignal({ from, to, type, sdp, candidate }) {
    if (to !== myNameRef.current) return
    if (type === 'offer') {
      const pc = createPC(from)
      await pc.setRemoteDescription({ type: 'offer', sdp })
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      channelRef.current?.send({
        type: 'broadcast', event: 'signal',
        payload: { from: myNameRef.current, to: from, type: 'answer', sdp: answer.sdp }
      })
    } else if (type === 'answer') {
      const pc = peerConnsRef.current[from]
      if (pc) await pc.setRemoteDescription({ type: 'answer', sdp })
    } else if (type === 'ice') {
      const pc = peerConnsRef.current[from]
      if (pc && candidate) await pc.addIceCandidate(candidate)
    }
  }

  function closePeer(name) {
    if (peerConnsRef.current[name]) { peerConnsRef.current[name].close(); delete peerConnsRef.current[name] }
    setRemoteStreams(prev => (name in prev ? (() => { const n = { ...prev }; delete n[name]; return n })() : prev))
  }

  const join = useCallback(async (roomId, myName, withVideo = true) => {
    myNameRef.current = myName
    setError('')
    let stream = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: withVideo })
    } catch (e) {
      if (withVideo) {
        // Camera blocked/unavailable -- still join with audio rather than
        // failing the whole call over it.
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
          setCameraOn(false)
          setError('Camera unavailable — joined with audio only')
        } catch {
          setError('Microphone access denied — check your browser permissions')
          return false
        }
      } else {
        setError('Microphone access denied — check your browser permissions')
        return false
      }
    }
    localStreamRef.current = stream

    const ch = supabase.channel(`${channelPrefix}:${roomId}`, { config: { broadcast: { self: false } } })
    channelRef.current = ch
    ch.on('broadcast', { event: 'signal' }, ({ payload }) => handleSignal(payload))
    ch.on('broadcast', { event: 'joined' }, ({ payload }) => {
      setMembers(m => m.includes(payload.name) ? m : [...m, payload.name])
      createOffer(payload.name)
    })
    ch.on('broadcast', { event: 'left' }, ({ payload }) => {
      setMembers(m => m.filter(n => n !== payload.name))
      closePeer(payload.name)
    })
    await ch.subscribe()
    await ch.send({ type: 'broadcast', event: 'joined', payload: { name: myName } })
    setMembers(m => m.includes(myName) ? m : [...m, myName])
    setJoined(true)
    return true
  }, [channelPrefix])

  const leave = useCallback(async () => {
    if (channelRef.current) {
      await channelRef.current.send({ type: 'broadcast', event: 'left', payload: { name: myNameRef.current } })
      await supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
    Object.keys(peerConnsRef.current).forEach(closePeer)
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop())
      localStreamRef.current = null
    }
    setMembers([]); setRemoteStreams({}); setJoined(false)
  }, [])

  function toggleMic() {
    const track = localStreamRef.current?.getAudioTracks()[0]
    if (track) { track.enabled = !track.enabled; setMicOn(track.enabled) }
  }
  function toggleCamera() {
    const track = localStreamRef.current?.getVideoTracks()[0]
    if (track) { track.enabled = !track.enabled; setCameraOn(track.enabled) }
  }

  return {
    members, remoteStreams, micOn, cameraOn, joined, error,
    localStreamRef, join, leave, toggleMic, toggleCamera,
  }
}
