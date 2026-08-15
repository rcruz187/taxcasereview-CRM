// linkedin-scheduler — runs every 15 minutes via Supabase cron
// Finds approved posts whose scheduled_at has passed and publishes them
// Idempotent: status='publishing' lock prevents double-publish
// Handles retries (up to 3), permanent failure logging, weekly report generation
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TIMEZONE = 'America/New_York'
const MAX_RETRIES = 3

function redact(str: string) {
  // Never log tokens or secrets
  return str ? str.replace(/(Bearer\s+)[^\s"]+/gi, '$1[REDACTED]')
                  .replace(/(access_token['":\s]+)[^'"&\s,}]+/gi, '$1[REDACTED]') : str
}

Deno.serve(async (req) => {
  // Allow cron invocation (no auth header) OR authenticated calls
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const now = new Date()
  console.log(`[linkedin-scheduler] Run started at ${now.toISOString()}`)

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch (_) {}
  const action = (body.action as string) || 'run'

  // ── Settings action ────────────────────────────────────────────────────────
  if (action === 'get_settings') {
    const tenantId = body.tenant_id as string
    const { data } = await supabase.from('linkedin_settings')
      .select('*').eq('tenant_id', tenantId).single()
    return new Response(JSON.stringify({ ok: true, settings: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  if (action === 'save_settings') {
    const tenantId = body.tenant_id as string
    const settings = body.settings as Record<string, unknown>
    await supabase.from('linkedin_settings').upsert({
      tenant_id: tenantId,
      ...settings,
      updated_at: now.toISOString(),
    }, { onConflict: 'tenant_id' })
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // ── Weekly report action ───────────────────────────────────────────────────
  if (action === 'generate_report') {
    const tenantId = body.tenant_id as string
    const report = await generateWeeklyReport(supabase, tenantId, now)
    return new Response(JSON.stringify({ ok: true, report }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // ── List reports action ────────────────────────────────────────────────────
  if (action === 'list_reports') {
    const tenantId = body.tenant_id as string
    const { data } = await supabase.from('linkedin_weekly_reports')
      .select('*').eq('tenant_id', tenantId)
      .order('week_start', { ascending: false }).limit(12)
    return new Response(JSON.stringify({ ok: true, reports: data || [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // ── Next schedule slots ────────────────────────────────────────────────────
  if (action === 'next_slots') {
    const tenantId = body.tenant_id as string
    const slots = getNextSlots(tenantId, now, 8)
    return new Response(JSON.stringify({ ok: true, slots }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // ── Main cron run ──────────────────────────────────────────────────────────
  const results = { published: 0, failed: 0, skipped: 0, errors: [] as string[] }

  try {
    // Get all tenants with LinkedIn connections
    const { data: connections } = await supabase
      .from('linkedin_connections')
      .select('tenant_id, access_token, expires_at, linkedin_person_id')

    if (!connections?.length) {
      console.log('[linkedin-scheduler] No LinkedIn connections found')
      return new Response(JSON.stringify({ ok: true, ...results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    for (const conn of connections) {
      const tenantId = conn.tenant_id

      // Check autopilot is enabled for this tenant
      const { data: settings } = await supabase.from('linkedin_settings')
        .select('autopilot').eq('tenant_id', tenantId).single()

      if (!settings?.autopilot) {
        console.log(`[linkedin-scheduler] Tenant ${tenantId}: autopilot off — skipping`)
        results.skipped++
        continue
      }

      // Token expiry check
      if (new Date(conn.expires_at) < now) {
        console.log(`[linkedin-scheduler] Tenant ${tenantId}: token expired`)
        results.errors.push(`Tenant ${tenantId}: LinkedIn token expired`)
        continue
      }

      // Find posts ready to publish: approved + scheduled_at <= now + not already locked
      const { data: duePosts } = await supabase
        .from('linkedin_posts')
        .select('id, body, title, retry_count')
        .eq('tenant_id', tenantId)
        .eq('status', 'approved')
        .lte('scheduled_at', now.toISOString())
        .lt('retry_count', MAX_RETRIES)
        .order('scheduled_at', { ascending: true })
        .limit(5)

      if (!duePosts?.length) continue

      for (const post of duePosts) {
        // Idempotency lock — set to 'publishing' before any API call
        const { error: lockErr } = await supabase.from('linkedin_posts')
          .update({ status: 'publishing', updated_at: now.toISOString() })
          .eq('id', post.id).eq('status', 'approved') // only if still approved

        if (lockErr) {
          console.log(`[linkedin-scheduler] Post ${post.id}: lock failed (already locked)`)
          continue
        }

        // Append UTM params to any URLs in the post body
        const bodyWithUtm = appendUtm(post.body, post.id)

        // Publish to LinkedIn
        try {
          const publishRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${conn.access_token}`,
              'Content-Type': 'application/json',
              'X-Restli-Protocol-Version': '2.0.0',
            },
            body: JSON.stringify({
              author: `urn:li:person:${conn.linkedin_person_id}`,
              lifecycleState: 'PUBLISHED',
              specificContent: {
                'com.linkedin.ugc.ShareContent': {
                  shareCommentary: { text: bodyWithUtm },
                  shareMediaCategory: 'NONE',
                },
              },
              visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
            }),
          })

          const publishData = await publishRes.json()
          // Redact before logging
          console.log(`[linkedin-scheduler] Post ${post.id} API response:`, redact(JSON.stringify(publishData)))

          if (publishRes.ok) {
            const liPostId = publishData.id
            const liUrl = `https://www.linkedin.com/feed/update/${liPostId}`
            await supabase.from('linkedin_posts').update({
              status: 'published',
              published_at: now.toISOString(),
              linkedin_post_id: liPostId,
              linkedin_url: liUrl,
              error_msg: null,
              updated_at: now.toISOString(),
            }).eq('id', post.id)
            results.published++
            console.log(`[linkedin-scheduler] Post ${post.id}: published ✓ ${liUrl}`)
          } else {
            const retryCount = (post.retry_count || 0) + 1
            const permanent = retryCount >= MAX_RETRIES
            await supabase.from('linkedin_posts').update({
              status: permanent ? 'failed' : 'approved', // back to approved for retry if not permanent
              retry_count: retryCount,
              error_msg: redact(JSON.stringify(publishData)),
              updated_at: now.toISOString(),
            }).eq('id', post.id)
            results.failed++
            console.error(`[linkedin-scheduler] Post ${post.id}: publish failed (attempt ${retryCount}/${MAX_RETRIES})`)
          }
        } catch (e) {
          const retryCount = (post.retry_count || 0) + 1
          await supabase.from('linkedin_posts').update({
            status: retryCount >= MAX_RETRIES ? 'failed' : 'approved',
            retry_count: retryCount,
            error_msg: String(e),
            updated_at: now.toISOString(),
          }).eq('id', post.id)
          results.failed++
          console.error(`[linkedin-scheduler] Post ${post.id}: exception`, e)
        }
      }
    }

    // Weekly report — generate every Monday at 7am ET
    const etHour = getETHour(now)
    const dayOfWeek = getETDayOfWeek(now)
    if (dayOfWeek === 1 && etHour === 7) {
      console.log('[linkedin-scheduler] Generating weekly reports…')
      for (const conn of connections) {
        try {
          await generateWeeklyReport(supabase, conn.tenant_id, now)
        } catch(e) {
          console.error('[linkedin-scheduler] Weekly report error:', e)
        }
      }
    }

  } catch (e) {
    console.error('[linkedin-scheduler] Fatal error:', e)
    results.errors.push(String(e))
  }

  console.log(`[linkedin-scheduler] Done:`, results)
  return new Response(JSON.stringify({ ok: true, ...results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})

// ── Helpers ────────────────────────────────────────────────────────────────

function appendUtm(body: string, postId: string): string {
  const utmSuffix = `utm_source=linkedin&utm_medium=social&utm_campaign=li_${postId.slice(0, 8)}`
  return body.replace(/(https?:\/\/[^\s]+)/g, (url) => {
    if (url.includes('utm_')) return url
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}${utmSuffix}`
  })
}

function getETHour(date: Date): number {
  return parseInt(new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE, hour: 'numeric', hour12: false
  }).format(date))
}

function getETDayOfWeek(date: Date): number {
  const etDate = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE, weekday: 'short'
  }).format(date)
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(etDate)
}

function getNextSlots(_tenantId: string, from: Date, count: number) {
  // Default schedule: Mon 9am, Wed 12pm, Fri 9am ET
  const slots = [
    { day: 1, hour: 9,  minute: 0 },
    { day: 3, hour: 12, minute: 0 },
    { day: 5, hour: 9,  minute: 0 },
  ]
  const result = []
  const cursor = new Date(from)
  while (result.length < count) {
    const etDay = getETDayOfWeek(cursor)
    const etHour = getETHour(cursor)
    for (const slot of slots) {
      if (etDay === slot.day && etHour <= slot.hour) {
        const slotDate = new Date(cursor)
        result.push(new Date(slotDate).toISOString())
      }
    }
    cursor.setDate(cursor.getDate() + 1)
    if (result.length >= count) break
  }
  return result.slice(0, count)
}

async function generateWeeklyReport(supabase: ReturnType<typeof createClient>, tenantId: string, now: Date) {
  // Week = previous Mon-Sun
  const etNow = new Date(now.toLocaleString('en-US', { timeZone: TIMEZONE }))
  const dayOfWeek = etNow.getDay() // 0=Sun, 1=Mon
  const daysBack = dayOfWeek === 0 ? 7 : dayOfWeek
  const weekEnd = new Date(etNow)
  weekEnd.setDate(etNow.getDate() - 1)
  weekEnd.setHours(23, 59, 59, 0)
  const weekStart = new Date(weekEnd)
  weekStart.setDate(weekEnd.getDate() - 6)
  weekStart.setHours(0, 0, 0, 0)

  const weekStartStr = weekStart.toISOString().slice(0, 10)
  const weekEndStr = weekEnd.toISOString().slice(0, 10)

  // Posts published this week
  const { data: published } = await supabase.from('linkedin_posts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'published')
    .gte('published_at', weekStart.toISOString())
    .lte('published_at', weekEnd.toISOString())

  // Posts that failed this week
  const { data: failed } = await supabase.from('linkedin_posts')
    .select('id, title, body, error_msg, updated_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'failed')
    .gte('updated_at', weekStart.toISOString())

  // Upcoming posts next week
  const nextWeekEnd = new Date(weekEnd)
  nextWeekEnd.setDate(weekEnd.getDate() + 8)
  const { data: upcoming } = await supabase.from('linkedin_posts')
    .select('id, title, body, scheduled_at, status, category')
    .eq('tenant_id', tenantId)
    .in('status', ['approved', 'scheduled'])
    .gte('scheduled_at', now.toISOString())
    .lte('scheduled_at', nextWeekEnd.toISOString())
    .order('scheduled_at', { ascending: true })

  const report = {
    week_start: weekStartStr,
    week_end: weekEndStr,
    posts_published: published?.length || 0,
    posts_failed: failed?.length || 0,
    posts_upcoming: upcoming?.length || 0,
    published_posts: (published || []).map(p => ({
      id: p.id, title: p.title || p.body.slice(0, 60),
      category: p.category, published_at: p.published_at,
      linkedin_url: p.linkedin_url,
    })),
    failed_posts: (failed || []).map(p => ({
      id: p.id, title: p.title || p.body?.slice(0, 60), error: p.error_msg
    })),
    upcoming_posts: (upcoming || []).map(p => ({
      id: p.id, title: p.title || p.body?.slice(0, 60),
      category: p.category, scheduled_at: p.scheduled_at
    })),
    // Analytics — manual/UTM only until LinkedIn MDP approved
    note: 'Impression/reaction analytics require LinkedIn Marketing Developer Platform access. UTM attribution available via Google Analytics.',
    generated_at: now.toISOString(),
  }

  await supabase.from('linkedin_weekly_reports').upsert({
    tenant_id: tenantId,
    week_start: weekStartStr,
    week_end: weekEndStr,
    report_data: report,
    generated_at: now.toISOString(),
  }, { onConflict: 'tenant_id,week_start' })

  return report
}
