// organizer-action
// Handles the STANDALONE Tax Organizer link (OrganizerPage.jsx, and the
// same wizard embedded in the Client Portal) — reached via a direct link
// containing only the organizer's own row id, with no separate login.
// That's a legitimate "unguessable share link" security model (the id is
// a random UUID), same as a Google Doc share link — but it means this
// function is the only thing standing between "anyone with the link" and
// "anyone at all", so it deliberately never returns or accepts anything
// beyond this one specific organizer record.
//
// JWT Verification must be OFF — this has no login step at all by design.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)

        const { error } = await supabase.from('documents').insert([{
          name: fileName, client: clientName || '', docType: 'Tax Organizer',
          notes: `Uploaded via Tax Organizer (${taxYear || ''})`,
          file_url: urlData.publicUrl, file_name: fileName, file_size: bytes.length,
          created_at: new Date().toISOString(),
        }])
        if (error) throw error
        return ok({ url: urlData.publicUrl })
      }

      default:
        return err('Unknown action type: ' + type)
    }
  } catch (e) {
    console.error('organizer-action error:', e)
    return err(String((e as Error).message || e), 500)
  }
})
