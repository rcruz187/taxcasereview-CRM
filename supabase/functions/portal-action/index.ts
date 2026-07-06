// portal-action
// Every WRITE the Client Portal performs (document upload, income &
// expenses save, tax organizer creation, payment-plan tracking) — all
// authenticated by the session token from portal-login, verified here via
// the service role. Replaces raw anon-role table writes that had no real
// per-client restriction.
//
// JWT Verification must be OFF — clients have no CRM login/session.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getSessionClientName(supabase: any, token: string) {
  const { data: session } = await supabase.from('portal_sessions').select('*').eq('token', token).maybeSingle()
  if (!session || new Date(session.expires_at).getTime() < Date.now()) return null
  return session
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const { token, type } = body
    if (!token || !type) return new Response(JSON.stringify({ error: 'Missing token or type' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const session = await getSessionClientName(supabase, token)
    if (!session) return new Response(JSON.stringify({ error: 'Session expired — please log in again.' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const clientName = session.client_name
    const clientId = session.client_id
    const clientTable = session.is_lead ? 'leads' : 'clients'

    switch (type) {
      case 'increment_payment_plan_changes': {
        const { data: cur } = await supabase.from(clientTable).select('payment_plan_changes').eq('id', clientId).maybeSingle()
        const { error } = await supabase.from(clientTable).update({ payment_plan_changes: (cur?.payment_plan_changes || 0) + 1 }).eq('id', clientId)
        if (error) throw error
        return ok({})
      }

      case 'save_financial_profile': {
        const { expenses } = body
        const { error } = await supabase.from('client_financial_profiles').upsert({
          client_name: clientName, expenses, updated_at: new Date().toISOString(),
        }, { onConflict: 'client_name', ignoreDuplicates: false })
        if (error) throw error
        return ok({})
      }

      case 'create_tax_organizer': {
        const { year, clientEmail } = body
        if (!year || !/^\d{4}$/.test(year)) return new Response(JSON.stringify({ error: 'Invalid year' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        const { data, error } = await supabase.from('tax_organizer_responses').insert([{
          client_name: clientName, client_email: clientEmail || '', tax_year: year,
          answers: {}, status: 'In Progress', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }]).select().single()
        if (error) throw error
        return ok({ organizer: data })
      }

      case 'upload_document': {
        // fileBase64 is the file's raw bytes, base64-encoded, sent from the browser
        const { fileName, fileType, fileBase64, docType } = body
        if (!fileName || !fileBase64) return new Response(JSON.stringify({ error: 'Missing file' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

        const binary = atob(fileBase64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

        const path = `docs/${clientName.replace(/\s+/g, '-')}/${Date.now()}_${fileName}`
        const { error: upErr } = await supabase.storage.from('documents').upload(path, bytes, { upsert: true, contentType: fileType || 'application/octet-stream' })
        if (upErr) throw upErr
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)

        const { error } = await supabase.from('documents').insert([{
          name: fileName, client: clientName, docType: docType || 'Other',
          notes: 'Uploaded by client via portal',
          file_url: urlData.publicUrl, file_name: fileName, file_size: bytes.length,
          created_at: new Date().toISOString(),
        }])
        if (error) throw error

        const { data: docsData } = await supabase.from('documents').select('*').eq('client', clientName).order('created_at', { ascending: false })
        return ok({ documents: docsData || [] })
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action type: ' + type }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

  } catch (e) {
    console.error('portal-action error:', e)
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})

function ok(data: any) {
  return new Response(JSON.stringify({ ok: true, ...data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
