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
// when they see that joiner appear -- the new joiner never initiates
// offers themselves, only answers. Keeping it one-directional like this
// avoids two sides racing to offer each other at once.
//
// IMPORTANT: membership/offer-triggering runs entirely on Supabase
// presence, not a "joined" broadcast message. A broadcast message is
// only ever delivered to people already subscribed AT THE MOMENT it's
// sent -- so someone who joins the room a few minutes after the first
// person never receives that first person's original "I'm here"
// announcement, and never adds them to the visible member list, even
// though the actual peer connection (triggered by the FIRST person
// reacting to the LATE joiner's own announcement) connects completely
// fine. That mismatch -- a fully connected call with a blank member
// list for whoever joined second -- was confirmed via console logs on
// both sides during testing. Presence doesn't have this gap: a new
// subscriber gets the full current room state on sync, not just events
// from that point forward.

// STUN-only fallback, used immediately while the real (possibly
// TURN-inclusive) servers are being fetched, and if that fetch fails.
// STUN alone only gets you a direct connection -- fine when both people's
// networks allow it, but a real share of real-world pairings (different
// ISPs, corporate firewalls, some cellular/CGNAT setups) can't connect
// directly and silently fail with STUN alone, even though signaling
// (offer/answer) completes successfully. See turn-credentials function.
const FALLBACK_ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] }

// Peer-to-peer mesh has a real practical ceiling -- every extra person
// means everyone else's device has to upload its camera feed one more
// time, with no server to share that load. 6 is comfortably inside what
// most connections/devices can handle; past that, quality degrades for
// everyone in the call, not just the person joining late.
const MAX_PARTICIPANTS = 6

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
  const iceServersRef = useRef(FALLBACK_ICE) // refreshed in join() from turn-credentials
  const fullyJoinedRef = useRef(false) // true only after this client has tracked its own presence


  function createPC(peerName) {
    if (peerConnsRef.current[peerName]) peerConnsRef.current[peerName].close()
    const pc = new RTCPeerConnection(iceServersRef.current)
    peerConnsRef.current[peerName] = pc
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current))
    } else {
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
    pc.onconnectionstatechange = () => {}
    pc.oniceconnectionstatechange = () => {}
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

    // Kick off fetching real (TURN-inclusive) ICE servers in parallel with
    // subscribing below -- by the time anyone actually creates a peer
    // connection (after media + capacity checks), this will have resolved.
    // Never lets a slow/failed fetch block joining -- falls back to the
    // STUN-only default already in iceServersRef.
    const iceServersPromise = supabase.functions.invoke('turn-credentials')
      .then(({ data, error: fnErr }) => {
        if (!fnErr && Array.isArray(data) && data.length) {
          iceServersRef.current = { iceServers: data }
          const hasTurn = data.some(s => (Array.isArray(s.urls) ? s.urls : [s.urls]).some(u => u?.startsWith('turn')))
        } else {
        }
      })
      .catch(() => {})

    // Presence handles three jobs at once here: the capacity headcount
    // check below, the live "who's in this room" member list (correct
    // even for people who joined before me, unlike a broadcast message),
    // and triggering this client to offer to anyone who arrives after me.
    const ch = supabase.channel(`${channelPrefix}:${roomId}`, {
      config: { broadcast: { self: false }, presence: { key: myName } }
    })
    channelRef.current = ch

    ch.on('broadcast', { event: 'signal' }, ({ payload }) => handleSignal(payload))

    let resolveSync
    const firstSync = new Promise(res => { resolveSync = res })
    ch.on('presence', { event: 'sync' }, () => {
      const names = Object.keys(ch.presenceState())
      setMembers(names)
      resolveSync()
    })
    ch.on('presence', { event: 'join' }, ({ key }) => {
      if (key === myNameRef.current) return // that's just my own track() reflecting back
      setMembers(m => m.includes(key) ? m : [...m, key])
      // Only offer if I've actually completed my own join -- a presence
      // diff for someone else could in theory arrive while I'm still
      // mid-setup (before I have local media ready to attach).
      if (fullyJoinedRef.current) createOffer(key)
    })
    ch.on('presence', { event: 'leave' }, ({ key }) => {
      setMembers(m => m.filter(n => n !== key))
      closePeer(key)
    })

    await new Promise(resolve => { ch.subscribe(status => { if (status === 'SUBSCRIBED') resolve() }) })
    await firstSync

    const currentCount = Object.keys(ch.presenceState()).length
    if (currentCount >= MAX_PARTICIPANTS) {
      await supabase.removeChannel(ch)
      channelRef.current = null
      const msg = `This call is full — ${MAX_PARTICIPANTS} people max right now`
      setError(msg)
      return { ok: false, reason: msg }
    }

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
          await supabase.removeChannel(ch)
          channelRef.current = null
          const msg = 'Microphone access denied — check your browser permissions'
          setError(msg)
          return { ok: false, reason: msg }
        }
      } else {
        await supabase.removeChannel(ch)
        channelRef.current = null
        const msg = 'Microphone access denied — check your browser permissions'
        setError(msg)
        return { ok: false, reason: msg }
      }
    }
    localStreamRef.current = stream
    await iceServersPromise // guarantee real ICE servers are set before anyone can offer to us

    await ch.track({ name: myName }) // this IS the announcement now -- triggers presence 'join' for everyone already in the room, who then offer to us
    setMembers(m => m.includes(myName) ? m : [...m, myName])
    fullyJoinedRef.current = true
    setJoined(true)
    return { ok: true }
  }, [channelPrefix])

  const leave = useCallback(async () => {
    fullyJoinedRef.current = false
    if (channelRef.current) {
      await channelRef.current.untrack().catch(() => {})
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
