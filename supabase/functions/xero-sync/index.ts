// xero-sync
// Pushes this tenant's invoices/payments into their connected Xero
// organization. Mirrors quickbooks-sync's shape. Xero access tokens last
// ~30min; refresh tokens rotate on every use and are valid 60 days of
// inactivity — same "always persist the newest refresh_token" rule as QBO.

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
      .select('*').eq('tenant_id', tenantId).eq('provider', 'xero').maybeSingle()
    if (!conn || conn.status !== 'connected') return json({ error: 'Xero is not connected for this office' }, 400)

    const { data: settingsRow } = await admin.from('settings').select('xero_client_id, xero_client_secret').eq('tenant_id', tenantId).maybeSingle()
    if (!settingsRow?.xero_client_id || !settingsRow?.xero_client_secret) return json({ error: 'Xero credentials missing' }, 400)

    let accessToken = conn.access_token
    const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0
    if (Date.now() > expiresAt - 2 * 60 * 1000) {
      const basicAuth = btoa(`${settingsRow.xero_client_id}:${settingsRow.xero_client_secret}`)
      const refreshRes = await fetch('https://identity.xero.com/connect/token', {
        method: 'POST',
        headers: { 'Authorization': `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refresh_token }),
      })
      const refreshData = await refreshRes.json()
      if (!refreshRes.ok || !refreshData.access_token) {
        await admin.from('accounting_connections').update({ status: 'error' }).eq('tenant_id', tenantId).eq('provider', 'xero')
        return json({ error: 'Token refresh failed — please reconnect Xero: ' + (refreshData.error_description || refreshData.error) }, 400)
      }
      accessToken = refreshData.access_token
      await admin.from('accounting_connections').update({
        access_token: refreshData.access_token,
        refresh_token: refreshData.refresh_token,
        token_expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
      }).eq('tenant_id', tenantId).eq('provider', 'xero')
    }

    const xeroTenantId = conn.external_company_id
    const xeroHeaders = {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-tenant-id': xeroTenantId,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }

    const { data: invoices } = await admin.from('invoices').select('*').eq('tenant_id', tenantId).is('xero_synced_at', null).limit(50)
    let syncedInvoices = 0, syncedPayments = 0
    const errors: string[] = []

    for (const inv of invoices || []) {
      try {
        const body = {
          Type: 'ACCREC',
          Contact: { Name: inv.clientName || inv.clientname },
          LineItems: [{
            Description: inv.description || 'Services',
            Quantity: 1,
            UnitAmount: parseFloat(inv.total || inv.amount || '0'),
            AccountCode: '200', // default Sales account code — most Xero charts of accounts have this; firms with a custom chart should adjust
          }],
          Status: 'AUTHORISED',
        }
        const res = await fetch('https://api.xero.com/api.xro/2.0/Invoices', { method: 'POST', headers: xeroHeaders, body: JSON.stringify(body) })
        const data = await res.json()
        if (!res.ok) { errors.push(`Invoice ${inv.id}: ${data?.Elements?.[0]?.ValidationErrors?.[0]?.Message || res.status}`); continue }
        const xeroId = data?.Invoices?.[0]?.InvoiceID || null
        await admin.from('invoices').update({ xero_synced_at: new Date().toISOString(), xero_id: xeroId }).eq('id', inv.id)
        syncedInvoices++
      } catch (e) { errors.push(`Invoice ${inv.id}: ${String((e as Error).message || e)}`) }
    }

    // Xero payments must reference an existing Invoice, so only pull payments
    // whose invoice already synced this run or a prior one (has xero_id).
    const { data: payments } = await admin.from('payments')
      .select('*, invoices!inner(xero_id)')
      .eq('tenant_id', tenantId).is('xero_synced_at', null).limit(50)
    for (const pay of payments || []) {
      try {
        const invoiceXeroId = (pay as any).invoices?.xero_id
        if (!invoiceXeroId) { errors.push(`Payment ${pay.id}: linked invoice hasn't synced to Xero yet`); continue }
        const body = {
          Invoice: { InvoiceID: invoiceXeroId },
          Account: { Code: '090' }, // default Bank account code — adjust per firm's chart of accounts
          Amount: parseFloat(pay.amount || '0'),
        }
        const res = await fetch('https://api.xero.com/api.xro/2.0/Payments', { method: 'POST', headers: xeroHeaders, body: JSON.stringify(body) })
        const data = await res.json()
        if (!res.ok) { errors.push(`Payment ${pay.id}: ${data?.Elements?.[0]?.ValidationErrors?.[0]?.Message || res.status}`); continue }
        const xeroPayId = data?.Payments?.[0]?.PaymentID || null
        await admin.from('payments').update({ xero_synced_at: new Date().toISOString(), xero_id: xeroPayId }).eq('id', pay.id)
        syncedPayments++
      } catch (e) { errors.push(`Payment ${pay.id}: ${String((e as Error).message || e)}`) }
    }

    const result = { ok: errors.length === 0, synced_invoices: syncedInvoices, synced_payments: syncedPayments, errors }
    await admin.from('accounting_connections').update({ last_synced_at: new Date().toISOString(), last_sync_result: result }).eq('tenant_id', tenantId).eq('provider', 'xero')

    return json(result)
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})
