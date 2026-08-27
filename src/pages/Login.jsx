import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'

// ── Auth constants ────────────────────────────────────────────────────────────
// Zero changes to auth logic — only the visual shell is new.
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

  // ── Tenant branding lookup — identical to original ────────────────────────
  useEffect(() => {
    if (ROMYLABS_OWNERS.includes(email.trim().toLowerCase())) {
      setBranding({
        firm_name: 'RomyLabs',
        logo_url:  '/romylabs-logo.png',
        sub:       'Platform Administration',
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

  // ── Auth submit — identical to original ──────────────────────────────────
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
      if (ROMYLABS_OWNERS.includes(data.user?.email?.toLowerCase())) {
        window.location.href = '/crm-admin'
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const firmName = branding?.firm_name || 'Tax Case Review'
  const logoUrl  = branding?.logo_url  || '/taxrescrm-logo.png'

  // ── Styles — self-contained, no classes that collide with app globals ─────
  const S = {
    page: {
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#060F1C',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
    },
    card: {
      display: 'flex',
      width: '100%',
      maxWidth: 920,
      minHeight: 560,
      borderRadius: 20,
      overflow: 'hidden',
      boxShadow: '0 32px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.06)',
    },
    // ── Left panel — dark branded ────────────────────────────────────────────
    left: {
      flex: '0 0 420px',
      background: 'linear-gradient(160deg, #0A1929 0%, #0D2140 55%, #0A2550 100%)',
      display: 'flex',
      flexDirection: 'column',
      padding: '52px 44px 40px',
      position: 'relative',
      overflow: 'hidden',
    },
    leftAccent: {
      position: 'absolute',
      top: -80,
      right: -80,
      width: 280,
      height: 280,
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(26,127,212,.18) 0%, transparent 70%)',
      pointerEvents: 'none',
    },
    leftAccent2: {
      position: 'absolute',
      bottom: -60,
      left: -40,
      width: 200,
      height: 200,
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(26,127,212,.10) 0%, transparent 70%)',
      pointerEvents: 'none',
    },
    logoImg: {
      height: 48,
      maxWidth: 220,
      objectFit: 'contain',
      display: 'block',
      marginBottom: 40,
      filter: 'brightness(1)',
    },
    eyebrow: {
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '.14em',
      textTransform: 'uppercase',
      color: '#1A7FD4',
      marginBottom: 12,
    },
    leftHeading: {
      fontSize: 28,
      fontWeight: 800,
      color: '#F0F6FF',
      lineHeight: 1.18,
      margin: '0 0 18px',
      letterSpacing: '-.01em',
    },
    leftBody: {
      fontSize: 14,
      color: '#8BA8C4',
      lineHeight: 1.7,
      margin: 0,
      flex: 1,
    },
    divider: {
      width: 36,
      height: 2,
      background: 'linear-gradient(90deg, #1A7FD4, transparent)',
      borderRadius: 2,
      margin: '28px 0',
    },
    badgeRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginTop: 'auto',
      paddingTop: 32,
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: '#22d3a5',
      flexShrink: 0,
      boxShadow: '0 0 6px rgba(34,211,165,.5)',
    },
    badgeLabel: {
      fontSize: 11.5,
      color: '#8BA8C4',
      fontWeight: 500,
    },
    // ── Right panel — clean white form ──────────────────────────────────────
    right: {
      flex: 1,
      background: '#FFFFFF',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '52px 48px',
    },
    formHeading: {
      fontSize: 24,
      fontWeight: 800,
      color: '#0A1929',
      margin: '0 0 6px',
      letterSpacing: '-.01em',
    },
    formSub: {
      fontSize: 13.5,
      color: '#64748B',
      margin: '0 0 32px',
      lineHeight: 1.5,
    },
    label: {
      display: 'block',
      fontSize: 12,
      fontWeight: 600,
      color: '#334155',
      marginBottom: 5,
      letterSpacing: '.01em',
    },
    input: {
      width: '100%',
      padding: '11px 14px',
      fontSize: 14,
      border: '1.5px solid #E2E8F0',
      borderRadius: 10,
      background: '#F8FAFC',
      color: '#0F172A',
      outline: 'none',
      boxSizing: 'border-box',
      transition: 'border-color .15s, box-shadow .15s',
      fontFamily: 'inherit',
    },
    fieldWrap: {
      marginBottom: 18,
    },
    errBox: {
      background: '#FEF2F2',
      border: '1.5px solid #FECACA',
      borderRadius: 10,
      padding: '10px 14px',
      fontSize: 13,
      color: '#DC2626',
      marginBottom: 20,
      lineHeight: 1.4,
    },
    btn: {
      width: '100%',
      padding: '13px',
      fontSize: 14.5,
      fontWeight: 700,
      background: '#1A7FD4',
      color: '#fff',
      border: 'none',
      borderRadius: 10,
      cursor: 'pointer',
      marginTop: 8,
      letterSpacing: '.01em',
      transition: 'background .15s, transform .1s, box-shadow .15s',
      fontFamily: 'inherit',
      boxShadow: '0 4px 14px rgba(26,127,212,.35)',
    },
    btnDisabled: {
      opacity: .65,
      cursor: 'not-allowed',
      boxShadow: 'none',
    },
    footer: {
      marginTop: 28,
      fontSize: 11,
      color: '#94A3B8',
      textAlign: 'center',
    },
  }

  // Focus styles — applied via onFocus/onBlur to avoid global CSS collision
  function focusInput(e)  { e.target.style.borderColor = '#1A7FD4'; e.target.style.boxShadow = '0 0 0 3px rgba(26,127,212,.12)'; e.target.style.background = '#fff' }
  function blurInput(e)   { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; e.target.style.background = '#F8FAFC' }
  function hoverBtn(e)    { if (!loading) { e.target.style.background = '#1567B8'; e.target.style.boxShadow = '0 6px 18px rgba(26,127,212,.45)' } }
  function leaveBtn(e)    { if (!loading) { e.target.style.background = '#1A7FD4'; e.target.style.boxShadow = '0 4px 14px rgba(26,127,212,.35)' } }

  return (
    <div style={S.page}>
      <div style={S.card} className="tcr-login-card">

        {/* ── Left — branded panel ──────────────────────────────────────── */}
        <div style={S.left} className="tcr-login-left">
          <div style={S.leftAccent} />
          <div style={S.leftAccent2} />

          <img
            src={logoUrl}
            alt={firmName}
            style={S.logoImg}
            onError={e => { e.target.style.display = 'none' }}
          />

          <div style={S.eyebrow}>Tax Resolution Management</div>
          <h1 style={S.leftHeading}>
            Your entire tax resolution<br />practice, in sync.
          </h1>
          <div style={S.divider} />
          <p style={S.leftBody}>
            Leads, clients, cases, IRS workflows, documents and communications
            in one secure workspace.
          </p>

          <div style={S.badgeRow}>
            <span style={S.dot} />
            <span style={S.badgeLabel}>Secure practice access</span>
          </div>
        </div>

        {/* ── Right — login form ───────────────────────────────────────── */}
        <div style={S.right} className="tcr-login-right">
          <h2 style={S.formHeading}>Welcome back</h2>
          <p style={S.formSub}>Sign in to manage your tax resolution practice.</p>

          {error && <div style={S.errBox}>{error}</div>}

          <form onSubmit={submit} noValidate>
            <div style={S.fieldWrap}>
              <label style={S.label} htmlFor="tcr-email">Email</label>
              <input
                id="tcr-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                autoFocus
                style={S.input}
                onFocus={focusInput}
                onBlur={blurInput}
              />
            </div>

            <div style={S.fieldWrap}>
              <label style={S.label} htmlFor="tcr-password">Password</label>
              <input
                id="tcr-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                style={S.input}
                onFocus={focusInput}
                onBlur={blurInput}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ ...S.btn, ...(loading ? S.btnDisabled : {}) }}
              onMouseEnter={hoverBtn}
              onMouseLeave={leaveBtn}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <div style={S.footer}>
            {isRomyLabsOwner ? 'RomyLabs Platform' : 'Powered by TaxRes CRM'}
          </div>
        </div>
      </div>

    </div>
  )
}
