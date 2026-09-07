import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BING_BASE = 'https://api.bing.com/webmaster/api'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: settings } = await supabase.from('settings')
      .select('bing_api_key, bing_site_url')
      .eq('tenant_id', 'a0000000-0000-0000-0000-000000000001')
      .maybeSingle()

    if (!settings?.bing_api_key) {
      return new Response(JSON.stringify({ error: 'no_key', message: 'Bing API key not configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const apiKey = settings.bing_api_key
    const siteUrl = settings.bing_site_url || 'https://taxrescrm.net/'

    const headers = {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Content-Type': 'application/json',
    }

    const today = new Date()
    const endDate = today.toISOString().slice(0, 10)
    const startDate = new Date(today.getTime() - 28 * 86400000).toISOString().slice(0, 10)

    // Bing Webmaster v3 REST API
    const [statsRes, pagesRes, keywordsRes] = await Promise.all([
      fetch(`${BING_BASE}/GetQueryStats?siteUrl=${encodeURIComponent(siteUrl)}&startDate=${startDate}&endDate=${endDate}`, { headers }),
      fetch(`${BING_BASE}/GetPageStats?siteUrl=${encodeURIComponent(siteUrl)}&startDate=${startDate}&endDate=${endDate}`, { headers }),
      fetch(`${BING_BASE}/GetKeywordStats?siteUrl=${encodeURIComponent(siteUrl)}&startDate=${startDate}&endDate=${endDate}`, { headers }),
    ])

    const [statsData, pagesData, keywordsData] = await Promise.all([
      statsRes.json().catch(() => ({})),
      pagesRes.json().catch(() => ({})),
      keywordsRes.json().catch(() => ({})),
    ])

    // Aggregate totals
    const stats = Array.isArray(statsData) ? statsData : (statsData.value || [])
    const pages = Array.isArray(pagesData) ? pagesData : (pagesData.value || [])
    const keywords = Array.isArray(keywordsData) ? keywordsData : (keywordsData.value || [])

    const totalClicks = stats.reduce((s: number, r: any) => s + (r.Clicks || r.clicks || 0), 0)
    const totalImpressions = stats.reduce((s: number, r: any) => s + (r.Impressions || r.impressions || 0), 0)
    const avgCtr = totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 100 : 0
    const avgPos = stats.length > 0 ? Math.round(stats.reduce((s: number, r: any) => s + (r.AveragePosition || r.avgPosition || 0), 0) / stats.length * 10) / 10 : 0

    return new Response(JSON.stringify({
      clicks: totalClicks,
      impressions: totalImpressions,
      ctr: avgCtr,
      avgPosition: avgPos,
      topPages: pages.slice(0, 10).map((p: any) => ({
        url: p.Url || p.url,
        clicks: p.Clicks || p.clicks || 0,
        impressions: p.Impressions || p.impressions || 0,
      })),
      topKeywords: keywords.slice(0, 10).map((k: any) => ({
        query: k.Query || k.query,
        clicks: k.Clicks || k.clicks || 0,
        impressions: k.Impressions || k.impressions || 0,
        avgPosition: Math.round((k.AveragePosition || k.avgPosition || 0) * 10) / 10,
      })),
      siteUrl,
      dateRange: { start: startDate, end: endDate },
      raw: { statsStatus: statsRes.status, pagesStatus: pagesRes.status },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('bing-data error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
