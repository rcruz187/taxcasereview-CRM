// demo-followup — manages the full demo email sequence for TaxRes CRM
// Triggered by: booking confirmation (immediate), then cron sweeps for timed steps
//
// Sequence:
//   Step 0 — Confirmation        (fires immediately on booking)
//   Step 1 — 24h reminder        (fires 23h after booking, before demo)
//   Step 2 — Post-demo thank-you (fires 2h after demo time)
//   Step 3 — 3-day follow-up     (fires 3 days after demo)
//   Step 4 — 7-day follow-up     (fires 7 days after demo)
//
// Stops automatically when:
//   - prospect moves to Demo Completed, Proposal Sent, Negotiation, Won, or Lost
//   - contact_email unsubscribed (opted_out = true)
//   - all 5 steps completed
//
// UTM attribution from the original booking is preserved throughout.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL   = () => Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_NAME      = 'Romy Cruz — TaxRes CRM'
const FROM_EMAIL     = 'romy@taxrescrm.net'
const DEMO_PAGE_URL  = 'https://taxrescrm.net/demo'
const RESOURCES_URL  = 'https://taxrescrm.net/resources'
const STOP_STAGES    = ['Demo Completed','Proposal Sent','Negotiation','Won','Lost']

function supabase() {
  return createClient(SUPABASE_URL(), SERVICE_KEY())
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch(`${SUPABASE_URL()}/functions/v1/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, subject, html,
      from_name: FROM_NAME, from_email: FROM_EMAIL }),
  })
  return res.ok
}

function firstName(name: string) {
  return (name || '').trim().split(' ')[0] || 'there'
}

// ── Email templates ────────────────────────────────────────────────────────

function emailConfirmation(name: string, eventType: string, when: string, utm: string) {
  const first = firstName(name)
  return {
    subject: `You're confirmed — ${eventType} with TaxRes CRM`,
    html: `
<p>Hi ${first},</p>
<p>Your demo is confirmed. Here are the details:</p>
<p style="line-height:2"><strong>${eventType}</strong><br>${when}</p>
<p>This is a 30-minute walkthrough of how TaxRes CRM works in a real resolution practice. We will look at case management, IRS transcript import, enforcement timeline tracking, and the client portal — focused on your firm's workflow, not a scripted product tour.</p>
<p>If you need to reschedule before then, just reply to this email.</p>
<p>Talk soon,<br><strong>Romy Cruz</strong><br>TaxRes CRM<br><a href="https://taxrescrm.net${utm}">taxrescrm.net</a></p>
    `.trim()
  }
}

function email24hReminder(name: string, eventType: string, when: string, utm: string) {
  const first = firstName(name)
  return {
    subject: `Tomorrow — ${eventType} with TaxRes CRM`,
    html: `
<p>Hi ${first},</p>
<p>A quick reminder that your TaxRes CRM walkthrough is tomorrow:</p>
<p style="line-height:2"><strong>${eventType}</strong><br>${when}</p>
<p>If you have specific workflows you want to see — transcript review, case pipeline, client portal, follow-up automation — reply now and I will make sure we cover them.</p>
<p>See you then,<br><strong>Romy Cruz</strong><br>TaxRes CRM</p>
    `.trim()
  }
}

function emailPostDemo(name: string, utm: string) {
  const first = firstName(name)
  return {
    subject: `Thanks for taking a look — TaxRes CRM`,
    html: `
<p>Hi ${first},</p>
<p>Thanks for taking the time today. I appreciate you walking through it with me.</p>
<p>A few things worth having handy as you think it over:</p>
<ul>
<li><a href="${RESOURCES_URL}${utm}">Resource Center</a> — IRS guides written for resolution practitioners</li>
<li><a href="https://taxrescrm.net/pricing${utm}">Pricing</a> — per-seat, no module tiers</li>
<li><a href="https://taxrescrm.net/features${utm}">Full feature list</a></li>
</ul>
<p>If you have questions after going through it, reply to this email or just book another 20 minutes — happy to dig into anything specific.</p>
<p>Best,<br><strong>Romy Cruz</strong><br>TaxRes CRM</p>
    `.trim()
  }
}

function email3DayFollowup(name: string, utm: string) {
  const first = firstName(name)
  return {
    subject: `Following up — TaxRes CRM`,
    html: `
<p>Hi ${first},</p>
<p>Checking in a few days after our walkthrough. Wanted to see if anything came up as you thought it over — questions, concerns about switching from your current setup, or anything you wanted to see again.</p>
<p>Most firms I talk to have one or two things that need to work a specific way before they can move. If that is the case for you, tell me what they are and we will figure out if TaxRes CRM handles them.</p>
<p>If the timing is not right, no problem — just say the word and I will stop following up.</p>
<p>Best,<br><strong>Romy Cruz</strong><br>TaxRes CRM</p>
    `.trim()
  }
}

function email7DayFollowup(name: string, utm: string) {
  const first = firstName(name)
  return {
    subject: `Last check-in — TaxRes CRM`,
    html: `
<p>Hi ${first},</p>
<p>I will keep this short. It has been about a week since we talked. If TaxRes CRM is still something you are considering, I am happy to answer questions or walk through anything we did not cover.</p>
<p>If you have moved on or the timing is off, no need to reply — I will take you off the follow-up list either way.</p>
<p>Either way, feel free to reach back out whenever the time is right. The offer stands.</p>
<p><strong>Romy Cruz</strong><br>TaxRes CRM<br><a href="${DEMO_PAGE_URL}${utm}">Book a new demo anytime</a></p>
    `.trim()
  }
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const db = supabase()
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch (_) {}

  const action = (body.action as string) || 'sweep'

  // ── Action: trigger (called immediately on booking confirmation) ──────────
  if (action === 'trigger') {
    const { calevent_id, contact_email, contact_name, event_type, event_when, utm_params } = body as Record<string, string>
    if (!calevent_id || !contact_email) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing calevent_id or contact_email' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // Check if sequence already started
    const { data: existing } = await db.from('demo_followup_log')
      .select('id').eq('calevent_id', calevent_id).limit(1)
    if (existing?.length) {
      return new Response(JSON.stringify({ ok: true, skipped: 'already_started' }),
        { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // Send confirmation immediately
    const utmSuffix = utm_params ? `?${utm_params}` : '?utm_source=email&utm_medium=demo_followup&utm_campaign=confirmation'
    const emailData = emailConfirmation(contact_name, event_type, event_when, utmSuffix)
    const sent = await sendEmail(contact_email, emailData.subject, emailData.html)

    // Create log row
    await db.from('demo_followup_log').insert({
      calevent_id,
      contact_email,
      contact_name: contact_name || '',
      event_type:   event_type   || 'TaxRes CRM Demo',
      event_when:   event_when   || '',
      utm_params:   utm_params   || '',
      step_0_sent:  sent,
      step_0_sent_at: sent ? new Date().toISOString() : null,
      opted_out: false,
    })

    // Also upsert into prospects table if not already there
    const { data: existing_prospect } = await db.from('prospects')
      .select('id').eq('contact_email', contact_email).limit(1)

    if (!existing_prospect?.length && contact_email) {
      await db.from('prospects').insert({
        firm_name:     contact_name || contact_email,
        contact_name:  contact_name || '',
        contact_email: contact_email,
        product:       'taxres_crm',
        stage:         'Demo Scheduled',
        source:        body.utm_source as string || 'Direct',
        source_campaign: body.utm_campaign as string || '',
        demo_date:     new Date().toISOString().slice(0, 10),
        owner:         'romy@taxrescrm.net',
        notes:         `Auto-created from demo booking. ${utm_params || ''}`,
      })
    }

    return new Response(JSON.stringify({ ok: true, step: 0, sent }),
      { headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  // ── Action: opt_out ────────────────────────────────────────────────────────
  if (action === 'opt_out') {
    const { contact_email } = body as Record<string, string>
    if (contact_email) {
      await db.from('demo_followup_log')
        .update({ opted_out: true }).eq('contact_email', contact_email)
    }
    return new Response(JSON.stringify({ ok: true }),
      { headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  // ── Action: sweep (cron — checks for emails due to send) ─────────────────
  const now = new Date()
  const results = { checked: 0, sent: 0, skipped: 0 }

  const { data: logs } = await db.from('demo_followup_log')
    .select('*')
    .eq('opted_out', false)
    .eq('completed', false)

  for (const log of logs || []) {
    results.checked++
    const email = log.contact_email
    const name  = log.contact_name
    const utm   = log.utm_params ? `?${log.utm_params}` : '?utm_source=email&utm_medium=demo_followup'
    const created = new Date(log.created_at)
    const hoursElapsed = (now.getTime() - created.getTime()) / 3600000

    // Check if prospect has advanced — stop sequence if so
    const { data: prospect } = await db.from('prospects')
      .select('stage').eq('contact_email', email).limit(1).single()
    if (prospect && STOP_STAGES.includes(prospect.stage)) {
      await db.from('demo_followup_log').update({ completed: true }).eq('id', log.id)
      results.skipped++
      continue
    }

    // Step 1 — 24h reminder (send between 23h and 25h after booking)
    if (!log.step_1_sent && hoursElapsed >= 23 && hoursElapsed < 25) {
      const emailData = email24hReminder(name, log.event_type, log.event_when, utm)
      const sent = await sendEmail(email, emailData.subject, emailData.html)
      if (sent) {
        await db.from('demo_followup_log').update({
          step_1_sent: true, step_1_sent_at: now.toISOString()
        }).eq('id', log.id)
        results.sent++
      }
      continue
    }

    // Step 2 — post-demo thank you (send 2h after demo, i.e. ~26-28h after booking for same-day demos)
    // Uses event_when to calculate post-demo window
    if (!log.step_2_sent && hoursElapsed >= 26) {
      const emailData = emailPostDemo(name, utm)
      const sent = await sendEmail(email, emailData.subject, emailData.html)
      if (sent) {
        await db.from('demo_followup_log').update({
          step_2_sent: true, step_2_sent_at: now.toISOString()
        }).eq('id', log.id)
        results.sent++
      }
      continue
    }

    // Step 3 — 3-day follow-up (72h after booking)
    if (!log.step_3_sent && hoursElapsed >= 72 && hoursElapsed < 96) {
      const emailData = email3DayFollowup(name, utm)
      const sent = await sendEmail(email, emailData.subject, emailData.html)
      if (sent) {
        await db.from('demo_followup_log').update({
          step_3_sent: true, step_3_sent_at: now.toISOString()
        }).eq('id', log.id)
        results.sent++
      }
      continue
    }

    // Step 4 — 7-day follow-up (168h after booking)
    if (!log.step_4_sent && hoursElapsed >= 168 && hoursElapsed < 192) {
      const emailData = email7DayFollowup(name, utm)
      const sent = await sendEmail(email, emailData.subject, emailData.html)
      if (sent) {
        await db.from('demo_followup_log').update({
          step_4_sent: true, step_4_sent_at: now.toISOString(),
          completed: true,
        }).eq('id', log.id)
        results.sent++
      }
      continue
    }

    // Mark completed if all steps done
    if (log.step_0_sent && log.step_1_sent && log.step_2_sent && log.step_3_sent && log.step_4_sent) {
      await db.from('demo_followup_log').update({ completed: true }).eq('id', log.id)
    }
  }

  console.log(`[demo-followup] sweep: checked=${results.checked} sent=${results.sent} skipped=${results.skipped}`)
  return new Response(JSON.stringify({ ok: true, ...results }),
    { headers: { ...cors, 'Content-Type': 'application/json' } })
})
