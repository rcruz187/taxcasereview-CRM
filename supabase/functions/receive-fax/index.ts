// receive-fax
// Receives inbound faxes via SignalWire Compatibility (cXML) API.
// JWT verification is OFF because SignalWire invokes this endpoint directly.
// Tenant routing is fail-closed: the dialed DID must resolve to exactly one tenant.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SELF_URL = 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/receive-fax'
const digits10 = (value: string) => String(value || '').replace(/\D/g, '').slice(-10)

function xmlResponse(xml: string, status = 200) {
  return new Response(xml, {
    status,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' }
  })
}

serve(async (req) => {
  if (req.method !== 'POST') return xmlResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 405)
  try {
    const url = new URL(req.url)
    const isDone = url.searchParams.get('done') === '1'
    const text = await req.text()
    const params = new URLSearchParams(text)
    const to = params.get('To') || ''
    const toDigits = digits10(to)
    if (toDigits.length !== 10) return xmlResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: rows, error: settingsError } = await supabase
      .from('settings')
      .select('tenant_id,sw_inbound_did')
      .not('tenant_id', 'is', null)
      .not('sw_inbound_did', 'is', null)
    if (settingsError) throw settingsError
    const matches = (rows || []).filter((r: any) => digits10(r.sw_inbound_did) === toDigits)
    if (matches.length !== 1) {
      console.error('[receive-fax] inbound DID did not resolve uniquely', { toDigits, matches: matches.length })
      return xmlResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 403)
    }
    const tenantId = matches[0].tenant_id

    if (isDone) {
      const faxSid = String(params.get('FaxSid') || '').trim()
      if (!faxSid) return new Response('', { status: 400 })
      const status = params.get('FaxStatus') || 'unknown'
      const mediaUrl = String(params.get('MediaUrl') || '').trim()
      const safeMediaUrl = /^https:\/\//i.test(mediaUrl) ? mediaUrl : null
      const insertPayload = {
        tenant_id: tenantId,
        from_number: params.get('From') || '',
        to_number: to,
        file_url: safeMediaUrl,
        status: status === 'received' ? 'Received' : 'Failed',
        direction: 'inbound',
        signalwire_fax_id: faxSid,
        error_msg: status !== 'received' ? (params.get('ErrorCode') || null) : null,
        pages: parseInt(params.get('NumPages') || '0') || null,
        created_at: new Date().toISOString(),
      }
      const { error: insertError } = await supabase.from('fax_logs').insert(insertPayload)
      if (insertError && insertError.code !== '23505') {
        console.error('[receive-fax] fax_logs insert FAILED:', insertError.message)
        return new Response('', { status: 500 })
      }
      return new Response('', { status: 200 })
    }

    return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Receive action="${SELF_URL}?done=1" storeMedia="true"/>
</Response>`)
  } catch (err) {
    console.error('receive-fax error:', err)
    return xmlResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 500)
  }
})
