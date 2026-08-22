import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateSignalWireRequest } from '../_shared/sw-verify.ts'

// Called by SignalWire via Conference statusCallback when a participant
// leaves (StatusCallbackEvent=participant-leave) or the conference ends.
// Marks the incoming_calls row as 'missed' so the CRM banner clears.
// JWT must be OFF — SignalWire calls this directly.

serve(async (req) => {
  try {
    const url = new URL(req.url)
    const confFromQuery = url.searchParams.get('conf')

    const body = await req.text()

    // ── SignalWire webhook authentication ──────────────────────────────────────
    const swSignature = req.headers.get('x-signalwire-signature') ?? ''
    const swSecret = Deno.env.get('SW_SIGNING_SECRET') ?? ''
    if (!swSecret) {
      console.error('[caller-hangup] SW_SIGNING_SECRET not configured')
      return new Response('Service unavailable', { status: 503 })
    }
    const webhookUrl = 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/caller-hangup'
    const paramMap: Record<string,string> = {}
    for (const [k,v] of new URLSearchParams(body)) { paramMap[k] = v }
    const sigValid = await validateSignalWireRequest(swSecret, webhookUrl, paramMap, swSignature)
    if (!sigValid) {
      console.warn('[caller-hangup] Invalid SignalWire signature — rejected')
      return new Response('Unauthorized', { status: 403 })
    }
    // ── End authentication ─────────────────────────────────────────────────────

    const params = new URLSearchParams(body)
    const event = params.get('StatusCallbackEvent') || ''
    const confFromBody = params.get('FriendlyName') || ''
    const callSid = params.get('CallSid') || ''

    const confName = confFromQuery || confFromBody

    console.log('caller-hangup fired | event:', event, '| conf:', confName, '| callSid:', callSid)

    // Only act on participant leaving or conference ending — ignore join events
    if (event && !event.includes('leave') && !event.includes('end')) {
      return new Response('ok')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 'ringing' with no agent = missed. 'answered' with agent = completed.
    if (confName) {
      await supabase.from('incoming_calls')
        .update({ status: 'completed' })
        .eq('conference_name', confName)
        .eq('status', 'answered')
      await supabase.from('incoming_calls')
        .update({ status: 'missed' })
        .eq('conference_name', confName)
        .eq('status', 'ringing')
      console.log('caller-hangup: marked incoming_calls completed/missed for conf:', confName)
    } else if (callSid) {
      await supabase.from('incoming_calls')
        .update({ status: 'completed' })
        .eq('callsid', callSid)
        .eq('status', 'answered')
      await supabase.from('incoming_calls')
        .update({ status: 'missed' })
        .eq('callsid', callSid)
        .eq('status', 'ringing')
      console.log('caller-hangup: marked incoming_calls completed/missed for callSid:', callSid)
    }

    return new Response('ok')
  } catch (err) {
    console.error('caller-hangup error:', err)
    return new Response('ok')
  }
})
