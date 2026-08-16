// xero-oauth-callback
// Handles Xero's OAuth 2.0 redirect. Same shape as quickbooks-oauth-callback
// but for Xero's API: Xero has its own per-org "tenant ID" (stored here as
// external_company_id — unrelated to TCR's own tenants.id, just the same
// column reused for whichever provider's org identifier). A connected Xero
// app can have access to MULTIPLE orgs; we take the first one returned by
// /connections, which covers the common single-org-per-firm case. verify_jwt
// OFF — Xero calls this directly.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const APP_ORIGIN = Deno.env.get('APP_ORIGIN') || 'https://taxrescrm.app'
const REDIRECT_URI = `${APP_ORIGIN}/auth/xero-callback`

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const errParam = url.searchParams.get('error')

  const redirectWithMsg = (ok: boolean, msg: string) => {
    const dest = `${APP_ORIGIN}/settings?xero_connect=${ok ? 'ok' : 'error'}&msg=${encodeURIComponent(msg)}`
    return new Response(null, { status: 302, headers: { ...corsHeaders, Location: dest } })
  }

  if (errParam) return redirectWithMsg(false, 'Xero denied the connection: ' + errParam)
  if (!code || !state) return redirectWithMsg(false, 'Missing code/state from Xero redirect')

  let tenantId: string
  try { tenantId = atob(state) } catch { return redirectWithMsg(false, 'Invalid state') }

  const supaUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supaUrl, serviceKey)

  const { data: settingsRow } = await admin.from('settings').select('xero_client_id, xero_client_secret').eq('tenant_id', tenantId).maybeSingle()
  if (!settingsRow?.xero_client_id || !settingsRow?.xero_client_secret) {
    return redirectWithMsg(false, 'Xero Client ID/Secret not saved for this office yet')
  }

  const basicAuth = btoa(`${settingsRow.xero_client_id}:${settingsRow.xero_client_secret}`)
  const tokenRes = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
  })
  const tokenData = await tokenRes.json()
  if (!tokenRes.ok || !tokenData.access_token) {
    return redirectWithMsg(false, 'Token exchange failed: ' + (tokenData.error_description || tokenData.error || tokenRes.status))
  }

  // Which Xero org(s) did they authorize? Take the first connection.
  const connRes = await fetch('https://api.xero.com/connections', {
    headers: { 'Authorization': `Bearer ${tokenData.access_token}`, 'Accept': 'application/json' },
  })
  const connections = await connRes.json().catch(() => [])
  const org = Array.isArray(connections) && connections.length ? connections[0] : null
  if (!org?.tenantId) return redirectWithMsg(false, 'No Xero organization returned — grant access to at least one org')

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

  const { error: upsertErr } = await admin.from('accounting_connections').upsert({
    tenant_id: tenantId,
    provider: 'xero',
    external_company_id: org.tenantId,
    external_company_name: org.tenantName || null,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    token_expires_at: expiresAt,
    status: 'connected',
    connected_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id,provider' })

  if (upsertErr) return redirectWithMsg(false, 'Saved token exchange but failed to store connection: ' + upsertErr.message)

  return redirectWithMsg(true, 'Xero connected' + (org.tenantName ? ` to ${org.tenantName}` : ''))
})
