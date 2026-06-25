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
  const [emailing, setEmailing] = useState(false)

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

  async function emailLink() {
    if (!record.email) { setErr('No email address on file'); return }
    setEmailing(true); setErr('')
    const firstName = record.name?.split(' ')[0] || record.name || 'there'
    const { error } = await supabase.functions.invoke('send-email', {
      body: {
        to: record.email,
        subject: `Your Secure Payment Link — Tax Case Review`,
        html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden"><tr><td style="background:linear-gradient(135deg,#1e3a8a,#1d4ed8);padding:28px 40px;text-align:center"><div style="font-size:20px;font-weight:800;color:#fff">Tax Case Review</div></td></tr><tr><td style="padding:32px 40px"><p style="margin:0 0 14px;font-size:15px;color:#0f172a">Hi <strong>${firstName}</strong>,</p><p style="margin:0 0 20px;font-size:14px;color:#334155;line-height:1.7">Here is your secure payment link. Click below to pay safely — your card info goes directly to Stripe and is never stored on our servers.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 24px"><a href="${link}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px">Pay Securely →</a></td></tr></table><p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;word-break:break-all">${link}</p></td></tr><tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 40px;text-align:center"><p style="margin:0;font-size:11px;color:#94a3b8">Tax Case Review · 631 US Highway One Ste 304, North Palm Beach, FL 33408 · (888) 334-5052</p></td></tr></table></td></tr></table></body></html>`
      }
    })
    setEmailing(false)
    if (error) { setErr(error.message); return }
    showToast?.('✅ Payment link emailed')
    onClose()
  }
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
              <button className="btn sec" onClick={emailLink} disabled={emailing || !record.email}>{emailing ? 'Sending…' : '📧 Email Link'}</button>
              <button className="btn pri" onClick={textLink} disabled={sending || !record.phone}>{sending ? 'Sending…' : 'Text Link'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
