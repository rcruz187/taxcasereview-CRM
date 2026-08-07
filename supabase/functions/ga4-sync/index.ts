import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GA4_PROPERTY_ID = '548974931'

serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  try {
    // Get service account JSON from vault
    const { data: secretData, error: secretErr } = await supabase
      .from('vault.decrypted_secrets')
      .select('decrypted_secret')
      .eq('name', 'GA4_SERVICE_ACCOUNT_JSON')
      .single()

    if (secretErr || !secretData) {
      throw new Error('Could not read GA4_SERVICE_ACCOUNT_JSON from vault: ' + JSON.stringify(secretErr))
    }

    const serviceAccount = JSON.parse(secretData.decrypted_secret)

    // Get Google OAuth2 access token using JWT
    const token = await getGoogleAccessToken(serviceAccount)

    // Fetch multiple date ranges in parallel
    const ranges = [
      { name: 'today',     startDate: 'today',     endDate: 'today' },
      { name: 'yesterday', startDate: 'yesterday',  endDate: 'yesterday' },
      { name: '7days',     startDate: '7daysAgo',   endDate: 'yesterday' },
      { name: '30days',    startDate: '30daysAgo',  endDate: 'yesterday' },
    ]

    const results = await Promise.all(ranges.map(r => fetchGA4Report(token, r)))

    // Upsert traffic rows
    const rows: any[] = []
    for (const result of results) {
      if (!result?.rows) continue
      for (const row of result.rows) {
        const dims = row.dimensionValues || []
        const mets = row.metricValues || []
        rows.push({
          date: dims[0]?.value || new Date().toISOString().slice(0,10),
          channel: dims[1]?.value || 'Direct',
          sessions: parseInt(mets[0]?.value || '0'),
          users: parseInt(mets[1]?.value || '0'),
          new_users: parseInt(mets[2]?.value || '0'),
          returning_users: parseInt(mets[1]?.value||'0') - parseInt(mets[2]?.value||'0'),
          page_views: parseInt(mets[3]?.value || '0'),
          bounce_rate: parseFloat(mets[4]?.value || '0'),
          avg_session_sec: parseFloat(mets[5]?.value || '0'),
          pages_per_session: parseFloat(mets[6]?.value || '0'),
          synced_at: new Date().toISOString(),
        })
      }
    }

    if (rows.length > 0) {
      await supabase.from('marketing_ga4_traffic').upsert(rows, {
        onConflict: 'date,channel',
        ignoreDuplicates: false,
      })
    }

    // Fetch top pages
    const pagesReport = await fetchGA4Pages(token)
    const pageRows: any[] = []
    for (const row of pagesReport?.rows || []) {
      const dims = row.dimensionValues || []
      const mets = row.metricValues || []
      pageRows.push({
        date: new Date().toISOString().slice(0,10),
        page_path: dims[0]?.value || '/',
        sessions: parseInt(mets[0]?.value || '0'),
        users: parseInt(mets[1]?.value || '0'),
        bounce_rate: parseFloat(mets[2]?.value || '0'),
        avg_time_sec: parseFloat(mets[3]?.value || '0'),
        synced_at: new Date().toISOString(),
      })
    }

    if (pageRows.length > 0) {
      await supabase.from('marketing_ga4_pages').upsert(pageRows, {
        onConflict: 'date,page_path',
        ignoreDuplicates: false,
      })
    }

    // Log success
    await supabase.from('marketing_sync_log').insert({
      source: 'ga4',
      status: 'success',
      rows_upserted: rows.length + pageRows.length,
      synced_at: new Date().toISOString(),
    })

    return new Response(JSON.stringify({ ok: true, rows: rows.length, pages: pageRows.length }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('GA4 sync error:', err)
    const supabase2 = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    await supabase2.from('marketing_sync_log').insert({
      source: 'ga4',
      status: 'error',
      error_msg: String(err),
      synced_at: new Date().toISOString(),
    })
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})

async function getGoogleAccessToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }

  const enc = (obj: any) => btoa(JSON.stringify(obj)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
  const sigInput = enc(header) + '.' + enc(payload)

  // Import the private key
  const keyData = sa.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')
  const keyBytes = Uint8Array.from(atob(keyData), c => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )

  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(sigInput)
  )

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')

  const jwt = sigInput + '.' + sigB64

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  const data = await res.json()
  if (!data.access_token) throw new Error('Failed to get access token: ' + JSON.stringify(data))
  return data.access_token
}

async function fetchGA4Report(token: string, range: { name: string, startDate: string, endDate: string }) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
        dimensions: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'newUsers' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
          { name: 'screenPageViewsPerSession' },
        ],
        limit: 100,
      }),
    }
  )
  return res.json()
}

async function fetchGA4Pages(token: string) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
        ],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 50,
      }),
    }
  )
  return res.json()
}
