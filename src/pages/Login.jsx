import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'

export default function Login() {
  const { login, showToast } = useApp()
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!email || !password) return setError('Email and password required')
    setLoading(true)
    setError('')
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      login(data.user)
      showToast(`Welcome back!`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const TAXRESCRM_LOGO = "/taxcasereview-CRM/assets/taxrescrm-logo.png"
  const isTaxResCRM = email.toLowerCase().includes('taxrescrm')

  return (
    <div className="login-wrap">
      <form className="login-box" onSubmit={submit}>
        <div className="login-logo">
          {isTaxResCRM ? (
            <img src={TAXRESCRM_LOGO} alt="TaxRes CRM"
              style={{ height: 52, objectFit: 'contain', display: 'block', margin: '0 auto' }}
              onError={e => { e.target.style.display = 'none' }} />
          ) : (
            <div style={{
              width: 56, height: 56, borderRadius: 14,
              background: 'var(--blue)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 26, fontWeight: 900, color: '#fff',
            }}>T</div>
          )}
        </div>
        <div className="login-title">{isTaxResCRM ? 'TaxRes CRM' : 'Tax Resolution CRM'}</div>
        <div className="login-sub">{isTaxResCRM ? 'Platform Administration' : 'IRS Resolution Platform'}</div>

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
          Tax Case Review SaaS Platform
        </div>
      </form>
    </div>
  )
}