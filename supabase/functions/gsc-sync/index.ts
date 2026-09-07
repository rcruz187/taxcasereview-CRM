// gsc-sync — daily GSC data ingestion
// Reads existing OAuth credentials from settings (admin tenant).
// Pulls last 90 days of query-level data from Search Console.
// Upserts into marketing_gsc_performance (date, query, clicks, impressions, ctr, position, page).
// Also pulls per-page data so commercial landing pages are captured.
// verify_jwt = false (cron-called)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TOKEN_URL   = 'https://oauth2.googleapis.com/token'
const GSC_BASE    = 'https://searchconsole.googleapis.com'
const ADMIN_TENANT = 'a0000000-0000-0000-0000-000000000001'

// Commercial pages to always capture explicitly
const COMMERCIAL_PAGES = [
  '/tax-resolution-crm',
  '/tax-resolution-software',
  '/crm-for-enrolled-agents',
  '/tax-resolution-case-management-software',
  '/canopy-alternative',
  '/taxdome-alternative',
  '/demo',
  '/resources',
]

function fmt(d: Date) { return d.toISOString().slice(0, 10) }

async function getValidToken(supabase: ReturnType<typeof createClient>, settings: any): Promise<string> {
  const expiry = settings.gsc_token_expiry ? new Date(settings.gsc_token_expiry).getTime() : 0
  if (settings.gsc_access_token && expiry > Date.now() + 60000) {
    return settings.gsc_access_token
  }
  // Refresh
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token:  settings.gsc_refresh_token,
      client_id:      settings.gmail_client_id,
      client_secret:  settings.gmail_client_secret,
      grant_type:     'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`GSC token refresh failed: ${data.error_description || data.error}`)
  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString()
  await supabase.from('settings').update({
    gsc_access_token: data.access_token,
    gsc_token_expiry: expiresAt,
  }).eq('tenant_id', ADMIN_TENANT)
  console.log('[gsc-sync] Token refreshed, expires', expiresAt)
  return data.access_token
}

async function gscQuery(token: string, siteUrl: string, body: Record<string, unknown>) {
  const res = await fetch(
    `${GSC_BASE}/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
  return res.json()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const now = new Date()
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch (_) {}
  const days = Number(body.days) || 90   // default: last 90 days
  const testMode = body.test === true    // returns data without upserting

  try {
    // ── Load settings ──────────────────────────────────────────────────
    const { data: settings, error: settErr } = await supabase
      .from('settings')
      .select('gsc_refresh_token, gsc_access_token, gsc_token_expiry, gsc_site_url, gmail_client_id, gmail_client_secret')
      .eq('tenant_id', ADMIN_TENANT)
      .single()

    if (settErr || !settings) throw new Error('Could not read admin settings row')
    if (!settings.gsc_refresh_token) throw new Error('No GSC refresh token — OAuth not connected')
    if (!settings.gsc_site_url)      throw new Error('No GSC site URL configured')

    const token   = await getValidToken(supabase, settings)
    const siteUrl = settings.gsc_site_url
    console.log(`[gsc-sync] Site: ${siteUrl}, days: ${days}`)

    const endDate   = new Date(now); endDate.setDate(endDate.getDate() - 3)   // GSC has ~3-day lag
    const startDate = new Date(endDate); startDate.setDate(startDate.getDate() - days)

    // ── 1. Query-level data (for content strategy + weekly report) ─────
    const queryData = await gscQuery(token, siteUrl, {
      startDate:  fmt(startDate),
      endDate:    fmt(endDate),
      dimensions: ['date', 'query'],
      rowLimit:   5000,
    })

    const queryRows: any[] = []
    for (const row of queryData.rows || []) {
      queryRows.push({
        date:        row.keys[0],
        query:       row.keys[1],
        clicks:      Math.round(row.clicks    || 0),
        impressions: Math.round(row.impressions || 0),
        ctr:         Number((row.ctr || 0).toFixed(4)),
        position:    Number((row.position || 0).toFixed(2)),
        page:        null,
        synced_at:   now.toISOString(),
      })
    }

    // ── 2. Page-level data (for commercial page tracking) ─────────────
    const pageData = await gscQuery(token, siteUrl, {
      startDate:  fmt(startDate),
      endDate:    fmt(endDate),
      dimensions: ['date', 'page'],
      rowLimit:   2000,
    })

    const pageRows: any[] = []
    for (const row of pageData.rows || []) {
      const rawPage = row.keys[1] as string
      // Store path only, not full URL, for cleaner matching
      let page = rawPage
      try { page = new URL(rawPage).pathname } catch (_) {}

      // Only store commercial pages + /resources + /demo + /book
      const isCommercial = COMMERCIAL_PAGES.some(p => page.startsWith(p)) || page === '/'
      if (!isCommercial) continue

      pageRows.push({
        date:        row.keys[0],
        query:       `[page] ${page}`,   // prefix distinguishes page rows from query rows
        clicks:      Math.round(row.clicks    || 0),
        impressions: Math.round(row.impressions || 0),
        ctr:         Number((row.ctr || 0).toFixed(4)),
        position:    Number((row.position || 0).toFixed(2)),
        page,
        synced_at:   now.toISOString(),
      })
    }

    const allRows = [...queryRows, ...pageRows]
    console.log(`[gsc-sync] Fetched ${queryRows.length} query rows + ${pageRows.length} page rows`)

    if (testMode) {
      return new Response(JSON.stringify({
        ok: true, test: true,
        query_rows: queryRows.slice(0, 10),
        page_rows: pageRows.slice(0, 10),
        total_query: queryRows.length,
        total_page: pageRows.length,
        site_url: siteUrl,
        date_range: { start: fmt(startDate), end: fmt(endDate) },
      }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // ── Upsert in batches of 500 ───────────────────────────────────────
    let inserted = 0
    const BATCH = 500
    for (let i = 0; i < allRows.length; i += BATCH) {
      const batch = allRows.slice(i, i + BATCH)
      const { error: upsertErr } = await supabase
        .from('marketing_gsc_performance')
        .upsert(batch, { onConflict: 'date,query' })
      if (upsertErr) {
        console.error(`[gsc-sync] Upsert batch ${i}-${i+BATCH} error:`, upsertErr.message)
      } else {
        inserted += batch.length
      }
    }

    console.log(`[gsc-sync] Upserted ${inserted} rows into marketing_gsc_performance`)

    return new Response(JSON.stringify({
      ok: true,
      site_url:      siteUrl,
      date_range:    { start: fmt(startDate), end: fmt(endDate) },
      query_rows:    queryRows.length,
      page_rows:     pageRows.length,
      upserted:      inserted,
      synced_at:     now.toISOString(),
    }), { headers: { ...cors, 'Content-Type': 'application/json' } })

  } catch (err: any) {
    console.error('[gsc-sync] Error:', err.message)
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }
})
