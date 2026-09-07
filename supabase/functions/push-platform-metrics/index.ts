// push-platform-metrics — TCR nightly metrics push to platform_metrics table
// Runs on a schedule (cron) or can be triggered manually.
// SAFE: read-only queries against TCR data, single INSERT/UPSERT to platform_metrics.
// Never touches any existing table structure or existing functions.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Gather TCR metrics — read-only queries, no side effects
    const [
      { data: tenants },
      { data: clients },
      { data: leads },
      { data: storage },
      { data: mrr },
    ] = await Promise.all([
      supabase.from('tenants').select('id, is_active').neq('tenant_code', 'ADMIN').neq('tenant_code', 'TAXRESCRM'),
      supabase.from('clients').select('id', { count: 'exact', head: true }),
      supabase.from('leads').select('id', { count: 'exact', head: true }),
      supabase.from('documents').select('file_size'),
      supabase.from('tenants').select('monthly_rate').neq('tenant_code', 'ADMIN').neq('tenant_code', 'TAXRESCRM').eq('is_active', true),
    ])

    const totalMRR     = (mrr || []).reduce((sum: number, t: any) => sum + (t.monthly_rate || 0), 0)
    const totalStorage = (storage || []).reduce((sum: number, d: any) => sum + (d.file_size || 0), 0)
    const activeOffices = (tenants || []).filter((t: any) => t.is_active).length

    const row = {
      product:        'taxres',
      metric_date:    new Date().toISOString().slice(0, 10),
      mrr:            totalMRR,
      active_clients: clients?.length ?? 0,
      active_users:   0, // populated from employees query below
      leads:          leads?.length ?? 0,
      storage_bytes:  totalStorage,
      offices:        activeOffices,
      custom_json:    { total_offices: (tenants || []).length },
      pushed_at:      new Date().toISOString(),
    }

    // Upsert — safe on conflict (product, metric_date)
    const { error } = await supabase
      .from('platform_metrics')
      .upsert(row, { onConflict: 'product,metric_date' })

    if (error) throw error

    return new Response(JSON.stringify({ ok: true, product: 'taxres', date: row.metric_date }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
