import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCall } from '../../context/CallContext'
import { supabase } from '../../lib/supabase'

export default function ActiveCallBar() {
  const navigate = useNavigate()
  const [polishing, setPolishing] = useState(false)

  // ── Live transcription ───────────────────────────────────────────────
  const [transcribing,   setTranscribing]   = useState(false)
  const [transcript,     setTranscript]     = useState('')     // final confirmed text
  const [interimText,    setInterimText]    = useState('')     // live unconfirmed text
  const [showTranscript, setShowTranscript] = useState(false)
  const [showDialpad,    setShowDialpad]    = useState(false)
  const [dtmfPressed,    setDtmfPressed]    = useState('')
  const recognitionRef = useRef(null)
  const shouldRestartRef = useRef(false)

  const {
    incomingCall, incomingMatch, calling, active, elapsed, formatTime,
    answerIncoming, declineIncoming, cancelCall, endCall,
    logModal, logForm, setLogForm, saving, OUTCOMES, saveCallLog, closeLogModalWithoutSaving,
    callToast, sendDTMF, muted, toggleMute, onHold, holdBusy, toggleHold, addParticipant,
  } = useCall()

  // Add-caller popover state
  const [showAddCaller, setShowAddCaller] = useState(false)
  const [addNumber, setAddNumber] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [addMsg, setAddMsg] = useState('')

  async function handleAddCaller() {
    const digits = addNumber.replace(/\D/g, '')
    if (digits.length < 10) { setAddMsg('Enter a full 10-digit number.'); return }
    setAddBusy(true); setAddMsg('')
    const res = await addParticipant(addNumber.trim())
    setAddBusy(false)
    if (res?.error) { setAddMsg('❌ ' + res.error); return }
    setAddMsg('✅ Ringing them now — they\'ll join when they pick up.')
    setAddNumber('')
    setTimeout(() => { setShowAddCaller(false); setAddMsg('') }, 3500)
  }

  function openFile(entry) {
    if (!entry?.id) return
    navigate(entry.entityType === 'client' ? `/clients/${entry.id}` : `/leads/${entry.id}`)
  }

  // When call ends and log modal opens, pre-fill notes with transcript if present
  useEffect(() => {
    if (logModal && transcript.trim()) {
      setLogForm(f => ({
        ...f,
        notes: f.notes ? f.notes + '\n\n--- Live Transcript ---\n' + transcript : '--- Live Transcript ---\n' + transcript
      }))
    }
  }, [logModal])

  // Stop transcription when call ends
  useEffect(() => {
    if (!calling) stopTranscription()
  }, [calling])

  function startTranscription() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      alert('Live transcription requires Chrome. Please use Chrome for this feature.')
      return
    }
    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 1

    recognition.onresult = (e) => {
      let interim = ''
      let final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript
        if (e.results[i].isFinal) {
          final += text + ' '
        } else {
          interim += text
        }
      }
      if (final) setTranscript(prev => prev + final)
      setInterimText(interim)
    }

    recognition.onend = () => {
      setInterimText('')
      // Auto-restart so it doesn't stop after ~60s silence
      if (shouldRestartRef.current) {
        try { recognition.start() } catch {}
      }
    }

    recognition.onerror = (e) => {
      if (e.error === 'not-allowed') {
        alert('Microphone access denied. Allow mic access in your browser to use transcription.')
        stopTranscription()
      }
    }

    shouldRestartRef.current = true
    recognitionRef.current = recognition
    try { recognition.start() } catch {}
    setTranscribing(true)
    setShowTranscript(true)
    setTranscript('')
    setInterimText('')
  }

  function stopTranscription() {
    shouldRestartRef.current = false
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch {}
      recognitionRef.current = null
    }
    setTranscribing(false)
    setInterimText('')
  }

  function toggleTranscription() {
    if (transcribing) { stopTranscription() } else { startTranscription() }
  }

  async function polishNotes() {
    if (!logForm.notes?.trim() || polishing) return
    setPolishing(true)
    const { data, error } = await supabase.functions.invoke('call-recap', {
      body: { bullets: logForm.notes, contactName: active?.name, outcome: logForm.outcome }
    })
    setPolishing(false)
    if (error || data?.error) {
      alert(data?.error || error?.message || 'Could not polish notes — try again.')
      return
    }
    if (data?.recap) setLogForm(f => ({ ...f, notes: data.recap }))
  }

  return (
    <>
      {callToast && (
        <div className="toast show" style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 4000 }}>{callToast}</div>
      )}

      {/* ── Incoming Call Banner ── */}
      {incomingCall && (
        <div style={{
          position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 3500,
          width: 'min(560px, 92vw)',
          background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
          borderRadius: 10, padding: '16px 20px', boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20
            }}>📞</div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>
                {incomingMatch ? incomingMatch.name : 'Incoming Call'}
                {incomingMatch && !incomingMatch.isDepartment && (
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.2)', borderRadius: 6, padding: '2px 8px' }}>
                    {incomingMatch.entityType === 'client' ? 'Client' : 'Lead'}
                  </span>
                )}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>
                {incomingCall.options?.remoteCallerNumber || incomingCall.options?.destinationNumber || 'Unknown number'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {incomingMatch && !incomingMatch.isDepartment && (
              <button onClick={() => openFile(incomingMatch)} className="btn"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none' }}>
                📂 Open File
              </button>
            )}
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

      {/* ── Active Call Bar ── */}
      {calling && active && (
        <>
          <div style={{
            position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 3500,
            width: 'min(860px, 96vw)',
            background: 'linear-gradient(135deg, #0f6e2e, #25A25A)',
            borderRadius: showTranscript ? '12px 12px 0 0' : 12,
            padding: '12px 18px', boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {/* Row 1 — who you're talking to + End */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0
                }}>📞</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {active?.name || `${active?.first || ''} ${active?.last || ''}`.trim()}
                    {active.entityType && (
                      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.2)', borderRadius: 6, padding: '2px 8px', verticalAlign: 'middle' }}>
                        {active.entityType === 'client' ? 'Client' : 'Lead'}
                      </span>
                    )}
                    {onHold && (
                      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, background: '#B45309', borderRadius: 6, padding: '2px 8px', verticalAlign: 'middle' }}>
                        ON HOLD
                      </span>
                    )}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {active.phone} <span style={{ opacity: 0.75, margin: '0 6px' }}>•</span> ⏱ {formatTime(elapsed)}
                  </div>
                </div>
              </div>
              <button onClick={endCall}
                style={{
                  background: '#C0202F', color: '#fff', border: 'none', flexShrink: 0,
                  borderRadius: 9, padding: '10px 22px', fontWeight: 800,
                  cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 7,
                  whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                }}>
                🔴 End Call
              </button>
            </div>

            {/* Row 2 — call controls, uniform sizing, never wrap labels */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {[
                { key: 'mute', onClick: toggleMute, on: muted, onBg: '#C0202F',
                  label: muted ? '🔇 Unmute' : '🎤 Mute',
                  title: muted ? 'Unmute microphone' : 'Mute microphone' },
                { key: 'hold', onClick: toggleHold, on: onHold, onBg: '#B45309', disabled: holdBusy,
                  label: holdBusy ? '⏳ Hold…' : (onHold ? '▶ Resume' : '⏸ Hold'),
                  title: onHold ? 'Take the caller off hold' : 'Put the caller on hold (they hear hold music)' },
                { key: 'add', onClick: () => { setShowAddCaller(v => !v); setAddMsg('') }, on: showAddCaller, onBg: 'rgba(255,255,255,0.35)',
                  label: '➕ Add Caller', title: 'Conference another person into this call' },
                { key: 'dialpad', onClick: () => setShowDialpad(d => !d), on: showDialpad, onBg: 'rgba(255,255,255,0.35)',
                  label: '⌨️ Dialpad', title: 'Open dialpad for IRS prompts' },
                { key: 'transcribe', onClick: toggleTranscription, on: transcribing, onBg: 'rgba(239,68,68,0.85)',
                  label: transcribing ? '⏹ Stop' : '🎙️ Transcribe',
                  title: transcribing ? 'Stop transcription' : 'Start live transcription (Chrome only)',
                  pulse: transcribing },
              ].map(b => (
                <button key={b.key} onClick={b.onClick} disabled={b.disabled} title={b.title}
                  style={{
                    background: b.on ? b.onBg : 'rgba(255,255,255,0.15)',
                    color: '#fff', border: 'none', borderRadius: 8,
                    height: 34, padding: '0 14px', fontWeight: 700, fontSize: 12.5,
                    cursor: b.disabled ? 'wait' : 'pointer', opacity: b.disabled ? 0.7 : 1,
                    display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                    animation: b.pulse ? 'pulse 1.5s infinite' : 'none',
                  }}>
                  {b.label}
                </button>
              ))}
              {active.id && (
                <button onClick={() => openFile(active)}
                  style={{
                    background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: 8,
                    height: 34, padding: '0 14px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                  }}>
                  📂 Open File
                </button>
              )}
              <div style={{ flex: 1 }} />
              <button onClick={cancelCall} title="Abort this call attempt"
                style={{
                  background: 'transparent', color: 'rgba(255,255,255,0.75)', border: '1px solid rgba(255,255,255,0.35)',
                  borderRadius: 8, height: 34, padding: '0 12px', fontWeight: 600, fontSize: 12,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                Cancel
              </button>
            </div>

            {/* Row 3 — conference-in input, only while Add Caller is open */}
            {showAddCaller && (
              <div style={{
                background: 'rgba(0,0,0,0.22)', borderRadius: 8,
                padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                alignSelf: 'flex-start',
              }}>
                <span style={{ color: '#fff', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>Conference in:</span>
                <input
                  autoFocus
                  value={addNumber}
                  onChange={e => setAddNumber(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddCaller() }}
                  placeholder="(561) 555-0123"
                  inputMode="tel"
                  style={{
                    background: 'rgba(255,255,255,0.95)', border: 'none', borderRadius: 7,
                    padding: '6px 10px', fontSize: 12.5, width: 145, height: 28, boxSizing: 'border-box',
                  }}
                />
                <button onClick={handleAddCaller} disabled={addBusy}
                  style={{
                    background: '#15803D', color: '#fff', border: 'none', borderRadius: 7,
                    height: 28, padding: '0 12px', fontWeight: 700, cursor: addBusy ? 'wait' : 'pointer', fontSize: 12,
                    opacity: addBusy ? 0.7 : 1, whiteSpace: 'nowrap',
                  }}>
                  {addBusy ? 'Dialing…' : '📞 Dial in'}
                </button>
                {addMsg && <span style={{ color: '#fff', fontSize: 12 }}>{addMsg}</span>}
              </div>
            )}
          </div>

          {/* ── DTMF Dialpad — appears below call bar ── */}
          {showDialpad && (
            <div style={{
              position: 'fixed', top: 82, left: '50%', transform: 'translateX(-50%)', zIndex: 3498,
              width: 220,
              background: 'rgba(5,15,30,0.97)',
              border: '1px solid rgba(255,255,255,.15)',
              borderTop: 'none',
              borderRadius: '0 0 12px 12px',
              padding: '12px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                Keypad — {dtmfPressed || 'Press to send tones'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
                {['1','2','3','4','5','6','7','8','9','*','0','#'].map(d => (
                  <button key={d} onClick={() => {
                    sendDTMF(d)
                    setDtmfPressed(p => (p + d).slice(-8))
                  }}
                    style={{
                      background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 8, padding: '10px 0', fontSize: 18, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'monospace',
                      transition: 'background .1s',
                    }}
                    onMouseDown={e => e.currentTarget.style.background='rgba(255,255,255,0.3)'}
                    onMouseUp={e => e.currentTarget.style.background='rgba(255,255,255,0.12)'}
                    onTouchStart={e => e.currentTarget.style.background='rgba(255,255,255,0.3)'}
                    onTouchEnd={e => e.currentTarget.style.background='rgba(255,255,255,0.12)'}
                  >{d}</button>
                ))}
              </div>
            </div>
          )}

          {/* Live transcript panel — attached below the call bar */}
          {showTranscript && (
            <div style={{
              position: 'fixed', top: 82, left: '50%', transform: 'translateX(-50%)', zIndex: 3499,
              width: 'min(620px, 92vw)',
              background: 'rgba(5,15,30,0.97)',
              border: '1px solid rgba(255,255,255,.15)',
              borderTop: 'none',
              borderRadius: '0 0 10px 10px',
              padding: '12px 16px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              maxHeight: 200, overflowY: 'auto',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {transcribing && (
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }}/>
                  )}
                  <span style={{ fontSize: 11, fontWeight: 700, color: transcribing ? '#ef4444' : '#64748b', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {transcribing ? 'Live Transcription — Your Mic' : 'Transcription Paused'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {transcript && (
                    <button onClick={() => { navigator.clipboard?.writeText(transcript); }}
                      style={{ fontSize: 11, padding: '3px 8px', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 5, color: '#94a3b8', cursor: 'pointer' }}>
                      📋 Copy
                    </button>
                  )}
                  <button onClick={() => setShowTranscript(false)}
                    style={{ fontSize: 14, background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', lineHeight: 1 }}>×</button>
                </div>
              </div>
              <div style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.7, minHeight: 32 }}>
                {transcript || <span style={{ color: '#475569', fontStyle: 'italic' }}>Listening… speak naturally.</span>}
                {interimText && <span style={{ color: '#94a3b8', fontStyle: 'italic' }}> {interimText}</span>}
              </div>
              {transcript && (
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => {
                      setLogForm(f => ({
                        ...f,
                        notes: f.notes ? f.notes + '\n\n' + transcript : transcript
                      }))
                    }}
                    style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(59,130,246,.2)', border: '1px solid rgba(59,130,246,.4)', borderRadius: 5, color: '#93c5fd', cursor: 'pointer', fontWeight: 600 }}>
                    ➕ Add to Notes
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Log Call Modal ── */}
      {logModal && (
        <div className="modal-bg open" style={{ zIndex: 4000 }} onClick={e => e.target === e.currentTarget && closeLogModalWithoutSaving()}>
          <div className="modal">
            <div className="mh">
              <span className="mt">Log Call — {active?.name || `${active?.first || ''} ${active?.last || ''}`.trim()}</span>
              <button className="xbtn" onClick={closeLogModalWithoutSaving}>&times;</button>
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
              <label>Notes {transcript && <span style={{ fontSize: 10, color: 'var(--blue)', fontWeight: 600 }}>✓ Transcript included</span>}</label>
              <textarea
                value={logForm.notes}
                onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="What was discussed? Follow-up needed?"
                style={{ minHeight: 100 }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button className="btn sec" style={{ fontSize: 12, padding: '6px 12px' }}
                  onClick={polishNotes} disabled={!logForm.notes?.trim() || polishing}>
                  {polishing ? 'Polishing…' : '✨ Polish Notes'}
                </button>
                {transcript && (
                  <button className="btn sec" style={{ fontSize: 12, padding: '6px 12px' }}
                    onClick={() => setLogForm(f => ({ ...f, notes: transcript }))}>
                    🎙️ Use Raw Transcript
                  </button>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
                Type quick bullet points then hit ✨ Polish Notes — or use the raw transcript from your mic.
              </div>
            </div>

            <button className="btn pri"
              style={{ width: '100%', justifyContent: 'center', padding: 10 }}
              onClick={() => saveCallLog()} disabled={saving}>
              {saving ? 'Saving...' : '💾 Save Call Log'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
