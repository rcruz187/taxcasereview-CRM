// Shared email send helper with retry for Gmail rate limits (429)
// Wraps supabase.functions.invoke('send-email') with up to 3 retries
// on 429 responses, with 2s delay between attempts.
// Usage: await sendEmail(supabase, { to, subject, html, tenant_id })

export async function sendEmail(supabase, body, { retries = 3, delayMs = 2000 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, delayMs * attempt))
    }
    const { data, error } = await supabase.functions.invoke('send-email', { body })
    // Supabase wraps HTTP errors — check data for retryable flag
    if (!error && data && !data.error) return { data, error: null }
    const isRateLimit = data?.retryable === true || error?.message?.includes('429')
    if (!isRateLimit || attempt === retries) {
      return { data, error: error || new Error(data?.error || 'Email send failed') }
    }
    // Rate limited — wait and retry
    console.warn(`send-email: rate limited, retrying in ${delayMs * (attempt + 1)}ms (attempt ${attempt + 1}/${retries})`)
  }
  return { data: null, error: new Error('Email send failed after retries') }
}
