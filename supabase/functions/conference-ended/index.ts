// conference-ended
// Called BY SignalWire when an outbound-call conference closes (wired up
// as the statusCallback on outbound-leg's <Conference> noun, event="end").
// This is the server-confirmed signal that CallContext.jsx polls
// outbound_calls for as a backup to the browser RELAY SDK's own
// call.state hangup/destroy notification -- which has proven unreliable
// for detecting when a call really ended (confirmed case: agent hung up
// on their own end and the CRM kept showing "connected" indefinitely).
// Two independent ways to notice "the call is over" instead of trusting
// the flaky one alone.
//
// Deploy via: Supabase Dashboard -> Edge Functions -> Deploy new function
// (paste this file in as index.ts), name it "conference-ended". JWT
// verification must be OFF -- SignalWire calls this directly.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const form = await req.formData().catch(() => null)
    const conferenceName = form?.get('FriendlyName')?.toString()
    if (!conferenceName) return new Response('ok')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    await supabase.from('outbound_calls')
      .update({ status: 'completed' })
      .eq('conference_name', conferenceName)

    return new Response('ok')
  } catch (err) {
    console.error('conference-ended error:', err)
    return new Response('ok')
  }
})
