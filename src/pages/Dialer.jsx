import { useState, useEffect, useRef } from 'react'
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

  useEffect(() => {
    loadLeads(); loadCallLog()
    // Pick up number passed from client phone link
    const pre = sessionStorage.getItem('dialerNumber')
    if (pre) { setDialpad(pre); sessionStorage.removeItem('dialerNumber') }
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

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  function startCall(lead) {
    setActive(lead)
    setCalling(true)
    setElapsed(0)
    setLogForm(BLANK_LOG)
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    // Open native dialer
    window.location.href = `tel:${lead.phone?.replace(/\D/g, '')}`
  }

  function endCall() {
    clearInterval(timerRef.current)
    setCalling(false)
    setLogForm(f => ({ ...f, duration: formatTime(elapsed) }))
    setLogModal(true)
  }

  function cancelCall() {
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

  const DIALPAD_KEYS = [
    ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
    ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
    ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
    ['*', ''], ['0', '+'], ['#', ''],
  ]

  return (
    <div>
      {toast && <div className="toast show">{toast}</div>}

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
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {[['queue', `📋 Call Queue (${leads.length})`], ['log', `📞 Call History (${callLog.length})`]].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
                className={tab === key ? 'btn pri' : 'btn sec'}
                style={{ padding: '7px 16px', fontSize: 13 }}>
                {label}
              </button>
            ))}
          </div>

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

