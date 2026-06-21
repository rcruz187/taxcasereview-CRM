// outbound-call-status
// Called BY SignalWire as the StatusCallback on the call CREATED in
// start-outbound-call (the destination leg) -- fires once that leg
// reaches a terminal state (completed). This is the server-confirmed
// signal CallContext.jsx polls outbound_calls for, as a backup to the
// browser RELAY SDK's own call.state hangup/destroy notification, which
// has proven unreliable for noticing when a call really ended (confirmed
// case: agent hung up on their own end and the CRM kept showing
// "connected" indefinitely).
//
// Deliberately separate from outbound-leg's cXML response -- this
// function has zero influence over how the call is routed or behaves; it
// only ever runs AFTER the call has already ended, and only writes one
// column. A previous attempt added a statusCallback directly on the
// Conference noun in outbound-leg instead, which visibly broke live call
// connection/audio -- this version can't do that even in theory, since
// it never returns cXML/SWML and isn't in the call-control path at all.
//
// Deploy via: Supabase Dashboard -> Edge Functions -> Deploy new function
// (paste this file in as index.ts), name it "outbound-call-status". JWT
// verification must be OFF -- SignalWire calls this directly.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const url = new URL(req.url)
    const conf = url.searchParams.get('conf')
    if (!conf) return new Response('ok')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    await supabase.from('outbound_calls')
      .update({ status: 'completed' })
      .eq('conference_name', conf)

    return new Response('ok')
  } catch (err) {
    console.error('outbound-call-status error:', err)
    return new Response('ok')
  }
})
