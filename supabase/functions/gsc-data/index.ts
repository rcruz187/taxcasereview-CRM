import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GSC_BASE = 'https://searchconsole.googleapis.com'
const ADMIN_TENANT = 'a0000000-0000-0000-0000-000000000001'
const CANONICAL_REDIRECT = 'https://admin.romylabs.com/crm-admin/command-center'

const GSC_SITE_CANDIDATES: Record<string, string[]> = {
  romylabs: ['sc-domain:romylabs.com', 'https://romylabs.com/', 'https://www.romylabs.com/'],
  taxres_crm: ['sc-domain:taxrescrm.net', 'https://taxrescrm.net/', 'https://www.taxrescrm.net/'],
  camvella: ['sc-domain:camvella.com', 'https://camvella.com/', 'https://www.camvella.com/'],
  arcvena: ['sc-domain:arcvena.com', 'https://arcvena.com/', 'https://www.arcvena.com/'],
  bocasync: ['sc-domain:bocasync.com', 'https://bocasync.com/', 'https://www.bocasync.com/'],
  groundivo: ['sc-domain:groundivo.com', 'https://groundivo.com/', 'https://www.groundivo.com/'],
  oculivo: ['sc-domain:oculivo.com', 'https://oculivo.com/', 'https://www.oculivo.com/'],
}

function siteHost(siteUrl: string): string {
  if (siteUrl.startsWith('sc-domain:')) return siteUrl.slice('sc-domain:'.length).toLowerCase()
  try { return new URL(siteUrl).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' }
}

async function resolveSiteUrl(token: string, productKey: string): Promise<string> {
  const candidates = GSC_SITE_CANDIDATES[productKey]
  if (!candidates) throw new Error('Unsupported reporting product')
  const sitesRes = await fetch(`${GSC_BASE}/webmasters/v3/sites`, { headers: { Authorization: `Bearer ${token}` } })
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
  if (!settings.gsc_refresh_token) throw new Error('NO_REFRESH_TOKEN')
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
  if (!res.ok) {
    console.error('[gsc-data] refresh failed', data?.error || 'unknown', data?.error_description || '')
    throw new Error(`REFRESH_FAILED:${data?.error || 'unknown'}`)
  }
  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString()
  const { error: saveErr } = await supabase.from('settings').update({
    gsc_access_token: data.access_token,
    gsc_token_expiry: expiresAt,
    gmail_redirect_uri: CANONICAL_REDIRECT,
  }).eq('tenant_id', ADMIN_TENANT)
  if (saveErr) console.error('[gsc-data] token save failed', saveErr.message)
  return data.access_token
}

async function cachedTaxRes(supabase: any, productKey: string, reason: string) {
  const start = new Date(); start.setDate(start.getDate() - 28)
  const { data: rows } = await supabase.from('marketing_gsc_performance')
    .select('query,clicks,impressions,ctr,position,date,synced_at')
    .gte('date', start.toISOString().slice(0,10))
    .not('query','like','[page] %')
  const r = rows || []
  const impressions = r.reduce((s:number,x:any)=>s+Number(x.impressions||0),0)
  const clicks = r.reduce((s:number,x:any)=>s+Number(x.clicks||0),0)
  const ctr = impressions ? Math.round((clicks/impressions)*1000)/10 : 0
  const avgPosition = r.length ? Math.round((r.reduce((s:number,x:any)=>s+Number(x.position||0),0)/r.length)*10)/10 : 0
  const grouped = new Map<string,{query:string,clicks:number,impressions:number,posSum:number,n:number}>()
  for (const x of r) {
    const key = x.query || ''
    const g = grouped.get(key) || {query:key,clicks:0,impressions:0,posSum:0,n:0}
    g.clicks += Number(x.clicks||0); g.impressions += Number(x.impressions||0); g.posSum += Number(x.position||0); g.n++
    grouped.set(key,g)
  }
  const topQueries = [...grouped.values()].sort((a,b)=>b.impressions-a.impressions).slice(0,10)
    .map(g=>({query:g.query,clicks:g.clicks,impressions:g.impressions,pos:Math.round((g.posSum/Math.max(g.n,1))*10)/10}))
  const latest = r.map((x:any)=>x.synced_at).filter(Boolean).sort().at(-1) || null
  return { mock:false, connected:true, degraded:true, cached:true, reason, product_key:productKey,
    siteUrl:'https://taxrescrm.net/', impressions, impressionsChange:0, clicks, clicksChange:0,
    ctr, ctrChange:0, avgPosition, posChange:0, topQueries, cachedAt:latest }
}

function configuredFallback(settings:any, productKey:string, reason:string) {
  const siteUrl = productKey === 'taxres_crm' && settings.gsc_site_url
    ? settings.gsc_site_url
    : GSC_SITE_CANDIDATES[productKey]?.[0] || ''
  return { mock:false, connected:true, degraded:true, cached:false, reason, product_key:productKey,
    siteUrl, impressions:null, impressionsChange:0, clicks:null, clicksChange:0,
    ctr:null, ctrChange:0, avgPosition:null, posChange:0, topQueries:[] }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const body = await req.json().catch(() => ({}))
    const { action, code, product_key = 'taxres_crm' } = body
    if (!GSC_SITE_CANDIDATES[product_key]) throw new Error('Unsupported reporting product')

    const { data: settings, error: settingsError } = await supabase.from('settings')
      .select('*').eq('tenant_id', ADMIN_TENANT).maybeSingle()
    if (settingsError || !settings) throw new Error('Could not load Search Console settings')

    if (settings.gmail_redirect_uri !== CANONICAL_REDIRECT) {
      await supabase.from('settings').update({ gmail_redirect_uri: CANONICAL_REDIRECT }).eq('tenant_id', ADMIN_TENANT)
    }

    if (action === 'connect') {
      const res = await fetch(TOKEN_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: settings.gmail_client_id, client_secret: settings.gmail_client_secret,
          redirect_uri: CANONICAL_REDIRECT, grant_type: 'authorization_code' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error_description || 'OAuth exchange failed')
      const siteUrl = await resolveSiteUrl(data.access_token, product_key)
      const refreshToken = data.refresh_token || settings.gsc_refresh_token
      if (!refreshToken) throw new Error('Google did not return a refresh token')
      const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString()
      const { error: updateError } = await supabase.from('settings').update({
        gsc_refresh_token: refreshToken, gsc_access_token: data.access_token,
        gsc_token_expiry: expiresAt, gsc_site_url: siteUrl, gmail_redirect_uri: CANONICAL_REDIRECT,
      }).eq('tenant_id', ADMIN_TENANT)
      if (updateError) throw new Error(`Could not save Search Console connection: ${updateError.message}`)
      return new Response(JSON.stringify({ success:true, site:siteUrl, product_key }), { headers:{...corsHeaders,'Content-Type':'application/json'} })
    }

    if (!settings.gsc_refresh_token) {
      return new Response(JSON.stringify({ mock:true, connected:false }), { headers:{...corsHeaders,'Content-Type':'application/json'} })
    }

    let token = ''
    try {
      token = await getValidToken(supabase, settings)
    } catch (e:any) {
      const reason = e?.message || 'token_refresh_failed'
      const fallback = product_key === 'taxres_crm'
        ? await cachedTaxRes(supabase, product_key, reason)
        : configuredFallback(settings, product_key, reason)
      return new Response(JSON.stringify(fallback), { status:200, headers:{...corsHeaders,'Content-Type':'application/json'} })
    }

    let siteUrl = ''
    try { siteUrl = await resolveSiteUrl(token, product_key) }
    catch (e:any) {
      return new Response(JSON.stringify(configuredFallback(settings, product_key, e?.message || 'property_lookup_failed')),
        { status:200, headers:{...corsHeaders,'Content-Type':'application/json'} })
    }

    if (settings.gsc_site_url !== siteUrl && product_key === 'taxres_crm') {
      await supabase.from('settings').update({ gsc_site_url:siteUrl }).eq('tenant_id', ADMIN_TENANT)
    }

    const endDate = new Date(); const startDate = new Date(endDate); startDate.setDate(startDate.getDate()-28)
    const prevEnd = new Date(startDate); const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate()-28)
    const fmt=(d:Date)=>d.toISOString().slice(0,10)
    const gscPost = async (queryBody:any) => {
      const response = await fetch(`${GSC_BASE}/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
        method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}, body:JSON.stringify(queryBody) })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error?.message || `Search Console query failed for ${siteUrl}`)
      return data
    }
    const [cur,prev,queries] = await Promise.all([
      gscPost({startDate:fmt(startDate),endDate:fmt(endDate),dimensions:[]}),
      gscPost({startDate:fmt(prevStart),endDate:fmt(prevEnd),dimensions:[]}),
      gscPost({startDate:fmt(startDate),endDate:fmt(endDate),dimensions:['query'],rowLimit:10}),
    ])
    const c=cur.rows?.[0]||{}, p=prev.rows?.[0]||{}
    const pct=(a:number,b:number)=>b?Math.round(((a-b)/b)*100):0
    return new Response(JSON.stringify({ mock:false, connected:true, degraded:false, product_key, siteUrl,
      impressions:Math.round(c.impressions||0), impressionsChange:pct(c.impressions,p.impressions),
      clicks:Math.round(c.clicks||0), clicksChange:pct(c.clicks,p.clicks),
      ctr:Math.round((c.ctr||0)*1000)/10, ctrChange:Math.round(((c.ctr||0)-(p.ctr||0))*1000)/10,
      avgPosition:Math.round((c.position||0)*10)/10, posChange:Math.round(((p.position||0)-(c.position||0))*10)/10,
      topQueries:(queries.rows||[]).map((r:any)=>({query:r.keys[0],pos:Math.round(r.position*10)/10,clicks:r.clicks,impressions:r.impressions}))
    }), { headers:{...corsHeaders,'Content-Type':'application/json'} })
  } catch (err:any) {
    console.error('gsc-data error:', err?.message || err)
    return new Response(JSON.stringify({ error:err?.message || 'Unknown GSC error' }), { status:500, headers:{...corsHeaders,'Content-Type':'application/json'} })
  }
})
