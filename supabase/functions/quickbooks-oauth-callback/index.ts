// quickbooks-oauth-callback
// Handles the Intuit OAuth 2.0 redirect after a user authorizes TCR's
// QuickBooks app. Exchanges the authorization code for access/refresh
// tokens, stores them per-tenant in accounting_connections, and redirects
// back into the app. This is the piece Settings.jsx has been waiting on —
// "Connect to QuickBooks" now actually works.
//
// Flow: Settings.jsx "Connect to QuickBooks" button opens Intuit's OAuth
// authorize URL with state=<tenant_id> (base64, so we know which tenant to
// attach the connection to when Intuit redirects back here — the whole
// point of per-tenant credentials is that each office uses its OWN Intuit
// app's client id/secret, stored on their own settings row).
// verify_jwt OFF — Intuit calls this directly with no Supabase session.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const APP_ORIGIN = 'https://taxrescrm.app'
const REDIRECT_URI = `${APP_ORIGIN}/auth/quickbooks-callback`

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') // base64(tenant_id)
  const realmId = url.searchParams.get('realmId')
  const errParam = url.searchParams.get('error')

  const redirectWithMsg = (ok: boolean, msg: string) => {
    const dest = `${APP_ORIGIN}/settings?qb_connect=${ok ? 'ok' : 'error'}&msg=${encodeURIComponent(msg)}`
    return new Response(null, { status: 302, headers: { ...corsHeaders, Location: dest } })
  }

  if (errParam) return redirectWithMsg(false, 'Intuit denied the connection: ' + errParam)
  if (!code || !state || !realmId) return redirectWithMsg(false, 'Missing code/state/realmId from Intuit redirect')

  let tenantId: string
  try { tenantId = atob(state) } catch { return redirectWithMsg(false, 'Invalid state') }

  const supaUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supaUrl, serviceKey)

  // Each tenant uses their OWN Intuit app credentials (stored on their
  // settings row, same field names the existing Settings.jsx UI already
  // writes: qb_client_id / qb_client_secret).
  const { data: settingsRow } = await admin.from('settings').select('qb_client_id, qb_client_secret').eq('tenant_id', tenantId).maybeSingle()
  if (!settingsRow?.qb_client_id || !settingsRow?.qb_client_secret) {
    return redirectWithMsg(false, 'QuickBooks Client ID/Secret not saved for this office yet')
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
    return redirectWithMsg(false, 'Token exchange failed: ' + (tokenData.error_description || tokenData.error || tokenRes.status))
  }

  // Pull the company name for a friendly display (best-effort — don't fail the connect if this errors)
  let companyName = null
  try {
    const infoRes = await fetch(`https://quickbooks.api.intuit.com/v3/company/${realmId}/companyinfo/${realmId}`, {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}`, 'Accept': 'application/json' },
    })
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

  if (upsertErr) return redirectWithMsg(false, 'Saved token exchange but failed to store connection: ' + upsertErr.message)

  return redirectWithMsg(true, 'QuickBooks connected' + (companyName ? ` to ${companyName}` : ''))
})
