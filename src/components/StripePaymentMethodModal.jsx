import { useState, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { supabase } from '../lib/supabase'

let stripePromise = null
function getStripe(publishableKey) {
  if (!stripePromise) stripePromise = loadStripe(publishableKey)
  return stripePromise
}

function InnerForm({ clientId, onSaved, onClose }) {
  const stripe = useStripe()
  const elements = useElements()
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSave() {
    if (!stripe || !elements) return
    setSaving(true); setErr('')
    const { error, setupIntent } = await stripe.confirmSetup({ elements, redirect: 'if_required' })
    if (error) { setErr(error.message); setSaving(false); return }

    // Resolve the safe display info (brand/last4) server-side and save it
    const { data, error: fnErr } = await supabase.functions.invoke('stripe-save-payment-method', {
      body: { clientId, setupIntentId: setupIntent.id }
    })
    setSaving(false)
    if (fnErr || data?.error) { setErr(data?.error || fnErr.message); return }
    onSaved(data)
  }

  return (
    <div>
      <PaymentElement />
      {err && <div style={{ color: 'var(--bad)', fontSize: 12, marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="btn pri" onClick={handleSave} disabled={saving || !stripe}>{saving ? 'Saving…' : 'Save Payment Method'}</button>
      </div>
    </div>
  )
}

export default function StripePaymentMethodModal({ client, onClose, onSaved, showToast }) {
  const [clientSecret, setClientSecret] = useState(null)
  const [publishableKey, setPublishableKey] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    async function init() {
      const { data: s } = await supabase.from('settings').select('stripe_publishable_key').limit(1).maybeSingle()
      if (!s?.stripe_publishable_key) { setErr('Stripe Publishable Key is not set in Settings → Stripe (Autopay).'); return }
      setPublishableKey(s.stripe_publishable_key)

      const { data, error } = await supabase.functions.invoke('stripe-setup-intent', {
        body: { clientId: client.id, clientName: client.name, email: client.email }
      })
      if (error || data?.error) { setErr(data?.error || error.message); return }
      setClientSecret(data.client_secret)
    }
    init()
  }, [client.id])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 460, maxWidth: '95vw', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Add Payment Method — {client.name}</div>
          <button className="xbtn" onClick={onClose}>&times;</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 14 }}>
          Card or bank account info is entered directly into Stripe's secure form below — it never passes through our servers or database.
        </div>

        {err && <div style={{ color: 'var(--bad)', fontSize: 13 }}>{err}</div>}

        {clientSecret && publishableKey ? (
          <Elements stripe={getStripe(publishableKey)} options={{ clientSecret }}>
            <InnerForm clientId={client.id} onClose={onClose} onSaved={(d) => { showToast?.('✅ Payment method saved'); onSaved?.(d); onClose() }} />
          </Elements>
        ) : !err ? (
          <div style={{ textAlign: 'center', color: 'var(--t3)', padding: 20 }}>Loading…</div>
        ) : null}
      </div>
    </div>
  )
}
