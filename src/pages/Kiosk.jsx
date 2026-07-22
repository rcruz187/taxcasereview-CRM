import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const LOGO = '/taxcasereview-CRM/logo.png'

const CLOCKIN_URL = window.location.origin + '/taxcasereview-CRM/clockin'

export default function Kiosk() {
  const [now, setNow] = useState(new Date())
  const [logoUrl, setLogoUrl] = useState(LOGO)
  const [lockdown, setLockdown] = useState(true)

  // Load this tenant's own logo (settings.logourl), never the shared file
  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from('settings').select('logourl').limit(1).maybeSingle()
      if (s?.logourl) {
        const img = new Image()
        img.onload = () => setLogoUrl(s.logourl)
        img.src = s.logourl
      }
    })()
  }, [])


  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Render QR code — static link, renders once on mount
  useEffect(() => {
    const el = document.getElementById('kiosk-qr-canvas')
    if (!el) return
    el.innerHTML = ''
    const render = () => {
      try {
        new window.QRCode(el, {
          text: CLOCKIN_URL,
          width: 200, height: 200,
          colorDark: '#0a2540', colorLight: '#ffffff',
        })
      } catch {
        el.innerHTML = '<div style="width:200px;height:200px;display:flex;align-items:center;justify-content:center;color:#6b7a90;font-size:12px">Loading QR...</div>'
      }
    }
    if (window.QRCode) {
      render()
    } else {
      const script = document.createElement('script')
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
      script.onload = render
      document.head.appendChild(script)
    }
  }, [])

  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg,#071c30 0%,#0a2f4e 55%,#0a3f60 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      fontFamily: '"DM Sans", system-ui, sans-serif',
    }}>
      <div style={{
        background: 'rgba(255,255,255,.07)',
        border: '1px solid rgba(255,255,255,.12)',
        borderRadius: 24,
        padding: '36px 40px',
        width: '100%',
        maxWidth: 420,
        textAlign: 'center',
      }}>
        {/* Logo */}
        <img
          src={logoUrl}
          alt="Tax Case Review"
          style={{ height: 64, objectFit: 'contain', background: '#fff', borderRadius: 12, padding: '6px 14px', marginBottom: 14 }}
          onError={e => { e.target.src = LOGO }}
        />
        <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 2 }}>Tax Case Review CRM</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', marginBottom: 18 }}>Employee Time Clock</div>

        {/* Live Clock */}
        <div style={{ fontSize: 48, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{timeStr}</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.4)', marginBottom: 24, marginTop: 4 }}>{dateStr}</div>

        {/* Badges */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {['👆 Tap your name', '🔒 Secure', '📱 No app needed'].map(b => (
            <span key={b} style={{
              background: 'rgba(41,182,216,.15)',
              border: '1px solid rgba(41,182,216,.3)',
              borderRadius: 99,
              padding: '3px 10px',
              fontSize: 10,
              color: '#29b6d8',
              fontWeight: 600,
            }}>{b}</span>
          ))}
        </div>

        {/* QR Code */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, display: 'inline-block' }}>
          <div id="kiosk-qr-canvas" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }} />
          <div style={{ fontSize: 11, color: '#6b7a90', marginTop: 10 }}>Point phone camera at QR code to clock in/out</div>
        </div>

        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.3)', marginTop: 4 }}>
          Scan to clock in or clock out — no app download required
        </div>

        {/* Back to CRM button — always visible */}
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <a href="/taxcasereview-CRM/"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,.12)',
              border: '1px solid rgba(255,255,255,.25)',
              borderRadius: 8, padding: '8px 20px',
              color: '#fff', textDecoration: 'none',
              fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
            }}>
            ← Back to CRM
          </a>
          {/* Tiny kiosk mode indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: lockdown ? 'rgba(29,158,117,.6)' : 'rgba(248,113,113,.6)', fontWeight: 600 }}>
              {lockdown ? '🔒 Kiosk Mode' : '🔓 Unlocked'}
            </span>
            <button onClick={() => setLockdown(l => !l)}
              style={{ background: 'none', border: '1px solid rgba(255,255,255,.1)', borderRadius: 6, color: 'rgba(255,255,255,.2)', fontSize: 9, padding: '2px 7px', cursor: 'pointer', fontFamily: 'inherit' }}>
              {lockdown ? 'Disable lockdown' : 'Re-lock'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
