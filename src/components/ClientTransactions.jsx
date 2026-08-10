import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Displays payment transaction history for a client from Chris's booking workbook.
// Shows date, amount, status, associate, deposit account, service type, notes.

export default function ClientTransactions({ clientId, clientName, tenantId }) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    if (!tenantId || !clientId) return
    load()
  }, [clientId, tenantId])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId)
      .order('payment_date', { ascending: false })
      .limit(100)
    setTransactions(data || [])
    setLoading(false)
  }

  const STATUS_COLORS = {
    'Posted':       { bg: 'rgba(22,163,74,0.15)',   color: '#4ade80' },
    'Cleared':      { bg: 'rgba(99,102,241,0.15)',  color: '#a5b4fc' },
    'No Status':    { bg: 'rgba(71,85,105,0.15)',   color: '#94a3b8' },
    'TBD':          { bg: 'rgba(245,158,11,0.15)',  color: '#fbbf24' },
    'New Agmt':     { bg: 'rgba(14,165,233,0.15)',  color: '#38bdf8' },
    'Chargeback':   { bg: 'rgba(220,38,38,0.15)',   color: '#f87171' },
    'Refunded':     { bg: 'rgba(220,38,38,0.15)',   color: '#f87171' },
    'Disputed':     { bg: 'rgba(220,38,38,0.15)',   color: '#f87171' },
    'Chk Returned': { bg: 'rgba(220,38,38,0.15)',   color: '#f87171' },
    'FAIL':         { bg: 'rgba(220,38,38,0.15)',   color: '#f87171' },
  }

  function fmt(dt) {
    if (!dt) return '—'
    return new Date(dt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function fmtAmount(amt) {
    if (amt === null || amt === undefined) return '—'
    const n = Number(amt)
    const color = n < 0 ? '#f87171' : '#4ade80'
    return <span style={{ color, fontWeight: 700 }}>{n < 0 ? '-' : '+'}${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
  }

  const statuses = ['all', ...Object.keys(STATUS_COLORS)]
  const filtered = filter === 'all' ? transactions : transactions.filter(t => t.status === filter)

  const total = transactions.reduce((s, t) => s + (Number(t.amount) || 0), 0)
  const posted = transactions.filter(t => t.status === 'Posted' || t.status === 'Cleared').reduce((s, t) => s + (Number(t.amount) || 0), 0)

  if (loading) return (
    <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
      Loading transactions...
    </div>
  )

  if (!transactions.length) return (
    <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>💰</div>
      <p style={{ margin: 0 }}>No transactions on file for this client.</p>
    </div>
  )

  return (
    <div style={{ paddingTop: 8 }}>
      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, background: 'var(--surface-2, #1e293b)', border: '1px solid var(--border, #334155)', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Total</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: total >= 0 ? '#4ade80' : '#f87171' }}>
            ${Math.abs(total).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: '#64748b' }}>{transactions.length} transactions</div>
        </div>
        <div style={{ flex: 1, background: 'var(--surface-2, #1e293b)', border: '1px solid var(--border, #334155)', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Posted/Cleared</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#4ade80' }}>
            ${posted.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: '#64748b' }}>{transactions.filter(t => t.status === 'Posted' || t.status === 'Cleared').length} confirmed</div>
        </div>
      </div>

      {/* Status filter */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 14, paddingBottom: 4 }}>
        {statuses.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{
              fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'inherit',
              background: filter === s ? '#6366f1' : 'rgba(71,85,105,0.2)',
              color: filter === s ? '#fff' : '#94a3b8',
            }}>
            {s === 'all' ? `All (${transactions.length})` : s}
          </button>
        ))}
      </div>

      {/* Transaction list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map((t, i) => {
          const sc = STATUS_COLORS[t.status] || STATUS_COLORS['No Status']
          return (
            <div key={i} style={{
              background: 'var(--surface-2, #1e293b)', border: '1px solid var(--border, #334155)',
              borderRadius: 10, padding: '12px 14px',
              display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 12px', alignItems: 'start'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{fmt(t.payment_date)}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: sc.bg, color: sc.color }}>
                    {t.status}
                  </span>
                  {t.associate && <span style={{ fontSize: 11, color: '#64748b' }}>· {t.associate}</span>}
                </div>
                {t.deposit_account && <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>📥 {t.deposit_account}</div>}
                {t.service_type && <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>🔧 {t.service_type}</div>}
                {t.notes && <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>{t.notes}</div>}
              </div>
              <div style={{ textAlign: 'right', fontSize: 16 }}>
                {fmtAmount(t.amount)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
