// platform-metrics — TCR live metrics endpoint for the Admin Portal hub
// Called on-demand by the hub when a product card is clicked.
// Returns live data — no snapshots, no cron, no stale reads.
// Each CRM gets its own copy of this function in its own Supabase project.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-secret',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // Verify request is from the Admin Portal hub
  const hubSecret = req.headers.get('x-hub-secret')
  if (hubSecret !== Deno.env.get('HUB_METRICS_SECRET')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const now = new Date()

    const [
      { data: tenants },
      { count: clientCount },
      { count: leadCount },
      { count: taskCount },
      { data: docs },
      { data: mrrData },
      { data: recentActivity },
      { data: employees },
    ] = await Promise.all([
      supabase.from('tenants').select('id,name,is_active,monthly_rate,tenant_code,created_at')
        .neq('tenant_code', 'ADMIN').neq('tenant_code', 'TAXRESCRM'),
      supabase.from('clients').select('*', { count: 'exact', head: true }),
      supabase.from('leads').select('*', { count: 'exact', head: true }),
      supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('documents').select('file_size'),
      supabase.from('tenants').select('monthly_rate,name,is_active')
        .neq('tenant_code', 'ADMIN').neq('tenant_code', 'TAXRESCRM').eq('is_active', true),
      supabase.from('notes').select('body,created_at,author_email')
        .order('created_at', { ascending: false }).limit(5),
      supabase.from('employees').select('id,name,email,role,tenant_id')
        .neq('role', 'admin').limit(50),
    ])

    const activeOffices  = (tenants || []).filter((t: any) => t.is_active).length
    const totalOffices   = (tenants || []).length
    const totalMRR       = (mrrData  || []).reduce((s: number, t: any) => s + Number(t.monthly_rate || 0), 0)
    const totalStorage   = (docs     || []).reduce((s: number, d: any) => s + Number(d.file_size    || 0), 0)

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
        active_offices: activeOffices,
        total_offices:  totalOffices,
        active_users:   (employees || []).length,
      },
      offices: (tenants || []).map((t: any) => ({
        id:        t.id,
        name:      t.name,
        is_active: t.is_active,
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
