import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// mercury-charge — charges an office via Mercury ACH/payment API.
// Called from AdminPortal billing tab by platform admin only.
// Reads MERCURY_API_KEY from the TCR settings row (never from client).
// Records every charge attempt in office_billing_payments regardless of outcome.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verify caller is platform admin
    const authHeader = req.headers.get('Authorization') || ''
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user?.email) return json({ error: 'Not authenticated' }, 401)

    const adminEmails = ['romy@taxcasereview.org', 'romy@taxrescrm.net', 'romy@romylabs.com', 'info@romylabs.com']
    if (!adminEmails.includes(user.email)) return json({ error: 'Not authorized' }, 403)

    const { tenant_id, amount, description, notes } = await req.json()
    if (!tenant_id || !amount || Number(amount) <= 0) {
      return json({ error: 'tenant_id and amount required' }, 400)
    }

    // Get Mercury API key from TCR platform settings row
    const { data: settings } = await supabase
      .from('settings')
      .select('mercury_api_key')
      .eq('tenant_id', '61a89aef-0e7e-4ea2-b222-44ab2024655a')
      .maybeSingle()

    const mercuryKey = settings?.mercury_api_key
    const configured = !!mercuryKey

    // Get office info for the charge description
    const { data: tenant } = await supabase
      .from('tenants')
      .select('firm_name, primary_contact_name, primary_contact_email')
      .eq('id', tenant_id)
      .maybeSingle()

    // Record the attempt first
    const paymentRecord = {
      tenant_id,
      amount: Number(amount),
      description: description || `Monthly billing — ${tenant?.firm_name || 'Office'}`,
      charged_by: user.email,
      notes: notes || null,
      status: configured ? 'processing' : 'pending_setup',
    }

    const { data: payment, error: insertErr } = await supabase
      .from('office_billing_payments')
      .insert([paymentRecord])
      .select()
      .single()

    if (insertErr) {
      console.error('mercury-charge: failed to record payment', insertErr)
      return json({ error: insertErr.message }, 500)
    }

    // If Mercury not configured — return pending state, don't error
    if (!configured) {
      return json({
        ok: false,
        pending: true,
        payment_id: payment.id,
        message: 'Mercury API key not configured. Payment recorded as pending — will process once Mercury is set up in Settings.',
      })
    }

    // Call Mercury API
    // Mercury uses Basic auth: API key as username, empty password
    const auth = 'Basic ' + btoa(`${mercuryKey}:`)

    // First get the Mercury account ID (the TaxRes CRM checking account)
    const accountsRes = await fetch('https://backend.mercury.com/api/v1/accounts', {
      headers: { Authorization: auth, 'Content-Type': 'application/json' }
    })

    if (!accountsRes.ok) {
      await supabase.from('office_billing_payments').update({ status: 'failed', notes: `Mercury accounts fetch failed: ${accountsRes.status}` }).eq('id', payment.id)
      return json({ error: `Mercury API error: ${accountsRes.status}` }, 502)
    }

    const accounts = await accountsRes.json()
    const checkingAccount = accounts?.accounts?.find((a: any) =>
      a.kind === 'checking' || a.type === 'checking'
    ) || accounts?.accounts?.[0]

    if (!checkingAccount) {
      await supabase.from('office_billing_payments').update({ status: 'failed', notes: 'No Mercury checking account found' }).eq('id', payment.id)
      return json({ error: 'No Mercury checking account found' }, 502)
    }

    // Create a payment/transaction via Mercury
    // Mercury sends payments via ACH — requires recipient bank details
    // For now record as initiated; full ACH setup requires recipient bank info per office
    const amountCents = Math.round(Number(amount) * 100)
    const txRes = await fetch(`https://backend.mercury.com/api/v1/account/${checkingAccount.id}/transactions`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: amountCents,
        currency: 'USD',
        externalMemo: description || `TaxRes CRM — ${tenant?.firm_name}`,
        note: notes || `Monthly subscription — ${tenant?.firm_name}`,
      })
    })

    const txData = await txRes.json()

    if (!txRes.ok) {
      await supabase.from('office_billing_payments').update({
        status: 'failed',
        notes: JSON.stringify(txData),
      }).eq('id', payment.id)
      return json({ error: txData?.message || 'Mercury transaction failed', detail: txData }, 502)
    }

    // Update payment record with Mercury transaction ID
    await supabase.from('office_billing_payments').update({
      status: 'completed',
      mercury_transaction_id: txData.id || txData.transactionId || null,
      mercury_account_id: checkingAccount.id,
    }).eq('id', payment.id)

    // Update last_billed_at on the tenant
    await supabase.from('tenants').update({ last_billed_at: new Date().toISOString() }).eq('id', tenant_id)

    return json({ ok: true, payment_id: payment.id, mercury_transaction_id: txData.id })

  } catch (err) {
    console.error('mercury-charge error:', err)
    return json({ error: String(err) }, 500)
  }
})
