import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useCall } from '../context/CallContext'

const OUTCOME_C = {
  'Connected': 'bg', 'No Answer': 'bn', 'Voicemail': 'ba',
  'Wrong Number': 'br', 'Callback Requested': 'bb', 'Converted': 'bg'
}

export default function Dialer() {
  const {
    relayStatus, calling, active,
    startCall: startCallShared, logModal,
  } = useCall()

  const [leads, setLeads]       = useState([])
  const [callLog, setCallLog]   = useState([])
  const [dialpad, setDialpad]   = useState('')
  const [toast, setToast]       = useState('')
  const [tab, setTab]           = useState('queue') // 'queue' | 'log'

  const [clientQueue, setClientQueue] = useState([])
  const [voicemails, setVoicemails] = useState([])
  const prevLogModalRef = useRef(false)

  // Page-local wrapper around the shared connection's startCall.
  function startCall(lead) { startCallShared(lead) }

  // The "log this call" modal now renders globally (so it still shows up
  // even if a call ends on a different page) — when it closes while this
  // page happens to be the one mounted, refresh this page's own lists.
  useEffect(() => {
    if (prevLogModalRef.current && !logModal) {
      const q = JSON.parse(sessionStorage.getItem('dialerQueue') || '[]')
      setClientQueue(q)
      loadCallLog()
      loadLeads()
    }
    prevLogModalRef.current = logModal
  }, [logModal])

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

  function dialpadPress(val) {
    setDialpad(p => p + val)
  }

  function callDialpad() {
    if (!dialpad) return
    const fakeLead = { id: null, name: 'Manual Dial', first: 'Manual', last: 'Dial', phone: dialpad, status: 'Manual' }
    startCall(fakeLead)
  }

  function callQueueEntry(entry) {
    const fakeLead = { id: null, name: entry.name || 'Client', first: entry.name||'', last: '', phone: entry.phone, status: 'Client Queue', entityType: 'client' }
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

      {/* ── Incoming Call Banner and Active Call Banner now render
           globally (see ActiveCallBar in App.jsx) so they're visible no
           matter which page you're on, not just here. ───────────────── */}

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
                              onClick={() => startCall({ ...lead, entityType: 'lead' })}
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

      {/* ── Log Call Modal now renders globally too (see ActiveCallBar
           in App.jsx), so it pops up correctly even if the call ended
           while you were on a different page. ─────────────────────── */}
    </div>
  )
}

