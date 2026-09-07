// ImpersonateGate — handles ?admin_token=<uuid> links from the admin portal.
// Validates the token, sets the tenant context override, then renders the
// full CRM Shell as if you're a Super Admin inside that office.
// The banner at the top reminds you you're in impersonation mode.

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const LOGO = '/taxrescrm-logo.png'
const TAXRESCRM_TENANT = 'a0000000-0000-0000-0000-000000000001'

export default function ImpersonateGate() {
  const [status, setStatus] = useState('validating')
  const [info, setInfo]     = useState(null)
  const [error, setError]   = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token  = params.get('admin_token')
    if (!token) { setStatus('error'); setError('No token provided'); return }
    validate(token)
  }, [])

  async function validate(token) {
    try {
      const { data, error } = await supabase.rpc('validate_impersonation_token', {
        p_token: token
      })
      if (error || !data?.valid) {
        setStatus('error')
        setError(data?.error || error?.message || 'Invalid or expired token')
        return
      }

      // Product context controls product branding. RomyLabs branding belongs
      // only to /crm-admin. Tenant sessions keep each tenant's own branding.
      const isTaxResProduct = data.tenant_id === TAXRESCRM_TENANT
      const firmName = isTaxResProduct ? 'TaxRes CRM' : data.firm_name
      const logoUrl = isTaxResProduct ? LOGO : (data.logo_url || '')

      const impersonation = {
        tenant_id:   data.tenant_id,
        tenant_code: data.tenant_code,
        firm_name:   firmName,
        admin_email: data.admin_email,
        logo_url:    logoUrl,
        brand_color: data.brand_color,
        started_at:  new Date().toISOString(),
      }
      sessionStorage.setItem('admin_impersonation', JSON.stringify(impersonation))

      // Prevent the next page from briefly showing a stale logo from whichever
      // tenant was opened previously. The CRM sidebar reads this cache on first
      // paint before the async branding loader runs.
      try {
        localStorage.setItem('tcr_firm_branding', JSON.stringify({
          name: firmName,
          slug: String(firmName || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
          tenantId: data.tenant_id,
          logoUrl,
          address: '', phone: '', email: '', website: '', fax: '', labels: {},
          paymentProvider: 'stripe'
        }))
      } catch (_) {}

      setInfo({ ...data, firm_name: firmName, logo_url: logoUrl })
      setStatus('ok')

      setTimeout(() => {
        window.location.href = window.location.origin + '/?imp=1'
      }, 1500)

    } catch (e) {
      setStatus('error')
      setError(e.message)
    }
  }

  const displayLogo = status === 'ok' && info ? (info.logo_url || '') : LOGO
  const displayAlt = status === 'ok' && info ? info.firm_name : 'TaxRes CRM'

  return (
    <div style={{
      minHeight: '100vh', background: '#0d0c1a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, Arial, sans-serif'
    }}>
      <div style={{
        background: 'rgba(255,255,255,.04)',
        border: '1px solid rgba(99,102,241,.3)',
        borderRadius: 20, padding: '40px 48px',
        textAlign: 'center', maxWidth: 420, width: '100%'
      }}>
        {displayLogo ? (
          <img src={displayLogo} alt={displayAlt}
            style={{ height: 44, maxWidth: 220, objectFit: 'contain', marginBottom: 24, display: 'block', margin: '0 auto 24px' }}
            onError={e => { e.currentTarget.style.display = 'none' }} />
        ) : (
          <div style={{ fontSize:18, fontWeight:800, color:'#fff', marginBottom:24 }}>{displayAlt}</div>
        )}

        {status === 'validating' && (
          <>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔐</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
              Validating admin token…
            </div>
            <div style={{ fontSize: 13, color: '#475569' }}>Opening office session</div>
          </>
        )}

        {status === 'ok' && info && (
          <>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#10b981', marginBottom: 8 }}>
              Jumping into {info.firm_name}
            </div>
            <div style={{ fontSize: 13, color:'#475569', marginBottom:16 }}>
              Super Admin session · Token validated · Redirecting…
            </div>
            <div style={{
              background:'rgba(16,185,129,.1)', border:'1px solid rgba(16,185,129,.3)',
              borderRadius:10, padding:'10px 16px', fontSize:12, color:'#10b981'
            }}>
              You are acting as Super Admin inside this office.<br/>
              All actions will be logged in the audit trail.
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize:40, marginBottom:12 }}>❌</div>
            <div style={{ fontSize:17, fontWeight:700, color:'#ef4444', marginBottom:8 }}>
              Token invalid or expired
            </div>
            <div style={{ fontSize:13, color:'#64748b', marginBottom:20 }}>{error}</div>
            <button onClick={() => window.close()}
              style={{ padding:'10px 24px', borderRadius:8, border:'none', cursor:'pointer',
                background:'rgba(99,102,241,.2)', color:'#a5b4fc', fontSize:13, fontWeight:600 }}>
              Close this tab
            </button>
            <div style={{ fontSize:12, color:'#475569', marginTop:10 }}>
              Tokens expire after 15 minutes. Generate a new one from the admin portal.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
