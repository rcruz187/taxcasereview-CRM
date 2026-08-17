// linkedin-scheduler v2 — production
// Actions: run (cron), generate_monday_drafts, get_settings, save_settings,
//          generate_report, list_reports, next_slots
// Schedule: Tue 9am ET, Thu 9am ET
// Monday 7am ET: auto-generate next Tue+Thu drafts, notify admin
// Safety: only publishes status='approved', idempotent 'publishing' lock

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TIMEZONE      = 'America/New_York'
const MAX_RETRIES   = 3
const ADMIN_EMAIL   = 'romy@taxcasereview.org'
const ADMIN_TENANT  = 'a0000000-0000-0000-0000-000000000001'

// Publish slots: Tuesday=2, Thursday=4 at 9:00 AM ET
const PUBLISH_SLOTS = [
  { day: 2, hour: 9, minute: 0, label: 'Tuesday' },
  { day: 4, hour: 9, minute: 0, label: 'Thursday' },
]

function redact(s: string) {
  return s ? s.replace(/(Bearer\s+)[^\s"]+/gi,'$1[REDACTED]')
              .replace(/(access_token['":\s]+)[^'"&\s,}]+/gi,'$1[REDACTED]') : s
}

function getETDate(d: Date) {
  return new Date(d.toLocaleString('en-US', { timeZone: TIMEZONE }))
}

function getNextSlots(from: Date, count = 8) {
  const slots = []
  const cursor = new Date(from)
  let days = 0
  while (slots.length < count && days < 60) {
    const et = getETDate(cursor)
    const dow = et.getDay() // 0=Sun,1=Mon,2=Tue,...
    for (const s of PUBLISH_SLOTS) {
      if (dow === s.day) {
        const slot = new Date(cursor)
        slot.setMinutes(0, 0, 0)
        slots.push({
          iso: slot.toISOString(),
          label: `${s.label} ${et.toLocaleDateString('en-US',{month:'short',day:'numeric'})} 9:00 AM ET`
        })
      }
    }
    cursor.setDate(cursor.getDate() + 1)
    days++
    if (slots.length >= count) break
  }
  return slots.slice(0, count)
}

// Content strategy: 30% edu, 25% practitioner, 20% product, 10% founder, 10% resource, 5% demo
const CONTENT_STRATEGY = [
  { category: 'educational',    label: 'Tax Resolution Education',    weight: 30 },
  { category: 'practitioner',   label: 'Practitioner / Workflow',     weight: 25 },
  { category: 'product',        label: 'Tax Res CRM Product',         weight: 20 },
  { category: 'founder_story',  label: 'Founder / Building',          weight: 10 },
  { category: 'resource',       label: 'Resource Center',             weight: 10 },
  { category: 'demo_invite',    label: 'Demo / Sales CTA',            weight:  5 },
]

// Topic pool — ensures 30-day non-repeat
const TOPIC_POOL: Record<string, string[]> = {
  educational:   ['CP2000 response process','IRS transcript types explained','Collection Due Process rights','Penalty abatement qualification','Trust Fund Recovery Penalty basics','Innocent Spouse relief overview','Offer in Compromise qualification math','CSED calculation and extension traps','IRS levy release requirements','Currently Not Collectible status'],
  practitioner:  ['A2A transcript pull workflow','Case file documentation best practices','IRS Power of Attorney (2848) tips','Client communication during IRS enforcement','Installment agreement monitoring','Tax lien subordination requests','Streamlined installment vs PPIA','Managing 433-A vs 433-B differences','Client onboarding checklist for resolution','Tracking CSED across multiple tax years'],
  product:       ['IRS transcript pull in Tax Res CRM','Client portal e-signature walkthrough','Case pipeline overview','Automated follow-up reminders','Document management built-in','Multi-office management','Per-seat pricing for growing firms','Demo booking integration','Task automation for resolution workflows','Role-based access control'],
  founder_story: ['Why I built Tax Res CRM','Moving from Canopy to a custom solution','Building for tax resolution specifically','First firm to use Tax Res CRM','Lessons from running a resolution practice','What Canopy gets wrong for resolution firms','The IRS transcript problem that started everything','Building SaaS while running a practice'],
  resource:      ['OIC qualification guide','CDP hearing checklist','IRS enforcement timeline reference','Penalty abatement letter templates','Trust Fund interview prep guide','Collection alternatives comparison','IRS notice response deadlines','Resolution case types reference'],
  demo_invite:   ['Book a demo of Tax Res CRM','See A2A transcript pull live','30-minute walkthrough available','Tax Res CRM for your firm'],
}

async function getRecentTopics(supabase: ReturnType<typeof createClient>, tenantId: string, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const { data } = await supabase.from('linkedin_posts')
    .select('body,category,created_at')
    .eq('tenant_id', tenantId)
    .gte('created_at', since)
    .not('status', 'eq', 'failed')
  return data || []
}

function pickTopic(category: string, recentBodies: string[]): string {
  const pool = TOPIC_POOL[category] || TOPIC_POOL['educational']
  // Filter out topics that appear in recent posts
  const fresh = pool.filter(t => !recentBodies.some(b => b.toLowerCase().includes(t.toLowerCase().split(' ')[0])))
  const available = fresh.length > 0 ? fresh : pool
  return available[Math.floor(Math.random() * available.length)]
}

function pickCategory(recentCategories: string[]): string {
  // Weighted random, biased away from recently-used categories
  const weights = CONTENT_STRATEGY.map(s => ({
    ...s,
    adjusted: recentCategories.slice(-4).includes(s.category) ? Math.max(1, s.weight - 15) : s.weight
  }))
  const total = weights.reduce((s, w) => s + w.adjusted, 0)
  let rand = Math.random() * total
  for (const w of weights) {
    rand -= w.adjusted
    if (rand <= 0) return w.category
  }
  return 'educational'
}

function buildPostBody(category: string, topic: string, tenantName: string): string {
  const crmUrl = 'https://taxrescrm.net'
  const utmBase = `utm_source=linkedin&utm_medium=social`

  const templates: Record<string, (t: string) => string> = {
    educational: (t) => `Most tax professionals handle ${t} wrong.\n\nHere's what the IRS actually expects — and where firms leave money on the table.\n\n[This post will be completed with specific educational content about: ${t}]\n\nWhat's your firm's process for this? Drop a comment below.\n\n📚 More at: ${crmUrl}/resources?${utmBase}&utm_campaign=li_edu_${t.split(' ')[0].toLowerCase()}_${Date.now().toString(36)}`,

    practitioner: (t) => `Here's a workflow problem every tax resolution firm has:\n\n${t}\n\n[This post will be completed with specific workflow content about: ${t}]\n\nIf your firm is still doing this manually, I'd love to show you a better way.\n\nDM me or book a walkthrough: ${crmUrl}/demo?${utmBase}&utm_campaign=li_workflow_${t.split(' ')[0].toLowerCase()}_${Date.now().toString(36)}`,

    product: (t) => `We built ${t} directly into Tax Res CRM.\n\n[This post will be completed with specific product content about: ${t}]\n\nIf you want to see it in action: ${crmUrl}/demo?${utmBase}&utm_campaign=li_product_${t.split(' ')[0].toLowerCase()}_${Date.now().toString(36)}`,

    founder_story: (t) => `${t}.\n\n[This post will be completed with founder story content about: ${t}]\n\nFollowing along: ${crmUrl}?${utmBase}&utm_campaign=li_founder_${t.split(' ')[0].toLowerCase()}_${Date.now().toString(36)}`,

    resource: (t) => `We put together a complete ${t} for tax professionals.\n\n[This post will be completed with resource content about: ${t}]\n\nLink in comments: ${crmUrl}/resources?${utmBase}&utm_campaign=li_resource_${t.split(' ')[0].toLowerCase()}_${Date.now().toString(36)}`,

    demo_invite: (t) => `${t}.\n\n[This post will be completed with demo invite content.]\n\nBook your 30-minute walkthrough: ${crmUrl}/demo?${utmBase}&utm_campaign=li_demo_${Date.now().toString(36)}`,
  }

  return (templates[category] || templates['educational'])(topic)
}

async function generateMondayDrafts(supabase: ReturnType<typeof createClient>, tenantId: string, now: Date) {
  const slots = getNextSlots(now, 2) // Next Tue + Thu
  const recent = await getRecentTopics(supabase, tenantId)
  const recentBodies = recent.map((r: any) => r.body || '')
  const recentCategories = recent.map((r: any) => r.category || '')

  const drafts = []
  for (const slot of slots) {
    const category = pickCategory(recentCategories)
    const topic    = pickTopic(category, recentBodies)
    const body     = buildPostBody(category, topic, 'Tax Res CRM')
    const title    = `${CONTENT_STRATEGY.find(s => s.category === category)?.label} — ${topic}`

    const { data, error } = await supabase.from('linkedin_posts').insert({
      tenant_id:    tenantId,
      body,
      title,
      category,
      status:       'draft',
      scheduled_at: slot.iso,
      cta_type:     category === 'demo_invite' ? 'demo' : category === 'resource' ? 'read' : 'engage',
    }).select().single()

    if (!error && data) {
      drafts.push({ post: data, slot })
      recentBodies.push(body)
      recentCategories.push(category)
    }
  }
  return drafts
}

async function sendAdminAlert(supabase: ReturnType<typeof createClient>, subject: string, body: string) {
  try {
    await supabase.functions.invoke('send-email', {
      body: {
        to:      ADMIN_EMAIL,
        subject,
        html:    body,
        tenant_id: ADMIN_TENANT,
      }
    })
  } catch (e) {
    console.error('[linkedin-scheduler] Alert email failed:', e)
  }
}

async function generateWeeklyReport(supabase: ReturnType<typeof createClient>, tenantId: string, now: Date) {
  const et = getETDate(now)
  const dayOfWeek = et.getDay()
  const weekEnd = new Date(et)
  weekEnd.setDate(et.getDate() - (dayOfWeek === 0 ? 1 : dayOfWeek - 1) - 1)
  weekEnd.setHours(23,59,59,0)
  const weekStart = new Date(weekEnd)
  weekStart.setDate(weekEnd.getDate() - 6)
  weekStart.setHours(0,0,0,0)

  const weekStartStr = weekStart.toISOString().slice(0,10)
  const weekEndStr   = weekEnd.toISOString().slice(0,10)

  const { data: published } = await supabase.from('linkedin_posts')
    .select('id,title,body,category,published_at,linkedin_url')
    .eq('tenant_id', tenantId).eq('status','published')
    .gte('published_at', weekStart.toISOString())
    .lte('published_at', weekEnd.toISOString())

  const { data: failed } = await supabase.from('linkedin_posts')
    .select('id,title,body,error_msg,updated_at')
    .eq('tenant_id', tenantId).eq('status','failed')
    .gte('updated_at', weekStart.toISOString())

  const { data: upcoming } = await supabase.from('linkedin_posts')
    .select('id,title,body,scheduled_at,status,category')
    .eq('tenant_id', tenantId)
    .in('status',['approved','scheduled'])
    .gte('scheduled_at', now.toISOString())
    .order('scheduled_at',{ascending:true}).limit(10)

  const report = {
    week_start: weekStartStr, week_end: weekEndStr,
    posts_published: published?.length || 0,
    posts_failed:    failed?.length    || 0,
    posts_upcoming:  upcoming?.length  || 0,
    published_posts: (published||[]).map(p=>({id:p.id,title:p.title||p.body?.slice(0,60),category:p.category,published_at:p.published_at,linkedin_url:p.linkedin_url})),
    failed_posts:    (failed||[]).map(p=>({id:p.id,title:p.title||p.body?.slice(0,60),error:p.error_msg})),
    upcoming_posts:  (upcoming||[]).map(p=>({id:p.id,title:p.title||p.body?.slice(0,60),category:p.category,scheduled_at:p.scheduled_at})),
    analytics_note:  'Impression/reaction data requires LinkedIn Marketing Developer Platform access. UTM attribution tracked via Google Analytics.',
    generated_at:    now.toISOString(),
  }

  await supabase.from('linkedin_weekly_reports').upsert({
    tenant_id: tenantId, week_start: weekStartStr, week_end: weekEndStr,
    report_data: report, generated_at: now.toISOString(),
  }, { onConflict: 'tenant_id,week_start' })

  return report
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch (_) {}
  const action = (body.action as string) || 'run'

  const now = new Date()
  console.log(`[linkedin-scheduler] action=${action} at ${now.toISOString()}`)

  // ── Settings ──────────────────────────────────────────────────────────────
  if (action === 'get_settings') {
    const { data } = await supabase.from('linkedin_settings')
      .select('*').eq('tenant_id', ADMIN_TENANT).single()
    return new Response(JSON.stringify({ ok: true, settings: data || { autopilot: false, timezone: TIMEZONE } }),
      { headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  if (action === 'save_settings') {
    const settings = body.settings as Record<string, unknown>
    await supabase.from('linkedin_settings').upsert({
      tenant_id: ADMIN_TENANT, ...settings, updated_at: now.toISOString()
    }, { onConflict: 'tenant_id' })
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  // ── Reports ───────────────────────────────────────────────────────────────
  if (action === 'generate_report') {
    const report = await generateWeeklyReport(supabase, ADMIN_TENANT, now)
    return new Response(JSON.stringify({ ok: true, report }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  if (action === 'list_reports') {
    const { data } = await supabase.from('linkedin_weekly_reports')
      .select('*').eq('tenant_id', ADMIN_TENANT)
      .order('week_start', { ascending: false }).limit(12)
    return new Response(JSON.stringify({ ok: true, reports: data || [] }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  if (action === 'next_slots') {
    return new Response(JSON.stringify({ ok: true, slots: getNextSlots(now, 8) }),
      { headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  // ── Manual Monday draft generation ────────────────────────────────────────
  if (action === 'generate_monday_drafts') {
    const drafts = await generateMondayDrafts(supabase, ADMIN_TENANT, now)
    return new Response(JSON.stringify({ ok: true, drafts_created: drafts.length, drafts }),
      { headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  // ── Main cron run ─────────────────────────────────────────────────────────
  const results = { published: 0, failed: 0, skipped: 0, monday_drafts: 0, errors: [] as string[] }

  try {
    const etNow  = getETDate(now)
    const etHour = etNow.getHours()
    const etDay  = etNow.getDay() // 0=Sun,1=Mon,2=Tue,4=Thu

    // ── Monday 7am ET: generate Tue+Thu drafts and alert admin ────────────
    if (etDay === 1 && etHour === 7) {
      console.log('[linkedin-scheduler] Monday 7am — generating weekly drafts')

      // Check if drafts already generated this Monday (idempotency)
      const mondayStart = new Date(etNow)
      mondayStart.setHours(0,0,0,0)
      const { count } = await supabase.from('linkedin_posts')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', ADMIN_TENANT)
        .eq('status', 'draft')
        .gte('created_at', mondayStart.toISOString())

      if (!count || count === 0) {
        const drafts = await generateMondayDrafts(supabase, ADMIN_TENANT, now)
        results.monday_drafts = drafts.length

        if (drafts.length > 0) {
          const draftList = drafts.map(d =>
            `• ${d.slot.label}: "${d.post.title || d.post.body.slice(0,80)}..." [${d.post.category}]`
          ).join('\n')

          await sendAdminAlert(supabase,
            `✅ LinkedIn: ${drafts.length} drafts ready for approval`,
            `<p>Good morning Romy,</p>
             <p>Your LinkedIn content for this week is ready for review and approval:</p>
             <pre>${draftList}</pre>
             <p><strong>Action required:</strong> Log into the Admin Portal → Command Center → LinkedIn → Content Queue to approve posts before they publish.</p>
             <p>Posts will NOT publish until you approve them.</p>
             <p>— Tax Res CRM Automation</p>`
          )
          console.log(`[linkedin-scheduler] Monday: ${drafts.length} drafts created, admin alerted`)
        }
      } else {
        console.log('[linkedin-scheduler] Monday drafts already generated today — skipping')
      }
    }

    // ── Token expiration check: alert 14 days before ──────────────────────
    const { data: conn } = await supabase.from('linkedin_connections')
      .select('expires_at, display_name').eq('tenant_id', ADMIN_TENANT).single()

    if (conn) {
      const daysLeft = Math.floor((new Date(conn.expires_at).getTime() - now.getTime()) / 86400000)
      if ((daysLeft === 14 || daysLeft === 7 || daysLeft === 3) && etHour === 9) {
        await sendAdminAlert(supabase,
          `⚠️ LinkedIn token expires in ${daysLeft} days`,
          `<p>Your LinkedIn OAuth token for <strong>${conn.display_name}</strong> expires in ${daysLeft} days (${new Date(conn.expires_at).toLocaleDateString()}).</p>
           <p>Go to Admin Portal → Command Center → LinkedIn → Settings to reconnect before it expires.</p>
           <p>If the token expires, scheduled posts will fail until you reconnect.</p>`
        )
        console.log(`[linkedin-scheduler] Token expiry alert sent — ${daysLeft} days remaining`)
      }
    }

    // ── Scheduled publishing: Tue/Thu 9am ET ─────────────────────────────
    if (!conn) {
      console.log('[linkedin-scheduler] No LinkedIn connection found — skipping publish')
      return new Response(JSON.stringify({ ok: true, ...results }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    if (new Date(conn.expires_at) < now) {
      console.error('[linkedin-scheduler] LinkedIn token EXPIRED')
      await sendAdminAlert(supabase,
        '🚨 LinkedIn token EXPIRED — posts not publishing',
        '<p>Your LinkedIn OAuth token has expired. Log into the Admin Portal → LinkedIn → Settings to reconnect immediately.</p>'
      )
      return new Response(JSON.stringify({ ok: true, ...results, error: 'token_expired' }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // ── APPROVAL MODE vs AUTOPILOT MODE ─────────────────────────────────
    // autopilot=false (APPROVAL MODE — default):
    //   Manually approved posts (status='approved') publish automatically on schedule.
    //   Draft posts NEVER auto-publish. Approval is the gate, not a publish blocker.
    //   Romy clicks Approve → post is eligible → scheduler fires it at scheduled_at.
    //
    // autopilot=true (AUTOPILOT MODE — optional):
    //   Monday drafts are auto-approved without manual review.
    //   Approved posts still publish on schedule (same path as above).
    //
    // In BOTH modes: approved + scheduled_at <= now = publishes automatically.
    // autopilot flag NEVER blocks publishing of already-approved posts.

    // Find approved posts ready to publish (scheduled_at <= now)
    const { data: duePosts } = await supabase.from('linkedin_posts')
      .select('id, body, title, retry_count, category')
      .eq('tenant_id', ADMIN_TENANT)
      .eq('status', 'approved')
      .lte('scheduled_at', now.toISOString())
      .lt('retry_count', MAX_RETRIES)
      .order('scheduled_at', { ascending: true })
      .limit(3) // Never fire more than 3 at once — safety cap

    if (!duePosts?.length) {
      console.log('[linkedin-scheduler] No approved posts due — nothing to publish')
      return new Response(JSON.stringify({ ok: true, ...results }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // Get LinkedIn connection details for publishing
    const { data: fullConn } = await supabase.from('linkedin_connections')
      .select('access_token, linkedin_person_id')
      .eq('tenant_id', ADMIN_TENANT).single()

    for (const post of duePosts) {
      // ── IDEMPOTENCY LOCK: only update if still 'approved' ──────────────
      const { error: lockErr, count: locked } = await supabase.from('linkedin_posts')
        .update({ status: 'publishing', updated_at: now.toISOString() })
        .eq('id', post.id)
        .eq('status', 'approved') // conditional update — only locks if still approved
        .select('id', { count: 'exact' })

      if (lockErr || !locked) {
        console.log(`[linkedin-scheduler] Post ${post.id}: already locked or not found — skipping`)
        continue
      }

      // Append UTM to any URLs in the post body
      const campaign = `li_${post.category || 'content'}_${post.id.slice(0,8)}`
      const bodyWithUtm = post.body.replace(/(https?:\/\/[^\s)]+)/g, (url: string) => {
        if (url.includes('utm_')) return url
        const sep = url.includes('?') ? '&' : '?'
        return `${url}${sep}utm_source=linkedin&utm_medium=social&utm_campaign=${campaign}`
      })

      try {
        const publishRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${fullConn!.access_token}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
          },
          body: JSON.stringify({
            author: `urn:li:person:${fullConn!.linkedin_person_id}`,
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
        console.log(`[linkedin-scheduler] Post ${post.id} response:`, redact(JSON.stringify(publishData)))

        if (publishRes.ok) {
          const liPostId = publishData.id
          const liUrl    = `https://www.linkedin.com/feed/update/${liPostId}`
          await supabase.from('linkedin_posts').update({
            status: 'published', published_at: now.toISOString(),
            linkedin_post_id: liPostId, linkedin_url: liUrl,
            error_msg: null, updated_at: now.toISOString(),
          }).eq('id', post.id)
          results.published++
          console.log(`[linkedin-scheduler] ✓ Published ${post.id} → ${liUrl}`)
        } else {
          const retries = (post.retry_count || 0) + 1
          const permanent = retries >= MAX_RETRIES
          await supabase.from('linkedin_posts').update({
            status: permanent ? 'failed' : 'approved',
            retry_count: retries,
            error_msg: redact(JSON.stringify(publishData)),
            updated_at: now.toISOString(),
          }).eq('id', post.id)
          results.failed++

          if (permanent) {
            await sendAdminAlert(supabase,
              `🚨 LinkedIn post FAILED after ${MAX_RETRIES} attempts`,
              `<p>Post: "${post.title || post.body.slice(0,80)}"</p>
               <p>Error: ${redact(JSON.stringify(publishData))}</p>
               <p>Log into Admin Portal → LinkedIn → Content Queue to retry or edit.</p>`
            )
          }
        }
      } catch (e) {
        const retries = (post.retry_count || 0) + 1
        await supabase.from('linkedin_posts').update({
          status: retries >= MAX_RETRIES ? 'failed' : 'approved',
          retry_count: retries, error_msg: String(e), updated_at: now.toISOString(),
        }).eq('id', post.id)
        results.failed++
        console.error(`[linkedin-scheduler] Post ${post.id} exception:`, e)
      }
    }

    // ── Weekly report: Monday 7am ET ──────────────────────────────────────
    if (etDay === 1 && etHour === 7) {
      try {
        await generateWeeklyReport(supabase, ADMIN_TENANT, now)
        console.log('[linkedin-scheduler] Weekly report generated')
      } catch (e) {
        console.error('[linkedin-scheduler] Weekly report error:', e)
      }
    }

  } catch (e) {
    console.error('[linkedin-scheduler] Fatal error:', e)
    results.errors.push(String(e))
  }

  console.log('[linkedin-scheduler] Done:', results)
  return new Response(JSON.stringify({ ok: true, ...results }), {
    headers: { ...cors, 'Content-Type': 'application/json' }
  })
})
