// retention-purge
// Nightly destructive retention job. Supabase JWT verification is off because
// pg_cron invokes it directly, so the function authenticates x-cron-secret
// against the server-only internal_secrets value before any service-role work.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}
const RECORDING_RETENTION_DAYS = 90
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})
function safeEqual(a:string,b:string){if(!a||!b||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({error:'Method not allowed'},405)

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const supplied=String(req.headers.get('x-cron-secret')||'')
    const {data:secretRow,error:secretErr}=await supabase.from('internal_secrets').select('value').eq('key','retention_purge_cron').maybeSingle()
    if(secretErr||!secretRow?.value)return json({error:'Retention authorization unavailable'},503)
    if(!safeEqual(supplied,String(secretRow.value)))return json({error:'Unauthorized'},401)

    const { data, error } = await supabase.rpc('run_retention_purge', { p_days: 30 })
    if (error) {
      console.error('[retention-purge] run_retention_purge failed:', error.message)
      return json({ ok: false, error: 'Retention purge failed' },500)
    }

    const paths: string[] = Array.isArray(data?.storage_paths) ? data.storage_paths.filter(Boolean) : []
    let filesRemoved = 0
    const failures: string[] = []
    for (let i = 0; i < paths.length; i += 100) {
      const batch = paths.slice(i, i + 100)
      const { data: removed, error: rmErr } = await supabase.storage.from('documents').remove(batch)
      if (rmErr) { console.error('[retention-purge] document storage remove failed:', rmErr.message); failures.push(...batch) }
      else filesRemoved += (removed?.length ?? 0)
    }

    let recordingsRemoved = 0, recordingsFailed = 0
    const cutoff = new Date(Date.now() - RECORDING_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    try {
      const { data: recFiles, error: listErr } = await supabase.storage.from('training-recordings').list('', { limit: 1000, sortBy: { column: 'created_at', order: 'asc' } })
      if (listErr) console.error('[retention-purge] recordings list failed:', listErr.message)
      else if (recFiles?.length) {
        const stale = recFiles.filter(f => f.created_at && new Date(f.created_at) < cutoff).map(f => f.name)
        for (let i = 0; i < stale.length; i += 100) {
          const batch = stale.slice(i, i + 100)
          const { data: removed, error: rmErr } = await supabase.storage.from('training-recordings').remove(batch)
          if (rmErr) { console.error('[retention-purge] recordings remove failed:', rmErr.message); recordingsFailed += batch.length }
          else recordingsRemoved += (removed?.length ?? 0)
        }
      }
    } catch (recErr) { console.error('[retention-purge] recordings purge unexpected:', (recErr as Error)?.message || String(recErr)) }

    const summary = { ok:true, purged_clients:data?.purged_clients??0, purged_leads:data?.purged_leads??0, files_removed:filesRemoved, files_failed:failures.length, recordings_removed:recordingsRemoved, recordings_failed:recordingsFailed, recordings_cutoff:cutoff.toISOString(), ran_at:data?.ran_at??new Date().toISOString() }
    console.log('[retention-purge]', JSON.stringify(summary))
    return json(summary)
  } catch (e) {
    console.error('[retention-purge] unexpected:', (e as Error)?.message || String(e))
    return json({ ok:false, error:'Retention purge failed' },500)
  }
})
