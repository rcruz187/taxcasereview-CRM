// fetch-usage-metrics
// Pulls Cached Egress / Storage / DB size from the Supabase Management API
// and stores a daily snapshot in usage_metrics, so the CRM's Settings page
// can show usage trends and warn before hitting plan limits — without
// requiring a manual trip to the Supabase dashboard.
//
// IMPORTANT: the parsing logic below is a first pass written before we'd
// confirmed the exact shape of the Management API's usage response. It
// ALWAYS stores the full raw_response in the table regardless of whether
// parsing succeeds, specifically so nothing is silently lost if the field
// names below turn out to be wrong — check raw_response in the DB and
// adjust the `cachedEgressGb` / `storageMb` / `dbSizeMb` extraction lines
// to match reality, then redeploy.
//
// Requires secret: TCR_MANAGEMENT_TOKEN (account-level personal
// access token from https://supabase.com/dashboard/account/tokens — NOT
// the same as SUPABASE_SERVICE_ROLE_KEY, which is project-scoped).
//
// JWT Verification must be OFF if this is triggered by an external cron
// (e.g. Supabase's built-in Cron / pg_cron scheduling), since those calls
// carry no user auth token.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PROJECT_REF = 'mpxgxfqdbquzkrvvejkh'
const EGRESS_LIMIT_GB = 5
const STORAGE_LIMIT_MB = 1024

serve(async () => {
  try {
    const mgmtToken = Deno.env.get('TCR_MANAGEMENT_TOKEN')
    if (!mgmtToken) {
      return new Response(JSON.stringify({ error: 'TCR_MANAGEMENT_TOKEN secret not set' }), { status: 500 })
    }

    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/usage`, {
      headers: { Authorization: `Bearer ${mgmtToken}` },
    })
    const raw = await res.json()

    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'Management API request failed', status: res.status, raw }), { status: 502 })
    }

    // Best-effort extraction — confirm against raw_response in the DB and
    // fix these paths if the real field names differ.
    const cachedEgressGb = raw?.egress_volume?.usage != null
      ? raw.egress_volume.usage / (1024 ** 3)
      : (raw?.cached_egress_gb ?? null)

    const storageMb = raw?.storage_size?.usage != null
      ? raw.storage_size.usage / (1024 ** 2)
      : (raw?.storage_used_mb ?? null)

    const dbSizeMb = raw?.db_size?.usage != null
      ? raw.db_size.usage / (1024 ** 2)
      : (raw?.db_size_mb ?? null)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { error: upsertErr } = await supabase
      .from('usage_metrics')
      .upsert({
        snapshot_date:    new Date().toISOString().slice(0, 10),
        cached_egress_gb: cachedEgressGb,
        egress_limit_gb:  EGRESS_LIMIT_GB,
        storage_used_mb:  storageMb,
        storage_limit_mb: STORAGE_LIMIT_MB,
        db_size_mb:       dbSizeMb,
        raw_response:     raw,
        fetched_at:       new Date().toISOString(),
      }, { onConflict: 'snapshot_date' })

    if (upsertErr) {
      return new Response(JSON.stringify({ error: upsertErr.message }), { status: 500 })
    }

    return new Response(JSON.stringify({ ok: true, cachedEgressGb, storageMb, dbSizeMb }), { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
