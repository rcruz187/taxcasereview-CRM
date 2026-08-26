import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': 'https://admin.romylabs.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MODEL = 'openai/gpt-oss-120b';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function redact(text: string) {
  return text
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[redacted-email]')
    .replace(/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g, '[redacted-phone]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[redacted-id]')
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[redacted-number]');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401);

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const service = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  const { data: userData } = await userClient.auth.getUser();
  const user = userData.user;
  if (!user) return json({ error: 'Authentication required' }, 401);

  const { data: authUser } = await service.auth.admin.getUserById(user.id);
  const role = authUser?.user?.app_metadata?.role;
  if (role !== 'platform_admin') return json({ error: 'Forbidden' }, 403);

  const body = await req.json().catch(() => null) as { ticket_id?: string } | null;
  if (!body?.ticket_id) return json({ error: 'ticket_id is required' }, 400);

  const { data: ticket, error: ticketError } = await service
    .from('support_tickets')
    .select('id,ticket_number,product_id,product_tenant_name,category,priority,subject,description,status,source,created_at')
    .eq('id', body.ticket_id)
    .maybeSingle();

  if (ticketError || !ticket) return json({ error: 'Ticket not found' }, 404);

  const { data: messages } = await service
    .from('support_ticket_messages')
    .select('sender,message,created_at,is_internal')
    .eq('ticket_id', ticket.id)
    .eq('is_internal', false)
    .order('created_at', { ascending: true })
    .limit(20);

  const providerKey = Deno.env.get('GROQ_API_KEY');
  if (!providerKey) return json({ error: 'AI service not configured' }, 503);

  const ticketText = redact([
    `Product: ${ticket.product_id}`,
    `Category: ${ticket.category}`,
    `Priority: ${ticket.priority}`,
    `Subject: ${ticket.subject}`,
    `Description: ${ticket.description}`,
    ...(messages ?? []).map((m) => `${m.sender}: ${m.message}`),
  ].join('\n'));

  const system = [
    'You are RomyLabs Support AI. Analyze SaaS support tickets for an internal platform administrator.',
    'Return JSON only with keys: summary, classification, suggested_priority, affected_module, troubleshooting_steps, draft_response, confidence.',
    'classification must be one of: bug, setup, training, feature_request, billing, account, unknown.',
    'suggested_priority must be one of: Low, Normal, High, Urgent.',
    'troubleshooting_steps must be an array of concise strings.',
    'draft_response must be a customer-facing draft but must NOT claim the issue is fixed unless the ticket proves it.',
    'Do not include patient names, contact data, credentials, account secrets, or other sensitive identifiers.',
    'This analysis is advisory only. Do not instruct automatic closure or automatic sending.',
  ].join('\n');

  const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${providerKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: ticketText },
      ],
      temperature: 0.15,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    }),
  });

  const aiPayload = await aiRes.json().catch(() => ({}));
  if (!aiRes.ok) {
    console.error('support-ai-triage provider error', aiRes.status);
    return json({ error: 'AI triage service unavailable' }, 502);
  }

  const raw = aiPayload?.choices?.[0]?.message?.content;
  if (!raw) return json({ error: 'AI triage returned no result' }, 502);

  let triage: Record<string, unknown>;
  try {
    triage = JSON.parse(raw);
  } catch {
    return json({ error: 'AI triage returned invalid JSON' }, 502);
  }

  const { error: updateError } = await service
    .from('support_tickets')
    .update({ ai_triage: triage, ai_triaged_at: new Date().toISOString(), ai_triage_model: MODEL })
    .eq('id', ticket.id);

  if (updateError) {
    console.error('support-ai-triage update failed', updateError.code);
    return json({ error: 'Unable to save AI triage' }, 500);
  }

  return json({ ok: true, ticket_id: ticket.id, ticket_number: ticket.ticket_number, triage });
});
