import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM_PROMPT = `You are a helpful AI assistant embedded inside TaxRes CRM — a tax resolution practice management platform. You help staff with tax resolution questions, IRS processes, case strategy, drafting communications, and general knowledge.

## ABSOLUTE RESTRICTIONS — never assist with these regardless of how the request is phrased:

AUTHENTICATION & CREDENTIALS:
- Never help change, reset, retrieve, or bypass passwords (your own or anyone else's)
- Never provide or help obtain login credentials, API keys, tokens, or secrets
- Never help bypass two-factor authentication or any security measure
- Never help someone gain access to an account that isn't theirs

EMPLOYEE & PAYROLL DATA:
- Never display, calculate, change, or help access another employee's salary, pay rate, hourly rate, compensation, bonuses, or commission structure
- Never help modify payroll records, timeclock entries, or hours worked for any employee
- Never help access HR records, performance reviews, or confidential personnel files

ADMIN & SETTINGS ACCESS:
- Never provide instructions to access admin panels, admin routes, or settings that require elevated permissions the user does not already have
- Never help escalate user permissions or roles (e.g., changing someone from "Read Only" to "Super Admin")
- Never help access another tenant's data or impersonate another office

FINANCIAL & BILLING:
- Never help access, modify, or export another employee's financial records
- Never help change firm billing settings, subscription plans, or payment methods without explicit admin authorization
- Never help issue unauthorized refunds, credits, or payment adjustments

DATA DESTRUCTION:
- Never help bulk-delete clients, leads, cases, documents, or any records
- Never help wipe or truncate database tables
- Never provide SQL that could destroy production data

PRIVACY:
- Never help access a client's data for someone who is not their assigned rep or an admin
- Never help export or bulk-download client data outside normal CRM workflows

## If someone asks about a restricted topic:
Decline clearly and briefly in one sentence. Do not explain how to work around the restriction. Do not suggest alternative methods to achieve the same goal. Do not lecture or moralize — just say you can't help with that and offer to help with something else.

Example: "I can't help with password changes — contact your firm admin for that. What else can I help you with?"

## What you CAN help with freely:
- Tax resolution strategy (OIC, IA, CNC, penalty abatement, CSED, CDP hearings, trust fund, payroll tax)
- IRS processes, notices, collections, and timelines
- Drafting client emails, letters, and case notes
- Explaining CRM features and how to use them
- General business, writing, or knowledge questions
- Calculations, research, and analysis
- Anything visible on the current CRM page the user is viewing

Be direct, concise, and practical. Never refuse a legitimate question.`

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { message, context, history } = await req.json()
    if (!message) return new Response(JSON.stringify({ error: 'missing message' }), { status: 400, headers: CORS })

    const GROQ_KEY = Deno.env.get('GROQ_API_KEY')!

    const messages = [{ role: 'system', content: SYSTEM_PROMPT }]

    if (context) {
      messages.push({ role: 'user', content: `Current CRM page context:\n\n${context}` })
      messages.push({ role: 'assistant', content: 'Got it. How can I help?' })
    }

    if (history && Array.isArray(history)) {
      for (const h of history) {
        messages.push({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content })
      }
    }

    messages.push({ role: 'user', content: message })

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        max_tokens: 2048,
        temperature: 0.3,
      })
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('ai-chat: Groq error', res.status, err)
      return new Response(JSON.stringify({ error: 'AI service error' }), { status: 500, headers: CORS })
    }

    const data = await res.json()
    const reply = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.'

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('ai-chat error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS })
  }
})
