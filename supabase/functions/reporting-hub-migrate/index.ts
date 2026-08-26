import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { Client } from 'https://deno.land/x/postgres@v0.17.0/mod.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-migrate-secret',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const secret = req.headers.get('x-migrate-secret')
  if (secret !== Deno.env.get('MIGRATE_SECRET') || !secret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }

  const dbUrl = Deno.env.get('SUPABASE_DB_URL')
  if (!dbUrl) {
    return new Response(JSON.stringify({ error: 'No DB URL available' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }

  const client = new Client(dbUrl)
  await client.connect()

  const results = []
  const stmts = [
    "ALTER TABLE marketing_gsc_performance ADD COLUMN IF NOT EXISTS product_id text NOT NULL DEFAULT \'taxres_crm\'",
    "UPDATE marketing_gsc_performance SET product_id = \'taxres_crm\' WHERE product_id IS NULL OR product_id = \'\'",
    "DROP INDEX IF EXISTS marketing_gsc_performance_date_query_key",
    "CREATE UNIQUE INDEX IF NOT EXISTS marketing_gsc_performance_product_date_query_key ON marketing_gsc_performance (product_id, date, query)",
    "DROP POLICY IF EXISTS marketing_gsc_admin_only ON marketing_gsc_performance",
    "CREATE POLICY marketing_gsc_admin_only ON marketing_gsc_performance FOR ALL USING (_is_platform_admin())",
    "ALTER TABLE marketing_ga4_traffic ADD COLUMN IF NOT EXISTS product_id text NOT NULL DEFAULT \'taxres_crm\'",
    "DROP INDEX IF EXISTS marketing_ga4_traffic_date_channel_key",
    "CREATE UNIQUE INDEX IF NOT EXISTS marketing_ga4_traffic_product_date_channel_key ON marketing_ga4_traffic (product_id, date, channel)",
  ]

  for (const stmt of stmts) {
    try {
      await client.queryArray(stmt)
      results.push({ ok: true, stmt: stmt.slice(0, 70) })
    } catch(e: any) {
      // IF NOT EXISTS / DROP IF EXISTS errors are non-fatal
      const msg = e.message || String(e)
      const nonFatal = msg.includes(\'already exists\') || msg.includes(\'does not exist\')
      results.push({ ok: nonFatal, stmt: stmt.slice(0, 70), error: msg })
      if (!nonFatal) { await client.end(); return new Response(JSON.stringify({ ok: false, results, error: msg }), { status: 500, headers: { ...cors, \'Content-Type\': \'application/json\' } }) }
    }
  }

  // Verification
  const verify = await client.queryObject<{ gsc_rows: number, gsc_products: number, checksum: string }>(
    `SELECT count(*)::int AS gsc_rows, count(DISTINCT product_id) AS gsc_products,
            md5(string_agg(query||date::text||clicks::text||impressions::text,\'|\' ORDER BY date,query)) AS checksum
     FROM marketing_gsc_performance`
  )

  await client.end()
  return new Response(JSON.stringify({ ok: true, results, verify: verify.rows }), {
    headers: { ...cors, 'Content-Type': 'application/json' }
  })
})
