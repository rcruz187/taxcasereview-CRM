import { useState, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { supabase } from '../lib/supabase'

let stripePromise = null
function getStripe(publishableKey) {
  if (!stripePromise) stripePromise = loadStripe(publishableKey)
  return stripePromise
}

function InnerForm({ invoiceId, paymentIntentId, balance, onPaid, onClose }) {
  const stripe = useStripe()
  const elements = useElements()
  const [paying, setPaying] = useState(false)
  const [err, setErr] = useState('')

  async function handlePay() {
    if (!stripe || !elements) return
    setPaying(true); setErr('')
    const { error } = await stripe.confirmPayment({ elements, redirect: 'if_required' })
    if (error) { setErr(error.message); setPaying(false); return }

    // Server-side verification + recording — never trust the browser alone.
    const { data, error: fnErr } = await supabase.functions.invoke('stripe-invoice-pay-confirm', {
      body: { paymentIntentId, invoiceId }
    })
    setPaying(false)
    if (fnErr || data?.error) { setErr(data?.error || fnErr.message); return }
    onPaid(data)
  }

  return (
    <div>
      <PaymentElement />
      {err && <div style={{ color: '#f87171', fontSize: 12, marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button onClick={onClose} disabled={paying} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,.15)', borderRadius: 6, color: '#cbd5e1', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
        <button onClick={handlePay} disabled={paying || !stripe} style={{ padding: '8px 18px', background: '#1A7FD4', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          {paying ? 'Processing…' : `Pay $${balance.toLocaleString('en-US',{minimumFractionDigits:2})}`}
        </button>
      </div>
    </div>
  )
}

export default function StripeInvoicePayModal({ invoice, onClose, onPaid }) {
  const [clientSecret, setClientSecret] = useState(null)
  const [paymentIntentId, setPaymentIntentId] = useState(null)
  const [balance, setBalance] = useState(0)
  const [publishableKey, setPublishableKey] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    async function init() {
      const { data: s } = await supabase.from('settings').select('stripe_publishable_key').limit(1).maybeSingle()
      if (!s?.stripe_publishable_key) { setErr('Online payments are not set up yet — please contact our office.'); return }
      setPublishableKey(s.stripe_publishable_key)

      const { data, error } = await supabase.functions.invoke('stripe-invoice-pay-intent', {
        body: { invoiceId: invoice.id }
      })
      if (error || data?.error) { setErr(data?.error || error.message); return }
      setClientSecret(data.client_secret)
      setPaymentIntentId(data.payment_intent_id)
      setBalance(data.balance)
    }
    init()
  }, [invoice.id])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: 440, maxWidth: '95vw', padding: 24, background: '#0f172a', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#f1f5f9' }}>Pay Invoice {invoice.invNum ? `#${invoice.invNum}` : ''}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}>&times;</button>
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>
          Card or bank account info is entered directly into Stripe's secure form below.
        </div>

        {err && <div style={{ color: '#f87171', fontSize: 13 }}>{err}</div>}

        {clientSecret && publishableKey ? (
          <Elements stripe={getStripe(publishableKey)} options={{ clientSecret }}>
            <InnerForm invoiceId={invoice.id} paymentIntentId={paymentIntentId} balance={balance}
              onClose={onClose} onPaid={(d) => { onPaid?.(d); onClose() }} />
          </Elements>
        ) : !err ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>Loading…</div>
        ) : null}
      </div>
    </div>
  )
}
