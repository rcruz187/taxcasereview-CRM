// organizer-action
// Handles the STANDALONE Tax Organizer link (OrganizerPage.jsx, and the
// same wizard embedded in the Client Portal) — reached via a direct link
// containing only the organizer's own row id, with no separate login.
// JWT Verification must be OFF — this has no login step by design.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const ARCHIVE_URL_TTL_SECONDS = 60 * 60 * 24 * 365 * 3

function ok(data: any) {
  return new Response(JSON.stringify({ ok: true, ...data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const { type, organizerId } = body
    if (!type || !organizerId) return err('Missing type or organizerId')

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    switch (type) {
      case 'get': {
        const { data, error } = await supabase.from('tax_organizer_responses').select('*').eq('id', organizerId).maybeSingle()
        if (error || !data) return err('Organizer not found or expired.', 404)
        return ok({ record: data })
      }

      case 'save_answers': {
        const { answers } = body
        const { error } = await supabase.from('tax_organizer_responses').update({
          answers, updated_at: new Date().toISOString(),
        }).eq('id', organizerId)
        if (error) throw error
        return ok({})
      }

      case 'submit': {
        const { answers } = body
        const { error } = await supabase.from('tax_organizer_responses').update({
          answers, status: 'Submitted', submitted_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq('id', organizerId)
        if (error) throw error
        return ok({})
      }

      case 'upload_document': {
        const { fileName, fileType, fileBase64, clientName, taxYear } = body
        if (!fileName || !fileBase64) return err('Missing file')

        const binary = atob(fileBase64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

        const safeClient = (clientName || 'client').replace(/[^a-zA-Z0-9]+/g, '-')
        const path = `organizer/${safeClient}/${taxYear || 'na'}/${Date.now()}-${fileName}`
        const { error: upErr } = await supabase.storage.from('documents').upload(path, bytes, { upsert: true, contentType: fileType || 'application/octet-stream' })
        if (upErr) throw upErr
        const { data: signedData, error: signErr } = await supabase.storage.from('documents').createSignedUrl(path, ARCHIVE_URL_TTL_SECONDS)
        if (signErr || !signedData?.signedUrl) throw signErr || new Error('Could not create secure organizer document URL')

        const { error } = await supabase.from('documents').insert([{
          name: fileName, client: clientName || '', docType: 'Tax Organizer',
          notes: `Uploaded via Tax Organizer (${taxYear || ''})`,
          file_url: signedData.signedUrl, file_name: fileName, file_size: bytes.length,
          created_at: new Date().toISOString(),
        }])
        if (error) throw error
        return ok({ url: signedData.signedUrl })
      }

      default:
        return err('Unknown action type: ' + type)
    }
  } catch (e) {
    console.error('organizer-action error:', e)
    return err(String((e as Error).message || e), 500)
  }
})
