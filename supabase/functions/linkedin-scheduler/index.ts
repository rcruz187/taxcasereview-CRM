// linkedin-scheduler v3 — hands-off content automation
// Publishing itself is handled by the database linkedin-publish-fire/process jobs.
// This function owns content generation, validation, reporting, settings, health, and alerts.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TIMEZONE = 'America/New_York'
const ADMIN_EMAIL = 'info@romylabs.com'
const ADMIN_TENANT = 'a0000000-0000-0000-0000-000000000001'

const PUBLISH_SLOTS = [
  { day: 2, label: 'Tuesday' },
  { day: 4, label: 'Thursday' },
]

type GeneratedPost = {
  title: string
  body: string
  category: string
  cta_type: string
}

type ValidationResult = { ok: boolean; reasons: string[] }

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function redact(value: string) {
  return value
    ? value
        .replace(/(Bearer\s+)[^\s\"]+/gi, '$1[REDACTED]')
        .replace(/(access_token['\":\s]+)[^'\"&\s,}]+/gi, '$1[REDACTED]')
    : value
}

function getETParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value || ''
  const weekday = get('weekday')
  return {
    weekday,
    hour: Number(get('hour')),
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
  }
}

function easternOffsetFor(date: Date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    timeZoneName: 'longOffset',
  })
  const zone = dtf.formatToParts(date).find((p) => p.type === 'timeZoneName')?.value || 'GMT-04:00'
  return zone.replace('GMT', '')
}

function makeEasternNineAm(year: number, month: number, day: number) {
  const probe = new Date(Date.UTC(year, month - 1, day, 13, 0, 0))
  const offset = easternOffsetFor(probe)
  return new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T09:00:00${offset}`)
}

function getNextSlots(from: Date, count = 8) {
  const result: Array<{ iso: string; label: string }> = []
  const cursor = new Date(from)
  cursor.setUTCHours(12, 0, 0, 0)

  for (let i = 0; i < 60 && result.length < count; i++) {
    const local = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      weekday: 'short',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(cursor)
    const val = (t: string) => local.find((p) => p.type === t)?.value || ''
    const weekday = val('weekday')
    const slot = PUBLISH_SLOTS.find((s) => s.label.slice(0, 3) === weekday)
    if (slot) {
      const y = Number(val('year'))
      const m = Number(val('month'))
      const d = Number(val('day'))
      const nine = makeEasternNineAm(y, m, d)
      if (nine.getTime() > from.getTime()) {
        result.push({
          iso: nine.toISOString(),
          label: `${slot.label} ${m}/${d} 9:00 AM ET`,
        })
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return result.slice(0, count)
}

const CONTENT_LIBRARY: GeneratedPost[] = [
  {
    category: 'practitioner',
    cta_type: 'engage',
    title: 'The hidden cost of scattered case notes',
    body: `A tax resolution case can involve calls, notices, documents, deadlines, follow-ups, and multiple people touching the file.\n\nWhen those details live in separate inboxes, spreadsheets, and personal notes, the problem is not just inconvenience. It becomes harder to answer a simple question: what needs attention next?\n\nThat is one of the reasons I built Tax Res CRM around the actual day-to-day workflow of a resolution practice.\n\nHow is your firm keeping the full case history in one place?\n\nhttps://taxrescrm.net`,
  },
  {
    category: 'practitioner',
    cta_type: 'engage',
    title: 'Follow-up should not depend on memory',
    body: `The easiest follow-up to miss is the one nobody wrote down.\n\nIn a busy tax resolution practice, client callbacks, document requests, IRS follow-ups, and internal tasks compete for attention every day. A repeatable workflow matters more as the caseload grows.\n\nTax Res CRM was built to give resolution teams a clearer place to organize the work instead of relying on memory and disconnected tools.\n\nWhat part of follow-up creates the most friction in your office?\n\nhttps://taxrescrm.net/demo`,
  },
  {
    category: 'product',
    cta_type: 'demo',
    title: 'A CRM built around tax resolution work',
    body: `Generic CRMs can track contacts. Tax resolution teams need the surrounding case workflow to make sense too.\n\nTax Res CRM is being built specifically around resolution practices: client records, case activity, documents, tasks, communications, and the operational work that happens around an active case.\n\nThe goal is simple: fewer disconnected systems and a clearer picture of what is happening across the office.\n\nWant to see the workflow?\n\nhttps://taxrescrm.net/demo`,
  },
  {
    category: 'founder_story',
    cta_type: 'engage',
    title: 'Why I built Tax Res CRM',
    body: `I did not start Tax Res CRM because the world needed another generic CRM.\n\nI built it after working inside tax resolution and seeing how much time gets lost moving between systems that were never designed around this type of practice.\n\nThe product decisions come from that perspective: organize the case, make the next action easier to see, and keep the office from depending on scattered information.\n\nThat is still the standard I use when deciding what belongs in the product.\n\nhttps://taxrescrm.net`,
  },
  {
    category: 'practitioner',
    cta_type: 'engage',
    title: 'The case file should tell the story',
    body: `Open a client file and ask one question: can another person on the team quickly understand what happened, what is pending, and what comes next?\n\nIf the answer depends on finding the right email thread or asking the person who last touched the case, the workflow is carrying unnecessary risk.\n\nA well-organized case history makes handoffs, follow-up, and client communication much easier.\n\nThat operational problem is a big part of what Tax Res CRM is designed to solve.\n\nhttps://taxrescrm.net`,
  },
  {
    category: 'product',
    cta_type: 'demo',
    title: 'One place to see the work',
    body: `A resolution practice should not need five different places to understand one client relationship.\n\nTax Res CRM brings the operational pieces of the practice together so the team has a clearer view of clients, case activity, communications, documents, and tasks.\n\nIt is software built around the work resolution teams already do rather than forcing that work into a generic sales pipeline.\n\nBook a walkthrough:\nhttps://taxrescrm.net/demo`,
  },
  {
    category: 'founder_story',
    cta_type: 'engage',
    title: 'Software should match the practice',
    body: `One lesson from working in tax resolution: software can create almost as much work as it removes when the workflow does not match the practice.\n\nThat is why I keep coming back to the same question while building Tax Res CRM: would this actually make sense during a normal workday inside a resolution office?\n\nFeatures are useful. A workflow people can actually follow is more useful.\n\nhttps://taxrescrm.net`,
  },
  {
    category: 'practitioner',
    cta_type: 'engage',
    title: 'Visibility matters as the caseload grows',
    body: `A small caseload can hide a messy process. A larger caseload exposes it.\n\nAs more cases move at the same time, teams need a reliable way to see pending work, recent activity, client communication, and ownership without rebuilding the picture every morning.\n\nThat visibility is one of the core problems Tax Res CRM is designed around.\n\nWhat is the first thing you check when you start your day?\n\nhttps://taxrescrm.net`,
  },
  {
    category: 'product',
    cta_type: 'demo',
    title: 'Built for resolution teams, not adapted later',
    body: `There is a difference between adding tax-resolution labels to a generic CRM and designing the workflow around a resolution practice from the beginning.\n\nTax Res CRM is built from the second approach. The product is centered on the operational reality of managing clients and active resolution work.\n\nIf your current system feels like something your firm has had to work around, I would be happy to show you what we are building.\n\nhttps://taxrescrm.net/demo`,
  },
  {
    category: 'practitioner',
    cta_type: 'engage',
    title: 'Good systems make handoffs easier',
    body: `A good case-management system should make a handoff boring.\n\nThe next person should be able to open the record, understand the recent activity, see what is pending, and continue the work without reconstructing the case from messages and memory.\n\nThat sounds simple, but it becomes increasingly important as a resolution team grows.\n\nhttps://taxrescrm.net`,
  },
  {
    category: 'founder_story',
    cta_type: 'engage',
    title: 'Building from real workflow problems',
    body: `The best product ideas for Tax Res CRM have not come from a feature checklist. They have come from moments where the work itself felt harder than it needed to be.\n\nA missed handoff. Information in the wrong place. Too many steps to understand a case. A follow-up that should have been obvious.\n\nThose are the problems I want the software to remove.\n\nhttps://taxrescrm.net`,
  },
  {
    category: 'product',
    cta_type: 'demo',
    title: 'See Tax Res CRM in context',
    body: `The easiest way to evaluate practice software is not a feature list. It is seeing how the workflow fits the way your office actually works.\n\nTax Res CRM is purpose-built for tax resolution practices and the operational work around their cases.\n\nIf you want to see the product in context, book a walkthrough and we can go through the workflow together.\n\nhttps://taxrescrm.net/demo`,
  },
]

const PROHIBITED = [
  '[draft', '[add ', '[describe ', '[open ', '[share ', '[verify ', 'todo', 'tbd',
  'guaranteed', 'settle for pennies', 'eliminate your tax debt', 'irs approved',
  'irs certified', 'always works', 'never fails', 'fully automated transcript',
]

function normalize(text: string) {
  return text.toLowerCase().replace(/https?:\/\/\S+/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

function validatePost(post: GeneratedPost, recentBodies: string[]): ValidationResult {
  const reasons: string[] = []
  const lower = post.body.toLowerCase()
  if (post.body.length < 180) reasons.push('body_too_short')
  if (post.body.length > 2500) reasons.push('body_too_long')
  if (!/^https:\/\/taxrescrm\.net(?:\/|$)/m.test(post.body.split('\n').find((l) => l.startsWith('https://')) || '')) {
    reasons.push('missing_or_invalid_destination')
  }
  for (const phrase of PROHIBITED) {
    if (lower.includes(phrase)) reasons.push(`prohibited:${phrase}`)
  }
  const candidate = normalize(post.body)
  for (const body of recentBodies) {
    const recent = normalize(body)
    if (candidate === recent || (candidate.length > 80 && recent.includes(candidate.slice(0, 80)))) {
      reasons.push('duplicate_recent_content')
      break
    }
  }
  return { ok: reasons.length === 0, reasons }
}

function withUtm(post: GeneratedPost, now: Date) {
  const stamp = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    month: '2-digit',
    day: '2-digit',
  }).format(now).replace('/', '')
  const campaign = `li_${post.category}_${stamp}`
  return {
    ...post,
    body: post.body.replace(/https:\/\/taxrescrm\.net(?:\/demo)?/g, (url) =>
      `${url}?utm_source=linkedin&utm_medium=social&utm_campaign=${campaign}`
    ),
  }
}

async function getRecentPosts(supabase: ReturnType<typeof createClient>, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const { data, error } = await supabase
    .from('linkedin_posts')
    .select('body,category,created_at,scheduled_at,status')
    .eq('tenant_id', ADMIN_TENANT)
    .gte('created_at', since)
    .not('status', 'eq', 'failed')
  if (error) throw error
  return data || []
}

function chooseContent(recent: any[], count: number) {
  const recentBodies = recent.map((p) => p.body || '')
  const recentCategories = recent.slice(-6).map((p) => p.category || '')
  const selected: GeneratedPost[] = []

  for (const item of CONTENT_LIBRARY) {
    const validation = validatePost(item, [...recentBodies, ...selected.map((p) => p.body)])
    if (!validation.ok) continue
    if (selected.length && selected[selected.length - 1].category === item.category) continue
    if (item.category === 'product' && recentCategories.slice(-2).includes('product')) continue
    if (item.category === 'founder_story' && recentCategories.includes('founder_story')) continue
    selected.push(item)
    if (selected.length >= count) break
  }

  if (selected.length < count) {
    for (const item of CONTENT_LIBRARY) {
      if (selected.includes(item)) continue
      const validation = validatePost(item, [...recentBodies, ...selected.map((p) => p.body)])
      if (validation.ok) selected.push(item)
      if (selected.length >= count) break
    }
  }
  return selected
}

async function generateAndApprove(supabase: ReturnType<typeof createClient>, now: Date) {
  const slots = getNextSlots(now, 2)
  const recent = await getRecentPosts(supabase)

  // Do not create a duplicate row for a slot that is already populated.
  const slotTimes = slots.map((s) => s.iso)
  const { data: existing, error: existingError } = await supabase
    .from('linkedin_posts')
    .select('scheduled_at,status')
    .eq('tenant_id', ADMIN_TENANT)
    .in('scheduled_at', slotTimes)
    .not('status', 'eq', 'failed')
  if (existingError) throw existingError

  const occupied = new Set((existing || []).map((p) => new Date(p.scheduled_at).toISOString()))
  const openSlots = slots.filter((s) => !occupied.has(new Date(s.iso).toISOString()))
  if (!openSlots.length) return { created: [], quarantined: [], skipped: slots.length }

  const chosen = chooseContent(recent, openSlots.length)
  const created: any[] = []
  const quarantined: any[] = []

  for (let i = 0; i < openSlots.length; i++) {
    const source = chosen[i]
    if (!source) {
      quarantined.push({ slot: openSlots[i], reasons: ['no_unique_valid_content_available'] })
      continue
    }

    const post = withUtm(source, now)
    const validation = validatePost(post, recent.map((p) => p.body || ''))
    if (!validation.ok) {
      quarantined.push({ slot: openSlots[i], title: post.title, reasons: validation.reasons })
      continue
    }

    const { data, error } = await supabase
      .from('linkedin_posts')
      .insert({
        tenant_id: ADMIN_TENANT,
        title: post.title,
        body: post.body,
        category: post.category,
        cta_type: post.cta_type,
        status: 'approved',
        approved_at: now.toISOString(),
        scheduled_at: openSlots[i].iso,
        retry_count: 0,
      })
      .select('id,title,category,status,scheduled_at')
      .single()

    if (error) {
      quarantined.push({ slot: openSlots[i], title: post.title, reasons: [redact(error.message)] })
    } else {
      created.push(data)
      recent.push({ body: post.body, category: post.category })
    }
  }

  return { created, quarantined, skipped: slots.length - openSlots.length }
}

async function sendAdminAlert(supabase: ReturnType<typeof createClient>, subject: string, html: string) {
  try {
    const { error } = await supabase.functions.invoke('send-email', {
      body: { to: ADMIN_EMAIL, subject, html, tenant_id: ADMIN_TENANT },
    })
    if (error) console.error('[linkedin-scheduler] alert failed:', redact(error.message))
  } catch (error) {
    console.error('[linkedin-scheduler] alert exception:', redact(String(error)))
  }
}

async function generateWeeklyReport(supabase: ReturnType<typeof createClient>, now: Date) {
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString()
  const { data: published } = await supabase
    .from('linkedin_posts')
    .select('id,title,category,published_at,linkedin_url')
    .eq('tenant_id', ADMIN_TENANT)
    .eq('status', 'published')
    .gte('published_at', weekAgo)
    .order('published_at', { ascending: false })

  const { data: failed } = await supabase
    .from('linkedin_posts')
    .select('id,title,error_msg,updated_at')
    .eq('tenant_id', ADMIN_TENANT)
    .eq('status', 'failed')
    .gte('updated_at', weekAgo)

  const { data: upcoming } = await supabase
    .from('linkedin_posts')
    .select('id,title,category,status,scheduled_at')
    .eq('tenant_id', ADMIN_TENANT)
    .in('status', ['approved', 'publishing'])
    .gte('scheduled_at', now.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(10)

  return {
    generated_at: now.toISOString(),
    published: published || [],
    failed: failed || [],
    upcoming: upcoming || [],
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SB_SERVICE_KEY')
  if (!url || !key) return json({ ok: false, error: 'server_configuration_missing' }, 500)

  const supabase = createClient(url, key)
  let input: Record<string, any> = {}
  try { input = await req.json() } catch (_) {}
  const action = input.action || 'run'
  const now = new Date()

  try {
    if (action === 'get_settings') {
      const { data } = await supabase.from('linkedin_settings').select('*').eq('tenant_id', ADMIN_TENANT).maybeSingle()
      return json({ ok: true, settings: data || { autopilot: true, timezone: TIMEZONE } })
    }

    if (action === 'save_settings') {
      const settings = input.settings || {}
      // Full autopilot is the production operating mode. Keep the field for UI compatibility.
      const { error } = await supabase.from('linkedin_settings').upsert({
        tenant_id: ADMIN_TENANT,
        ...settings,
        autopilot: true,
        timezone: TIMEZONE,
        updated_at: now.toISOString(),
      }, { onConflict: 'tenant_id' })
      if (error) throw error
      return json({ ok: true, autopilot: true })
    }

    if (action === 'get_health') {
      const { data, error } = await supabase.rpc('get_linkedin_health')
      if (error) throw error
      return json({ ok: true, health: data })
    }

    if (action === 'send_alert') {
      if (!input.subject || !input.html) return json({ ok: false, error: 'subject_and_html_required' }, 400)
      await sendAdminAlert(supabase, String(input.subject), String(input.html))
      return json({ ok: true })
    }

    if (action === 'next_slots') return json({ ok: true, slots: getNextSlots(now, 8) })

    if (action === 'generate_report') {
      return json({ ok: true, report: await generateWeeklyReport(supabase, now) })
    }

    if (action === 'list_reports') {
      const { data, error } = await supabase
        .from('linkedin_weekly_reports')
        .select('*')
        .eq('tenant_id', ADMIN_TENANT)
        .order('week_start', { ascending: false })
        .limit(12)
      if (error) throw error
      return json({ ok: true, reports: data || [] })
    }

    if (action === 'generate_monday_drafts' || action === 'generate_content') {
      const result = await generateAndApprove(supabase, now)
      if (result.quarantined.length) {
        await sendAdminAlert(
          supabase,
          'LinkedIn autopilot: content needs attention',
          `<p>Autopilot safely withheld ${result.quarantined.length} post(s) because validation did not pass.</p><pre>${JSON.stringify(result.quarantined, null, 2)}</pre>`,
        )
      }
      return json({ ok: true, autopilot: true, ...result })
    }

    if (action !== 'run') return json({ ok: false, error: 'unknown_action' }, 400)

    const et = getETParts(now)
    const results: Record<string, any> = {
      ok: true,
      autopilot: true,
      generated: 0,
      quarantined: 0,
      skipped: 0,
      report_generated: false,
    }

    // Monday 7 AM ET. Cron may invoke more than once during the hour; slot idempotency prevents duplicates.
    if (et.weekday === 'Mon' && et.hour === 7) {
      const generated = await generateAndApprove(supabase, now)
      results.generated = generated.created.length
      results.quarantined = generated.quarantined.length
      results.skipped = generated.skipped

      if (generated.quarantined.length) {
        await sendAdminAlert(
          supabase,
          'LinkedIn autopilot: validation withheld content',
          `<p>${generated.quarantined.length} post(s) were not approved because automated validation failed. No unsafe content will publish.</p><pre>${JSON.stringify(generated.quarantined, null, 2)}</pre>`,
        )
      }

      const report = await generateWeeklyReport(supabase, now)
      results.report_generated = true
      results.report = report

      console.log(`[linkedin-scheduler] Monday autopilot generated=${results.generated} quarantined=${results.quarantined} skipped=${results.skipped}`)
    }

    // The DB publish-fire/process jobs own actual LinkedIn publication. This function deliberately
    // does not call LinkedIn, preventing the old pg_net/edge-function timeout and orphan-lock path.
    return json(results)
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : String(error))
    console.error('[linkedin-scheduler] fatal:', message)
    return json({ ok: false, error: message }, 500)
  }
})
