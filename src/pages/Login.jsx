import { useState } from 'react'
import { useApp } from '../context/AppContext'

export default function Login() {
  const { login, showToast } = useApp()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!username || !password) return setError('Username and password required')
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-firm-slug': 'taxcasereview',
        },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Login failed')
      login(data.user || data)
      showToast(`Welcome back, ${(data.user || data).name || username}!`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-box" onSubmit={submit}>
        <div className="login-logo">
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'var(--blue)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: 26, fontWeight: 900, color: '#fff',
          }}>T</div>
        </div>
        <div className="login-title">Tax Resolution CRM</div>
        <div className="login-sub">IRS Resolution Platform</div>

        {error && <div className="login-err">{error}</div>}

        <div className="field">
          <label>Username</label>
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="rcruz187"
            autoComplete="username"
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
