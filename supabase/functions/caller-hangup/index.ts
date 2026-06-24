import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Called by SignalWire via Conference statusCallback when a participant
// leaves (StatusCallbackEvent=participant-leave) or the conference ends.
// Marks the incoming_calls row as 'missed' so the CRM banner clears.
// JWT must be OFF — SignalWire calls this directly.

serve(async (req) => {
  try {
    const url = new URL(req.url)
    const confFromQuery = url.searchParams.get('conf')

    const body = await req.text()
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

    if (confName) {
      await supabase.from('incoming_calls')
        .update({ status: 'missed' })
        .eq('conference_name', confName)
        .in('status', ['ringing', 'answered'])
      console.log('marked incoming_calls missed for conf:', confName)
    } else if (callSid) {
      await supabase.from('incoming_calls')
        .update({ status: 'missed' })
        .eq('callsid', callSid)
        .in('status', ['ringing', 'answered'])
      console.log('marked incoming_calls missed for callSid:', callSid)
    }

    return new Response('ok')
  } catch (err) {
    console.error('caller-hangup error:', err)
    return new Response('ok')
  }
})
