import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Creates a Stripe Checkout link (hosted payment page) for a lead or client
// and lets the rep copy it or text it straight to them. The client fills in
// their own card on Stripe's page — none of it touches our servers. Once
// paid, stripe-checkout-webhook logs the payment and saves the card on file
// for future use, the same as the embedded card-on-file flow does.
export default function SendPaymentLinkModal({ record, recordType, onClose, showToast, purpose, defaultAmount, defaultDescription }) {
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : '')
  const [description, setDescription] = useState(defaultDescription || '')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')
  const [link, setLink] = useState(null)
  const [copied, setCopied] = useState(false)

  async function generate() {
    if (!amount || parseFloat(amount) <= 0) { setErr('Enter a valid amount'); return }
    setLoading(true); setErr('')
    const { data, error } = await supabase.functions.invoke('stripe-create-checkout-session', {
      body: {
        recordType, recordId: record.id, name: record.name, email: record.email,
        amount, description: description || undefined, purpose: purpose || undefined,
      }
    })
    setLoading(false)
    if (error || data?.error) { setErr(data?.error || error.message); return }
    setLink(data.url)
  }

  async function copyLink() {
    await navigator.clipboard.writeText(link)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  async function textLink() {
    if (!record.phone) { setErr('No phone number on file'); return }
    setSending(true); setErr('')
    const toNum = '+1' + record.phone.replace(/\D/g, '').slice(-10)
    const body = `Hi ${record.name?.split(' ')[0] || ''}, here's your secure payment link from Tax Case Review: ${link}`
    const { data, error } = await supabase.functions.invoke('send-sms', {
      body: { to: toNum, body, [recordType === 'lead' ? 'lead_id' : 'client_id']: record.id }
    })
    setSending(false)
    if (error || data?.error) { setErr(data?.error || error.message); return }
    showToast?.('✅ Payment link texted')
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 440, maxWidth: '95vw', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>🔗 {defaultDescription || 'Send Payment Link'} — {record.name}</div>
          <button className="xbtn" onClick={onClose}>&times;</button>
        </div>

        {!link ? (
          <>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 14 }}>
              Generates a secure Stripe-hosted payment page. {record.name?.split(' ')[0] || 'They'} enter their own card there — it never touches our servers, and gets saved on file for future charges too.
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Amount ($)</label>
              <input type="number" step="0.01" autoFocus value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 500" />
            </div>
            <div className="field">
              <label>Description (optional)</label>
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Investigation Fee" />
            </div>
            {err && <div style={{ color: 'var(--bad)', fontSize: 13, marginTop: 8 }}>{err}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="btn" onClick={onClose} disabled={loading}>Cancel</button>
              <button className="btn pri" onClick={generate} disabled={loading}>{loading ? 'Generating…' : 'Generate Link'}</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 10 }}>Link ready — copy it or text it directly:</div>
            <div style={{ background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--tx)', wordBreak: 'break-all', marginBottom: 12 }}>
              {link}
            </div>
            {err && <div style={{ color: 'var(--bad)', fontSize: 13, marginBottom: 8 }}>{err}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={onClose}>Close</button>
              <button className="btn sec" onClick={copyLink}>{copied ? '✓ Copied' : 'Copy Link'}</button>
              <button className="btn pri" onClick={textLink} disabled={sending || !record.phone}>{sending ? 'Sending…' : 'Text Link'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
