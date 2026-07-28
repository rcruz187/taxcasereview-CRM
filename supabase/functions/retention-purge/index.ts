// retention-purge
// Runs nightly via Supabase Cron. Calls run_retention_purge(), which
// hard-deletes any client/lead soft-deleted more than 30 days ago (cascading
// through their child rows in a single transaction each) and returns the
// storage object paths that belonged to the purged clients' documents. This
// function then removes those files from the 'documents' bucket.
//
// Unlike the app's inline document deletes — which swallow storage errors with
// .catch(() => {}) — every failed removal here is logged and counted, so a
// stranded file is visible rather than silent.
//
// JWT Verification must be OFF — Supabase Cron calls this with no user token.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data, error } = await supabase.rpc('run_retention_purge', { p_days: 30 })
    if (error) {
      console.error('[retention-purge] run_retention_purge failed:', error.message)
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const paths: string[] = Array.isArray(data?.storage_paths) ? data.storage_paths.filter(Boolean) : []
    let filesRemoved = 0
    const failures: string[] = []

    // Remove in batches; storage .remove accepts an array.
    for (let i = 0; i < paths.length; i += 100) {
      const batch = paths.slice(i, i + 100)
      const { data: removed, error: rmErr } = await supabase.storage.from('documents').remove(batch)
      if (rmErr) {
        console.error('[retention-purge] storage remove failed for batch:', rmErr.message, batch)
        failures.push(...batch)
      } else {
        filesRemoved += (removed?.length ?? 0)
      }
    }

    const summary = {
      ok: true,
      purged_clients: data?.purged_clients ?? 0,
      purged_leads: data?.purged_leads ?? 0,
      files_removed: filesRemoved,
      files_failed: failures.length,
      ran_at: data?.ran_at ?? new Date().toISOString(),
    }
    console.log('[retention-purge]', JSON.stringify(summary))
    if (failures.length) console.error('[retention-purge] stranded files:', failures)

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('[retention-purge] unexpected:', e?.message || String(e))
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
