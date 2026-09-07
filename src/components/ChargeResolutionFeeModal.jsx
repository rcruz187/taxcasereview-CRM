import { useState } from 'react'
import { formatMoneyInput, parseMoney } from '../lib/money'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { supabase } from '../lib/supabase'

let stripePromise = null
function getStripe(publishableKey) {
  if (!stripePromise) stripePromise = loadStripe(publishableKey)
  return stripePromise
}

function PayForm({ lead, paymentIntentId, amount, onPaid, onClose }) {
  const stripe = useStripe()
  const elements = useElements()
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handlePay() {
    if (!stripe || !elements) return
    setSaving(true); setErr('')
    const { error, paymentIntent } = await stripe.confirmPayment({ elements, redirect: 'if_required' })
    if (error) { setErr(error.message); setSaving(false); return }

    // Never trust the browser alone — verify server-side with the secret key and log it
    const { data, error: fnErr } = await supabase.functions.invoke('stripe-resolution-fee-confirm', {
      body: { paymentIntentId: paymentIntent.id, leadName: lead.name, amount }
    })
    setSaving(false)
    if (fnErr || data?.error) { setErr(data?.error || fnErr.message); return }
    onPaid(data)
  }

  return (
    <div>
      <PaymentElement />
      {err && <div style={{ color: 'var(--bad)', fontSize: 12, marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="btn pri" onClick={handlePay} disabled={saving || !stripe}>{saving ? 'Charging…' : `Charge $${amount}`}</button>
      </div>
    </div>
  )
}

export default function ChargeResolutionFeeModal({ lead, onClose, onPaid, showToast }) {
  const [amount, setAmount] = useState('')
  const [clientSecret, setClientSecret] = useState(null)
  const [publishableKey, setPublishableKey] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function startCharge() {
    if (!amount || parseFloat(amount) <= 0) { setErr('Enter a valid amount'); return }
    setLoading(true); setErr('')

    const { data: s } = await supabase.from('settings').select('stripe_publishable_key').limit(1).maybeSingle()
    if (!s?.stripe_publishable_key) { setErr('Stripe Publishable Key is not set in Settings → Stripe (Autopay).'); setLoading(false); return }
    setPublishableKey(s.stripe_publishable_key)

    // Commission for the 2nd trade goes to whoever actually sent the
    // addendum, not whoever happens to click Charge — so look that up from
    // the most recent Service Addendum esign for this client.
    const { data: addendum } = await supabase.from('esigns')
      .select('sent_by').eq('client_name', lead.name).eq('doc_type', 'Service Addendum')
      .order('sent_at', { ascending: false }).limit(1).maybeSingle()

    const { data, error } = await supabase.functions.invoke('stripe-resolution-fee-intent', {
      body: { leadId: lead.id, leadName: lead.name, email: lead.email, amount, description: `Resolution fee — ${lead.name}`, enrolledBy: addendum?.sent_by || null }
    })
    setLoading(false)
    if (error || data?.error) { setErr(data?.error || error.message); return }
    setClientSecret(data.client_secret)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 460, maxWidth: '95vw', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>💰 Charge Resolution Fee — {lead.name}</div>
          <button className="xbtn" onClick={onClose}>&times;</button>
        </div>

        {!clientSecret ? (
          <>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 14 }}>
              This is the one-time fee for doing the resolution work, based on what came back from the IRS — separate from the investigation fee already paid. Once it clears, this lead converts to a client automatically.
            </div>
            <div className="field"><label>Resolution Fee Amount ($)</label>
              <input type="text" inputMode="decimal" autoFocus value={formatMoneyInput(amount)} onChange={e=>setAmount(parseMoney(e.target.value))}
                onKeyDown={e=>e.key==='Enter'&&startCharge()} placeholder="e.g. 3500" />
            </div>
            {err && <div style={{ color: 'var(--bad)', fontSize: 13, marginTop: 6 }}>{err}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="btn" onClick={onClose} disabled={loading}>Cancel</button>
              <button className="btn pri" onClick={startCharge} disabled={loading}>{loading ? 'Loading…' : 'Continue to Payment'}</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 14 }}>
              Card or bank account info goes directly into Stripe's secure form below — it never passes through our servers or database.
            </div>
            <Elements stripe={getStripe(publishableKey)} options={{ clientSecret }}>
              <PayForm lead={lead} amount={amount} onClose={onClose}
                onPaid={() => { showToast?.('✅ Resolution fee charged'); onPaid?.(); onClose() }} />
            </Elements>
          </>
        )}
      </div>
    </div>
  )
}
