import { useState, useEffect, useRef } from 'react'
import { Relay } from '@signalwire/js'
import { supabase } from '../lib/supabase'

const OUTCOMES = ['Connected', 'No Answer', 'Voicemail', 'Wrong Number', 'Callback Requested', 'Converted']
const OUTCOME_C = {
  'Connected': 'bg', 'No Answer': 'bn', 'Voicemail': 'ba',
  'Wrong Number': 'br', 'Callback Requested': 'bb', 'Converted': 'bg'
}

const BLANK_LOG = { outcome: 'Connected', notes: '', duration: '' }

export default function Dialer() {
  const [leads, setLeads]       = useState([])
  const [callLog, setCallLog]   = useState([])
  const [active, setActive]     = useState(null)   // current lead being called
  const [dialpad, setDialpad]   = useState('')
  const [logForm, setLogForm]   = useState(BLANK_LOG)
  const [logModal, setLogModal] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [toast, setToast]       = useState('')
  const [tab, setTab]           = useState('queue') // 'queue' | 'log'
  const [calling, setCalling]   = useState(false)
  const [elapsed, setElapsed]   = useState(0)
  const timerRef = useRef(null)

  const [clientQueue, setClientQueue] = useState([])
  const [voicemails, setVoicemails] = useState([])

  // ── Real calling (SignalWire RELAY) ──────────────────────────────────
  const [relayStatus, setRelayStatus] = useState('connecting') // connecting | ready | error
  const [incomingCall, setIncomingCall] = useState(null)        // Call object while it's ringing in
  const relayRef = useRef(null)       // the Relay client instance
  const liveCallRef = useRef(null)    // the Call object currently in progress (in or out)
  const callerNumberRef = useRef(null)
  const uiStartedRef = useRef(false)  // guards against re-initializing the active-call UI twice for the same call
  const elapsedRef = useRef(0)
  useEffect(() => { elapsedRef.current = elapsed }, [elapsed])

  useEffect(() => {
    let client
    let audioEl
    ;(async () => {
      // Built with plain DOM APIs, appended directly to <body> — NOT
      // rendered by React — so React never attaches its internal tracking
      // data to this node. That tracking data is exactly what crashed the
      // SDK mid-call every time before (circular JSON during ICE exchange).
      audioEl = document.createElement('audio')
      audioEl.id = 'sw-remote-audio'
      audioEl.autoplay = true
      document.body.appendChild(audioEl)

      const { data, error } = await supabase.functions.invoke('signalwire-relay-token')
      if (error || !data?.jwt_token) {
        setRelayStatus('error')
        showToast('Could not connect calling: ' + (data?.error || error?.message || 'unknown error'))
        return
      }
      callerNumberRef.current = data.caller_number

      client = new Relay({ project: data.project_id, token: data.jwt_token })
      client.remoteElement = 'sw-remote-audio'

      client.on('signalwire.ready', () => setRelayStatus('ready'))
      client.on('signalwire.error', (e) => { setRelayStatus('error'); console.error('RELAY error', e) })
      client.on('signalwire.notification', (n) => {
        if (n.type !== 'callUpdate') return
        const call = n.call
        if (call.direction === 'inbound' && call.state === 'ringing') {
          liveCallRef.current = call
          uiStartedRef.current = false
          setIncomingCall(call)
        }
        if (call.state === 'active' && !uiStartedRef.current) {
          uiStartedRef.current = true
          setIncomingCall(null)
          setCalling(true)
          setElapsed(0)
          setLogForm(BLANK_LOG)
          timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
          setActive(prev => prev || { id: null, name: 'Incoming Call', first: 'Incoming', last: 'Call', phone: call.options?.remoteCallerNumber || '—', status: 'Manual' })
        }
        if (call.state === 'hangup' || call.state === 'destroy') {
          setIncomingCall(null)
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
    })()

    return () => { client?.disconnect(); audioEl?.remove() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function answerIncoming() {
    incomingCall?.answer()
    setIncomingCall(null)
  }

  function declineIncoming() {
    incomingCall?.hangup()
    setIncomingCall(null)
    liveCallRef.current = null
  }

  useEffect(() => {
    loadLeads(); loadCallLog(); loadVoicemails()
    // Pick up number passed from client phone link
    const pre = sessionStorage.getItem('dialerNumber')
    if (pre) {
      setDialpad(pre)
      sessionStorage.removeItem('dialerNumber')
      sessionStorage.removeItem('dialerName')
    }
    // Load client call queue (from "Add to Call Queue" on Clients page)
    const q = JSON.parse(sessionStorage.getItem('dialerQueue')||'[]')
    setClientQueue(q)
  }, [])

  async function loadLeads() {
    const { data, error } = await supabase
      .from('leads')
      .select('id, name, first, last, phone, status, source')
      .not('status', 'eq', 'Converted to Client')
      .not('status', 'eq', 'Dead')
      .order('created_at', { ascending: false })
    if (error) console.error('loadLeads error:', error)
    if (data) setLeads(data)
  }

  async function loadCallLog() {
    const { data } = await supabase
      .from('calllog')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    if (data) setCallLog(data)
  }

  async function loadVoicemails() {
    const { data, error } = await supabase
      .from('voicemails')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) console.error('loadVoicemails error:', error)
    if (data) setVoicemails(data)
  }

  async function markVoicemailRead(vm) {
    await supabase.from('voicemails').update({ is_read: true }).eq('id', vm.id)
    setVoicemails(vs => vs.map(v => v.id === vm.id ? { ...v, is_read: true } : v))
  }

  async function deleteVoicemail(vm) {
    if (!window.confirm('Delete this voicemail? This cannot be undone.')) return
    await supabase.from('voicemails').delete().eq('id', vm.id)
    if (vm.recording_url?.includes('/storage/v1/object/public/voicemails/')) {
      const fileName = vm.recording_url.split('/voicemails/').pop()
      if (fileName) await supabase.storage.from('voicemails').remove([fileName]).catch(() => {})
    }
    setVoicemails(vs => vs.filter(v => v.id !== vm.id))
    showToast('Voicemail deleted.')
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  function startCall(lead) {
    if (relayStatus !== 'ready') { showToast('Calling isn\'t connected yet — wait a moment and try again.'); return }
    const digits = lead.phone?.replace(/\D/g, '')
    if (!digits) { showToast('No phone number to call.'); return }
    uiStartedRef.current = true
    setActive(lead)
    setCalling(true)
    setElapsed(0)
    setLogForm(BLANK_LOG)
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    relayRef.current?.newCall({
      destinationNumber: digits.length === 10 ? `+1${digits}` : `+${digits}`,
      callerNumber: callerNumberRef.current || undefined,
    }).then(call => { liveCallRef.current = call })
      .catch(err => { showToast('Call failed: ' + (err?.message || err)); cancelCall() })
  }

  function endCall() {
    liveCallRef.current?.hangup()
    liveCallRef.current = null
    uiStartedRef.current = false
    clearInterval(timerRef.current)
    setCalling(false)
    setLogForm(f => ({ ...f, duration: formatTime(elapsed) }))
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

  async function saveCallLog() {
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
    if (error) { showToast('Error: ' + error.message); return }

    // If converted, offer to update lead status
    if (logForm.outcome === 'Converted') {
      await supabase.from('leads').update({ status: 'Consultation' }).eq('id', active.id)
    }
    if (logForm.outcome === 'Callback Requested') {
      await supabase.from('leads').update({ status: 'Contacted' }).eq('id', active.id)
    }

    showToast('Call logged!')
    setLogModal(false)
    if (active.status === 'Client Queue') {
      setClientQueue(q => {
        const next = q.filter(e => e.phone !== active.phone)
        sessionStorage.setItem('dialerQueue', JSON.stringify(next))
        return next
      })
    }
    setActive(null)
    setElapsed(0)
    loadCallLog()
    loadLeads()
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0')
    const s = (sec % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  function dialpadPress(val) {
    setDialpad(p => p + val)
  }

  function callDialpad() {
    if (!dialpad) return
    const fakeLead = { id: null, name: 'Manual Dial', first: 'Manual', last: 'Dial', phone: dialpad, status: 'Manual' }
    startCall(fakeLead)
  }

  function callQueueEntry(entry) {
    const fakeLead = { id: null, name: entry.name || 'Client', first: entry.name||'', last: '', phone: entry.phone, status: 'Client Queue' }
    startCall(fakeLead)
  }

  function removeFromQueue(idx) {
    setClientQueue(q => {
      const next = q.filter((_,i)=>i!==idx)
      sessionStorage.setItem('dialerQueue', JSON.stringify(next))
      return next
    })
  }

  function clearQueue() {
    setClientQueue([])
    sessionStorage.removeItem('dialerQueue')
  }

  const DIALPAD_KEYS = [
    ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
    ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
    ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
    ['*', ''], ['0', '+'], ['#', ''],
  ]

  return (
    <div>
      {toast && <div className="toast show">{toast}</div>}

      {/* ── Calling connection status ──────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <span style={{
          fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 600,
          background: relayStatus === 'ready' ? 'rgba(37,162,90,0.15)' : relayStatus === 'error' ? 'rgba(192,32,47,0.15)' : 'rgba(245,158,11,0.15)',
          color: relayStatus === 'ready' ? '#25A25A' : relayStatus === 'error' ? '#C0202F' : '#f59e0b',
        }}>
          {relayStatus === 'ready' ? '🟢 Phone line connected' : relayStatus === 'error' ? '🔴 Phone line error' : '🟡 Connecting phone line…'}
        </span>
      </div>

      {/* ── Incoming Call Banner ───────────────────────────────────── */}
      {incomingCall && (
        <div style={{
          background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
          borderRadius: 10, padding: '16px 20px', marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20
            }}>📞</div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>Incoming Call</div>
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>
                {incomingCall.options?.remoteCallerNumber || incomingCall.options?.destinationNumber || 'Unknown number'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={declineIncoming} className="btn"
              style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none' }}>
              Decline
            </button>
            <button onClick={answerIncoming}
              style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              ✅ Answer
            </button>
          </div>
        </div>
      )}

      {/* ── Active Call Banner ──────────────────────────────────────── */}
      {calling && active && (
        <div style={{
          background: 'linear-gradient(135deg, #0f6e2e, #25A25A)',
          borderRadius: 10,
          padding: '16px 20px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20
            }}>📞</div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>
                {active?.name || `${active?.first || ''} ${active?.last || ''}`.trim()}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>{active.phone}</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>
                ⏱ {formatTime(elapsed)}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" onClick={cancelCall}
              style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none' }}>
              Cancel
            </button>
            <button onClick={endCall}
              style={{
                background: '#C0202F', color: '#fff', border: 'none',
                borderRadius: 8, padding: '8px 20px', fontWeight: 700,
                cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6
              }}>
              🔴 End & Log Call
            </button>
          </div>
        </div>
      )}

      <div className="g2" style={{ alignItems: 'start' }}>

        {/* ── Left: Dialpad ──────────────────────────────────────────── */}
        <div className="card" style={{ maxWidth: 320 }}>
          <div className="ch"><span className="ct">Dialpad</span></div>

          {/* Number display */}
          <div style={{
            background: 'var(--bg)', borderRadius: 8, padding: '10px 14px',
            textAlign: 'center', fontSize: 22, fontWeight: 700, letterSpacing: 4,
            color: 'var(--tx)', marginBottom: 12, minHeight: 48,
            border: '1px solid var(--br)', fontFamily: 'monospace'
          }}>
            {dialpad || <span style={{ color: 'var(--t3)', fontSize: 14, fontWeight: 400, letterSpacing: 0 }}>Enter number</span>}
          </div>

          {/* Dialpad grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
            {DIALPAD_KEYS.map(([num, letters]) => (
              <button key={num} onClick={() => dialpadPress(num)}
                style={{
                  background: 'var(--sf)', border: '1px solid var(--br)',
                  borderRadius: 8, padding: '12px 8px', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1
                }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--tx)' }}>{num}</span>
                {letters && <span style={{ fontSize: 9, color: 'var(--t3)', letterSpacing: 1 }}>{letters}</span>}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn pri" style={{ flex: 1, justifyContent: 'center', padding: 10 }}
              onClick={callDialpad} disabled={!dialpad || calling}>
              📞 Call
            </button>
            <button className="btn sec" style={{ padding: '10px 14px' }}
              onClick={() => setDialpad(p => p.slice(0, -1))}>
              ⌫
            </button>
          </div>
        </div>

        {/* ── Right: Queue + Log ─────────────────────────────────────── */}
        <div style={{ flex: 1 }}>

          {/* Client Call Queue (added via Clients page "Add to Call Queue") */}
          {clientQueue.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="ch">
                <span className="ct">📇 Client Call Queue ({clientQueue.length})</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn pri" style={{ padding: '5px 12px', fontSize: 12 }}
                    onClick={() => callQueueEntry(clientQueue[0])} disabled={calling}>
                    📞 Call Next
                  </button>
                  <button className="btn sec" style={{ padding: '5px 12px', fontSize: 12 }} onClick={clearQueue}>
                    Clear Queue
                  </button>
                </div>
              </div>
              <div className="ovx">
                <table>
                  <thead><tr><th>Name</th><th>Phone</th><th></th></tr></thead>
                  <tbody>
                    {clientQueue.map((entry, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{entry.name || 'Unknown'}</td>
                        <td style={{ fontFamily: 'monospace', color: 'var(--t2)' }}>{entry.phone}</td>
                        <td style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn pri" style={{ padding: '5px 12px', fontSize: 12 }}
                            onClick={() => callQueueEntry(entry)} disabled={calling}>
                            📞 Call
                          </button>
                          <button className="btn sec" style={{ padding: '5px 8px', fontSize: 12 }}
                            onClick={() => removeFromQueue(i)}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {[
              ['queue', `📋 Call Queue (${leads.length})`],
              ['voicemail', `🔵 Voicemails (${voicemails.filter(v => !v.is_read).length})`],
              ['log', `📞 Call History (${callLog.length})`],
            ].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
                className={tab === key ? 'btn pri' : 'btn sec'}
                style={{ padding: '7px 16px', fontSize: 13 }}>
                {label}
              </button>
            ))}
          </div>

          {/* Voicemails */}
          {tab === 'voicemail' && (
            <div className="card">
              <div className="ovx">
                {voicemails.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--t3)', padding: 24 }}>No voicemails yet</div>
                ) : voicemails.map(vm => (
                  <div key={vm.id} style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '12px 8px',
                    borderBottom: '1px solid var(--br)',
                    background: vm.is_read ? 'transparent' : 'rgba(37,99,235,0.06)'
                  }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: vm.is_read ? 'transparent' : '#3b82f6', flexShrink: 0 }} />
                    <div style={{ minWidth: 140 }}>
                      <div style={{ fontWeight: 700, fontFamily: 'monospace' }}>{vm.from_number || 'Unknown'}</div>
                      <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                        {vm.created_at ? new Date(vm.created_at).toLocaleString() : '—'}
                        {vm.duration_seconds ? ` · ${vm.duration_seconds}s` : ''}
                      </div>
                    </div>
                    {vm.recording_url ? (
                      <audio controls src={vm.recording_url} style={{ flex: 1, height: 32 }}
                        onPlay={() => !vm.is_read && markVoicemailRead(vm)} />
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--t3)' }}>Recording unavailable</span>
                    )}
                    {!vm.is_read && (
                      <button className="btn sec" style={{ padding: '5px 10px', fontSize: 11 }}
                        onClick={() => markVoicemailRead(vm)}>
                        Mark Read
                      </button>
                    )}
                    <button className="btn sec" style={{ padding: '5px 10px', fontSize: 11, color: '#dc2626' }}
                      onClick={() => deleteVoicemail(vm)}>
                      🗑️ Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Call Queue */}
          {tab === 'queue' && (
            <div className="card">
              <div className="ovx">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Phone</th>
                      <th>Status</th>
                      <th>Source</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.length === 0 ? (
                      <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--t3)', padding: 24 }}>
                        No leads in queue
                      </td></tr>
                    ) : leads.map(lead => (
                      <tr key={lead.id} style={active?.id === lead.id ? { background: 'rgba(37,162,90,0.08)' } : {}}>
                        <td style={{ fontWeight: 600 }}>
                          {lead.name || `${lead.first || ''} ${lead.last || ''}`.trim()}
                        </td>
                        <td style={{ fontFamily: 'monospace', color: 'var(--t2)' }}>
                          {lead.phone || '—'}
                        </td>
                        <td>
                          <span className="bdg bb" style={{ fontSize: 11 }}>{lead.status}</span>
                        </td>
                        <td style={{ color: 'var(--t2)', fontSize: 12 }}>{lead.source || '—'}</td>
                        <td>
                          {lead.phone ? (
                            <button className="btn pri"
                              style={{ padding: '5px 12px', fontSize: 12, gap: 4 }}
                              onClick={() => startCall(lead)}
                              disabled={calling}>
                              📞 Call
                            </button>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--t3)' }}>No phone</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Call History */}
          {tab === 'log' && (
            <div className="card">
              <div className="ovx">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Phone</th>
                      <th>Outcome</th>
                      <th>Duration</th>
                      <th>Notes</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {callLog.length === 0 ? (
                      <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--t3)', padding: 24 }}>
                        No calls logged yet
                      </td></tr>
                    ) : callLog.map(c => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>{c.clientName || '—'}</td>
                        <td style={{ fontFamily: 'monospace', color: 'var(--t2)', fontSize: 12 }}>{c.phone || '—'}</td>
                        <td><span className={`bdg ${OUTCOME_C[c.outcome] || 'bn'}`} style={{ fontSize: 11 }}>{c.outcome}</span></td>
                        <td style={{ fontFamily: 'monospace', color: 'var(--t2)', fontSize: 12 }}>{c.duration || '—'}</td>
                        <td style={{ color: 'var(--t2)', fontSize: 12, maxWidth: 200 }}>{c.notes || '—'}</td>
                        <td style={{ color: 'var(--t3)', fontSize: 11 }}>
                          {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Log Call Modal ─────────────────────────────────────────────── */}
      {logModal && (
        <div className="modal-bg open" onClick={e => e.target === e.currentTarget && setLogModal(false)}>
          <div className="modal">
            <div className="mh">
              <span className="mt">Log Call — {active?.name || `${active?.first || ''} ${active?.last || ''}`.trim()}</span>
              <button className="xbtn" onClick={() => { setLogModal(false); setActive(null) }}>&times;</button>
            </div>

            <div style={{
              background: 'var(--bg)', borderRadius: 8, padding: '10px 14px',
              marginBottom: 14, display: 'flex', gap: 20, flexWrap: 'wrap'
            }}>
              <div><span style={{ color: 'var(--t3)', fontSize: 11 }}>Phone</span><br />
                <span style={{ fontWeight: 600 }}>{active?.phone}</span></div>
              <div><span style={{ color: 'var(--t3)', fontSize: 11 }}>Duration</span><br />
                <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{logForm.duration || formatTime(elapsed)}</span></div>
            </div>

            <div className="field">
              <label>Outcome</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {OUTCOMES.map(o => (
                  <button key={o}
                    onClick={() => setLogForm(f => ({ ...f, outcome: o }))}
                    className={logForm.outcome === o ? 'btn pri' : 'btn sec'}
                    style={{ padding: '6px 12px', fontSize: 12 }}>
                    {o}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Notes</label>
              <textarea
                value={logForm.notes}
                onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="What was discussed? Follow-up needed?"
                style={{ minHeight: 80 }}
              />
            </div>

            <button className="btn pri"
              style={{ width: '100%', justifyContent: 'center', padding: 10 }}
              onClick={saveCallLog} disabled={saving}>
              {saving ? 'Saving...' : '💾 Save Call Log'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

