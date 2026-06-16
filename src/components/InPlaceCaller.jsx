import { useState, useRef } from 'react'

const OUTCOMES = ['Connected', 'No Answer', 'Voicemail', 'Wrong Number', 'Callback Requested', 'Converted']

function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = (sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// Renders a clickable phone number that starts the call right where you are —
// no trip to the Dialer page. Dialer stays reserved for calling numbers that
// aren't in the CRM yet (IRS, state, brand-new leads).
export default function InPlaceCaller({ phone, name, entityType, entityId, supabase, showToast, onLogged }) {
  const [calling, setCalling] = useState(false)
  const [logging, setLogging] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [outcome, setOutcome] = useState('Connected')
  const [notes,   setNotes]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const timerRef = useRef(null)

  if (!phone) return <span style={{ color: 'var(--t3)' }}>—</span>
  const digits = phone.replace(/\D/g, '')

  function start() {
    window.location.href = `tel:${digits}`
    setCalling(true)
    setElapsed(0)
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
  }

  function endCall() {
    clearInterval(timerRef.current)
    setCalling(false)
    setLogging(true)
  }

  function discard() {
    setLogging(false); setOutcome('Connected'); setNotes(''); setElapsed(0)
  }

  async function saveLog() {
    setSaving(true)
    const duration = formatTime(elapsed)
    await supabase.from('calllog').insert([{
      leadId: entityType === 'lead' ? entityId : null,
      clientName: name, phone, outcome, notes, duration,
      created_at: new Date().toISOString()
    }]).catch(() => {})

    const text = `📞 Call — ${outcome} (${duration})${notes ? ': ' + notes : ''}`
    if (entityType === 'lead') {
      await supabase.from('lead_notes').insert([{
        lead_id: entityId, lead_name: name, text, type: 'Call', author: 'Staff', created_at: new Date().toISOString()
      }]).catch(() => {})
    } else {
      await supabase.from('client_notes').insert([{
        client_name: name, content: text, created_by: 'Staff', created_at: new Date().toISOString()
      }]).catch(() => {})
    }
    setSaving(false)
    discard()
    showToast?.('Call logged!')
    onLogged?.()
  }

  return (
    <div style={{ display: 'inline-block', width: calling || logging ? '100%' : 'auto' }}>
      <span
        onClick={start}
        style={{ color: 'var(--blue)', fontWeight: 600, cursor: calling || logging ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, pointerEvents: calling || logging ? 'none' : 'auto' }}
        onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
        onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.18 1h3a2 2 0 012 1.72 12.05 12.05 0 00.7 2.81 2 2 0 01-.45 2.11L4.91 8.15a16 16 0 006.29 6.29l1.51-1.52a2 2 0 012.11-.45 12.05 12.05 0 002.81.7A2 2 0 0122 16.92z"/></svg>
        {phone}
      </span>

      {calling && (
        <div style={{ marginTop: 8, padding: '10px 14px', background: 'rgba(34,197,94,.12)', border: '1px solid #16a34a', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: '#4ade80' }}>On call with {name} · {formatTime(elapsed)}</div>
          <button style={{ marginLeft: 'auto', padding: '5px 14px', fontSize: 12, fontWeight: 700, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }} onClick={endCall}>End &amp; Log Call</button>
        </div>
      )}

      {logging && (
        <div style={{ marginTop: 8, padding: 14, background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Log This Call ({formatTime(elapsed)})</div>
          <select value={outcome} onChange={e => setOutcome(e.target.value)} style={{ marginBottom: 8, fontSize: 12, padding: '6px 8px', borderRadius: 6, width: '100%' }}>
            {OUTCOMES.map(o => <option key={o}>{o}</option>)}
          </select>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="What happened on the call?"
            style={{ width: '100%', minHeight: 60, padding: 8, borderRadius: 6, border: '1px solid var(--br)', background: 'var(--s1)', color: 'var(--tx)', fontSize: 12.5, fontFamily: 'inherit', marginBottom: 8, resize: 'vertical', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn pri" disabled={saving} style={{ fontSize: 12, padding: '6px 14px' }} onClick={saveLog}>{saving ? 'Saving…' : '✓ Save Call Log'}</button>
            <button className="btn sec" disabled={saving} style={{ fontSize: 12, padding: '6px 14px' }} onClick={discard}>Discard</button>
          </div>
        </div>
      )}
    </div>
  )
}
