// receive-fax
// Receives inbound faxes via SignalWire Compatibility (cXML) API.
// The phone number in SignalWire must have its webhook set to this URL
// and "Accept Incoming Calls As" set to Fax, using cXML/Compatibility mode.
//
// Flow:
//   1. Fax arrives → SignalWire calls this URL → we return cXML <Receive> tag
//   2. Fax finishes → SignalWire POSTs result to /receive-fax?done=1 → we log it
//
// JWT Verification must be OFF (SignalWire calls this with no auth token).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SELF_URL = 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/receive-fax'

function xmlResponse(xml: string) {
  return new Response(xml, {
    headers: { 'Content-Type': 'text/xml; charset=utf-8' }
  })
}

serve(async (req) => {
  try {
    const url = new URL(req.url)
    const isDone = url.searchParams.get('done') === '1'

    // Parse form body (SignalWire posts application/x-www-form-urlencoded)
    const text = await req.text()
    const params = new URLSearchParams(text)

    if (isDone) {
      // Fax finished — log the result
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )

      const status = params.get('FaxStatus') || 'unknown'
      const insertPayload = {
        tenant_id: '61a89aef-0e7e-4ea2-b222-44ab2024655a',
        from_number:        params.get('From') || '',
        to_number:          params.get('To') || '',
        file_url:           params.get('MediaUrl') || null,
        status:             status === 'received' ? 'Received' : 'Failed',
        direction:          'inbound',
        signalwire_fax_id:  params.get('FaxSid') || null,
        error_msg:          status !== 'received' ? (params.get('ErrorCode') || null) : null,
        pages:              parseInt(params.get('NumPages') || '0') || null,
        created_at:         new Date().toISOString(),
      }
      const { error: insertError } = await supabase.from('fax_logs').insert(insertPayload)
      if (insertError) {
        // This insert was previously unchecked — if it fails here, the fax
        // never lands in fax_logs at all, which would explain the badge/sound
        // never firing even though the frontend realtime/query side is fine.
        console.error('[receive-fax] fax_logs insert FAILED:', insertError.message, JSON.stringify(insertPayload))
      } else {
        console.log('[receive-fax] fax_logs insert OK:', insertPayload.from_number, '->', insertPayload.to_number, insertPayload.status)
      }

      // Return empty response — SignalWire doesn't need anything back
      return new Response('', { status: 200 })
    }

    // First hit — tell SignalWire to receive the fax and call us back when done
    return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Receive action="${SELF_URL}?done=1" storeMedia="true"/>
</Response>`)

  } catch (err) {
    console.error('receive-fax error:', err)
    return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`)
  }
})
