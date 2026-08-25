import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'

const ROMYLABS_OWNERS = ['romy@romylabs.com', 'info@romylabs.com']

export default function Login() {
  const { login, showToast } = useApp()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [branding, setBranding] = useState(null)
  const debounceRef = useRef(null)
  const isRomyLabsOwner = ROMYLABS_OWNERS.includes(email.trim().toLowerCase())

  // Lookup tenant branding by email domain as user types. The RomyLabs platform
  // owner gets platform branding rather than inheriting TaxRes tenant branding.
  useEffect(() => {
    if (ROMYLABS_OWNERS.includes(email.trim().toLowerCase())) {
      setBranding({
        firm_name: 'RomyLabs',
        logo_url: '/romylabs-logo.png',
        sub: 'Platform Administration',
      })
      return
    }

    const domain = email.split('@')[1]?.toLowerCase()
    if (!domain || !domain.includes('.')) {
      setBranding(null)
      return
    }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await supabase.rpc('get_branding_by_email_domain', { p_domain: domain })
        if (data && data.firm_name) {
          setBranding({
            firm_name: data.firm_name,
            logo_url:  data.logo_url || null,
            sub:       data.sub || 'IRS Resolution Platform',
          })
        } else {
          setBranding(null)
        }
      } catch (_) {
        setBranding(null)
      }
    }, 400)
    return () => clearTimeout(debounceRef.current)
  }, [email])

  async function submit(e) {
    e.preventDefault()
    if (!email || !password) return setError('Email and password required')
    setLoading(true)
    setError('')
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      login(data.user)
      showToast('Welcome back!')

      // Platform owner belongs in RomyLabs Command Center, never the TaxRes app.
      if (ROMYLABS_OWNERS.includes(data.user?.email?.toLowerCase())) {
        window.location.href = '/crm-admin'
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const firmName = branding?.firm_name || 'TaxRes CRM'
  const sub      = branding?.sub       || 'IRS Resolution Platform'
  const logoUrl  = branding?.logo_url  || null

  return (
    <div className="login-wrap">
      <form className="login-box" onSubmit={submit}>
        <div className="login-logo">
          {logoUrl ? (
            <img src={logoUrl} alt={firmName}
              style={{ height: isRomyLabsOwner ? 64 : 52, maxWidth: 220, objectFit: 'contain', display: 'block', margin: '0 auto' }}
              onError={e => { e.target.style.display = 'none' }} />
          ) : (
            <div style={{
              width: 56, height: 56, borderRadius: 14,
              background: 'var(--blue)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 26, fontWeight: 900, color: '#fff',
            }}>{firmName.charAt(0)}</div>
          )}
        </div>
        <div className="login-title">{firmName}</div>
        <div className="login-sub">{sub}</div>

        {error && <div className="login-err">{error}</div>}

        <div className="field">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </div>

        <button
          type="submit"
          className="btn pri lg full"
          style={{ marginTop: 8 }}
          disabled={loading}
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>

        <div style={{ marginTop: 16, fontSize: 11, color: 'var(--t3)', textAlign: 'center' }}>
          {isRomyLabsOwner ? 'RomyLabs Platform' : 'Powered by TaxRes CRM'}
        </div>
      </form>
    </div>
  )
}
