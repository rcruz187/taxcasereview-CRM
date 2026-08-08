import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BING_BASE = 'https://ssl.bing.com/webmaster/api.svc/json'

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
    const siteUrl = settings.bing_site_url || 'https://taxrescrm.app/'

    const today = new Date()
    const endDate = today.toISOString().slice(0, 10)
    const startDate = new Date(today.getTime() - 28 * 86400000).toISOString().slice(0, 10)

    // Fetch traffic stats + top pages in parallel
    const [trafficRes, pagesRes, keywordsRes] = await Promise.all([
      fetch(`${BING_BASE}/GetUrlTrafficInfo?apikey=${apiKey}&siteUrl=${encodeURIComponent(siteUrl)}&startDate=${startDate}&endDate=${endDate}`),
      fetch(`${BING_BASE}/GetTopPages?apikey=${apiKey}&siteUrl=${encodeURIComponent(siteUrl)}&startDate=${startDate}&endDate=${endDate}`),
      fetch(`${BING_BASE}/GetKeywordStats?apikey=${apiKey}&siteUrl=${encodeURIComponent(siteUrl)}&startDate=${startDate}&endDate=${endDate}`),
    ])

    const [trafficData, pagesData, keywordsData] = await Promise.all([
      trafficRes.json().catch(() => ({})),
      pagesRes.json().catch(() => ({})),
      keywordsRes.json().catch(() => ({})),
    ])

    const traffic = trafficData.d || {}
    const pages = (pagesData.d || []).slice(0, 10)
    const keywords = (keywordsData.d || []).slice(0, 10)

    return new Response(JSON.stringify({
      clicks: traffic.Clicks || 0,
      impressions: traffic.Impressions || 0,
      ctr: traffic.Ctr ? Math.round(traffic.Ctr * 100) / 100 : 0,
      avgPosition: traffic.AvgPosition ? Math.round(traffic.AvgPosition * 10) / 10 : 0,
      topPages: pages.map((p: any) => ({
        url: p.Url,
        clicks: p.Clicks || 0,
        impressions: p.Impressions || 0,
      })),
      topKeywords: keywords.map((k: any) => ({
        query: k.Query,
        clicks: k.Clicks || 0,
        impressions: k.Impressions || 0,
        avgPosition: k.AvgPosition ? Math.round(k.AvgPosition * 10) / 10 : 0,
      })),
      siteUrl,
      dateRange: { start: startDate, end: endDate },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('bing-data error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
