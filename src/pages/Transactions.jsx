import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { FIRM } from '../lib/firmBranding'

// All-transactions view — shows payment_transactions across all clients for this tenant.
// Filterable by status, associate, date range. Searchable by client name.

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

export default function Transactions() {
  const { user } = useApp()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [associateFilter, setAssociateFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 100

  useEffect(() => { if (user) load() }, [user, statusFilter, associateFilter, dateFrom, dateTo])

  async function load() {
    setLoading(true)
    setPage(0)
    let q = supabase
      .from('payment_transactions')
      .select('*')
      .eq('tenant_id', FIRM.tenantId)
      .order('payment_date', { ascending: false })
      .limit(2000)

    if (statusFilter !== 'all') q = q.eq('status', statusFilter)
    if (associateFilter !== 'all') q = q.eq('associate', associateFilter)
    if (dateFrom) q = q.gte('payment_date', dateFrom)
    if (dateTo) q = q.lte('payment_date', dateTo)

    const { data } = await q
    setTransactions(data || [])
    setLoading(false)
  }

  const filtered = transactions.filter(t =>
    !search || t.client_name?.toLowerCase().includes(search.toLowerCase())
  )

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  const totalAmount = filtered.reduce((s, t) => s + (Number(t.amount) || 0), 0)
  const confirmedAmount = filtered.filter(t => t.status === 'Posted' || t.status === 'Cleared')
    .reduce((s, t) => s + (Number(t.amount) || 0), 0)

  const associates = [...new Set(transactions.map(t => t.associate).filter(Boolean))].sort()
  const statuses = [...new Set(transactions.map(t => t.status).filter(Boolean))].sort()

  function fmt(dt) {
    if (!dt) return '—'
    return new Date(dt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function fmtAmt(amt) {
    if (amt === null || amt === undefined) return '—'
    const n = Number(amt)
    return (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 })
  }

  return (
    <div style={{ padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--t1)', margin: 0 }}>Transactions</h1>
          <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 2 }}>Payment history from booking workbook</div>
        </div>
      </div>

      {/* Summary tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Records', val: filtered.length.toLocaleString(), color: 'var(--blue)' },
          { label: 'Total Amount', val: fmtAmt(totalAmount), color: '#10b981' },
          { label: 'Posted / Cleared', val: fmtAmt(confirmedAmount), color: '#6366f1' },
          { label: 'Unconfirmed', val: fmtAmt(totalAmount - confirmedAmount), color: '#f59e0b' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--s2)', border: '1px solid var(--b1)', borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search client name..."
          style={{ flex: '1 1 200px', minWidth: 180, padding: '8px 12px', background: 'var(--s2)', border: '1px solid var(--b1)', borderRadius: 8, color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit' }}
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '8px 12px', background: 'var(--s2)', border: '1px solid var(--b1)', borderRadius: 8, color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit' }}>
          <option value="all">All Statuses</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={associateFilter} onChange={e => setAssociateFilter(e.target.value)}
          style={{ padding: '8px 12px', background: 'var(--s2)', border: '1px solid var(--b1)', borderRadius: 8, color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit' }}>
          <option value="all">All Associates</option>
          {associates.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          style={{ padding: '8px 12px', background: 'var(--s2)', border: '1px solid var(--b1)', borderRadius: 8, color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit' }} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          style={{ padding: '8px 12px', background: 'var(--s2)', border: '1px solid var(--b1)', borderRadius: 8, color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit' }} />
        {(search || statusFilter !== 'all' || associateFilter !== 'all' || dateFrom || dateTo) && (
          <button onClick={() => { setSearch(''); setStatusFilter('all'); setAssociateFilter('all'); setDateFrom(''); setDateTo('') }}
            style={{ padding: '8px 14px', background: 'var(--s2)', border: '1px solid var(--b1)', borderRadius: 8, color: 'var(--t3)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>Loading…</div>
      ) : (
        <>
          <div style={{ background: 'var(--s2)', border: '1px solid var(--b1)', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--b1)', background: 'var(--s1)' }}>
                  {['Date', 'Client', 'Associate', 'Amount', 'Deposit Acct', 'Service', 'Status', 'Notes'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((t, i) => {
                  const sc = STATUS_COLORS[t.status] || STATUS_COLORS['No Status']
                  const amt = Number(t.amount)
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--b1)', transition: 'background .1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--s1)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <td style={{ padding: '10px 14px', color: 'var(--t3)', whiteSpace: 'nowrap' }}>{fmt(t.payment_date)}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--t1)', fontWeight: 500 }}>{t.client_name || '—'}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--t2)' }}>{t.associate || '—'}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, whiteSpace: 'nowrap', color: amt < 0 ? '#f87171' : '#4ade80' }}>{fmtAmt(t.amount)}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--t3)' }}>{t.deposit_account || '—'}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--t3)' }}>{t.service_type || '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>
                          {t.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--t3)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.notes || '—'}</td>
                    </tr>
                  )
                })}
                {paginated.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>No transactions match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginTop: 16 }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                style={{ padding: '6px 14px', background: 'var(--s2)', border: '1px solid var(--b1)', borderRadius: 8, color: 'var(--t1)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
                ← Prev
              </button>
              <span style={{ fontSize: 13, color: 'var(--t3)' }}>Page {page + 1} of {totalPages} ({filtered.length.toLocaleString()} records)</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                style={{ padding: '6px 14px', background: 'var(--s2)', border: '1px solid var(--b1)', borderRadius: 8, color: 'var(--t1)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
