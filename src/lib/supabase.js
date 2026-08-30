import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://mpxgxfqdbquzkrvvejkh.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6Im1weGd4ZnFkYnF1emtydnZlamtoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyOTk5MzksImV4cCI6MjA5NDg3NTkzOX0.puvhU1MV5nGOykizeTkwCpRR7NKKaGsVpA8oqjVjmu4'

// admin.romylabs.com is the platform control plane. A stale Jump In flag from
// a prior tenant session must never prevent the platform owner from reaching
// /crm-admin. Explicit ?imp=1 sessions are preserved so intentional Jump In
// behavior continues to work unchanged.
if (typeof window !== 'undefined' && window.location.hostname.toLowerCase() === 'admin.romylabs.com') {
  const impParam = new URLSearchParams(window.location.search).get('imp')
  if (!impParam) {
    try { sessionStorage.removeItem('admin_impersonation') } catch (_) {}
  }
}

const PORTAL_PAYMENT_FUNCTIONS = [
  'stripe-set-autopay',
  'stripe-setup-intent',
  'stripe-save-payment-method',
  'stripe-invoice-pay-intent',
  'stripe-invoice-pay-confirm',
]

async function secureFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input?.url || ''
  if (typeof sessionStorage !== 'undefined' && PORTAL_PAYMENT_FUNCTIONS.some(fn => url.includes(`/functions/v1/${fn}`))) {
    const tokenKey = Object.keys(sessionStorage).find(k => k.startsWith('tcr_portal_token_'))
    const portalToken = tokenKey ? sessionStorage.getItem(tokenKey) : ''
    if (portalToken) {
      const headers = new Headers(init.headers || (typeof input !== 'string' ? input?.headers : undefined) || {})
      headers.set('x-portal-token', portalToken)
      init = { ...init, headers }
    }
  }
  return fetch(input, init)
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: secureFetch },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
    reconnectAfterMs: (attempts) => Math.min(1000 * Math.pow(2, attempts), 30000),
  },
})

// Credential Vault re-auth must never mutate the active Admin Portal session.
// On the vault route, verify the owner's password directly against GoTrue.
// The returned session tokens are intentionally discarded, so the live
// Supabase client never receives a second SIGNED_IN event.
const liveSignInWithPassword = supabase.auth.signInWithPassword.bind(supabase.auth)
supabase.auth.signInWithPassword = async credentials => {
  const isVaultReauth = typeof window !== 'undefined'
    && window.location.hostname.toLowerCase() === 'admin.romylabs.com'
    && window.location.pathname.startsWith('/crm-admin/vault')

  if (!isVaultReauth) return liveSignInWithPassword(credentials)

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials || {}),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        data: { user: null, session: null },
        error: new Error(payload?.error_description || payload?.msg || payload?.error || 'Password verification failed'),
      }
    }
    return {
      data: { user: payload?.user || null, session: null },
      error: null,
    }
  } catch (error) {
    return { data: { user: null, session: null }, error }
  }
}

// Fail-safe for Credential Vault reveals. The backend RPC is the security
// boundary and already enforces protected RomyLabs owner access. When it
// successfully returns a decrypted secret, surface it immediately before any
// React re-render can discard local display state. Clipboard is best-effort;
// the prompt guarantees the user can still view/copy the value.
const liveRpc = supabase.rpc.bind(supabase)
supabase.rpc = async (fn, args, options) => {
  const result = await liveRpc(fn, args, options)
  const isVaultReveal = fn === 'credential_vault_reveal'
    && typeof window !== 'undefined'
    && window.location.hostname.toLowerCase() === 'admin.romylabs.com'
    && window.location.pathname.startsWith('/crm-admin/vault')

  if (isVaultReveal && !result?.error && typeof result?.data === 'string' && result.data.length) {
    try { await navigator.clipboard.writeText(result.data) } catch (_) {}
    window.prompt('Credential Revealed — copied to clipboard when permitted:', result.data)
  }
  return result
}
