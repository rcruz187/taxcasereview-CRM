// save-email-account — encrypts the password server-side before persisting.
// The encryption key NEVER reaches the browser — it lives only in this
// edge function's environment variables.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ENCRYPT_KEY  = Deno.env.get('EMAIL_ENCRYPT_KEY') || 'taxrescrm-email-key-change-in-prod'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Get the calling user from their JWT
    const authHeader = req.headers.get('Authorization') || ''
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user?.email) throw new Error('Not authenticated')

    const svc = createClient(SUPABASE_URL, SERVICE_KEY)

    const { email_address, display_name, imap_host, imap_port, smtp_host, smtp_port, use_ssl, password } = await req.json()

    if (!email_address || !password) throw new Error('email_address and password are required')

    // Encrypt via the server-side RPC (key never leaves the server)
    const { data: encrypted, error: encErr } = await svc
      .rpc('encrypt_email_password', { p_plain: password, p_key: ENCRYPT_KEY })
    if (encErr || !encrypted) throw new Error('Encryption failed: ' + encErr?.message)

    // Get tenant_id from the employee record
    const { data: emp } = await svc.from('employees').select('tenant_id').eq('email', user.email).single()
    if (!emp?.tenant_id) throw new Error('No employee record found for ' + user.email)

    // Upsert the account
    const { data, error } = await svc.from('email_accounts').upsert({
      tenant_id:          emp.tenant_id,
      employee_email:     user.email,
      email_address:      email_address.trim(),
      display_name:       display_name || email_address.trim(),
      imap_host:          imap_host || 'mail.taxrescrm.net',
      imap_port:          imap_port || 993,
      smtp_host:          smtp_host || 'mail.taxrescrm.net',
      smtp_port:          smtp_port || 587,
      use_ssl:            use_ssl ?? true,
      encrypted_password: encrypted,
      is_active:          true,
      sync_status:        'pending',
    }, { onConflict: 'employee_email,email_address' }).select('id').single()

    if (error) throw error

    return new Response(JSON.stringify({ ok: true, id: data.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
