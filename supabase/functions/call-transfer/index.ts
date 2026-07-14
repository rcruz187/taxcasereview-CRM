import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Blind transfer. Two modes in one function:
//
// 1) Browser mode (JSON POST from CallContext.jsx transferCall): uses the
//    SignalWire REST API to REDIRECT the caller's live leg to this same
//    function's LaML mode. Also closes out the transferring agent's
//    incoming_calls row (answered -> completed).
//
// 2) LaML mode (?laml=1, hit by SignalWire for the redirected leg):
//    - mode=ext: parks the caller in a fresh conference and inserts a
//      targeted incoming_calls row ("Extension NNN — Name"), which rings
//      the target agent's browser through the exact same machinery as a
//      normal extension call — 12s target-only, then everyone, then
//      voicemail. Conference attributes mirror ivr-route exactly (hold
//      music, recording, caller-hangup tracking).
//    - mode=num: dials the outside number directly, caller ID = business
//      number, polite message if they don't answer.
//
// JWT verification must be OFF for this function (SignalWire calls the
// LaML mode with no auth headers), same as receive-call / ivr-route.

const CALL_RECORDED_URL = 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/call-recorded'
const CALLER_HANGUP_URL = 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/caller-hangup'
const HOLD_MUSIC_URL = 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/hold-music'
const SELF_URL = 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/call-transfer'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function xml(body: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { 'Content-Type': 'text/xml' },
  })
}

function makeSupabase() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)

  // ────────────────────────────────────────────────────────────
  // LaML MODE — SignalWire fetching instructions for the
  // redirected caller leg
  // ────────────────────────────────────────────────────────────
  if (url.searchParams.get('laml') === '1') {
    try {
      const mode = url.searchParams.get('mode')
      const body = await req.text()
      const form = new URLSearchParams(body)
      const callSid = form.get('CallSid') || ''
      const from = form.get('From') || ''
      const supabase = makeSupabase()

      if (mode === 'num') {
        const num = url.searchParams.get('num') || ''
        if (!/^\+1\d{10}$/.test(num)) {
          return xml(`<Say voice="Polly.Joanna-Neural">We are sorry, this transfer is no longer available. Goodbye.</Say><Hangup/>`)
        }
        const { data: settings } = await supabase
          .from('settings').select('sw_inbound_did').limit(1).maybeSingle()
        const callerId = settings?.sw_inbound_did || ''
        return xml(
          `<Say voice="Polly.Joanna-Neural">Please hold while we transfer your call.</Say>` +
          `<Dial timeout="30"${callerId ? ` callerId="${callerId}"` : ''}>${num}</Dial>` +
          `<Say voice="Polly.Joanna-Neural">The party you are trying to reach is unavailable. Please call back later. Goodbye.</Say><Hangup/>`
        )
      }

      if (mode === 'ext') {
        const ext = url.searchParams.get('ext') || ''
        if (!/^\d{1,6}$/.test(ext) || !callSid) {
          return xml(`<Say voice="Polly.Joanna-Neural">We are sorry, this transfer is no longer available. Goodbye.</Say><Hangup/>`)
        }
        const { data: emp } = await supabase
          .from('employees').select('name').eq('extension', ext).limit(1)
        const empName = emp?.[0]?.name || ''
        const confName = `xfer-${ext}-${callSid}`.replace(/[^A-Za-z0-9_-]/g, '')

        const { error: insErr } = await supabase.from('incoming_calls').insert({
          callsid: callSid,
          conference_name: confName,
          from_number: from,
          department: `Extension ${ext}${empName ? ' — ' + empName : ''}`,
          status: 'ringing',
          tenant_id: '61a89aef-0e7e-4ea2-b222-44ab2024655a',
        })
        if (insErr) {
          console.error('call-transfer: incoming_calls insert error', insErr)
          return xml(`<Say voice="Polly.Joanna-Neural">We are sorry, this transfer could not be completed. Goodbye.</Say><Hangup/>`)
        }

        console.log('call-transfer: parked', callSid, 'for extension', ext, 'in', confName)
        return xml(
          `<Say voice="Polly.Joanna-Neural">Please hold while we transfer your call.</Say>` +
          `<Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false" ` +
          `waitUrl="${HOLD_MUSIC_URL}" waitMethod="GET" ` +
          `statusCallback="${CALLER_HANGUP_URL}?conf=${confName}" statusCallbackEvent="leave end" statusCallbackMethod="POST" ` +
          `record="record-from-start" recordingStatusCallback="${CALL_RECORDED_URL}">${confName}</Conference></Dial>`
        )
      }

      return xml(`<Say voice="Polly.Joanna-Neural">We are sorry, this transfer is no longer available. Goodbye.</Say><Hangup/>`)
    } catch (err) {
      console.error('call-transfer laml error:', err)
      return xml(`<Say voice="Polly.Joanna-Neural">We are sorry, an error occurred. Goodbye.</Say><Hangup/>`)
    }
  }

  // ────────────────────────────────────────────────────────────
  // BROWSER MODE — perform the redirect
  // ────────────────────────────────────────────────────────────
  try {
    const { callsid, target_type, extension, number } = await req.json()
    if (!callsid || !target_type) {
      return json({ error: 'callsid and target_type required' }, 400)
    }

    const supabase = makeSupabase()
    const { data: settings, error: sErr } = await supabase
      .from('settings')
      .select('sw_space_url,sw_project_id,sw_api_token')
      .limit(1)
      .maybeSingle()

    if (sErr || !settings?.sw_space_url || !settings?.sw_project_id || !settings?.sw_api_token) {
      console.error('call-transfer: missing SignalWire credentials', sErr)
      return json({ error: 'SignalWire credentials missing in Settings' }, 400)
    }

    let lamlUrl = ''
    if (target_type === 'extension') {
      const ext = String(extension || '').replace(/\D/g, '')
      if (!ext) return json({ error: 'Pick a teammate to transfer to.' }, 400)
      const { data: emp } = await supabase
        .from('employees').select('name').eq('extension', ext).limit(1)
      if (!emp || emp.length === 0) return json({ error: 'No employee has extension ' + ext + '.' }, 404)
      lamlUrl = `${SELF_URL}?laml=1&mode=ext&ext=${ext}`
    } else if (target_type === 'external') {
      const digits = String(number || '').replace(/\D/g, '')
      let e164 = ''
      if (digits.length === 10) e164 = '+1' + digits
      else if (digits.length === 11 && digits.startsWith('1')) e164 = '+' + digits
      else return json({ error: 'Enter a valid 10-digit US phone number.' }, 400)
      lamlUrl = `${SELF_URL}?laml=1&mode=num&num=${encodeURIComponent(e164)}`
    } else {
      return json({ error: 'target_type must be extension or external' }, 400)
    }

    const spaceDomain = settings.sw_space_url.replace(/^https?:\/\//, '')
    const auth = 'Basic ' + btoa(`${settings.sw_project_id}:${settings.sw_api_token}`)

    const resp = await fetch(
      `https://${spaceDomain}/api/laml/2010-04-01/Accounts/${settings.sw_project_id}/Calls/${callsid}.json`,
      {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ Url: lamlUrl, Method: 'POST' }),
      }
    )

    const text = await resp.text()
    if (!resp.ok) {
      console.error('call-transfer: SignalWire rejected the redirect', resp.status, text)
      return json({ error: 'Could not transfer: the call may have already ended.' }, 502)
    }

    // Close out the transferring agent's row so the timeline reads
    // correctly. Conditional on 'answered' — never touches the fresh
    // 'ringing' row LaML mode is about to create for the same callsid.
    const { error: updErr } = await supabase
      .from('incoming_calls')
      .update({ status: 'completed' })
      .eq('callsid', callsid)
      .eq('status', 'answered')
    if (updErr) console.error('call-transfer: row completion error', updErr)

    console.log('call-transfer: redirected', callsid, 'to', lamlUrl)
    return json({ ok: true })

  } catch (err) {
    console.error('call-transfer error:', err)
    return json({ error: String(err) }, 500)
  }
})
