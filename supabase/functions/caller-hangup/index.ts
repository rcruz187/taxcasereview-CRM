import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Called by SignalWire via <Dial action="..."> when the caller's leg ends
// for any reason (caller hangs up, carrier drops, timeout). Marks the
// incoming_calls row as 'missed' so the CRM banner clears automatically.
// JWT must be OFF — SignalWire calls this directly.

serve(async (req) => {
  try {
    const url = new URL(req.url)
    const confName = url.searchParams.get('conf')
    const body = await req.text()
    const params = new URLSearchParams(body)
    const callSid = params.get('CallSid')

    console.log('caller-hangup fired | conf:', confName, '| callSid:', callSid)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Mark by conference name (most reliable) or callSid as fallback
    if (confName) {
      await supabase.from('incoming_calls')
        .update({ status: 'missed' })
        .eq('conference_name', confName)
        .in('status', ['ringing', 'answered'])
    } else if (callSid) {
      await supabase.from('incoming_calls')
        .update({ status: 'missed' })
        .eq('callsid', callSid)
        .in('status', ['ringing', 'answered'])
    }

    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' }
    })
  } catch (err) {
    console.error('caller-hangup error:', err)
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' }
    })
  }
})
