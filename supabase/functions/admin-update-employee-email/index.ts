// admin-update-employee-email
// Changes BOTH the Supabase auth login email AND the employees.email row for
// one employee, atomically enough for this purpose — current_tenant_id()
// matches on employees.email = auth.email(), so these two must never drift
// apart or the person's tenant resolution (and login) breaks.
// Gated to Romy specifically (same pattern as provision-tenant/CRM Companies).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const PLATFORM_ADMIN_EMAIL = 'romy@taxcasereview.org'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    if (!token) return json({ error: 'Missing authorization' }, 401)
    const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } })
    const { data: { user }, error: userErr } = await asCaller.auth.getUser()
    if (userErr || !user?.email) return json({ error: 'Invalid session' }, 401)
    if (user.email.toLowerCase() !== PLATFORM_ADMIN_EMAIL) return json({ error: 'Not authorized' }, 403)

    const admin = createClient(url, serviceKey)
    const b = await req.json().catch(() => ({}))
    const old_email = (b.old_email || '').trim().toLowerCase()
    const new_email = (b.new_email || '').trim().toLowerCase()
    if (!old_email || !new_email) return json({ error: 'old_email and new_email are required' }, 400)

    const { data: emp } = await admin.from('employees').select('id').eq('email', old_email).maybeSingle()
    if (!emp) return json({ error: 'No employee found with that email' }, 404)

    // Find the auth user by listing (admin API has no direct get-by-email)
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    if (listErr) return json({ error: listErr.message }, 500)
    const authUser = list.users.find(u => (u.email || '').toLowerCase() === old_email)
    if (!authUser) return json({ error: 'No auth login found with that email' }, 404)

    const { error: updErr } = await admin.auth.admin.updateUserById(authUser.id, { email: new_email, email_confirm: true })
    if (updErr) return json({ error: 'Auth update failed: ' + updErr.message }, 400)

    const { error: empErr } = await admin.from('employees').update({ email: new_email }).eq('id', emp.id)
    if (empErr) {
      // roll back the auth email so the two never drift apart
      await admin.auth.admin.updateUserById(authUser.id, { email: old_email })
      return json({ error: 'Employee row update failed, auth email rolled back: ' + empErr.message }, 400)
    }

    return json({ ok: true, employee_id: emp.id, new_email })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})
