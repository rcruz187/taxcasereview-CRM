import { useNavigate } from 'react-router-dom'
import { useCall } from '../../context/CallContext'

export default function ActiveCallBar() {
  const navigate = useNavigate()
  const {
    incomingCall, incomingMatch, calling, active, elapsed, formatTime,
    answerIncoming, declineIncoming, cancelCall, endCall,
    logModal, logForm, setLogForm, saving, OUTCOMES, saveCallLog, closeLogModalWithoutSaving,
    callToast,
  } = useCall()

  function openFile(entry) {
    if (!entry?.id) return
    navigate(entry.entityType === 'client' ? `/clients/${entry.id}` : `/leads/${entry.id}`)
  }

  return (
    <>
      {callToast && (
        <div className="toast show" style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 4000 }}>{callToast}</div>
      )}

      {/* ── Incoming Call Banner (visible on every page) ────────────── */}
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
                {incomingMatch && (
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.2)', borderRadius: 6, padding: '2px 8px' }}>
                    {incomingMatch.entityType === 'client' ? 'Client' : 'Lead'} on file
                  </span>
                )}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>
                {incomingCall.options?.remoteCallerNumber || incomingCall.options?.destinationNumber || 'Unknown number'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {incomingMatch && (
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

      {/* ── Active Call Bar (visible on every page while a call is live) ── */}
      {calling && active && (
        <div style={{
          position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 3500,
          width: 'min(560px, 92vw)',
          background: 'linear-gradient(135deg, #0f6e2e, #25A25A)',
          borderRadius: 10, padding: '14px 20px', boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18
            }}>📞</div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>
                {active?.name || `${active?.first || ''} ${active?.last || ''}`.trim()}
                {active.entityType && (
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.2)', borderRadius: 6, padding: '2px 8px' }}>
                    {active.entityType === 'client' ? 'Client' : 'Lead'}
                  </span>
                )}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>{active.phone}</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 }}>⏱ {formatTime(elapsed)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {active.id && (
              <button onClick={() => openFile(active)} className="btn"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none' }}>
                📂 File
              </button>
            )}
            <button className="btn" onClick={cancelCall}
              style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none' }}>
              Cancel
            </button>
            <button onClick={endCall}
              style={{
                background: '#C0202F', color: '#fff', border: 'none',
                borderRadius: 8, padding: '8px 16px', fontWeight: 700,
                cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6
              }}>
              🔴 End
            </button>
          </div>
        </div>
      )}

      {/* ── Log Call Modal (visible on every page once a call ends) ── */}
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
              onClick={() => saveCallLog()} disabled={saving}>
              {saving ? 'Saving...' : '💾 Save Call Log'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
