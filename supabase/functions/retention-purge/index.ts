// retention-purge
// Runs nightly via Supabase Cron. Does two things:
// 1. Calls run_retention_purge() — hard-deletes clients/leads soft-deleted
//    more than 30 days ago and returns their document storage paths.
// 2. Purges training recordings older than 90 days from the
//    training-recordings bucket.
//
// JWT Verification must be OFF — Supabase Cron calls this with no user token.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RECORDING_RETENTION_DAYS = 90

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── 1. Client / lead retention purge ────────────────────────────────────
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

    for (let i = 0; i < paths.length; i += 100) {
      const batch = paths.slice(i, i + 100)
      const { data: removed, error: rmErr } = await supabase.storage.from('documents').remove(batch)
      if (rmErr) {
        console.error('[retention-purge] document storage remove failed:', rmErr.message, batch)
        failures.push(...batch)
      } else {
        filesRemoved += (removed?.length ?? 0)
      }
    }

    // ── 2. Training recordings — purge files older than 90 days ─────────────
    let recordingsRemoved = 0
    let recordingsFailed  = 0
    const cutoff = new Date(Date.now() - RECORDING_RETENTION_DAYS * 24 * 60 * 60 * 1000)

    try {
      const { data: recFiles, error: listErr } = await supabase.storage
        .from('training-recordings')
        .list('', { limit: 1000, sortBy: { column: 'created_at', order: 'asc' } })

      if (listErr) {
        console.error('[retention-purge] recordings list failed:', listErr.message)
      } else if (recFiles?.length) {
        const stale = recFiles
          .filter(f => f.created_at && new Date(f.created_at) < cutoff)
          .map(f => f.name)

        for (let i = 0; i < stale.length; i += 100) {
          const batch = stale.slice(i, i + 100)
          const { data: removed, error: rmErr } = await supabase.storage
            .from('training-recordings')
            .remove(batch)
          if (rmErr) {
            console.error('[retention-purge] recordings remove failed:', rmErr.message, batch)
            recordingsFailed += batch.length
          } else {
            recordingsRemoved += (removed?.length ?? 0)
          }
        }

        if (stale.length) {
          console.log(`[retention-purge] recordings: ${recordingsRemoved} purged, ${recordingsFailed} failed (cutoff: ${cutoff.toISOString()})`)
        }
      }
    } catch (recErr) {
      console.error('[retention-purge] recordings purge unexpected:', recErr?.message || String(recErr))
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    const summary = {
      ok: true,
      purged_clients:      data?.purged_clients      ?? 0,
      purged_leads:        data?.purged_leads         ?? 0,
      files_removed:       filesRemoved,
      files_failed:        failures.length,
      recordings_removed:  recordingsRemoved,
      recordings_failed:   recordingsFailed,
      recordings_cutoff:   cutoff.toISOString(),
      ran_at:              data?.ran_at ?? new Date().toISOString(),
    }
    console.log('[retention-purge]', JSON.stringify(summary))
    if (failures.length) console.error('[retention-purge] stranded document files:', failures)

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
