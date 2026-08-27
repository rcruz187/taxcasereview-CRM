import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://mpxgxfqdbquzkrvvejkh.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJtcHhnZ2ZxZGJxdXprcnZ2ZWpraCIsInJlZiI6Im1weGd4ZnFkYnF1emtydnZlamtoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyOTk5MzksImV4cCI6MjA5NDg3NTkzOX0.puvhU1MV5nGOykizeTkwCpRR7NKKaGsVpA8oqjVjmu4'

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
