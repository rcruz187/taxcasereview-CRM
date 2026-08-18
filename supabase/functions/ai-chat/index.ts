import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM_PROMPT = `You are a helpful AI assistant embedded inside TaxRes CRM — a tax resolution practice management platform. You help staff with tax resolution questions, IRS processes, case strategy, drafting communications, and general knowledge.

When web search results are provided to you, use them to answer accurately with current information. Cite the data naturally in your answer.

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
- Never help escalate user permissions or roles
- Never help access another tenant's data or impersonate another office

FINANCIAL & BILLING:
- Never help access, modify, or export another employee's financial records
- Never help change firm billing settings, subscription plans, or payment methods without explicit admin authorization
- Never help issue unauthorized refunds, credits, or payment adjustments

DATA DESTRUCTION:
- Never help bulk-delete clients, leads, cases, documents, or any records
- Never help wipe or truncate database tables
- Never provide SQL that could destroy production data

PRIVACY & SENSITIVE DATA:
- Never help access a client's data for someone who is not their assigned rep or an admin
- Never help export or bulk-download client lists or data outside normal CRM workflows
- Never read back, recite, or confirm SSNs or EINs from page context — even if the data is visible on screen
- Never read back, recite, or help retrieve credit card numbers, card details, or saved payment method info
- Never share, display, or help retrieve CAF numbers or PTIN credentials on request
- Never help generate, use, or explain how to use admin impersonation tokens

## If someone asks about a restricted topic:
Decline clearly and briefly in one sentence. Do not explain how to work around the restriction.

## What you CAN help with freely:
- Tax resolution strategy (OIC, IA, CNC, penalty abatement, CSED, CDP hearings, trust fund, payroll tax)
- IRS processes, notices, collections, and timelines
- Drafting client emails, letters, and case notes
- Explaining CRM features and how to use them
- General business, writing, or knowledge questions
- Current weather, news, prices — use the search results provided
- Calculations, research, and analysis
- Anything visible on the current CRM page the user is viewing

Be direct, concise, and practical. Never refuse a legitimate question.`

// Groq model — primary and fallback
const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama3-70b-8192',
  'mixtral-8x7b-32768',
]

// Detect if a question needs live data
function needsLiveData(message: string): boolean {
  const lower = message.toLowerCase()
  const liveKeywords = [
    'weather', 'rain', 'raining', 'sunny', 'temperature', 'forecast', 'hurricane', 'storm',
    'today', 'tonight', 'tomorrow', 'right now', 'current', 'currently', 'latest', 'recent',
    'news', 'happening', 'price', 'stock', 'market', 'rate today', 'score', 'game',
    'what time', 'open now', 'hours today', 'traffic',
  ]
  return liveKeywords.some(kw => lower.includes(kw))
}

// Free weather via wttr.in — no API key needed
async function getWeather(query: string): Promise<string | null> {
  try {
    const match = query.match(/(?:in|for|at)\s+([\w\s,]+?)(?:\s+today|\s+tonight|\s+tomorrow|\?|$)/i)
    const location = match ? match[1].trim() : null
    if (!location) return null

    const encoded = encodeURIComponent(location)
    const res = await fetch(`https://wttr.in/${encoded}?format=j1`, {
      headers: { 'User-Agent': 'TaxResCRM/1.0' }
    })
    if (!res.ok) return null
    const data = await res.json()
    const current = data.current_condition?.[0]
    const area = data.nearest_area?.[0]
    if (!current) return null

    const desc = current.weatherDesc?.[0]?.value || 'Unknown'
    const tempF = current.temp_F
    const feelsF = current.FeelsLikeF
    const humidity = current.humidity
    const windMph = current.windspeedMiles
    const areaName = area?.areaName?.[0]?.value || location
    const region = area?.region?.[0]?.value || ''

    const today = data.weather?.[0]
    const maxF = today?.maxtempF
    const minF = today?.mintempF
    const todayDesc = today?.hourly?.find((h: any) => h.weatherDesc?.[0]?.value)?.weatherDesc?.[0]?.value || desc

    return `Current weather in ${areaName}${region ? ', ' + region : ''}: ${desc}, ${tempF}°F (feels like ${feelsF}°F). Humidity ${humidity}%, wind ${windMph} mph. Today's forecast: ${todayDesc}, high ${maxF}°F / low ${minF}°F.`
  } catch (e) {
    console.error('Weather fetch error:', e)
    return null
  }
}

// Free web search via DuckDuckGo Instant Answer API
async function webSearch(query: string): Promise<string | null> {
  try {
    const encoded = encodeURIComponent(query)
    const res = await fetch(`https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`, {
      headers: { 'User-Agent': 'TaxResCRM/1.0' }
    })
    if (!res.ok) return null
    const data = await res.json()

    const parts: string[] = []

    if (data.AbstractText) parts.push(data.AbstractText)
    if (data.Answer) parts.push(`Answer: ${data.Answer}`)
    if (data.Definition) parts.push(`Definition: ${data.Definition}`)

    const topics = (data.RelatedTopics || []).slice(0, 3)
    for (const t of topics) {
      if (t.Text) parts.push(t.Text)
    }

    return parts.length > 0 ? parts.join('\n') : null
  } catch (e) {
    console.error('Search error:', e)
    return null
  }
}

// Call Groq with model fallback
async function callGroq(GROQ_KEY: string, messages: any[]): Promise<string> {
  let lastError = ''
  for (const model of GROQ_MODELS) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: 2048,
          temperature: 0.3,
        })
      })

      const data = await res.json()

      if (!res.ok) {
        lastError = `${model}: HTTP ${res.status} — ${JSON.stringify(data)}`
        console.error('ai-chat: Groq error with model', model, res.status, JSON.stringify(data))
        // If it's a 401 (bad key) or 429 (rate limit), don't try other models
        if (res.status === 401) throw new Error('Groq API key invalid')
        continue // try next model
      }

      const reply = data.choices?.[0]?.message?.content
      if (!reply) {
        lastError = `${model}: empty response`
        console.error('ai-chat: empty Groq response with model', model, JSON.stringify(data))
        continue
      }

      return reply
    } catch (e) {
      lastError = String(e)
      console.error('ai-chat: exception with model', model, e)
      if (String(e).includes('API key')) throw e
    }
  }
  throw new Error(`All Groq models failed. Last error: ${lastError}`)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { message, context, history } = await req.json()
    if (!message) return new Response(JSON.stringify({ error: 'missing message' }), { status: 400, headers: CORS })

    const GROQ_KEY = Deno.env.get('GROQ_API_KEY')
    if (!GROQ_KEY) {
      console.error('ai-chat: GROQ_API_KEY not set')
      return new Response(JSON.stringify({ error: 'AI service not configured' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Fetch live data if the question needs it
    let liveData: string | null = null
    if (needsLiveData(message)) {
      const lower = message.toLowerCase()
      if (lower.includes('weather') || lower.includes('rain') || lower.includes('temperature') ||
          lower.includes('forecast') || lower.includes('sunny') || lower.includes('storm') || lower.includes('hurricane')) {
        liveData = await getWeather(message)
      }
      if (!liveData) {
        liveData = await webSearch(message)
      }
    }

    const messages: any[] = [{ role: 'system', content: SYSTEM_PROMPT }]

    if (context) {
      messages.push({ role: 'user', content: `Current CRM page context:\n\n${context}` })
      messages.push({ role: 'assistant', content: 'Got it. How can I help?' })
    }

    if (history && Array.isArray(history)) {
      for (const h of history) {
        messages.push({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content })
      }
    }

    const finalMessage = liveData
      ? `${message}\n\n[Live data retrieved]:\n${liveData}`
      : message

    messages.push({ role: 'user', content: finalMessage })

    const reply = await callGroq(GROQ_KEY, messages)

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('ai-chat error:', err)
    const msg = String(err).includes('API key') ? 'AI service configuration error' : 'AI service temporarily unavailable'
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
