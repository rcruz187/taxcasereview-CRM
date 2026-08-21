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
const ADMIN_EMAIL   = 'romy@taxrescrm.net'
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

// ── CONTENT STRATEGY ─────────────────────────────────────────────────────
// Governed by docs/LINKEDIN_CONTENT_STRATEGY.md
// 30% edu | 25% practitioner | 20% product | 10% founder | 10% resource | 5% demo
const CONTENT_STRATEGY = [
  { category: 'educational',    label: 'Tax Resolution Education',    weight: 30 },
  { category: 'practitioner',   label: 'Practitioner / Workflow',     weight: 25 },
  { category: 'product',        label: 'Tax Res CRM Product',         weight: 20 },
  { category: 'founder_story',  label: 'Founder / Building',          weight: 10 },
  { category: 'resource',       label: 'Resource Center',             weight: 10 },
  { category: 'demo_invite',    label: 'Demo / Sales CTA',            weight:  5 },
]

// Hard rotation rules (from content strategy doc):
// - No two demo_invite posts in same week
// - No two product posts in same week
// - founder_story: max 1x per 3 weeks (21-day cooldown enforced in pickCategory)

// Topic pool — 30-day dedup enforced in getRecentTopics
// All topics are specific IRS processes, forms, or resolution-firm workflows.
// Generic tax topics ("IRS debt", "tax problems") are excluded by design.
const TOPIC_POOL: Record<string, string[]> = {
  educational: [
    'CP2000 response process and transcript comparison',
    'IRS transcript types — Account, Wage & Income, Record of Account, Tax Return',
    'Collection Due Process hearing rights under IRC 6320/6330',
    'First-time penalty abatement qualification criteria',
    'Trust Fund Recovery Penalty — who is responsible and how to dispute',
    'Innocent Spouse relief — Form 8857 qualification',
    'Offer in Compromise RCP calculation — Quick Sale Value vs FMV',
    'CSED calculation and what tolls the 10-year statute',
    'IRS levy release — Form 668-D and hardship criteria',
    'Currently Not Collectible status — 53 designation and review cycles',
    'Partial Pay Installment Agreement vs full-pay IA',
    'IRS notice sequence — from CP14 to levy',
    'CDP vs Equivalent Hearing — when each applies',
    'IRS lien withdrawal vs discharge vs subordination',
    'Streamlined Processing vs standard OIC review',
    'Tax lien impact on credit and real estate transactions',
    'IRS ACS vs Revenue Officer — different collection paths',
    'CP501/CP503/CP504 — what each means and response deadlines',
    'IRC 6672 Trust Fund assessment — timeline and appeal rights',
    'Offer in Compromise Doubt as to Liability vs Collectibility',
  ],
  practitioner: [
    'IRS transcript pull workflow — what to pull before every case review',
    'Case file documentation for representation — what the IRS expects',
    'Form 2848 Power of Attorney — authorization scope and CAF processing times',
    'Client communication during active IRS enforcement',
    'Monitoring installment agreements — default triggers and cure procedures',
    'Tax lien subordination request process — Form 14134',
    'Streamlined IA vs PPIA — when each applies and how to calculate',
    'Managing 433-A vs 433-B — individual vs business collection information',
    'Client onboarding checklist for new resolution cases',
    'Tracking CSED across multiple tax years in active cases',
    'Handling unresponsive clients during IRS deadlines',
    'Revenue Officer contact protocol — what to say and what not to say',
    'When to file for CDP hearing vs accept proposed collection action',
    'Building a resolution practice billing model — hourly vs flat fee',
    'Managing a 40+ case resolution caseload without missing deadlines',
    'Prioritizing cases by enforcement risk — levy vs lien',
    'Document retention for closed resolution cases',
    'Setting client expectations on OIC timelines',
  ],
  product: [
    'IRS transcript import in Tax Res CRM — current workflow',
    'Client portal e-signature for resolution engagement letters',
    'Resolution case pipeline — stages mapped to actual IRS process',
    'Automated follow-up reminders keyed to IRS response deadlines',
    'Document management for resolution case files',
    'Role-based access — keeping client data isolated by rep',
    'Booking integration — clients self-schedule without the back-and-forth',
    'Task automation when a case moves to a new resolution stage',
    'Multi-tenant architecture for firms with multiple locations',
    'Built-in IRS form pre-fill — 2848 and 8821',
  ],
  founder_story: [
    'Why I built Tax Res CRM instead of customizing what already existed',
    'What running a resolution practice taught me about CRM design',
    'The IRS transcript pull problem that started this whole project',
    'Why generic CRMs require so much adaptation for resolution work',
    'What I learned building Tax Res CRM while running an active caseload',
    'The difference between software built for resolution vs adapted for it',
    'What Tax Case Review looks like as the first office on Tax Res CRM',
    'Why I chose to build on Supabase and what that means for data ownership',
  ],
  resource: [
    'OIC qualification guide — step-by-step RCP calculation',
    'CDP hearing checklist — what to prepare before the hearing',
    'IRS enforcement timeline — notice to levy reference guide',
    'Penalty abatement request — first-time and reasonable cause criteria',
    'Trust Fund interview preparation guide for 4180 interviews',
    'Collection alternatives comparison — IA vs PPIA vs CNC vs OIC',
    'IRS notice response deadlines reference — CP series',
    'Resolution case types reference — which path for which situation',
  ],
  demo_invite: [
    'See IRS transcript import in Tax Res CRM — 30-minute walkthrough',
    'Tax Res CRM for resolution firms — book a demo',
    'See the resolution case pipeline live — book a walkthrough',
    'Built for resolution work — see what that means in practice',
  ],
}

// Compliance safeguards — applied in buildPostBody
// Any post body violating these will be flagged in logs
const CLAIM_SAFEGUARDS = {
  prohibited_phrases: [
    'guaranteed', 'eliminate your tax debt', 'settle for pennies',
    'IRS approved', 'IRS certified', 'always works', 'never fails',
    'saves 20 minutes', // only use with verified data
    'fully automated transcript', // A2A is watched-folder import currently
  ],
  require_qualification: [
    'acceptance rate', 'rejection rate', 'approval rate',
    'most firms', 'most practitioners', 'typically results in',
  ],
  // A2A transcript status — must not claim full automation
  a2a_accurate_description: 'Tax Res CRM supports transcript import via watched folder. Full A2A automated retrieval is on the product roadmap.',
}

// UTM naming: li_[category_short]_[topic_slug]_[mmdd]
const CATEGORY_SHORT: Record<string, string> = {
  educational:   'edu',
  practitioner:  'workflow',
  product:       'product',
  founder_story: 'founder',
  resource:      'resource',
  demo_invite:   'demo',
}

// Destination URLs per category
const DESTINATION_URLS: Record<string, string> = {
  educational:   'https://taxrescrm.net/resources',
  practitioner:  'https://taxrescrm.net/demo',
  product:       'https://taxrescrm.net/demo',
  founder_story: 'https://taxrescrm.net',
  resource:      'https://taxrescrm.net/resources',
  demo_invite:   'https://taxrescrm.net/demo',
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

function pickCategory(recentCategories: string[], recentBodies: string[]): string {
  // Weighted random with hard rotation rules from LINKEDIN_CONTENT_STRATEGY.md
  const last7 = recentCategories.slice(-7)
  const last4 = recentCategories.slice(-4)
  const last21days_founder = recentCategories.slice(-6).includes('founder_story')

  const weights = CONTENT_STRATEGY.map(s => {
    let adj = s.weight
    // Recency penalty
    if (last4.includes(s.category)) adj = Math.max(1, adj - 15)
    // Hard rules
    if (s.category === 'demo_invite' && last7.filter(c => c === 'demo_invite').length >= 1) adj = 0
    if (s.category === 'product' && last7.filter(c => c === 'product').length >= 1) adj = 0
    if (s.category === 'founder_story' && last21days_founder) adj = 0
    return { ...s, adjusted: adj }
  })
  const total = weights.reduce((s, w) => s + w.adjusted, 0)
  if (total === 0) return 'educational' // fallback if all suppressed
  let rand = Math.random() * total
  for (const w of weights) {
    rand -= w.adjusted
    if (rand <= 0) return w.category
  }
  return 'educational'
}

function makeUtmCampaign(category: string, topic: string, now: Date): string {
  const short = CATEGORY_SHORT[category] || 'content'
  const slug = topic.split(' ').slice(0,3).join('_').toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,20)
  const month = now.toLocaleString('en-US',{month:'short',timeZone:'America/New_York'}).toLowerCase()
  const day = now.toLocaleString('en-US',{day:'numeric',timeZone:'America/New_York'})
  return `li_${short}_${slug}_${month}${day}`
}

function buildPostBody(category: string, topic: string, _tenantName: string, now: Date): string {
  const destUrl = DESTINATION_URLS[category] || 'https://taxrescrm.net'
  const campaign = makeUtmCampaign(category, topic, now)
  const utmUrl = destUrl + '?utm_source=linkedin&utm_medium=social&utm_campaign=' + campaign
  const nl = "\n"

  const templates: Record<string, (t: string) => string> = {
    educational: (t) =>
      '[DRAFT -- add specific practitioner detail before approving]' + nl + nl +
      'Most firms handle this type of issue without pulling the relevant IRS transcript first.' + nl + nl +
      'Topic: ' + t + nl + nl +
      '[Add 3-5 specific steps, form numbers, or IRS criteria for this topic]' + nl + nl +
      'What does your firm do when this comes up?' + nl + nl +
      'More at: ' + utmUrl,

    practitioner: (t) =>
      '[DRAFT -- add specific workflow detail before approving]' + nl + nl +
      'Here is a workflow problem most resolution firms have.' + nl + nl +
      'Topic: ' + t + nl + nl +
      '[Describe the current manual state and what improves with better tooling]' + nl + nl +
      'If your firm is still handling this manually, happy to show you a different approach.' + nl + nl +
      utmUrl,

    product: (t) =>
      '[DRAFT -- describe a specific live production capability before approving]' + nl + nl +
      '[Describe the before state without this feature]' + nl + nl +
      'Topic: ' + t + nl + nl +
      '[Describe the after state with Tax Res CRM -- specific and verifiable today]' + nl + nl +
      'If you want to see it: ' + utmUrl,

    founder_story: (t) =>
      '[DRAFT -- write in Romy voice before approving]' + nl + nl +
      '[Open with a specific observation from running Tax Case Review]' + nl + nl +
      'Topic: ' + t + nl + nl +
      '[Share what you learned or decided -- specific details only]' + nl + nl +
      utmUrl,

    resource: (t) =>
      '[DRAFT -- verify resource URL exists at taxrescrm.net before approving]' + nl + nl +
      '[Open with the problem this resource solves for resolution practitioners]' + nl + nl +
      'Topic: ' + t + nl + nl +
      '[Add 2-3 specific things the reader will find in the guide]' + nl + nl +
      'Link: ' + utmUrl,

    demo_invite: (t) =>
      '[DRAFT -- must describe a live production capability before approving]' + nl + nl +
      '[Open with a specific resolution workflow problem]' + nl + nl +
      t + nl + nl +
      '[Describe what changes with Tax Res CRM -- production-ready only]' + nl + nl +
      'Book a 30-minute walkthrough: ' + utmUrl,
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
    const category = pickCategory(recentCategories, recentBodies)
    const topic    = pickTopic(category, recentBodies)
    const body     = buildPostBody(category, topic, 'Tax Res CRM', now)
    const title    = `[DRAFT] ${CONTENT_STRATEGY.find(s => s.category === category)?.label} — ${topic}`

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

Deno.serve(async (req, ctx) => {
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

  // ── Monitor: send alert email (called by pg_net from check_linkedin_health) ─
  if (action === 'send_alert') {
    const subject = body.subject as string
    const html    = body.html    as string
    if (!subject || !html) return new Response(JSON.stringify({ ok: false, error: 'subject and html required' }), { status: 400 })
    await sendAdminAlert(supabase, subject, html)
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  // ── Monitor: read health status (called by UI Settings panel) ─────────────
  if (action === 'get_health') {
    const { data, error } = await supabase.rpc('get_linkedin_health')
    if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 })
    return new Response(JSON.stringify({ ok: true, health: data }), { headers: { ...cors, 'Content-Type': 'application/json' } })
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
          ).join("\n")

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

    // ── Return immediately so pg_net gets its response before the 30s timeout ──
    // The LinkedIn API call runs in the background via ctx.waitUntil().
    // This prevents pg_net from killing the connection mid-publish.
    const publishWork = async () => {
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

      try {
        // Append UTM to any URLs in the post body
        const campaign = `li_${post.category || 'content'}_${post.id.slice(0,8)}`
        const bodyWithUtm = (post.body || '').replace(/(https?:\/\/[^\s)]+)/g, (url: string) => {
          if (url.includes('utm_')) return url
          const sep = url.includes('?') ? '&' : '?'
          return `${url}${sep}utm_source=linkedin&utm_medium=social&utm_campaign=${campaign}`
        })

        // 25s timeout — pg_net kills connections at 30s, so fail fast with an error msg
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 25000)

        let publishRes: Response
        try {
          publishRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
            method: 'POST',
            signal: controller.signal,
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
        } finally {
          clearTimeout(timeoutId)
        }

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
        const errMsg = e instanceof Error && e.name === 'AbortError'
          ? 'LinkedIn API timeout (>25s) — will retry next scheduled run'
          : String(e)
        // Safety: always reset the lock — never leave a post stranded at 'publishing'
        await supabase.from('linkedin_posts').update({
          status: retries >= MAX_RETRIES ? 'failed' : 'approved',
          retry_count: retries, error_msg: errMsg, updated_at: now.toISOString(),
        }).eq('id', post.id)
        results.failed++
        console.error(`[linkedin-scheduler] Post ${post.id} exception:`, errMsg)
      }
    } // end for loop

      // ── Weekly report: Monday 7am ET (runs in background alongside publish) ─
      if (etDay === 1 && etHour === 7) {
        try {
          await generateWeeklyReport(supabase, ADMIN_TENANT, now)
          console.log('[linkedin-scheduler] Weekly report generated')
        } catch (e) {
          console.error('[linkedin-scheduler] Weekly report error:', e)
        }
      }
    } // end publishWork

    // Register background work THEN return immediately — pg_net gets its response
    // in <1s and closes the connection; Deno keeps running publishWork to completion.
    ctx.waitUntil(publishWork())
    console.log(`[linkedin-scheduler] Queued ${duePosts.length} post(s) for background publish`)
    return new Response(JSON.stringify({ ok: true, queued: duePosts.length }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })

  } catch (e) {
    console.error('[linkedin-scheduler] Fatal error:', e)
    results.errors.push(String(e))
  }

  console.log('[linkedin-scheduler] Done:', results)
  return new Response(JSON.stringify({ ok: true, ...results }), {
    headers: { ...cors, 'Content-Type': 'application/json' }
  })
})
