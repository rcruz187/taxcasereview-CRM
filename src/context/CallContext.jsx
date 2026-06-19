import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { Relay } from '@signalwire/js'
import { supabase } from '../lib/supabase'
import { useApp } from './AppContext'

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
          if (liveCallRef.current === call) {
            liveCallRef.current = null
            if (uiStartedRef.current) {
              uiStartedRef.current = false
              clearInterval(timerRef.current)
              setCalling(false)
              setLogForm(f => ({ ...f, duration: formatTime(elapsedRef.current) }))
              setLogModal(true)
            }
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
      if (cancelled || pendingInboundRef.current || calling) return
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
      }, 15000)
    }, 2000)

    return () => { cancelled = true; clearInterval(poll) }
  }, [relayStatus, calling])

  function answerIncoming() {
    const row = pendingInboundRef.current
    if (!row) return
    if (inboundTimeoutRef.current) { clearTimeout(inboundTimeoutRef.current); inboundTimeoutRef.current = null }

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

    supabase.from('incoming_calls').update({ status: 'answered' }).eq('callsid', row.callsid)
      .then(({ error }) => error && console.error('incoming_calls update error:', error))

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
    setIncomingCall(null)
    setIncomingMatch(null)
    pendingInboundRef.current = null
    if (row?.callsid) {
      supabase.functions.invoke('redirect-to-voicemail', { body: { callsid: row.callsid } })
        .then(({ error }) => error && console.error('redirect-to-voicemail error:', error))
    }
  }

  function startCall(lead) {
    if (relayStatus !== 'ready') { showCallToast('Calling isn\'t connected yet — wait a moment and try again.'); return false }
    const digits = lead.phone?.replace(/\D/g, '')
    if (!digits) { showCallToast('No phone number to call.'); return false }
    uiStartedRef.current = true
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

    relayRef.current?.newCall({
      destinationNumber: digits.length === 10 ? `+1${digits}` : `+${digits}`,
      callerNumber: callerNumberRef.current || undefined,
    }).then(call => { liveCallRef.current = call })
      .catch(err => { showCallToast('Call failed: ' + (err?.message || err)); cancelCall() })
    return true
  }

  function endCall() {
    liveCallRef.current?.hangup()
    liveCallRef.current = null
    uiStartedRef.current = false
    clearInterval(timerRef.current)
    setCalling(false)
    setLogForm(f => ({ ...f, duration: formatTime(elapsedRef.current) }))
    setLogModal(true)
  }

  function cancelCall() {
    liveCallRef.current?.hangup()
    liveCallRef.current = null
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
