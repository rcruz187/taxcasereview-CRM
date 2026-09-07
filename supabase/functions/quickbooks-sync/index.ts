// quickbooks-sync
// Pushes this tenant's invoices/payments into their connected QuickBooks
// Online company. Called from Settings.jsx's "Sync Now" button (session JWT
// required — this is a per-tenant self-service action, not a platform tool).
// Refreshes the access token first if it's expired or near expiry (QBO
// access tokens last ~1hr; refresh tokens rotate on every use and are valid
// ~100 days — we always persist whatever new refresh_token QBO hands back).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
    const supaUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    if (!token) return json({ error: 'Missing authorization' }, 401)
    const asCaller = createClient(supaUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } })
    const { data: { user }, error: userErr } = await asCaller.auth.getUser()
    if (userErr || !user?.email) return json({ error: 'Invalid session' }, 401)

    const admin = createClient(supaUrl, serviceKey)
    const { data: emp } = await admin.from('employees').select('tenant_id').eq('email', user.email).maybeSingle()
    if (!emp?.tenant_id) return json({ error: 'No tenant context for this user' }, 403)
    const tenantId = emp.tenant_id

    const { data: conn } = await admin.from('accounting_connections')
      .select('*').eq('tenant_id', tenantId).eq('provider', 'quickbooks').maybeSingle()
    if (!conn || conn.status !== 'connected') return json({ error: 'QuickBooks is not connected for this office' }, 400)

    const { data: settingsRow } = await admin.from('settings').select('qb_client_id, qb_client_secret').eq('tenant_id', tenantId).maybeSingle()
    if (!settingsRow?.qb_client_id || !settingsRow?.qb_client_secret) return json({ error: 'QuickBooks credentials missing' }, 400)

    // Refresh if the access token is expired or expiring within 2 minutes
    let accessToken = conn.access_token
    const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0
    if (Date.now() > expiresAt - 2 * 60 * 1000) {
      const basicAuth = btoa(`${settingsRow.qb_client_id}:${settingsRow.qb_client_secret}`)
      const refreshRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
        method: 'POST',
        headers: { 'Authorization': `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refresh_token }),
      })
      const refreshData = await refreshRes.json()
      if (!refreshRes.ok || !refreshData.access_token) {
        await admin.from('accounting_connections').update({ status: 'error' }).eq('tenant_id', tenantId).eq('provider', 'quickbooks')
        return json({ error: 'Token refresh failed — please reconnect QuickBooks: ' + (refreshData.error_description || refreshData.error) }, 400)
      }
      accessToken = refreshData.access_token
      await admin.from('accounting_connections').update({
        access_token: refreshData.access_token,
        refresh_token: refreshData.refresh_token,
        token_expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
      }).eq('tenant_id', tenantId).eq('provider', 'quickbooks')
    }

    const realmId = conn.external_company_id
    const qboBase = `https://quickbooks.api.intuit.com/v3/company/${realmId}`
    const qboHeaders = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json' }

    // Sync unsynced invoices as QBO Invoice objects (a generic "Services" line
    // item — QBO requires a real Item reference; firms typically have one
    // default item for this kind of sync, configured once).
    const { data: invoices } = await admin.from('invoices').select('*').eq('tenant_id', tenantId).is('qb_synced_at', null).limit(50)
    let syncedInvoices = 0, syncedPayments = 0
    const errors: string[] = []

    for (const inv of invoices || []) {
      try {
        const body = {
          Line: [{
            Amount: parseFloat(inv.total || inv.amount || '0'),
            DetailType: 'SalesItemLineDetail',
            Description: inv.description || 'Services',
            SalesItemLineDetail: { ItemRef: { value: '1', name: 'Services' } },
          }],
          CustomerRef: { name: inv.clientName || inv.clientname },
        }
        const res = await fetch(`${qboBase}/invoice`, { method: 'POST', headers: qboHeaders, body: JSON.stringify(body) })
        const data = await res.json()
        if (!res.ok) { errors.push(`Invoice ${inv.id}: ${data?.Fault?.Error?.[0]?.Message || res.status}`); continue }
        await admin.from('invoices').update({ qb_synced_at: new Date().toISOString(), qb_id: data?.Invoice?.Id || null }).eq('id', inv.id)
        syncedInvoices++
      } catch (e) { errors.push(`Invoice ${inv.id}: ${String((e as Error).message || e)}`) }
    }

    const { data: payments } = await admin.from('payments').select('*').eq('tenant_id', tenantId).is('qb_synced_at', null).limit(50)
    for (const pay of payments || []) {
      try {
        const body = {
          TotalAmt: parseFloat(pay.amount || '0'),
          CustomerRef: { name: pay.clientName || pay.clientname },
        }
        const res = await fetch(`${qboBase}/payment`, { method: 'POST', headers: qboHeaders, body: JSON.stringify(body) })
        const data = await res.json()
        if (!res.ok) { errors.push(`Payment ${pay.id}: ${data?.Fault?.Error?.[0]?.Message || res.status}`); continue }
        await admin.from('payments').update({ qb_synced_at: new Date().toISOString(), qb_id: data?.Payment?.Id || null }).eq('id', pay.id)
        syncedPayments++
      } catch (e) { errors.push(`Payment ${pay.id}: ${String((e as Error).message || e)}`) }
    }

    const result = { ok: errors.length === 0, synced_invoices: syncedInvoices, synced_payments: syncedPayments, errors }
    await admin.from('accounting_connections').update({ last_synced_at: new Date().toISOString(), last_sync_result: result }).eq('tenant_id', tenantId).eq('provider', 'quickbooks')

    return json(result)
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})
