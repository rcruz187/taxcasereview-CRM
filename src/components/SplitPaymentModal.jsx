import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Charges a total amount across one or more saved cards in one go — e.g.
// $1,000 on card A and the remaining $500 on card B. Each leg is its own
// independent charge (own PaymentIntent, own payments row), so a failure on
// one card doesn't undo a charge that already succeeded on another.
export default function SplitPaymentModal({ record, recordType, onClose, showToast, onCharged }) {
  const [cards, setCards] = useState([])
  const [loadingCards, setLoadingCards] = useState(true)
  const [total, setTotal] = useState('')
  const [description, setDescription] = useState('')
  const [rows, setRows] = useState([{ cardId: '', amount: '' }])
  const [charging, setCharging] = useState(false)
  const [results, setResults] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.from('payment_methods').select('*')
      .eq('record_type', recordType).eq('record_id', record.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setCards(data || [])
        setLoadingCards(false)
        if (data?.length) setRows([{ cardId: data.find(c=>c.is_default)?.id || data[0].id, amount: '' }])
      })
  }, [record.id])

  const allocated = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const totalNum = parseFloat(total) || 0
  const remaining = +(totalNum - allocated).toFixed(2)

  function addRow() {
    const used = rows.map(r => r.cardId)
    const next = cards.find(c => !used.includes(c.id))
    setRows(prev => [...prev, { cardId: next?.id || '', amount: remaining > 0 ? String(remaining) : '' }])
  }
  function removeRow(i) { setRows(prev => prev.filter((_, j) => j !== i)) }
  function updateRow(i, field, val) { setRows(prev => prev.map((r, j) => j === i ? { ...r, [field]: val } : r)) }

  async function charge() {
    setErr('')
    if (!totalNum || totalNum <= 0) { setErr('Enter a total amount'); return }
    if (rows.some(r => !r.cardId || !r.amount || parseFloat(r.amount) <= 0)) { setErr('Every row needs a card and an amount'); return }
    if (Math.abs(remaining) > 0.01) { setErr(`Amounts must add up to the total (off by $${Math.abs(remaining).toFixed(2)})`); return }

    setCharging(true)
    const outcomes = []
    for (const row of rows) {
      const card = cards.find(c => c.id === row.cardId)
      const { data, error } = await supabase.functions.invoke('stripe-charge', {
        body: {
          clientId: record.id, recordType, amount: row.amount,
          paymentMethodRowId: row.cardId, source: 'split',
          description: (description || `Tax Case Review payment — ${record.name}`) + ` (split — ${card ? card.brand+' ••••'+card.last4 : 'card'})`,
        }
      })
      const ok = !error && !data?.error
      outcomes.push({ card, amount: row.amount, ok, msg: ok ? 'Charged' : (data?.error || error.message) })
    }
    setCharging(false)
    setResults(outcomes)
    if (outcomes.every(o => o.ok)) { showToast?.('✅ Split payment charged'); onCharged?.() }
    else { onCharged?.() } // partial success still needs the parent to refresh
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 480, maxWidth: '95vw', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>💸 Split Payment — {record.name}</div>
          <button className="xbtn" onClick={onClose}>&times;</button>
        </div>

        {loadingCards ? (
          <div style={{ textAlign: 'center', color: 'var(--t3)', padding: 20 }}>Loading saved cards…</div>
        ) : cards.length < 2 ? (
          <div style={{ fontSize: 13, color: 'var(--t3)' }}>
            Need at least 2 saved cards to split a payment — only {cards.length} on file right now. Add another card first.
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn" onClick={onClose}>Close</button>
            </div>
          </div>
        ) : results ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {results.map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--s2)', borderRadius: 8 }}>
                  <span style={{ fontSize: 13 }}>{r.card ? `${r.card.brand} ••••${r.card.last4}` : 'Card'} — ${parseFloat(r.amount).toLocaleString()}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: r.ok ? 'var(--ok)' : 'var(--bad)' }}>{r.ok ? '✅ Charged' : `❌ ${r.msg}`}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn pri" onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 14 }}>
              Charges each card separately and logs each as its own payment — if one card fails, the others already charged still count.
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Total Amount ($)</label>
              <input type="number" step="0.01" value={total} onChange={e => setTotal(e.target.value)} placeholder="e.g. 1500" />
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Description (optional)</label>
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Resolution Fee" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
              {rows.map((row, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select value={row.cardId} onChange={e => updateRow(i, 'cardId', e.target.value)} style={{ flex: 1 }}>
                    <option value="">Select card…</option>
                    {cards.map(c => <option key={c.id} value={c.id}>{c.brand} ••••{c.last4} {c.is_default ? '(default)' : ''}</option>)}
                  </select>
                  <input type="number" step="0.01" value={row.amount} onChange={e => updateRow(i, 'amount', e.target.value)}
                    placeholder="$" style={{ width: 100 }} />
                  {rows.length > 1 && <button className="btn del" style={{ padding: '6px 9px', fontSize: 12 }} onClick={() => removeRow(i)}>×</button>}
                </div>
              ))}
            </div>
            {rows.length < cards.length && (
              <button className="btn" style={{ fontSize: 12, padding: '5px 10px', marginBottom: 10 }} onClick={addRow}>+ Add another card</button>
            )}

            <div style={{ fontSize: 12, color: Math.abs(remaining) > 0.01 ? 'var(--bad)' : 'var(--ok)', marginBottom: 10 }}>
              {Math.abs(remaining) > 0.01 ? `Remaining to allocate: $${remaining.toFixed(2)}` : '✓ Fully allocated'}
            </div>

            {err && <div style={{ color: 'var(--bad)', fontSize: 13, marginBottom: 8 }}>{err}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={onClose} disabled={charging}>Cancel</button>
              <button className="btn pri" onClick={charge} disabled={charging}>{charging ? 'Charging…' : `Charge ${rows.length} Cards`}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
