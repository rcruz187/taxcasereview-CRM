// StripeAddCardModal — lets a client save a card on file via SetupIntent
// (no charge). Used in the Client Portal before locking in a payment plan.
import { useState, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { supabase } from '../lib/supabase'

let stripePromise = null
function getStripe(pk) {
  if (!stripePromise) stripePromise = loadStripe(pk)
  return stripePromise
}

function InnerForm({ setupIntentId, clientId, onSaved, onClose }) {
  const stripe = useStripe()
  const elements = useElements()
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSave() {
    if (!stripe || !elements) return
    setSaving(true); setErr('')
    const { setupIntent, error } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
    })
    if (error) { setErr(error.message); setSaving(false); return }

    // Save the payment method server-side
    const { data, error: fnErr } = await supabase.functions.invoke('stripe-save-payment-method', {
      body: {
        clientId,
        recordType: 'client',
        paymentMethodId: setupIntent.payment_method,
        setAsDefault: true,
      }
    })
    setSaving(false)
    if (fnErr || data?.error) { setErr(data?.error || fnErr?.message || 'Failed to save card'); return }
    onSaved()
  }

  return (
    <div>
      <PaymentElement options={{ layout: 'tabs' }} />
      {err && <div style={{ color: '#f87171', fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
        <button onClick={onClose} disabled={saving}
          style={{ padding: '9px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,.15)', borderRadius: 7, color: '#cbd5e1', cursor: 'pointer', fontSize: 13 }}>
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving || !stripe}
          style={{ padding: '9px 22px', background: '#1A7FD4', border: 'none', borderRadius: 7, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
          {saving ? 'Saving…' : '💾 Save Card'}
        </button>
      </div>
    </div>
  )
}

export default function StripeAddCardModal({ clientId, clientName, email, onClose, onSaved }) {
  const [clientSecret, setClientSecret] = useState(null)
  const [setupIntentId, setSetupIntentId] = useState(null)
  const [publishableKey, setPublishableKey] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      // Staff (authenticated) can read settings directly. Client Portal visitors are
      // anonymous, so RLS blocks that read — fall back to the tenant-scoped RPC.
      const { data: s } = await supabase.from('settings').select('stripe_publishable_key').limit(1).maybeSingle()
      let pk = s?.stripe_publishable_key || null
      if (!pk && clientId) {
        const { data: rpcPk } = await supabase.rpc('portal_get_stripe_pk', { p_client_id: String(clientId) })
        pk = rpcPk || null
      }
      if (!pk) { setErr('Online payments are not configured — contact our office.'); setLoading(false); return }
      setPublishableKey(pk)

      const { data, error } = await supabase.functions.invoke('stripe-setup-intent', {
        body: { clientId, clientName, email, recordType: 'client' }
      })
      setLoading(false)
      if (error || data?.error) { setErr(data?.error || error?.message || 'Could not initialize card entry'); return }
      setClientSecret(data.client_secret)
      setSetupIntentId(data.setup_intent_id)
    }
    init()
  }, [clientId])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: 460, maxWidth: '95vw', padding: 28, background: '#0f172a', border: '1px solid rgba(255,255,255,.1)', borderRadius: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: '#f1f5f9' }}>💳 Add Payment Method</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>&times;</button>
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>
          Your card info is entered directly into Stripe's secure form — we never see your card number. Saving a card on file allows you to set up monthly payments.
        </div>

        {err && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>⚠️ {err}</div>}

        {loading && <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Loading secure form…</div>}

        {clientSecret && publishableKey && (
          <Elements stripe={getStripe(publishableKey)} options={{
            clientSecret,
            appearance: {
              theme: 'night',
              variables: { colorPrimary: '#3b82f6', borderRadius: '8px' }
            }
          }}>
            <InnerForm
              setupIntentId={setupIntentId}
              clientId={clientId}
              onClose={onClose}
              onSaved={() => { onSaved?.(); onClose() }}
            />
          </Elements>
        )}

        <div style={{ marginTop: 16, fontSize: 10, color: '#374151', textAlign: 'center' }}>
          🔒 Secured by Stripe · Encrypted · PCI Compliant
        </div>
      </div>
    </div>
  )
}
