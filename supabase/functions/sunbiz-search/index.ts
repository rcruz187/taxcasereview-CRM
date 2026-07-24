// sunbiz-search
// FL Division of Corporations (Sunbiz) search — name availability + entity
// lookup for FormaCorp. Two modes:
//   { mode: 'name-check', name: 'Acme Holdings' } → { available: boolean, matches: [...] }
//   { mode: 'lookup', query: 'L23000012345' | 'Acme Holdings LLC' } → { entities: [...] }
//
// Sunbiz has NO official REST API. We scrape search.sunbiz.org's public search
// pages. That means:
//   - HTML shape can change without notice; on breakage the function returns
//     { ok:false, reason:'sunbiz_parse_error' } and the UI falls back to the
//     manual sunbiz.org link that already existed today.
//   - Sunbiz may rate-limit or IP-block cloud egress. If we get a non-200 or
//     a body that doesn't look like the search page, we return
//     { ok:false, reason:'sunbiz_unavailable' } so the UI can degrade gracefully.
//
// Deploy with JWT Verification OFF — called from anonymous booking-like paths
// (name check inside the wizard) as well as signed-in FormaCorp.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Sunbiz's name-search endpoint. `SearchTerm` and `SearchNameOrder` are the
// exact form fields sunbiz.org uses; other params are the site's defaults for
// an "all-active" search.
const NAME_SEARCH_URL =
  'https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults'

// Normalize a name the way Sunbiz effectively does — strip punctuation, collapse
// whitespace, drop entity suffixes, lowercase — so "Acme Holdings, LLC" and
// "Acme Holdings L.L.C." compare as the same.
function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[.,'"“”‘’()]/g, ' ')
    .replace(/\b(llc|l l c|inc|incorporated|corp|corporation|company|co|ltd|limited|lp|llp|pllc|pa)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface SunbizHit {
  name: string
  documentNumber: string
  status: string
  detailUrl: string
}

async function fetchSunbiz(searchTerm: string): Promise<SunbizHit[] | null> {
  const params = new URLSearchParams({
    inquiryType: 'EntityName',
    searchTerm: searchTerm,
  })
  const url = `${NAME_SEARCH_URL}?${params.toString()}`
  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        // Match a real browser — Sunbiz returns different HTML for known crawler UAs.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
  } catch (_e) {
    return null
  }
  if (!res.ok) return null
  const html = await res.text()
  // Sunbiz results table has a stable structure: rows in `#search-results tbody`,
  // three cells per row (Name link, Document Number, Status).
  const rows: SunbizHit[] = []
  const tbodyMatch = html.match(/<table[^>]*id=["']search-results["'][^>]*>[\s\S]*?<tbody[^>]*>([\s\S]*?)<\/tbody>/i)
  if (!tbodyMatch) {
    // Not the results page we expected — treat as parse error, not "no results".
    // Sunbiz returns a distinct "no results" page which still has the empty tbody.
    if (!/no records\s+match/i.test(html) && !/search-results/i.test(html)) {
      return null
    }
    return []
  }
  const tbody = tbodyMatch[1]
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let m: RegExpExecArray | null
  while ((m = rowRe.exec(tbody)) !== null) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => c[1])
    if (cells.length < 3) continue
    // Cell 0: <a href="/Inquiry/CorporationSearch/SearchResultDetail?...">Name</a>
    const hrefMatch = cells[0].match(/href=["']([^"']+)["']/i)
    const nameMatch = cells[0].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    const docNum   = cells[1].replace(/<[^>]+>/g, '').trim()
    const status   = cells[2].replace(/<[^>]+>/g, '').trim()
    if (!nameMatch) continue
    rows.push({
      name: nameMatch,
      documentNumber: docNum,
      status,
      detailUrl: hrefMatch ? `https://search.sunbiz.org${hrefMatch[1]}` : '',
    })
  }
  return rows
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const body = await req.json().catch(() => ({}))
    const mode = String(body?.mode || '').toLowerCase()
    if (mode === 'name-check') {
      const name = String(body?.name || '').trim()
      if (name.length < 3) {
        return new Response(JSON.stringify({ ok: false, reason: 'name_too_short' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const hits = await fetchSunbiz(name)
      if (hits === null) {
        return new Response(JSON.stringify({ ok: false, reason: 'sunbiz_unavailable' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const target = norm(name)
      // "Available" = no ACTIVE entity's normalized name equals target.
      // Sunbiz's own rule is a superset of exact-match (they check confusingly
      // similar names too), so this can produce false positives — the UI
      // surfaces this as "no exact match" and shows the near-misses.
      const exact = hits.filter(h => norm(h.name) === target)
      const activeExact = exact.filter(h => /active/i.test(h.status))
      const near = hits.filter(h => norm(h.name) !== target).slice(0, 5)
      return new Response(JSON.stringify({
        ok: true,
        available: activeExact.length === 0,
        exactMatches: exact,
        nearMatches: near,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (mode === 'lookup') {
      const query = String(body?.query || '').trim()
      if (query.length < 3) {
        return new Response(JSON.stringify({ ok: false, reason: 'query_too_short' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const hits = await fetchSunbiz(query)
      if (hits === null) {
        return new Response(JSON.stringify({ ok: false, reason: 'sunbiz_unavailable' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ ok: true, entities: hits.slice(0, 15) }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ ok: false, reason: 'bad_mode' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, reason: 'server_error', message: String(e?.message || e) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
  }
})
