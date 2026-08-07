import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

const BRAND_VOICE = `
You are writing content for TaxRes CRM — a purpose-built CRM for tax resolution firms.
The audience is: licensed Enrolled Agents (EAs), CPAs, and tax attorneys who represent clients before the IRS.

VOICE RULES (non-negotiable):
- Professional, educational, practitioner-first tone
- No AI buzzwords: never say "leverage", "utilize", "game-changing", "revolutionary", "cutting-edge", "seamless", "robust", "streamline" (unless naturally unavoidable), "empower", "synergy"
- No hype or exaggerated claims
- No generic openers like "In today's fast-paced world" or "Are you tired of..."
- Write like a colleague who has spent years in tax resolution, not a marketer
- Short, direct sentences. No walls of text.
- Specific over vague: real IRS process names (CP504, TFRP, CSED, OIC, 433-F, IRS TDS), real timelines (21 days, 10 years), real consequences
- Practitioner language: "your firm", "your clients", "resolution workflow", "case pipeline"

PRODUCT FACTS (use accurately):
- TaxRes CRM is a multi-tenant SaaS CRM built specifically for tax resolution firms
- Features: IRS transcript import (automated via A2A + manual import), case pipeline, IRS form generation (2848, 8821, 433-F, 433-B), e-signatures, client portal, payment processing, workflow automation, calendar, document management, team chat, time tracking
- NOT a competitor to Drake, Lacerte, or ProSeries — those are tax preparation tools. TaxRes CRM is case management for resolution work post-notice.
- Competitor context: Canopy and TaxDome are the main alternatives. TaxRes CRM differentiates on IRS-specific workflows and transcript automation.
- Currently in early access / beta — be honest about this

NEVER say:
- "Former IRS Revenue Officer" or anything implying Romy worked at the IRS
- "Game-changing" or "revolutionary"
- "All-in-one" (overused)
- Claim features not listed above
`

const ARCHETYPES = [
  { name:'Marcus', trade:'roofing contractor', county:'Broward County, FL', debt:'$81,000', problem:'941 deposit shortfalls' },
  { name:'Elena', trade:'restaurant owner', county:'Miami-Dade County, FL', debt:'$47,000', problem:'payroll tax trust fund' },
  { name:'Derek', trade:'HVAC company owner', county:'Harris County, TX', debt:'$67,000', problem:'quarterly deposit gaps' },
  { name:'James', trade:'trucking company owner', county:'Dallas County, TX', debt:'$94,000', problem:'three years unfiled 941s' },
  { name:'Sandra', trade:'real estate investor', county:'Orange County, FL', debt:'$142,000', problem:'multi-property capital gains' },
  { name:'Tony', trade:'general contractor', county:'Hillsborough County, FL', debt:'$88,000', problem:'TFRP after business closure' },
  { name:'Keisha', trade:'freelance healthcare consultant', county:'Fulton County, GA', debt:'$38,000', problem:'W-2 to 1099 transition' },
  { name:'Carlos', trade:'solar installation owner', county:'Maricopa County, AZ', debt:'$62,000', problem:'1099 subs reclassified as W-2' },
]

const LINKEDIN_ROTATIONS = [
  'Educational: IRS workflow tip that practitioners rarely discuss',
  'Product walkthrough: a specific TaxRes CRM feature in a real use case',
  'Founder update: what we built this week and why',
  'Industry insight: a pattern seen across resolution cases',
  'New feature announcement: specific capability just shipped',
  'Case type breakdown: how to handle a specific IRS notice type',
]

serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Get context: recent feature releases, published articles, top keywords
  const weekOf = new Date()
  weekOf.setDate(weekOf.getDate() - weekOf.getDay() + 1) // This Monday
  const weekOfStr = weekOf.toISOString().slice(0, 10)

  // Check if we already generated this week
  const { data: existing } = await supabase
    .from('content_drafts')
    .select('id')
    .eq('week_of', weekOfStr)
    .limit(1)

  if (existing && existing.length > 0 && !req.headers.get('x-force-regenerate')) {
    return new Response(JSON.stringify({ ok: true, message: 'Already generated this week', weekOf: weekOfStr }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Get top GSC keywords if available
  const { data: keywords } = await supabase
    .from('marketing_gsc_performance')
    .select('query, clicks, position')
    .not('query', 'is', null)
    .order('clicks', { ascending: false })
    .limit(10)

  const topKeywords = (keywords || []).map(k => k.query).join(', ') || 
    'tax resolution CRM, IRS case management software, Canopy alternative, tax resolution software'

  // Get recent GA4 top pages if available
  const { data: topPages } = await supabase
    .from('marketing_ga4_pages')
    .select('page_path, sessions')
    .order('sessions', { ascending: false })
    .limit(5)

  const topPagesStr = (topPages || []).map(p => p.page_path).join(', ') || '/features/irs-workflows, /resources'

  // Pick archetype for this week (rotate by week number)
  const weekNum = Math.floor(Date.now() / (7 * 86400000))
  const archetype = ARCHETYPES[weekNum % ARCHETYPES.length]
  const rotation = LINKEDIN_ROTATIONS[weekNum % LINKEDIN_ROTATIONS.length]

  const context = `
Week of: ${weekOfStr}
Top SEO keywords this week: ${topKeywords}
Top traffic pages: ${topPagesStr}
Archetype for this week: ${archetype.name}, ${archetype.trade}, ${archetype.county}, owes ${archetype.debt}, issue: ${archetype.problem}
LinkedIn rotation this week: ${rotation}
`

  async function callClaude(prompt: string, maxTokens = 800): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        system: BRAND_VOICE,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await res.json()
    return data.content?.[0]?.text || ''
  }

  const drafts = []

  // 1. LinkedIn post
  const linkedinDraft = await callClaude(`
${context}

Write a LinkedIn post for TaxRes CRM. This week's rotation: ${rotation}

Requirements:
- 120-160 words
- Open with a specific data point, a practitioner scenario, or a contrarian insight — NOT a generic opener
- Body: one concrete insight or workflow tip tied to TaxRes CRM capability
- End with a soft CTA: either a question that invites comments, or "Book a demo at taxrescrm.net"
- 4 relevant hashtags at the end: mix of #TaxResolution #EnrolledAgent #IRSHelp #TaxPro
- Do NOT start with "I", "Are you", or "Did you know"
- Tone: peer-to-peer, not salesy
`, 600)

  drafts.push({ content_type: 'linkedin', title: `LinkedIn Post — Week of ${weekOfStr}`, body: linkedinDraft, week_of: weekOfStr, status: 'draft' })

  // 2. Resource Center article idea
  const articleIdea = await callClaude(`
${context}

Generate ONE Resource Center article idea for TaxRes CRM's website (taxrescrm.net/resources).

The article should:
- Target a keyword that tax resolution firm OWNERS would search (not their clients)
- Address a real operational problem: how to manage transcript pulls, how to handle a specific IRS notice type in your practice, how to structure OIC case timelines, how to track CSED across a caseload, etc.
- Be educational for practitioners, not taxpayers
- Be 1,200-1,800 words when written

Return exactly this format:
TITLE: [article title]
KEYWORD: [primary target keyword]
ANGLE: [one sentence — what makes this article useful that other articles miss]
OUTLINE:
- [section 1]
- [section 2]
- [section 3]
- [section 4]
- [section 5]
CTA: [which page to link: /features/irs-workflows, /features, /about, or taxrescrm.net demo page]
`, 500)

  drafts.push({ content_type: 'article_idea', title: `Article Idea — Week of ${weekOfStr}`, body: articleIdea, week_of: weekOfStr, status: 'draft' })

  // 3. Email newsletter
  const emailDraft = await callClaude(`
${context}

Write a weekly email newsletter for TaxRes CRM subscribers (tax resolution practitioners).

Format:
SUBJECT: [subject line — max 8 words, practitioner-focused, no clickbait]
PREVIEW: [preview text, 40-60 chars]

---

[Email body — 200-280 words]

Structure:
- Opening: one specific thing that happened in IRS resolution this week OR one product update (2-3 sentences)
- Feature spotlight: one TaxRes CRM feature explained in concrete workflow terms — what you do, what it saves, what it replaces
- Quick tip: one IRS process tip practitioners can use today
- Close: simple, direct — "See you next week" energy, not a hard sell
- CTA: Book a demo at taxrescrm.net OR reply to this email with a question

Sign off: Romy Cruz, EA | TaxRes CRM | taxrescrm.net
`, 700)

  drafts.push({ content_type: 'email', title: `Newsletter — Week of ${weekOfStr}`, body: emailDraft, week_of: weekOfStr, status: 'draft' })

  // 4. Customer education tip
  const eduTip = await callClaude(`
${context}

Write ONE short customer education tip for tax resolution practitioners using TaxRes CRM.

This is for in-app tips, onboarding emails, or short social content.

Format:
TIP TITLE: [short, action-oriented, max 8 words]
TIP BODY: [60-80 words — specific, actionable, tied to a real TaxRes CRM workflow or IRS process]
USE CASE: [one sentence — when to show this tip]
`, 300)

  drafts.push({ content_type: 'edu_tip', title: `Education Tip — Week of ${weekOfStr}`, body: eduTip, week_of: weekOfStr, status: 'draft' })

  // 5-7. Three outreach messages
  const outreachTargets = [
    { target: 'Enrolled Agent who currently uses Canopy and manages 40+ resolution cases', pain: 'transcript pulls take too long and case status is hard to see at a glance' },
    { target: 'CPA firm with a resolution department, 3-5 staff, currently using spreadsheets', pain: 'no centralized case tracking, documents scattered across email' },
    { target: 'Solo EA who just passed representation exam and is building their resolution practice', pain: 'no purpose-built tool, using generic CRM that does not understand IRS workflows' },
  ]

  for (const t of outreachTargets) {
    const outreach = await callClaude(`
${context}

Write a cold outreach message for TaxRes CRM.

Target: ${t.target}
Their pain point: ${t.pain}

Format: LinkedIn DM or cold email (keep it ambiguous so it works for both)
Length: 80-110 words
Tone: peer-to-peer, direct, no fluff, no flattery opener ("I came across your profile...")
Open with their pain point or a specific scenario they recognize immediately
One sentence about TaxRes CRM — what it does, not what it "is"
CTA: one specific ask — offer a 20-minute demo or a free trial
Sign: Romy, TaxRes CRM | taxrescrm.net

Do NOT say: "I hope this message finds you well", "I wanted to reach out", "I noticed that", "game-changer", "revolutionary"
`, 400)

    drafts.push({ 
      content_type: 'outreach', 
      title: `Outreach — ${t.target.split(' ').slice(0,5).join(' ')}`, 
      body: outreach, 
      week_of: weekOfStr, 
      status: 'draft',
      metadata: { target: t.target, pain: t.pain }
    })
  }

  // Insert all drafts
  const { error: insertErr } = await supabase.from('content_drafts').insert(drafts)

  if (insertErr) {
    return new Response(JSON.stringify({ ok: false, error: insertErr }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }

  return new Response(JSON.stringify({ ok: true, weekOf: weekOfStr, drafts: drafts.length }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
