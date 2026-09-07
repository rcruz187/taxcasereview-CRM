import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Displays AI-generated call summaries for a client or case.
// Shows transcript, summary, key points, action items, sentiment, next steps.
// Loaded lazily — only queries when the Calls tab is active.

export default function CallAISummaries({ clientId, caseId, tenantId }) {
  const [summaries, setSummaries] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    if (!tenantId) return
    load()
  }, [clientId, caseId, tenantId])

  async function load() {
    setLoading(true)
    let q = supabase
      .from('call_ai_summaries')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (caseId) q = q.eq('case_id', caseId)
    else if (clientId) q = q.eq('client_id', clientId)

    const { data } = await q
    setSummaries(data || [])
    setLoading(false)
  }

  function sentimentColor(s) {
    if (!s) return '#64748b'
    const l = s.toLowerCase()
    if (l === 'positive') return '#16a34a'
    if (l === 'neutral') return '#2563eb'
    if (l === 'concerned') return '#d97706'
    if (l === 'frustrated') return '#dc2626'
    return '#64748b'
  }

  function fmt(dt) {
    if (!dt) return ''
    return new Date(dt).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    })
  }

  function fmtDuration(secs) {
    if (!secs) return ''
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  if (loading) return (
    <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
      Loading call summaries...
    </div>
  )

  if (!summaries.length) return (
    <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>🤖</div>
      <p style={{ margin: 0 }}>No AI call summaries yet.</p>
      <p style={{ margin: '4px 0 0', fontSize: 12 }}>Summaries are generated automatically after each recorded call.</p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 0' }}>
      {summaries.map(s => (
        <div key={s.id} style={{
          background: 'var(--surface-2, #1e293b)',
          border: '1px solid var(--border, #334155)',
          borderRadius: 10,
          overflow: 'hidden'
        }}>
          {/* Header row */}
          <div
            onClick={() => setExpanded(expanded === s.id ? null : s.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px', cursor: 'pointer',
              borderBottom: expanded === s.id ? '1px solid var(--border, #334155)' : 'none'
            }}
          >
            <span style={{ fontSize: 20 }}>📞</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary, #f1f5f9)', marginBottom: 2 }}>
                {s.from_number || 'Unknown'} → {s.to_number || 'Unknown'}
                {s.duration_seconds ? <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: 8 }}>· {fmtDuration(s.duration_seconds)}</span> : null}
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{fmt(s.created_at)}</div>
            </div>
            <span style={{
              fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20,
              background: sentimentColor(s.sentiment) + '22',
              color: sentimentColor(s.sentiment)
            }}>{s.sentiment || 'Unknown'}</span>
            <span style={{ color: '#64748b', fontSize: 14 }}>{expanded === s.id ? '▲' : '▼'}</span>
          </div>

          {expanded === s.id && (
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Summary */}
              {s.summary && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>Summary</p>
                  <p style={{ fontSize: 13, color: 'var(--text-primary, #f1f5f9)', margin: 0, lineHeight: 1.6 }}>{s.summary}</p>
                </div>
              )}

              {/* Key Points */}
              {s.key_points?.length > 0 && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>Key Points</p>
                  <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {s.key_points.map((pt, i) => (
                      <li key={i} style={{ fontSize: 13, color: 'var(--text-primary, #f1f5f9)', lineHeight: 1.5 }}>{pt}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action Items */}
              {s.action_items?.length > 0 && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>Action Items</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {s.action_items.map((item, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                        background: 'rgba(234,179,8,0.08)', borderRadius: 6, padding: '6px 10px'
                      }}>
                        <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>⚡</span>
                        <span style={{ fontSize: 13, color: 'var(--text-primary, #f1f5f9)', lineHeight: 1.5 }}>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Next Steps */}
              {s.next_steps && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>Next Steps</p>
                  <p style={{ fontSize: 13, color: 'var(--text-primary, #f1f5f9)', margin: 0, lineHeight: 1.6 }}>{s.next_steps}</p>
                </div>
              )}

              {/* Transcript */}
              {s.transcript && (
                <details style={{ cursor: 'pointer' }}>
                  <summary style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>▶</span> Full Transcript
                  </summary>
                  <pre style={{
                    marginTop: 10, padding: '12px', borderRadius: 6,
                    background: 'rgba(0,0,0,0.2)', fontSize: 12,
                    color: '#cbd5e1', whiteSpace: 'pre-wrap', lineHeight: 1.7,
                    fontFamily: 'inherit', overflowY: 'auto', maxHeight: 400
                  }}>{s.transcript}</pre>
                </details>
              )}

              {/* Recording link */}
              {s.recording_url && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>Recording</p>
                  <audio controls src={s.recording_url} style={{ width: '100%', height: 36 }} />
                </div>
              )}

            </div>
          )}
        </div>
      ))}
    </div>
  )
}
