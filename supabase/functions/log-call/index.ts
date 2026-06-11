import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const {
      direction = 'outbound',
      from_number,
      to_number,
      duration_sec = 0,
      status = 'completed',
      recording_url,
      notes,
      lead_id,
      client_id,
      user_id,
    } = await req.json()

    if (!from_number && !to_number) {
      return new Response(JSON.stringify({ error: 'from_number or to_number required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data, error } = await supabase.from('call_logs').insert({
      direction,
      from_number: from_number || null,
      to_number: to_number || null,
      duration_sec,
      status,
      recording_url: recording_url || null,
      notes: notes || null,
      lead_id: lead_id || null,
      client_id: client_id || null,
      user_id: user_id || null,
    }).select().single()

    if (error) throw error

    return new Response(JSON.stringify({ success: true, id: data.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
