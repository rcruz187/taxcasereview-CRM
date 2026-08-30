import { createClient } from 'npm:@supabase/supabase-js@2'

type HeaderPair = [string, string]
type HookRequest = {
  context?: { stage?: string }
  envelope?: {
    from?: { address?: string }
    to?: Array<{ address?: string }>
  }
  message?: {
    headers?: HeaderPair[]
    serverHeaders?: HeaderPair[]
    contents?: string
    size?: number
  }
}

type MailboxRoute = {
  id: string
  email_address: string
  product_id: string
  tenant_id: string | null
  display_name: string
  outbound_from: string
  inbox_owner: string
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

const normalizeEmail = (value: unknown) => String(value ?? '').trim().toLowerCase()

function headerValue(headers: HeaderPair[] | undefined, name: string) {
  const target = name.toLowerCase()
  return headers?.find(([key]) => key.toLowerCase() === target)?.[1]?.trim() ?? ''
}

function cleanHeaderId(value: string) {
  return String(value || '').trim().slice(0, 1000) || null
}

function threadKey(messageId: string | null, inReplyTo: string | null, referencesHeader: string | null) {
  const refs = String(referencesHeader || '').match(/<[^>]+>|[^\s]+/g) || []
  return cleanHeaderId(refs[0] || inReplyTo || messageId || '')
}

function mtaAccept() {
  return json({ action: 'accept', modifications: [] })
}

function adminKey() {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
    if (keys?.default) return String(keys.default)
  } catch (_) {
    // Fall through to the legacy key while this existing project migrates.
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Supabase JWT verification is intentionally disabled for this provider webhook.
  // Stalwart must authenticate with this dedicated bearer secret instead.
  const expectedToken = Deno.env.get('STALWART_MTA_HOOK_TOKEN') || ''
  const suppliedToken = req.headers.get('authorization') || ''
  if (!expectedToken || suppliedToken !== `Bearer ${expectedToken}`) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const secretKey = adminKey()
  if (!supabaseUrl || !secretKey) return json({ error: 'Server configuration missing' }, 500)

  const payload = await req.json().catch(() => null) as HookRequest | null
  if (!payload) return json({ error: 'Invalid JSON' }, 400)

  const stage = String(payload.context?.stage || '').toUpperCase()
  if (stage && stage !== 'DATA') return mtaAccept()

  const allHeaders = [
    ...(payload.message?.headers || []),
    ...(payload.message?.serverHeaders || []),
  ] as HeaderPair[]

  const fromAddress = normalizeEmail(payload.envelope?.from?.address)
  const envelopeRecipients = (payload.envelope?.to || [])
    .map((entry) => normalizeEmail(entry.address))
    .filter(Boolean)
  const deliveredTo = normalizeEmail(headerValue(allHeaders, 'Delivered-To'))
  const recipients = [...new Set([...envelopeRecipients, ...(deliveredTo ? [deliveredTo] : [])])]

  // If the message is not for a RomyLabs-managed address, do not interfere with mail delivery.
  if (!fromAddress || recipients.length === 0) return mtaAccept()

  const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false } })

  let route: MailboxRoute | null = null
  for (const recipient of recipients.slice(0, 25)) {
    const { data, error } = await admin
      .from('romylabs_mailboxes')
      .select('id,email_address,product_id,tenant_id,display_name,outbound_from,inbox_owner')
      .eq('active', true)
      .ilike('email_address', recipient)
      .maybeSingle()
    if (error) return json({ error: 'Mailbox route lookup failed' }, 500)
    if (data) {
      route = data as MailboxRoute
      break
    }
  }

  if (!route) return mtaAccept()

  const subject = headerValue(allHeaders, 'Subject').slice(0, 1000) || null
  const messageId = cleanHeaderId(headerValue(allHeaders, 'Message-ID'))
  const inReplyTo = cleanHeaderId(headerValue(allHeaders, 'In-Reply-To'))
  const referencesHeader = cleanHeaderId(headerValue(allHeaders, 'References'))
  const body = String(payload.message?.contents || '').slice(0, 500000)
  const receivedAt = new Date().toISOString()

  if (messageId) {
    const { data: existing, error: dedupeError } = await admin
      .from('emails')
      .select('id')
      .eq('message_id', messageId)
      .eq('route_id', route.id)
      .eq('direction', 'inbound')
      .limit(1)
      .maybeSingle()
    if (dedupeError) return json({ error: 'Inbound dedupe check failed' }, 500)
    if (existing) return mtaAccept()
  }

  let matchedName = ''
  let clientId: string | null = null
  const tenantId = route.tenant_id

  if (tenantId) {
    const { data: client, error: clientError } = await admin
      .from('clients')
      .select('id,name,email')
      .eq('tenant_id', tenantId)
      .ilike('email', fromAddress)
      .limit(1)
      .maybeSingle()
    if (clientError) return json({ error: 'Client match failed' }, 500)

    if (client) {
      clientId = String(client.id)
      matchedName = String(client.name || '')
    } else {
      const { data: lead, error: leadError } = await admin
        .from('leads')
        .select('id,name,email')
        .eq('tenant_id', tenantId)
        .ilike('email', fromAddress)
        .limit(1)
        .maybeSingle()
      if (leadError) return json({ error: 'Lead match failed' }, 500)
      if (lead) matchedName = String(lead.name || '')
    }
  }

  const displayName = matchedName || fromAddress
  const { error: insertError } = await admin.from('emails').insert({
    recipient: fromAddress,
    clientname: displayName,
    clientName: displayName,
    subject,
    body,
    triage: 'Inbox',
    status: 'Received',
    created_at: receivedAt,
    from_address: fromAddress,
    received_at: receivedAt,
    is_read: false,
    tenant_id: tenantId,
    mailbox_owner: route.inbox_owner || 'info@romylabs.com',
    client_id: clientId,
    message_id: messageId,
    thread_id: threadKey(messageId, inReplyTo, referencesHeader),
    sender: fromAddress,
    recipients: [route.email_address],
    direction: 'inbound',
    received_mailbox: route.email_address,
    reply_from: route.outbound_from || route.email_address,
    product_id: route.product_id,
    in_reply_to: inReplyTo,
    references_header: referencesHeader,
    assigned_to: null,
    route_id: route.id,
  })

  if (insertError && insertError.code !== '23505') {
    return json({ error: 'Inbound message storage failed' }, 500)
  }

  return mtaAccept()
})
