// quickbooks-oauth-callback
// Called directly from the QuickBooksCallback React page (not by Intuit directly).
// Receives code/state/realmId as query params, exchanges for tokens, stores them.
// Returns JSON { ok, message } — the React page handles the redirect.
// verify_jwt OFF — called from the browser before session is confirmed.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const REDIRECT_URI = 'https://taxrescrm.app/auth/quickbooks-callback'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), {
    status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })

  const url = new URL(req.url)
  const code     = url.searchParams.get('code')
  const state    = url.searchParams.get('state') // base64(tenant_id)
  const realmId  = url.searchParams.get('realmId')
  const errParam = url.searchParams.get('error')

  if (errParam) return json({ ok: false, message: 'Intuit denied the connection: ' + errParam }, 400)
  if (!code || !state || !realmId) return json({ ok: false, message: 'Missing code/state/realmId' }, 400)

  let tenantId: string
  try { tenantId = atob(state) } catch { return json({ ok: false, message: 'Invalid state' }, 400) }

  const supaUrl    = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin      = createClient(supaUrl, serviceKey)

  const { data: settingsRow } = await admin.from('settings')
    .select('qb_client_id, qb_client_secret')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!settingsRow?.qb_client_id || !settingsRow?.qb_client_secret) {
    return json({ ok: false, message: 'QuickBooks Client ID/Secret not saved for this office' }, 400)
  }

  const basicAuth = btoa(`${settingsRow.qb_client_id}:${settingsRow.qb_client_secret}`)
  const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
  })
  const tokenData = await tokenRes.json()
  if (!tokenRes.ok || !tokenData.access_token) {
    return json({ ok: false, message: 'Token exchange failed: ' + (tokenData.error_description || tokenData.error || tokenRes.status) }, 400)
  }

  // Pull company name (best-effort)
  let companyName = null
  try {
    const infoRes = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/companyinfo/${realmId}`,
      { headers: { 'Authorization': `Bearer ${tokenData.access_token}`, 'Accept': 'application/json' } }
    )
    const infoData = await infoRes.json()
    companyName = infoData?.CompanyInfo?.CompanyName || null
  } catch (_) { /* non-fatal */ }

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

  const { error: upsertErr } = await admin.from('accounting_connections').upsert({
    tenant_id: tenantId,
    provider: 'quickbooks',
    external_company_id: realmId,
    external_company_name: companyName,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    token_expires_at: expiresAt,
    status: 'connected',
    connected_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id,provider' })

  if (upsertErr) return json({ ok: false, message: 'Token exchanged but failed to store: ' + upsertErr.message }, 500)

  return json({ ok: true, message: 'QuickBooks connected' + (companyName ? ` to ${companyName}` : '') })
})
