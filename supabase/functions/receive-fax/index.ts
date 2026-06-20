// receive-fax
// Called BY SignalWire whenever a fax arrives on (239) 526-2666. Configure
// as the "Handle Faxes Using" -> "External SWML webhook" URL under the
// phone number's "Voice and Fax Settings", after setting "Accept Incoming
// Calls As" to Fax.
//
// IMPORTANT: SignalWire fax handling runs on SWML (JSON), NOT the LaML/cXML
// XML the rest of this app's voice functions use -- confirmed directly by
// SignalWire support after our original cXML-based version (a bare
// <Response></Response>) silently failed to actually receive faxes. See
// https://signalwire.com/docs/platform/fax#create-a-script
//
// SWML flow for fax has two hits to this same URL:
//   1. Initial inbound fax call -> body.vars is empty -> respond with SWML
//      telling SignalWire to receive_fax, then execute back to this same
//      URL with the result.
//   2. Re-fetch after the fax finishes -> body.vars.receive_fax_document
//      (and friends) are populated -> log to fax_logs, then hang up.
//
// Deploy via: Supabase Dashboard -> Edge Functions -> Deploy new function
// (paste this file in as index.ts), name it "receive-fax". JWT verification
// must be OFF (SignalWire calls this directly, no Supabase auth token).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SELF_URL = 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/receive-fax'

const swmlReceive = {
  version: '1.0.0',
  sections: {
    main: [
      { receive_fax: {} },
      { execute: { dest: SELF_URL } },
    ],
  },
}

const swmlDone = {
  version: '1.0.0',
  sections: { main: [{ hangup: {} }] },
}

function swmlResponse(doc: Record<string, unknown>) {
  return new Response(JSON.stringify(doc), { headers: { 'Content-Type': 'application/json' } })
}

serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}))
    const call = body?.call ?? {}
    const vars = body?.vars ?? {}

    // Second hit: the fax already ran, vars has the result.
    if (vars.receive_fax_document) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )

      await supabase.from('fax_logs').insert({
        from_number: vars.receive_fax_remote_identity || call.from || '',
        to_number: vars.receive_fax_identity || call.to || '',
        file_url: vars.receive_fax_document,
        status: vars.receive_fax_result === 'success' ? 'Received' : 'Failed',
        direction: 'inbound',
        signalwire_fax_id: call.call_id || null,
        error_msg: vars.receive_fax_result === 'success' ? null : (vars.receive_fax_result_text || null),
        created_at: new Date().toISOString(),
      })

      return swmlResponse(swmlDone)
    }

    // First hit: tell SignalWire to actually receive the fax, then come
    // back here with the result.
    return swmlResponse(swmlReceive)

  } catch (err) {
    console.error('receive-fax error:', err)
    return swmlResponse(swmlDone)
  }
})
