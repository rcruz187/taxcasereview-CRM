import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { Relay } from '@signalwire/js'
import { supabase } from '../lib/supabase'
import { useApp } from './AppContext'
import { playSound } from '../lib/notifySound'

// ──────────────────────────────────────────────────────────────────────
// This used to live entirely inside Dialer.jsx. The problem: React
// unmounts a page's component the instant you navigate away from it,
// and the old code's cleanup function called relayRef.current?.disconnect()
// on unmount — so clicking ANY other sidebar tab during a call killed the
// call, and (just as bad) killed the "office" RELAY registration itself,
// which is exactly why inbound calls had nothing to ring into unless the
// Dialer tab happened to be the active page at that exact moment.
//
// Fix: the connection + live call state now live here, in a Provider
// mounted once at the Shell level (outside <Routes>), so navigating
// between pages no longer touches it. It only disconnects on a real
// logout/app close.
// ──────────────────────────────────────────────────────────────────────

const CallContext = createContext(null)
export function useCall() { return useContext(CallContext) }

const OUTCOMES = ['Connected', 'No Answer', 'Voicemail', 'Wrong Number', 'Callback Requested', 'Converted']
const BLANK_LOG = { outcome: 'Connected', notes: '', duration: '' }

function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = (sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// Matches an inbound caller's number against Clients and Leads by the
// last 10 digits, so formatting differences ("+1 561...", "(561)...",
// "561-310-2931") all still match. Small dataset (a tax firm's CRM), so
// pulling both tables and comparing in JS is simple and fast enough —
// worth revisiting with an indexed lookup only if the client list grows
// into the thousands.
async function matchCallerToRecord(rawNumber) {
  const digits = (rawNumber || '').replace(/\D/g, '')
  const last10 = digits.slice(-10)
  if (last10.length < 7) return null

  const [{ data: clients }, { data: leads }] = await Promise.all([
    supabase.from('clients').select('id, name, phone, phone2').limit(3000),
    supabase.from('leads').select('id, name, first, last, phone').limit(3000),
  ])
  const isMatch = (p) => !!p && p.replace(/\D/g, '').slice(-10) === last10

  const client = clients?.find(c => isMatch(c.phone) || isMatch(c.phone2))
  if (client) return { entityType: 'client', id: client.id, name: client.name }

  const lead = leads?.find(l => isMatch(l.phone))
  if (lead) return { entityType: 'lead', id: lead.id, name: lead.name || `${lead.first || ''} ${lead.last || ''}`.trim() }

  return null
}

export function CallProvider({ children }) {
  const { user } = useApp()
  const [relayStatus, setRelayStatus] = useState('connecting')
  const [incomingCall, setIncomingCall] = useState(null)
  const [incomingMatch, setIncomingMatch] = useState(null) // {entityType,id,name} while ringing, or null
  const [calling, setCalling] = useState(false)
  const [active, setActive] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [logForm, setLogForm] = useState(BLANK_LOG)
  const [logModal, setLogModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [callToast, setCallToast] = useState('')

  const relayRef = useRef(null)
  const liveCallRef = useRef(null)
  const callerNumberRef = useRef(null)
  const activeConferenceRef = useRef(null)
  const activeInboundCallsidRef = useRef(null)
  const uiStartedRef = useRef(false)
  const elapsedRef = useRef(0)
  const incomingMatchRef = useRef(null)
  const timerRef = useRef(null)
  // Inbound calls no longer arrive as a real RELAY call object (the
  // inbound Verto dial was confirmed dead after a full day of testing —
  // it fails in 0 seconds every time, regardless of registration state).
  // Instead, receive-call holds the caller in a conference and writes a
  // row to incoming_calls; we poll for it here and "answer" by having the
  // browser dial itself (the same outbound mechanism that's reliable all
  // day), which receive-call recognizes and bridges straight into that
  // conference. These three refs track that flow.
  const pendingInboundRef = useRef(null)
  const lastHandledInboundRef = useRef(null)
  const inboundTimeoutRef = useRef(null)
  const ringIntervalRef = useRef(null)
  const ringAudioRef = useRef(null)
  // Backup confirmation that an outbound call has actually ended, started
  // explicitly inside startCall() once the conference name is known
  // (rather than a useEffect keyed on `calling` -- that state flips true
  // synchronously, before activeConferenceRef is populated a moment
  // later, so an effect watching `calling` would check the ref before it
  // was ever set). Cleared in finalizeCallEnd alongside everything else.
  const outboundPollRef = useRef(null)

  function stopRing() {
    if (ringIntervalRef.current) { clearInterval(ringIntervalRef.current); ringIntervalRef.current = null }
    if (ringAudioRef.current) { try { ringAudioRef.current.pause(); ringAudioRef.current.currentTime = 0 } catch(_) {} }
  }

  // Ending a call needs to be CONFIRMED, not fire-and-forget -- a call
  // that silently fails to disconnect on SignalWire's side leaves the
  // other party's phone connected indefinitely with no indication
  // anything went wrong. Retries a couple of times before giving up and
  // warning staff to check manually, rather than trusting a single
  // attempt that could fail for an ordinary transient reason (network
  // blip, SignalWire API hiccup).
  async function endConferenceWithRetry(conferenceName, attempt = 1) {
    const { data, error } = await supabase.functions.invoke('end-conference', { body: { conferenceName } })
    if (error || data?.error) {
      if (attempt < 3) {
        setTimeout(() => endConferenceWithRetry(conferenceName, attempt + 1), 2000)
      } else {
        showCallToast('⚠️ Could not confirm the call actually ended — check your phone, it may still be connected.')
      }
    }
  }

  useEffect(() => { elapsedRef.current = elapsed }, [elapsed])

  function showCallToast(msg) { setCallToast(msg); setTimeout(() => setCallToast(''), 4000) }

  useEffect(() => {
    let disposed = false
    let audioEl = document.createElement('audio')
    audioEl.id = 'sw-remote-audio'
    audioEl.autoplay = true
    document.body.appendChild(audioEl)

    let reconnectTimer = null
    function scheduleReconnect() {
      if (disposed || reconnectTimer) return
      reconnectTimer = setTimeout(() => { reconnectTimer = null; connect() }, 3000)
    }

    async function connect() {
      if (disposed) return
      setRelayStatus('connecting')
      const { data, error } = await supabase.functions.invoke('signalwire-relay-token')
      if (disposed) return
      if (error || !data?.jwt_token) {
        setRelayStatus('error')
        showCallToast('Could not connect calling: ' + (data?.error || error?.message || 'unknown error'))
        scheduleReconnect()
        return
      }
      callerNumberRef.current = data.caller_number

      const client = new Relay({ project: data.project_id, token: data.jwt_token })
      client.remoteElement = 'sw-remote-audio'

      client.on('signalwire.ready', () => { console.log('%c[RELAY] ready — registered as "office"', 'color:lime'); setRelayStatus('ready') })
      client.on('signalwire.error', (e) => { setRelayStatus('error'); console.error('[RELAY] error', e); scheduleReconnect() })
      client.on('signalwire.socket.close', () => { setRelayStatus('error'); console.warn('[RELAY] socket closed — reconnecting in 3s'); scheduleReconnect() })
      client.on('signalwire.socket.error', (e) => { setRelayStatus('error'); console.error('[RELAY] socket error', e); scheduleReconnect() })
      client.on('blade.disconnect', () => { setRelayStatus('error'); console.warn('[RELAY] disconnected — reconnecting in 3s'); scheduleReconnect() })
      client.on('signalwire.notification', (n) => {
        console.log('[RELAY] notification received:', n.type, n)
        if (n.type !== 'callUpdate') return
        const call = n.call
        console.log('[RELAY] callUpdate — direction:', call.direction, '| state:', call.state, '| from:', call.options?.remoteCallerNumber)
        if (call.state === 'active' && !uiStartedRef.current) {
          uiStartedRef.current = true
          setIncomingCall(null)
          stopRing()
          setCalling(true)
          setElapsed(0)
          setLogForm(BLANK_LOG)
          timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
          const m = incomingMatchRef.current
          setActive(prev => prev || {
            id: m?.id ?? null,
            name: m?.name || 'Incoming Call',
            first: 'Incoming', last: 'Call',
            phone: call.options?.remoteCallerNumber || '—',
            status: 'Manual',
            entityType: m?.entityType || null,
          })
        }
        if (call.state === 'hangup' || call.state === 'destroy') {
          setIncomingCall(null)
          setIncomingMatch(null)
          stopRing()
          if (liveCallRef.current === call) {
            finalizeCallEnd({ alreadyHungUp: true })
            handleRemoteHangup()
          }
        }
      })

      client.connect()
      relayRef.current = client
    }

    connect()

    return () => {
      disposed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      relayRef.current?.disconnect()
      audioEl?.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Polls for inbound calls being held by receive-call/ivr-route (see
  // those functions' comments for why — the direct Verto dial-in is
  // dead). When a new 'ringing' row shows up, show the same banner UI as
  // before and start a 15-second window (matches the auto-attendant's
  // "ring ~3 times" spec); if nobody answers in time, redirect-to-
  // voicemail pulls the caller out to the voicemail prompt automatically.
  useEffect(() => {
    if (relayStatus !== 'ready') return
    let cancelled = false

    const poll = setInterval(async () => {
      if (cancelled) return

      // If we have a pending inbound call, check if caller hung up (row flipped to missed)
      if (pendingInboundRef.current && !calling) {
        const { data: check } = await supabase
          .from('incoming_calls')
          .select('status')
          .eq('callsid', pendingInboundRef.current.callsid)
          .maybeSingle()
        if (check?.status === 'missed' || check?.status === 'completed') {
          console.log('[poll] caller hung up — clearing banner, status:', check.status)
          if (inboundTimeoutRef.current) { clearTimeout(inboundTimeoutRef.current); inboundTimeoutRef.current = null }
          pendingInboundRef.current = null
          setIncomingCall(null)
          setIncomingMatch(null)
          stopRing()
          return
        }
      }

      if (pendingInboundRef.current || calling) return
      const { data, error } = await supabase
        .from('incoming_calls')
        .select('callsid, conference_name, from_number, department, created_at')
        .eq('status', 'ringing')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cancelled || error || !data) return
      if (data.callsid === lastHandledInboundRef.current) return

      lastHandledInboundRef.current = data.callsid
      pendingInboundRef.current = data
      setIncomingCall({ options: { remoteCallerNumber: data.from_number } })
      playSound('call')
      ringIntervalRef.current = setInterval(() => playSound('call'), 3000)
      // Shows immediately as a fallback label ("Tax Professional" /
      // "Front Desk" from the IVR choice) — overwritten the instant a real
      // Client/Lead match comes back, same as before.
      setIncomingMatch(data.department ? { name: data.department, isDepartment: true } : null)
      incomingMatchRef.current = null
      matchCallerToRecord(data.from_number).then(m => { incomingMatchRef.current = m; if (m) setIncomingMatch(m) })

      inboundTimeoutRef.current = setTimeout(() => {
        if (pendingInboundRef.current?.callsid !== data.callsid) return
        supabase.functions.invoke('redirect-to-voicemail', { body: { callsid: data.callsid } })
          .then(({ error: e }) => e && console.error('redirect-to-voicemail error:', e))
        pendingInboundRef.current = null
        setIncomingCall(null)
        setIncomingMatch(null)
        stopRing()
      }, 15000)
    }, 2000)

    return () => { cancelled = true; clearInterval(poll); stopRing() }
  }, [relayStatus, calling])

  async function answerIncoming() {
    const row = pendingInboundRef.current
    if (!row) return
    if (inboundTimeoutRef.current) { clearTimeout(inboundTimeoutRef.current); inboundTimeoutRef.current = null }
    stopRing()

    // ── Atomic claim: only one agent wins, even if multiple click Answer
    // at the same instant. The second .eq('status','ringing') means this
    // update is a no-op for any agent who arrives after the first one
    // flipped the row to 'answered'. If data comes back empty, we lost the
    // race — silently dismiss the banner and let the winner handle the call.
    const agentName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Staff'
    const { data: claimed, error: claimErr } = await supabase
      .from('incoming_calls')
      .update({ status: 'answered', claimed_by: agentName })
      .eq('callsid', row.callsid)
      .eq('status', 'ringing')
      .select('callsid')

    if (claimErr) console.error('incoming_calls claim error:', claimErr)

    if (!claimed || claimed.length === 0) {
      // Another agent claimed this call first — dismiss banner silently
      console.log('[answerIncoming] lost claim race for', row.callsid, '— another agent answered first')
      pendingInboundRef.current = null
      setIncomingCall(null)
      setIncomingMatch(null)
      return
    }

    // We won the claim — proceed with full answer flow
    const m = incomingMatchRef.current
    uiStartedRef.current = true
    setIncomingCall(null)
    setCalling(true)
    setElapsed(0)
    setLogForm(BLANK_LOG)
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    setActive({
      id: m?.id ?? null,
      name: (m && !m.isDepartment) ? m.name : (row.department ? `Incoming — ${row.department}` : 'Incoming Call'),
      first: 'Incoming', last: 'Call',
      phone: row.from_number || '—',
      status: 'Manual',
      entityType: (m && !m.isDepartment) ? m.entityType : null,
    })

    activeConferenceRef.current = row.conference_name || null
    activeInboundCallsidRef.current = row.callsid || null

    // Server-side backup hangup detector for inbound calls — mirrors outboundPollRef.
    // When the caller hangs up, caller-hangup marks the row 'completed' or 'missed'.
    // The RELAY SDK hangup event is unreliable for the agent's self-dial leg, so
    // poll the DB every 3s as a guaranteed fallback to end the active call UI.
    const inboundCallsid = row.callsid
    const inboundPollRef = setInterval(async () => {
      const { data: row } = await supabase
        .from('incoming_calls')
        .select('status')
        .eq('callsid', inboundCallsid)
        .maybeSingle()
      if (row?.status === 'completed' || row?.status === 'missed') {
        clearInterval(inboundPollRef)
        finalizeCallEnd({ alreadyHungUp: true })
        handleRemoteHangup()
      }
    }, 3000)

    // Bridge in using the exact same outbound-dial mechanism that's been
    // working reliably all day — the browser dials the business number
    // itself, and receive-call recognizes that self-dial and connects it
    // straight into this caller's hold conference instead of treating it
    // as a new customer call.
    relayRef.current?.newCall({
      destinationNumber: callerNumberRef.current,
      callerNumber: callerNumberRef.current,
    }).then(call => { liveCallRef.current = call })
      .catch(err => { showCallToast('Could not connect: ' + (err?.message || err)); cancelCall() })

    pendingInboundRef.current = null
  }

  function declineIncoming() {
    const row = pendingInboundRef.current
    if (inboundTimeoutRef.current) { clearTimeout(inboundTimeoutRef.current); inboundTimeoutRef.current = null }
    stopRing()
    setIncomingCall(null)
    setIncomingMatch(null)
    pendingInboundRef.current = null
    if (row?.callsid) {
      supabase.functions.invoke('redirect-to-voicemail', { body: { callsid: row.callsid } })
        .then(({ error }) => error && console.error('redirect-to-voicemail error:', error))
    }
  }

  function handleRemoteHangup() {
    if (uiStartedRef.current) {
      uiStartedRef.current = false
      clearInterval(timerRef.current)
      setCalling(false)
      setLogForm(f => ({ ...f, duration: formatTime(elapsedRef.current) }))
      setLogModal(true)
    }
  }

  function startCall(lead) {
    if (relayStatus !== 'ready') { showCallToast('Calling isn\'t connected yet — wait a moment and try again.'); return false }
    const digits = lead.phone?.replace(/\D/g, '')
    if (!digits) { showCallToast('No phone number to call.'); return false }
    const destinationNumber = digits.length === 10 ? `+1${digits}` : `+${digits}`

    uiStartedRef.current = true
    activeInboundCallsidRef.current = null
    setActive(lead)
    setCalling(true)
    setElapsed(0)
    setLogForm(BLANK_LOG)
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)

    // Manual dial-pad calls don't know who they're calling yet — check
    // if the number matches an existing client/lead so the recap still
    // attaches to the right record once the call ends.
    if (!lead.entityType && lead.status === 'Manual') {
      matchCallerToRecord(lead.phone).then(m => {
        if (m) setActive(prev => (prev === lead ? { ...lead, name: m.name, id: m.id, entityType: m.entityType } : prev))
      })
    }

    // Recorded-outbound path: start-outbound-call originates the real leg
    // to the destination (routed through outbound-leg into a recorded
    // conference), then the browser self-dials the business number —
    // same proven bridge mechanism answerIncoming() already uses —
    // and receive-call's isAgentJoin branch bridges us into that same
    // conference once it sees the pending outbound_calls row.
    supabase.functions.invoke('start-outbound-call', { body: { destinationNumber } })
      .then(({ data, error }) => {
        if (error || !data?.ok) {
          showCallToast('Call failed: ' + (data?.error || error?.message || 'unknown error'))
          cancelCall()
          return
        }
        activeConferenceRef.current = data.conferenceName || null
        // Server-confirmed backup for noticing this call has truly ended,
        // independent of the RELAY SDK's own (sometimes unreliable)
        // call.state events. outbound-call-status writes 'completed' here
        // once SignalWire reports the destination leg as done, whatever
        // the reason. Cleared in finalizeCallEnd.
        if (activeConferenceRef.current) {
          const conf = activeConferenceRef.current
          outboundPollRef.current = setInterval(async () => {
            const { data: row } = await supabase.from('outbound_calls')
              .select('status').eq('conference_name', conf).maybeSingle()
            if (row?.status === 'completed') {
              finalizeCallEnd({ alreadyHungUp: true })
              handleRemoteHangup()
            }
          }, 3000)
        }
        // Deliberate pause before the browser self-dials the business number.
        // This self-dial is itself a second outbound SignalWire origination
        // on top of the start-outbound-call REST leg above. Firing them
        // back-to-back was confirmed via SignalWire's own call history to
        // self-collide and exceed the space-wide outbound rate limit on
        // every single attempt, even fully isolated with nothing else
        // running. Spacing them out clears the rate window. If the call
        // gets cancelled during the wait, cancelCall() already tore down
        // the conference via activeConferenceRef.current, so just bail.
        setTimeout(() => {
          if (!uiStartedRef.current) return
          relayRef.current?.newCall({
            destinationNumber: callerNumberRef.current,
            callerNumber: callerNumberRef.current,
          }).then(call => { liveCallRef.current = call })
            .catch(err => { showCallToast('Could not connect: ' + (err?.message || err)); cancelCall() })
        }, 1500)
      })
    return true
  }

  // Shared teardown for every path a call can end on: agent clicks End,
  // agent clicks Cancel, or the far end hangs up on their own (caught by
  // the signalwire.notification listener above). All three need to do the
  // exact same cleanup -- hang up the live leg (unless it already ended
  // itself), terminate the conference server-side as a backup to the
  // browser SDK's known-unreliable .hangup(), and mark incoming_calls
  // completed so a stale row can never hijack the next agent-join. Having
  // one shared function means these three paths can't drift out of sync
  // with each other again.
  function finalizeCallEnd({ alreadyHungUp }) {
    if (outboundPollRef.current) { clearInterval(outboundPollRef.current); outboundPollRef.current = null }
    if (!alreadyHungUp) liveCallRef.current?.hangup()
    liveCallRef.current = null
    const conf = activeConferenceRef.current
    activeConferenceRef.current = null
    if (conf) endConferenceWithRetry(conf)
    const inboundCallsid = activeInboundCallsidRef.current
    activeInboundCallsidRef.current = null
    if (inboundCallsid) {
      supabase.from('incoming_calls').update({ status: 'completed' }).eq('callsid', inboundCallsid)
        .then(({ error }) => error && console.error('incoming_calls completion update error:', error))
    }
  }

  function endCall() {
    finalizeCallEnd({ alreadyHungUp: false })
    uiStartedRef.current = false
    clearInterval(timerRef.current)
    setCalling(false)
    setLogForm(f => ({ ...f, duration: formatTime(elapsedRef.current) }))
    setLogModal(true)
  }

  function cancelCall() {
    finalizeCallEnd({ alreadyHungUp: false })
    uiStartedRef.current = false
    clearInterval(timerRef.current)
    setCalling(false)
    setActive(null)
    setElapsed(0)
  }

  async function saveCallLog(onSaved) {
    if (!active) return
    setSaving(true)
    const record = {
      leadId: active.id,
      clientName: active.name || `${active.first || ''} ${active.last || ''}`.trim(),
      phone: active.phone,
      outcome: logForm.outcome,
      notes: logForm.notes,
      duration: logForm.duration || formatTime(elapsed),
      created_at: new Date().toISOString()
    }
    const { error } = await supabase.from('calllog').insert([record])
    setSaving(false)
    if (error) { showCallToast('Error: ' + error.message); return }

    // Also drop the note into the actual Client/Lead notes timeline (not
    // just buried in the call log), so it shows up where Romy/Dana/Yesenia
    // already look. client_notes keys off the name; lead_notes needs the
    // real lead id, so only leads with a known id get one.
    if (record.notes?.trim()) {
      const author = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Staff'
      const noteLine = `[${record.outcome}, ${record.duration}] ${record.notes.trim()}`
      if (active.entityType === 'client') {
        await supabase.from('client_notes').insert({
          client_name: record.clientName, content: noteLine, created_by: author,
        }).then(({ error: e }) => e && console.error('client_notes insert error:', e))
      } else if (active.entityType === 'lead' && active.id) {
        await supabase.from('lead_notes').insert([{
          lead_id: active.id, lead_name: record.clientName, text: noteLine,
          type: 'Call', author, created_at: new Date().toISOString(),
        }]).then(({ error: e }) => e && console.error('lead_notes insert error:', e))
      }
    }

    if (active.entityType !== 'client') {
      if (logForm.outcome === 'Converted') {
        await supabase.from('leads').update({ status: 'Consultation' }).eq('id', active.id)
      }
      if (logForm.outcome === 'Callback Requested') {
        await supabase.from('leads').update({ status: 'Contacted' }).eq('id', active.id)
      }
    }

    showCallToast('Call logged!')
    setLogModal(false)

    if (active.status === 'Client Queue') {
      try {
        const q = JSON.parse(sessionStorage.getItem('dialerQueue') || '[]')
        const next = q.filter(e => e.phone !== active.phone)
        sessionStorage.setItem('dialerQueue', JSON.stringify(next))
      } catch { /* no-op */ }
    }

    setActive(null)
    setElapsed(0)
    onSaved?.(record)
  }

  function closeLogModalWithoutSaving() {
    setLogModal(false)
    setActive(null)
  }

  const value = {
    relayStatus, incomingCall, incomingMatch, calling, active, elapsed,
    logForm, setLogForm, logModal, setLogModal, saving, callToast,
    OUTCOMES, formatTime,
    answerIncoming, declineIncoming, startCall, endCall, cancelCall,
    saveCallLog, closeLogModalWithoutSaving,
  }

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>
}

