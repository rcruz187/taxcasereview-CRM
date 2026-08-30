import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://mpxgxfqdbquzkrvvejkh.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1weGd4ZnFkYnF1emtydnZlamtoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyOTk5MzksImV4cCI6MjA5NDg3NTkzOX0.puvhU1MV5nGOykizeTkwCpRR7NKKaGsVpA8oqjVjmu4'

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

// Credential Vault re-auth must never mutate, refresh, sign out, or broadcast
// changes to the active Admin Portal session. The vault UI calls the normal
// signInWithPassword method to confirm the owner's password before revealing a
// secret; on the vault route only, perform a one-shot GoTrue password request
// directly and discard the returned access/refresh tokens immediately. The
// existing main Supabase client/session remains completely untouched.
const liveSignInWithPassword = supabase.auth.signInWithPassword.bind(supabase.auth)
supabase.auth.signInWithPassword = async credentials => {
  const isVaultReauth = typeof window !== 'undefined'
    && window.location.hostname.toLowerCase() === 'admin.romylabs.com'
    && window.location.pathname.startsWith('/crm-admin/vault')

  if (!isVaultReauth) return liveSignInWithPassword(credentials)

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: credentials?.email || '',
        password: credentials?.password || '',
      }),
    })

    if (!response.ok) {
      let message = 'Password verification failed'
      try {
        const payload = await response.json()
        message = payload?.msg || payload?.message || payload?.error_description || message
      } catch (_) {}
      return { data: { user: null, session: null }, error: new Error(message) }
    }

    // Intentionally do not persist or expose the returned auth session. A 2xx
    // response is sufficient proof that the supplied owner credentials are valid.
    return { data: { user: null, session: null }, error: null }
  } catch (error) {
    return { data: { user: null, session: null }, error }
  }
}
