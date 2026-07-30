// office-agreement-file
// Handles contract/agreement files for an office against the PRIVATE
// office-agreements bucket (no client-side storage policy — only this
// service-role-backed function touches the bucket). Three actions:
//   upload  — base64 file + metadata -> stores object, inserts office_agreements row
//   geturl  — returns a short-lived signed URL for viewing/downloading one file
//   delete  — removes the storage object + the office_agreements row
// Gated the same way as provision-tenant: caller must be the TCR platform
// Super Admin (checked here; the underlying RPCs re-check independently).
// verify_jwt stays ON — this must never be anonymous.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const BUCKET = 'office-agreements'
const PLATFORM_ADMIN_EMAIL = 'romy@taxcasereview.org'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
    const url        = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey    = Deno.env.get('SUPABASE_ANON_KEY')!

    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    if (!token) return json({ error: 'Missing authorization' }, 401)
    const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } })
    const { data: { user }, error: userErr } = await asCaller.auth.getUser()
    if (userErr || !user?.email) return json({ error: 'Invalid session' }, 401)

    if (user.email.toLowerCase() !== PLATFORM_ADMIN_EMAIL) return json({ error: 'Not authorized' }, 403)
    const admin = createClient(url, serviceKey)

    const b = await req.json().catch(() => ({}))
    const action = b.action

    if (action === 'upload') {
      const { tenant_id, file_name, file_base64, content_type, label } = b
      if (!tenant_id || !file_name || !file_base64)
        return json({ error: 'tenant_id, file_name, and file_base64 are required' }, 400)
      const bytes = Uint8Array.from(atob(file_base64), c => c.charCodeAt(0))
      const path = `${tenant_id}/${Date.now()}-${file_name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`
      const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
        contentType: content_type || 'application/octet-stream', upsert: false,
      })
      if (upErr) return json({ error: 'Upload failed: ' + upErr.message }, 400)
      const { data: rpcData, error: rpcErr } = await admin.rpc('add_office_agreement', {
        p_tenant_id: tenant_id, p_file_name: file_name, p_file_path: path,
        p_file_size: bytes.length, p_label: label || null, p_uploaded_by: user.email,
      })
      if (rpcErr) { await admin.storage.from(BUCKET).remove([path]); return json({ error: rpcErr.message }, 400) }
      return json(rpcData)
    }

    if (action === 'geturl') {
      const { file_path } = b
      if (!file_path) return json({ error: 'file_path is required' }, 400)
      const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(file_path, 300) // 5 min
      if (error) return json({ error: error.message }, 400)
      return json({ url: data.signedUrl })
    }

    if (action === 'delete') {
      const { agreement_id } = b
      if (!agreement_id) return json({ error: 'agreement_id is required' }, 400)
      const { data: rpcData, error: rpcErr } = await admin.rpc('delete_office_agreement', { p_id: agreement_id })
      if (rpcErr) return json({ error: rpcErr.message }, 400)
      const path = (rpcData as any)?.file_path
      if (path) await admin.storage.from(BUCKET).remove([path])
      return json({ ok: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})
