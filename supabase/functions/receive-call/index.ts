import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const HELD_ROW_MAX_AGE_MINUTES = 10

function isWithinBusinessHours(date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', weekday:'short', hour:'numeric', hour12:false }).formatToParts(date)
  const weekday = parts.find(p=>p.type==='weekday')?.value
  const hour = parseInt(parts.find(p=>p.type==='hour')?.value || '0',10)
  return weekday !== 'Sat' && weekday !== 'Sun' && hour >= 9 && hour < 18
}

serve(async (req) => {
  const body = await req.text()
  const params = new URLSearchParams(body)
  const callSid = params.get('CallSid')
  const from = params.get('From') || ''
  const to = params.get('To') || ''
  // SignalWire calls this endpoint without a Supabase JWT. Keep the phone
  // service available while SW_SIGNING_SECRET is not configured; require
  // the core Compatibility API fields so arbitrary blank requests fail.
  if (!callSid || !from || !to) return new Response('Bad Request',{status:400})

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const toDigitsForLookup = to.replace(/\D/g,'').slice(-10)
    let settings = null, sErr = null
    if (toDigitsForLookup) {
      const r = await supabase.from('settings').select('name,call_forward_number,sw_inbound_did,tenant_id')
      sErr = r.error
      settings = (r.data||[]).find(row=>(row.sw_inbound_did||'').replace(/\D/g,'').slice(-10)===toDigitsForLookup)||null
    }
    if (!settings) {
      const r = await supabase.from('settings').select('name,call_forward_number,sw_inbound_did,tenant_id').not('sw_inbound_did','is',null).limit(1).maybeSingle()
      if (!sErr) sErr=r.error
      settings=r.data||null
    }
    if (sErr) console.error('settings fetch error:',sErr)
    if (!settings?.sw_inbound_did) return new Response('No phone configuration',{status:500})

    const businessDigits=(settings.sw_inbound_did||'').replace(/\D/g,'').slice(-10)
    const fromDigits=from.replace(/\D/g,'').slice(-10)
    const toDigits=to.replace(/\D/g,'').slice(-10)
    const isAgentJoin=!!businessDigits && fromDigits===businessDigits && toDigits===businessDigits

    if (isAgentJoin) {
      const cutoff=new Date(Date.now()-HELD_ROW_MAX_AGE_MINUTES*60000).toISOString()
      let bridgeTarget=null
      const {data:popped,error:popErr}=await supabase.rpc('bridge_pop_claimed',{p_cutoff:cutoff})
      if (popErr) console.error('bridge_pop_claimed error:',popErr)
      if (popped?.conference_name) bridgeTarget=popped
      if (!bridgeTarget) {
        const {data:held}=await supabase.from('incoming_calls').select('conference_name,callsid').in('status',['ringing','answered']).gte('created_at',cutoff).order('created_at',{ascending:false}).limit(1).maybeSingle()
        if (held) {
          await supabase.from('incoming_calls').update({status:'answered'}).eq('callsid',held.callsid).eq('status','ringing')
          bridgeTarget=held
        }
      }
      if (bridgeTarget) return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Dial><Conference endConferenceOnExit="true">${bridgeTarget.conference_name}</Conference></Dial></Response>`,{headers:{'Content-Type':'text/xml'}})
      const {data:outbound}=await supabase.from('outbound_calls').select('id,conference_name').eq('status','pending').order('created_at',{ascending:false}).limit(1).maybeSingle()
      if (outbound) {
        await supabase.from('outbound_calls').update({status:'connected'}).eq('id',outbound.id)
        return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Dial><Conference endConferenceOnExit="true">${outbound.conference_name}</Conference></Dial></Response>`,{headers:{'Content-Type':'text/xml'}})
      }
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',{headers:{'Content-Type':'text/xml'}})
    }

    if (settings.call_forward_number) {
      const xml=`<?xml version="1.0" encoding="UTF-8"?><Response><Dial timeout="25"><Number>${settings.call_forward_number}</Number></Dial><Say voice="Polly.Ruth-Neural" language="en-US"><speak>Thank you for calling ${settings.name||'our office'}. We're sorry we missed you. Please leave your name, number, and a brief message and we'll get back to you shortly.</speak></Say><Record action="${Deno.env.get('SUPABASE_URL')}/functions/v1/voicemail-recorded" maxLength="120" playBeep="true"/></Response>`
      return new Response(xml,{headers:{'Content-Type':'text/xml'}})
    }
    if (!isWithinBusinessHours(new Date())) {
      const xml=`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Ruth-Neural" language="en-US"><speak>Thank you for calling ${settings.name||'our office'}. Our office is currently closed. We're available Monday through Friday, nine AM to six PM Eastern. Please leave us a message after the tone and we'll return your call the next business day.</speak></Say><Record action="${Deno.env.get('SUPABASE_URL')}/functions/v1/voicemail-recorded" maxLength="120" playBeep="true"/></Response>`
      return new Response(xml,{headers:{'Content-Type':'text/xml'}})
    }
    const ivrRouteUrl=`${Deno.env.get('SUPABASE_URL')}/functions/v1/ivr-route`
    const greeting=`<speak>Thank you for calling ${settings.name||'our office'}. <break time="400ms"/> If you're an existing client, check your email or text messages for your secure client portal link. <break time="600ms"/> To continue, please listen carefully as our menu has recently changed. <break time="400ms"/> Press <say-as interpret-as="digits">1</say-as> to dial by extension. <break time="300ms"/> Press <say-as interpret-as="digits">2</say-as> to speak with a tax advisor. <break time="300ms"/> Press <say-as interpret-as="digits">3</say-as> to speak with a tax associate. <break time="300ms"/> Or press <say-as interpret-as="digits">0</say-as> for the operator.</speak>`
    const xml=`<?xml version="1.0" encoding="UTF-8"?><Response><Gather numDigits="1" timeout="8" action="${ivrRouteUrl}" method="POST"><Say voice="Polly.Ruth-Neural" language="en-US">${greeting}</Say></Gather><Redirect method="POST">${ivrRouteUrl}</Redirect></Response>`
    return new Response(xml,{headers:{'Content-Type':'text/xml'}})
  } catch(err) {
    console.error('receive-call error:',err)
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>We're sorry, we're experiencing a brief technical issue. Please try your call again in just a moment.</Say></Response>`,{headers:{'Content-Type':'text/xml'}})
  }
})
