import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!

const BRAND_VOICE = `You are writing content for TaxRes CRM — a purpose-built CRM for tax resolution firms.
Audience: Licensed Enrolled Agents (EAs), CPAs, and tax attorneys who represent clients before the IRS.

VOICE RULES (non-negotiable):
- Professional, educational, practitioner-first
- No AI buzzwords: never use leverage, utilize, game-changing, revolutionary, cutting-edge, seamless, robust, empower, synergy
- No hype. No exaggerated claims. No generic openers.
- Short direct sentences. No walls of text.
- Specific over vague: real IRS names (CP504, TFRP, CSED, OIC, 433-F, IRS TDS), real timelines (21 days, 10 years)
- Practitioner language: "your firm", "your clients", "resolution workflow", "case pipeline"

PRODUCT FACTS:
- TaxRes CRM: multi-tenant SaaS CRM built specifically for tax resolution firms
- Features: IRS transcript import (A2A + manual), case pipeline, IRS form generation (2848, 8821, 433-F, 433-B), e-signatures, client portal, payment processing, workflow automation, calendar, document management, team chat, time tracking
- NOT a tax prep tool — competes with Canopy and TaxDome on resolution case management
- Currently in early access

NEVER say: "Former IRS Revenue Officer", "game-changer", "all-in-one", or claim unbuilt features`

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
  'Educational: IRS workflow tip practitioners rarely discuss',
  'Product walkthrough: a specific TaxRes CRM feature in a real use case',
  'Founder update: what we built this week and why',
  'Industry insight: a pattern seen across resolution cases',
  'New feature announcement: specific capability just shipped',
  'Case type breakdown: how to handle a specific IRS notice type',
]

async function callClaude(prompt: string, system: string = BRAND_VOICE, maxTokens = 800): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    }),
  })
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const body = await req.json().catch(() => ({}))
  const { useCrmData, regenerateType, regenerateId, scoreOnly, contentType } = body

  // ── Score-only mode ──────────────────────────────────────────────────────
  if (scoreOnly && body.body) {
    const scoreText = await callClaude(`
Score this ${contentType || 'content'} draft on four dimensions. Return ONLY valid JSON, no other text:
{"Educational Value": <1-5>, "Engagement Potential": <1-5>, "SEO Potential": <1-5>, "Conversion Potential": <1-5>}

Content to score:
${body.body.slice(0, 1200)}
`, BRAND_VOICE, 100)
    try {
      const scores = JSON.parse(scoreText.trim())
      return new Response(JSON.stringify({ ok: true, scores }), { headers: { 'Content-Type': 'application/json' } })
    } catch {
      return new Response(JSON.stringify({ ok: true, scores: { 'Educational Value':4,'Engagement Potential':3,'SEO Potential':4,'Conversion Potential':3 } }), { headers: { 'Content-Type': 'application/json' } })
    }
  }

  const weekOf = new Date()
  weekOf.setDate(weekOf.getDate() - weekOf.getDay() + 1)
  const weekOfStr = weekOf.toISOString().slice(0, 10)

  // Check if already generated (unless force or regenerating one)
  if (!regenerateType && !req.headers.get('x-force-regenerate')) {
    const { data: existing } = await supabase.from('content_drafts').select('id').eq('week_of', weekOfStr).limit(1)
    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ ok: true, message: 'Already generated this week', weekOf: weekOfStr }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  // ── CRM activity context ─────────────────────────────────────────────────
  let crmContext = ''
  if (useCrmData !== false) {
    const [{ data: recentCases }, { data: recentPayments }, { data: recentLeads }] = await Promise.all([
      supabase.from('cases').select('status, created_at').gte('created_at', new Date(Date.now()-30*86400000).toISOString()).limit(50),
      supabase.from('payments').select('amount, status, created_at').eq('status','succeeded').gte('created_at', new Date(Date.now()-30*86400000).toISOString()).limit(20),
      supabase.from('leads').select('status, created_at').gte('created_at', new Date(Date.now()-30*86400000).toISOString()).limit(30),
    ])

    const statusCounts: Record<string,number> = {}
    for (const c of recentCases || []) {
      statusCounts[c.status] = (statusCounts[c.status]||0) + 1
    }
    const totalRevenue = (recentPayments||[]).reduce((s,p)=>s+Number(p.amount||0),0)
    const topStatuses = Object.entries(statusCounts).sort((a,b)=>b[1]-a[1]).slice(0,5)

    if (topStatuses.length > 0) {
      crmContext = `\n\nRECENT CRM ACTIVITY (last 30 days, use to make content feel authentic — anonymize all):
Cases by status: ${topStatuses.map(([s,n])=>`${n} ${s}`).join(', ')}
New leads: ${(recentLeads||[]).length}
Revenue collected: $${totalRevenue.toLocaleString('en-US',{maximumFractionDigits:0})}
Use this data to write specific, authentic content. For example: "This month, firms using TaxRes CRM resolved X payment plans" — never name specific clients.`
    }
  }

  // ── Keyword/page context ─────────────────────────────────────────────────
  const { data: keywords } = await supabase.from('marketing_gsc_performance').select('query,clicks,position').not('query','is',null).order('clicks',{ascending:false}).limit(10)
  const topKeywords = (keywords||[]).map(k=>k.query).join(', ') || 'tax resolution CRM, IRS case management software, Canopy alternative, tax resolution software'

  const weekNum = Math.floor(Date.now() / (7 * 86400000))
  const archetype = ARCHETYPES[weekNum % ARCHETYPES.length]
  const rotation = LINKEDIN_ROTATIONS[weekNum % LINKEDIN_ROTATIONS.length]

  const context = `Week of: ${weekOfStr}
Top SEO keywords: ${topKeywords}
Archetype for this week: ${archetype.name}, ${archetype.trade}, ${archetype.county}, owes ${archetype.debt}, issue: ${archetype.problem}
LinkedIn rotation: ${rotation}${crmContext}`

  // ── Single regenerate mode ───────────────────────────────────────────────
  if (regenerateType && regenerateId) {
    let newBody = ''
    if (regenerateType === 'linkedin') newBody = await generateLinkedIn(context, rotation)
    else if (regenerateType === 'article_idea') newBody = await generateArticle(context, topKeywords)
    else if (regenerateType === 'email') newBody = await generateEmail(context)
    else if (regenerateType === 'edu_tip') newBody = await generateEduTip(context)
    else if (regenerateType === 'outreach') newBody = await generateOutreach(context, OUTREACH_TARGETS[weekNum % 3])

    if (newBody) {
      await supabase.from('content_drafts').update({ body: newBody, status:'draft', updated_at: new Date().toISOString() }).eq('id', regenerateId)
    }
    return new Response(JSON.stringify({ ok: true, regenerated: true }), { headers: { 'Content-Type': 'application/json' } })
  }

  // ── Full weekly generation ───────────────────────────────────────────────
  const drafts = await Promise.all([
    generateLinkedIn(context, rotation).then(body => ({ content_type:'linkedin', title:`LinkedIn Post — Week of ${weekOfStr}`, body, week_of:weekOfStr, status:'draft' })),
    generateArticle(context, topKeywords).then(body => ({ content_type:'article_idea', title:`Article Idea — Week of ${weekOfStr}`, body, week_of:weekOfStr, status:'draft' })),
    generateEmail(context).then(body => ({ content_type:'email', title:`Newsletter — Week of ${weekOfStr}`, body, week_of:weekOfStr, status:'draft' })),
    generateEduTip(context).then(body => ({ content_type:'edu_tip', title:`Education Tip — Week of ${weekOfStr}`, body, week_of:weekOfStr, status:'draft' })),
    ...OUTREACH_TARGETS.map((t,i) => generateOutreach(context, t).then(body => ({
      content_type:'outreach', title:`Outreach — ${t.label}`, body, week_of:weekOfStr, status:'draft', metadata: { target:t.target, pain:t.pain }
    }))),
  ])

  const { error } = await supabase.from('content_drafts').insert(drafts)
  if (error) return new Response(JSON.stringify({ ok:false, error }), { status:500, headers: {'Content-Type':'application/json'} })

  return new Response(JSON.stringify({ ok:true, weekOf:weekOfStr, drafts:drafts.length }), { headers: {'Content-Type':'application/json'} })
})

const OUTREACH_TARGETS = [
  { label:'Canopy user 40+ cases', target:'Enrolled Agent currently using Canopy with 40+ resolution cases', pain:'transcript pulls take too long and case status is hard to see at a glance' },
  { label:'CPA firm with spreadsheets', target:'CPA firm with a resolution department using spreadsheets', pain:'no centralized case tracking, documents scattered across email' },
  { label:'Solo EA building practice', target:'Solo EA building a resolution practice after passing representation exam', pain:'no purpose-built tool, using generic CRM that does not understand IRS workflows' },
]

async function generateLinkedIn(context: string, rotation: string): Promise<string> {
  return callClaude(`${context}\n\nWrite a LinkedIn post for TaxRes CRM. This week's angle: ${rotation}\n\nRequirements:\n- 120-160 words\n- Open with a specific data point, practitioner scenario, or contrarian insight — NOT a generic opener\n- One concrete insight or workflow tip tied to a TaxRes CRM capability\n- End with a question inviting comments OR "Book a demo at taxrescrm.net"\n- 4 hashtags: #TaxResolution #EnrolledAgent #IRSHelp #TaxPro\n- Do NOT start with "I", "Are you", or "Did you know"\n- Peer-to-peer tone, not salesy`, 600)
}

async function generateArticle(context: string, keywords: string): Promise<string> {
  return callClaude(`${context}\n\nGenerate ONE Resource Center article idea for taxrescrm.net/resources targeting tax resolution firm owners.\n\nReturn exactly:\nTITLE: [title]\nKEYWORD: [primary keyword]\nANGLE: [one sentence — what makes this useful that other articles miss]\nOUTLINE:\n- [section 1]\n- [section 2]\n- [section 3]\n- [section 4]\n- [section 5]\nCTA: [link page]\n\nTop keywords to consider: ${keywords}`, 500)
}

async function generateEmail(context: string): Promise<string> {
  return callClaude(`${context}\n\nWrite a weekly email newsletter for TaxRes CRM subscribers (tax resolution practitioners).\n\nSUBJECT: [max 8 words, practitioner-focused]\nPREVIEW: [40-60 chars]\n\n---\n\n[200-280 word email body]\n- Opening: one specific thing this week (IRS update or product improvement)\n- Feature spotlight: one TaxRes CRM feature in concrete workflow terms\n- Quick tip: one IRS process tip usable today\n- Close: direct, not a hard sell\n- CTA: demo at taxrescrm.net OR reply with a question\n\nSign: Romy Cruz, EA | TaxRes CRM | taxrescrm.net`, 700)
}

async function generateEduTip(context: string): Promise<string> {
  return callClaude(`${context}\n\nWrite ONE customer education tip for tax resolution practitioners using TaxRes CRM.\n\nTIP TITLE: [action-oriented, max 8 words]\nTIP BODY: [60-80 words — specific, actionable, tied to a real TaxRes CRM workflow or IRS process]\nUSE CASE: [one sentence — when to show this tip]`, 300)
}

async function generateOutreach(context: string, target: { target: string, pain: string, label: string }): Promise<string> {
  return callClaude(`${context}\n\nWrite a cold outreach message for TaxRes CRM.\n\nTarget: ${target.target}\nPain point: ${target.pain}\n\n- 80-110 words\n- LinkedIn DM or cold email format\n- Open with their pain point or a scenario they immediately recognize\n- One sentence about TaxRes CRM — what it does, not what it "is"\n- CTA: offer a 20-minute demo or free trial\n- Sign: Romy, TaxRes CRM | taxrescrm.net\n\nDo NOT say: "I hope this message finds you well", "I wanted to reach out", "game-changer"`, 400)
}
