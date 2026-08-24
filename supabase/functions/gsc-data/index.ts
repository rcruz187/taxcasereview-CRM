import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GSC_BASE  = 'https://searchconsole.googleapis.com'

const GSC_SITE_CANDIDATES: Record<string, string[]> = {
  taxres_crm: ['sc-domain:taxrescrm.net', 'https://taxrescrm.net/', 'https://www.taxrescrm.net/'],
  camvella: ['sc-domain:camvella.com', 'https://camvella.com/', 'https://www.camvella.com/'],
  arcvena: ['sc-domain:arcvena.com', 'https://arcvena.com/', 'https://www.arcvena.com/'],
}

function siteHost(siteUrl: string): string {
  if (siteUrl.startsWith('sc-domain:')) return siteUrl.slice('sc-domain:'.length).toLowerCase()
  try { return new URL(siteUrl).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' }
}

async function resolveSiteUrl(token: string, productKey: string): Promise<string> {
  const candidates = GSC_SITE_CANDIDATES[productKey]
  if (!candidates) throw new Error('Unsupported reporting product')

  const sitesRes = await fetch(`${GSC_BASE}/webmasters/v3/sites`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const sitesData = await sitesRes.json()
  if (!sitesRes.ok) throw new Error(sitesData?.error?.message || 'Could not list Search Console properties')

  const sites = sitesData.siteEntry || []
  const exact = candidates.find(candidate => sites.some((s: any) => s.siteUrl === candidate))
  if (exact) return exact

  const targetHost = siteHost(candidates[0])
  const sameDomain = sites.find((s: any) => siteHost(s.siteUrl || '') === targetHost)
  if (sameDomain?.siteUrl) return sameDomain.siteUrl

  throw new Error(`Google account does not have Search Console access to ${targetHost}`)
}

async function getValidToken(supabase: any, settings: any): Promise<string> {
  const expiry = settings.gsc_token_expiry ? new Date(settings.gsc_token_expiry).getTime() : 0
  if (settings.gsc_access_token && expiry > Date.now() + 60000) return settings.gsc_access_token
  if (!settings.gsc_refresh_token) throw new Error('No GSC refresh token — reconnect Google Search Console')

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: settings.gsc_refresh_token,
      client_id: settings.gmail_client_id,
      client_secret: settings.gmail_client_secret,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description || 'GSC token refresh failed')
  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString()
  await supabase.from('settings').update({
    gsc_access_token: data.access_token,
    gsc_token_expiry: expiresAt,
  }).eq('tenant_id', 'a0000000-0000-0000-0000-000000000001')
  return data.access_token
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const body = await req.json().catch(() => ({}))
    const { action, code, redirect_uri, product_key = 'taxres_crm' } = body

    if (!GSC_SITE_CANDIDATES[product_key]) throw new Error('Unsupported reporting product')

    const { data: settings, error: settingsError } = await supabase.from('settings')
      .select('*').eq('tenant_id', 'a0000000-0000-0000-0000-000000000001').maybeSingle()
    if (settingsError || !settings) throw new Error('Could not load Search Console settings')

    if (action === 'connect') {
      const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code, client_id: settings.gmail_client_id,
          client_secret: settings.gmail_client_secret,
          redirect_uri, grant_type: 'authorization_code',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error_description || 'OAuth exchange failed')

      const siteUrl = await resolveSiteUrl(data.access_token, product_key)
      const refreshToken = data.refresh_token || settings.gsc_refresh_token
      if (!refreshToken) throw new Error('Google did not return a refresh token. Reconnect with consent enabled.')

      const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString()
      const { error: updateError } = await supabase.from('settings').update({
        gsc_refresh_token: refreshToken,
        gsc_access_token: data.access_token,
        gsc_token_expiry: expiresAt,
        gsc_site_url: siteUrl,
      }).eq('tenant_id', 'a0000000-0000-0000-0000-000000000001')
      if (updateError) throw new Error(`Could not save Search Console connection: ${updateError.message}`)

      return new Response(JSON.stringify({ success: true, site: siteUrl, product_key }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!settings.gsc_refresh_token) {
      return new Response(JSON.stringify({ mock: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const token = await getValidToken(supabase, settings)
    const siteUrl = await resolveSiteUrl(token, product_key)

    if (settings.gsc_site_url !== siteUrl) {
      await supabase.from('settings').update({ gsc_site_url: siteUrl })
        .eq('tenant_id', 'a0000000-0000-0000-0000-000000000001')
    }

    const endDate = new Date()
    const startDate = new Date(endDate); startDate.setDate(startDate.getDate() - 28)
    const prevEnd = new Date(startDate)
    const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - 28)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)

    const gscPost = async (queryBody: any) => {
      const response = await fetch(
        `${GSC_BASE}/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(queryBody) }
      )
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error?.message || `Search Console query failed for ${siteUrl}`)
      }
      return data
    }

    const [cur, prev, queries] = await Promise.all([
      gscPost({ startDate: fmt(startDate), endDate: fmt(endDate), dimensions: [] }),
      gscPost({ startDate: fmt(prevStart), endDate: fmt(prevEnd), dimensions: [] }),
      gscPost({ startDate: fmt(startDate), endDate: fmt(endDate), dimensions: ['query'], rowLimit: 10, orderBy: [{ fieldName: 'impressions', sortOrder: 'DESCENDING' }] }),
    ])

    const c = cur.rows?.[0] || {}
    const p = prev.rows?.[0] || {}
    const pct = (a: number, b: number) => b ? Math.round(((a - b) / b) * 100) : 0

    return new Response(JSON.stringify({
      mock: false, product_key, siteUrl,
      impressions: Math.round(c.impressions || 0),
      impressionsChange: pct(c.impressions, p.impressions),
      clicks: Math.round(c.clicks || 0),
      clicksChange: pct(c.clicks, p.clicks),
      ctr: Math.round((c.ctr || 0) * 1000) / 10,
      ctrChange: Math.round(((c.ctr || 0) - (p.ctr || 0)) * 1000) / 10,
      avgPosition: Math.round((c.position || 0) * 10) / 10,
      posChange: Math.round(((p.position || 0) - (c.position || 0)) * 10) / 10,
      topQueries: (queries.rows || []).map((r: any) => ({
        query: r.keys[0],
        pos: Math.round(r.position * 10) / 10,
        clicks: r.clicks,
        impressions: r.impressions,
      })),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('gsc-data error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
