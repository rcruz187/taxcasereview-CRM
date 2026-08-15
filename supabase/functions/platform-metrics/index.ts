// platform-metrics — TCR live metrics endpoint for the Admin Portal hub
// Accepts ?view=tcr (Tax Case Review practice) or ?view=saas (Tax Res CRM product)
// Called on-demand by the hub when a product card is clicked.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-secret',
}

const TCR_TENANT_ID  = '61a89aef-0e7e-4ea2-b222-44ab2024655a' // Tax Case Review (TRC-001)
const ADMIN_CODE     = 'ADMIN'
const TCR_CODE       = 'TRC-001'  // Romy's own practice — shown on Tax Case Review card
const DEMO_CODE      = 'DEMO'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const hubSecret = req.headers.get('x-hub-secret')
  if (hubSecret !== Deno.env.get('HUB_METRICS_SECRET')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }

  const url  = new URL(req.url)
  const view = url.searchParams.get('view') || 'saas' // 'tcr' | 'saas'

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const now = new Date()

    if (view === 'tcr') {
      // ── Tax Case Review — Romy's own practice only (TRC-001) ──────────────
      const [
        { count: clientCount },
        { count: leadCount },
        { count: taskCount },
        { data: docs },
        { data: recentActivity },
      ] = await Promise.all([
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('tenant_id', TCR_TENANT_ID),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('tenant_id', TCR_TENANT_ID),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('tenant_id', TCR_TENANT_ID).eq('status', 'pending'),
        supabase.from('documents').select('file_size').eq('tenant_id', TCR_TENANT_ID),
        supabase.from('notes').select('body,created_at,author_email').eq('tenant_id', TCR_TENANT_ID)
          .order('created_at', { ascending: false }).limit(5),
      ])

      const totalStorage = (docs || []).reduce((s: number, d: any) => s + Number(d.file_size || 0), 0)

      return new Response(JSON.stringify({
        ok: true,
        product: 'tax_case_review',
        product_label: 'Tax Case Review',
        fetched_at: now.toISOString(),
        metrics: {
          mrr:            0,   // practice, not billed monthly
          arr:            0,
          active_clients: clientCount  || 0,
          active_leads:   leadCount    || 0,
          pending_tasks:  taskCount    || 0,
          storage_bytes:  totalStorage,
          active_offices: 1,
          total_offices:  1,
          active_users:   0,
        },
        offices: [{ id: TCR_TENANT_ID, name: 'Tax Case Review', is_active: true, mrr: 0, since: '2025-01-01' }],
        recent_activity: (recentActivity || []).map((n: any) => ({
          text: (n.body || '').slice(0, 120),
          at:   n.created_at,
          by:   n.author_email,
        })),
      }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // ── Tax Res CRM SaaS — all paying tenants (exclude TRC-001, ADMIN, DEMO) ──
    const [
      { data: tenants },
      { count: clientCount },
      { count: leadCount },
      { count: taskCount },
      { data: docs },
      { data: recentActivity },
      { data: employees },
    ] = await Promise.all([
      supabase.from('tenants').select('id,firm_name,tenant_code,monthly_rate,created_at')
        .not('tenant_code', 'in', `(${ADMIN_CODE},${TCR_CODE},${DEMO_CODE})`),
      supabase.from('clients').select('*', { count: 'exact', head: true }),
      supabase.from('leads').select('*', { count: 'exact', head: true }),
      supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('documents').select('file_size'),
      supabase.from('notes').select('body,created_at,author_email')
        .order('created_at', { ascending: false }).limit(5),
      supabase.from('employees').select('id').not('role', 'eq', 'admin').limit(200),
    ])

    const totalMRR     = (tenants || []).reduce((s: number, t: any) => s + Number(t.monthly_rate || 0), 0)
    const totalStorage = (docs    || []).reduce((s: number, d: any) => s + Number(d.file_size    || 0), 0)

    return new Response(JSON.stringify({
      ok: true,
      product: 'taxres_crm',
      product_label: 'Tax Res CRM',
      fetched_at: now.toISOString(),
      metrics: {
        mrr:            totalMRR,
        arr:            totalMRR * 12,
        active_clients: clientCount  || 0,
        active_leads:   leadCount    || 0,
        pending_tasks:  taskCount    || 0,
        storage_bytes:  totalStorage,
        active_offices: (tenants || []).length,
        total_offices:  (tenants || []).length,
        active_users:   (employees || []).length,
      },
      offices: (tenants || []).map((t: any) => ({
        id:        t.id,
        name:      t.firm_name,
        is_active: true,
        mrr:       t.monthly_rate || 0,
        since:     t.created_at?.slice(0, 10),
      })),
      recent_activity: (recentActivity || []).map((n: any) => ({
        text: (n.body || '').slice(0, 120),
        at:   n.created_at,
        by:   n.author_email,
      })),
    }), { headers: { ...cors, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('platform-metrics error:', err)
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }
})
