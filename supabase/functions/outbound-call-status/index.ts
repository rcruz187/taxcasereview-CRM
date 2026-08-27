import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// SignalWire status callback for the PSTN destination leg. This endpoint is
// deliberately outside the cXML call-control path: it only mirrors provider
// state into outbound_calls so the browser can render the real call lifecycle.
serve(async (req) => {
  try {
    const url = new URL(req.url)
    const conf = url.searchParams.get('conf')
    if (!conf) return new Response('ok')

    const body = await req.text()
    const form = new URLSearchParams(body)
    const rawStatus = (form.get('CallStatus') || form.get('CallState') || '').toLowerCase()

    // Compatibility API statuses vary slightly by event. Normalize them to
    // the small state set consumed by the CRM.
    let status = rawStatus
    if (rawStatus === 'in-progress' || rawStatus === 'answered') status = 'answered'
    else if (rawStatus === 'queued' || rawStatus === 'initiated') status = 'pending'
    else if (rawStatus === 'ringing') status = 'ringing'
    else if (['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(rawStatus)) status = 'completed'

    // A completed-only callback from older SignalWire configuration may not
    // include CallStatus. In that case this callback itself is terminal.
    if (!status) status = 'completed'

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { error } = await supabase.from('outbound_calls').update({ status }).eq('conference_name', conf)
    if (error) console.error('outbound-call-status update failed:', error)
    else console.log('outbound-call-status:', conf, rawStatus || '(empty)', '=>', status)

    return new Response('ok')
  } catch (err) {
    console.error('outbound-call-status error:', err)
    return new Response('ok')
  }
})
