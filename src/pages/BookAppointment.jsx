import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { sendClientConfirmation, sendFirmNotification } from '../lib/bookingEmails'
import { etLabelInZone, visitorZone, zoneShort } from '../lib/timezones'
import { resolveProductConfig } from '../lib/productBookingConfig'

// ── Public booking page (Calendly-style), served at #/book with no login ──
// Supports multi-product via ?product=<key> URL parameter.
// Unknown product keys fall back to taxres_crm (safe, backward-compatible).
// Existing ?t=<tenant_uuid> per-office TaxRes links remain fully backward-compatible.
// All data access goes through SECURITY DEFINER RPCs — anon never touches tables directly.

const C = {
  bg: '#0f172a', card: '#1e293b', line: '#334155',
  text: '#f1f5f9', dim: '#94a3b8', accent: '#2563eb', ok: '#22c55e',
}

const fmt12 = (t) => {
  const [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ap}`
}

export default function BookAppointment() {
  const [params] = useSearchParams()
  const [cfg, setCfg] = useState(null)
  const [loadErr, setLoadErr] = useState('')
  const [type, setType] = useState('')
  const [date, setDate] = useState('')
  const [slots, setSlots] = useState(null)
  const [time, setTime] = useState('')
  const [form, setForm] = useState({ name: params.get('name') || '', email: params.get('email') || '', phone: params.get('phone') || '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(null)
  const [payReturn, setPayReturn] = useState(params.get('booking') || '')
  const zone = visitorZone()

  // ── Product resolution ────────────────────────────────────────────────────
  // ?product= is validated server-side against the allowlist in productBookingConfig.
  // Unknown/inactive values silently fall back to taxres_crm — no error, no leak.
  const productKey = (params.get('product') || '').toLowerCase().trim()
  const productCfg = resolveProductConfig(productKey)

  // ── Tenant hint (TaxRes per-office links) ─────────────────────────────────
  // ?t=<tenant_uuid> carries a specific TaxRes office. If present, overrides
  // product branding with that office's own branding via booking_get_public_meta.
  // This is the existing TaxRes behavior — fully preserved and unchanged.
  const tid = (params.get('t') || new URLSearchParams(window.location.search).get('t') || '').trim()
  const TAXRESCRM_TENANT = 'a0000000-0000-0000-0000-000000000001'

  // When ?t= is present, use that tenant's slot availability and config (TaxRes path).
  // When only ?product= is present, use TCR primary tenant for availability
  // (all demos book into Romy's calendar regardless of product).
  const tenantArgs = { p_tenant: tid || TAXRESCRM_TENANT }

  // Display meta: ?t= → fetch office branding from RPC; ?product= → use productCfg
  const [meta, setMeta] = useState({
    firm_name:  productCfg.name,
    logo_url:   productCfg.logo,
    logo_alt:   productCfg.logoAlt,
    subtitle:   productCfg.headline,
    payment:    { required: false },
  })

  useEffect(() => {
    // Load booking availability config from Supabase
    ;(async () => {
      const { data, error } = await supabase.rpc('booking_get_config', tenantArgs)
      if (error || !data) { setLoadErr('Online booking is unavailable right now. Please contact us instead.'); return }
      // Use product-specific types when no tenant hint; ?t= uses the office's own types
      const effectiveTypes = tid ? (data.types || []) : productCfg.types
      setCfg({ ...data, types: effectiveTypes })
      if (effectiveTypes.length) setType(effectiveTypes[0])
    })()

    // If ?t= is present (TaxRes per-office link), fetch office branding to override.
    // If only ?product= (or nothing), productCfg already has the right branding — no RPC needed.
    if (tid) {
      supabase.rpc('booking_get_public_meta', { p_tenant: tid }).then(({ data }) => {
        if (data) setMeta(m => ({ ...m, ...data, payment: { ...m.payment, ...(data.payment || {}) } }))
      }).catch(() => {})
    } else if (!productKey) {
      // Legacy: no ?product= and no ?t= → backward-compatible TaxRes CRM booking page
      // (already handled by productCfg resolving to taxres_crm)
    }
  }, [])

  // Next available days from config
  const days = []
  if (cfg) {
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
    const now = new Date()
    for (let i = 0; i < (cfg.maxDaysOut || 30); i++) {
      const d = new Date(now); d.setDate(now.getDate() + i)
      const key = dayKeys[d.getDay()]
      const blocked = (cfg.blockedDates || []).includes(d.toISOString().slice(0, 10))
      if (!blocked && cfg.hours && cfg.hours[key]) {
        days.push({ iso: d.toISOString().slice(0, 10), label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) })
      }
      if (days.length >= 21) break
    }
  }

  async function pickDate(iso) {
    setDate(iso); setTime(''); setSlots(null)
    const { data, error } = await supabase.rpc('booking_get_slots', { p_date: iso, ...tenantArgs })
    setSlots(error ? [] : (data || []))
  }

  async function book() {
    if (!form.name.trim() || !form.email.trim()) {
      setErr('Please enter your name and email so we can send your confirmation.'); return
    }

    // Pay-to-book: Stripe Checkout. Appointment created by webhook on payment success.
    if (meta.payment?.required) {
      setSaving(true); setErr('')
      const base = window.location.origin + window.location.pathname
      const { data, error } = await supabase.functions.invoke('booking-checkout', { body: {
        name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(),
        event_type: type, date, time, notes: form.notes.trim(), tenant: tid || '',
        success_url: `${base}?booking=paid`, cancel_url: `${base}?booking=canceled`,
      }})
      if (error || !data?.url) { setSaving(false); setErr((data && data.error) || 'Could not start payment. Please contact us instead.'); return }
      window.location.href = data.url
      return
    }

    setSaving(true); setErr('')

    // Product identity is validated and persisted inside the server-side RPC.
    // Anonymous browsers never write directly to calevents.
    const { data, error } = await supabase.rpc('booking_create_product', {
      p_name: form.name.trim(), p_email: form.email.trim(), p_phone: form.phone.trim(),
      p_event_type: type, p_date: date, p_time: time, p_notes: form.notes.trim(),
      p_product: productCfg.key,
      ...tenantArgs,
    })
    setSaving(false)
    if (error) { setErr(error.message); return }
    if (data && data.ok === false) {
      setErr(data.message || 'That time was just taken — please pick another slot.')
      pickDate(date)
      return
    }


    // Confirmation to the client + notification to the appropriate product inbox
    const bookingTenant = tid || TAXRESCRM_TENANT
    sendClientConfirmation({
      name: form.name.trim(), email: form.email.trim(),
      type, date, time, token: data && data.booking_token,
      tenantId: bookingTenant, productCfg,
    })
    sendFirmNotification({
      name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(),
      notes: form.notes.trim(), type, date, time,
      notifyEmail: data && data.notify_email,
      tenantId: bookingTenant, productCfg,
    })

    setDone({ date, time, type })
  }

  const box = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20 }
  const input = { width: '100%', boxSizing: 'border-box', background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, color: C.text, padding: '10px 12px', fontSize: 14 }
  const chip = (active) => ({
    padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, textAlign: 'center',
    border: `1px solid ${active ? C.accent : C.line}`, background: active ? C.accent : 'transparent', color: C.text,
  })

  // Effective display name: prefer meta (which may be overridden by ?t= RPC) then productCfg
  const displayName = meta.firm_name || productCfg.name
  const displayLogo = meta.logo_url || productCfg.logo
  const displayLogoAlt = meta.logo_alt || productCfg.logoAlt || displayName
  const displaySubtitle = meta.subtitle || productCfg.headline

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, -apple-system, sans-serif', padding: '32px 16px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          {displayLogo && (
            <img
              src={displayLogo}
              alt={displayLogoAlt}
              style={{ maxHeight: 56, maxWidth: 220, objectFit: 'contain', marginBottom: 10 }}
              onError={e => { e.target.style.display = 'none' }}
            />
          )}
          <div style={{ fontSize: 24, fontWeight: 800 }}>{displayName}</div>
          {displaySubtitle && <div style={{ fontSize: 14, color: '#a0b0c8', marginTop: 4 }}>{displaySubtitle}</div>}
        </div>

        {payReturn === 'paid' ? (
          <div style={{ ...box, textAlign: 'center' }}>
            <div style={{ fontSize: 40 }}>✅</div>
            <div style={{ fontWeight: 800, fontSize: 18, marginTop: 8 }}>Payment received — you're booked!</div>
            <div style={{ color: C.dim, marginTop: 8, fontSize: 14 }}>A confirmation email is on its way. If anything looks off, just contact us.</div>
          </div>
        ) : payReturn === 'canceled' ? (
          <div style={{ ...box, textAlign: 'center' }}>
            <div style={{ fontSize: 40 }}>↩️</div>
            <div style={{ fontWeight: 800, fontSize: 18, marginTop: 8 }}>Payment canceled</div>
            <div style={{ color: C.dim, marginTop: 8, fontSize: 14 }}>No charge was made and your time wasn't reserved.</div>
            <button style={{ marginTop: 16, background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
              onClick={() => setPayReturn('')}>Try again</button>
          </div>
        ) : loadErr ? (
          <div style={{ ...box, textAlign: 'center', color: C.dim }}>{loadErr}</div>
        ) : !cfg ? (
          <div style={{ ...box, textAlign: 'center', color: C.dim }}>Loading…</div>
        ) : done ? (
          <div style={{ ...box, textAlign: 'center' }}>
            <div style={{ fontSize: 40 }}>✅</div>
            <div style={{ fontWeight: 800, fontSize: 18, marginTop: 8 }}>You're booked!</div>
            <div style={{ color: C.dim, marginTop: 8, fontSize: 14 }}>
              {done.type}<br />
              {new Date(done.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at {fmt12(done.time)} (Eastern){zone !== 'America/New_York' && <> — {etLabelInZone(done.date, done.time, zone)} your time</>}
            </div>
            <div style={{ color: C.dim, marginTop: 12, fontSize: 12.5 }}>We'll reach out to confirm. If anything changes, just contact us.</div>
          </div>
        ) : (
          <div style={box}>
            {cfg.types.length > 1 && (
              <>
                <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>What is this about?</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginBottom: 18 }}>
                  {cfg.types.map(t => <div key={t} style={chip(type === t)} onClick={() => setType(t)}>{t}</div>)}
                </div>
              </>
            )}

            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Pick a day</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginBottom: 18 }}>
              {days.map(d => <div key={d.iso} style={chip(date === d.iso)} onClick={() => pickDate(d.iso)}>{d.label}</div>)}
            </div>

            {date && (
              <>
                <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Pick a time <span style={{ color: C.dim, fontWeight: 400 }}>({zone === 'America/New_York' ? 'Eastern' : `your time — ${zoneShort(zone)}`})</span></div>
                {slots === null ? (
                  <div style={{ color: C.dim, fontSize: 13, marginBottom: 18 }}>Checking availability…</div>
                ) : slots.length === 0 ? (
                  <div style={{ color: C.dim, fontSize: 13, marginBottom: 18 }}>No open times that day — try another date.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8, marginBottom: 18 }}>
                    {slots.map(s => <div key={s} style={chip(time === s)} onClick={() => setTime(s)}>{etLabelInZone(date, s, zone)}</div>)}
                  </div>
                )}
              </>
            )}

            {time && (
              <>
                <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Your details</div>
                <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
                  <input style={input} placeholder="Full name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                  <input style={input} placeholder="Email *" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                  <input style={input} placeholder="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                  <textarea style={{ ...input, resize: 'vertical' }} rows={2} placeholder="Anything we should know? (optional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
                {err && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>{err}</div>}
                <button disabled={saving}
                  style={{ width: '100%', background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '12px 0', fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}
                  onClick={book}>
                  {saving ? (meta.payment?.required ? 'Redirecting to secure payment…' : 'Booking…')
                    : meta.payment?.required
                      ? `Continue to secure payment — $${Number(meta.payment.amount || 0).toFixed(2)}`
                      : `Confirm — ${etLabelInZone(date, time, zone)} on ${new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                </button>
                {meta.payment?.required && (
                  <div style={{ color: C.dim, fontSize: 11.5, marginTop: 8, textAlign: 'center' }}>
                    Secure payment via Stripe{meta.payment.label ? ` · ${meta.payment.label}` : ''} · your card is never stored by us
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div style={{ textAlign: 'center', color: C.dim, fontSize: 11.5, marginTop: 16 }}>
          {displayName}
        </div>
      </div>
    </div>
  )
}
