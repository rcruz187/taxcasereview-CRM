import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = new URL(req.url)
    const code  = url.searchParams.get('code')
    const state = url.searchParams.get('state') // JSON: { employeeEmail, tenantId, origin }
    const error = url.searchParams.get('error')

    if (error) {
      const origin = JSON.parse(state || '{}').origin || ''
      return Response.redirect(`${origin}/settings?m365=error&reason=${encodeURIComponent(error)}`)
    }

    if (!code || !state) return new Response(JSON.stringify({ error: 'missing params' }), { status: 400, headers: cors })

    const { employeeEmail, tenantId, origin } = JSON.parse(decodeURIComponent(state))

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get Azure app config for this tenant
    const { data: settings } = await supabase.from('settings')
      .select('m365_client_id, m365_client_secret, m365_tenant_id')
      .eq('tenant_id', tenantId).single()

    if (!settings?.m365_client_id) {
      return Response.redirect(`${origin}/settings?m365=error&reason=missing_app_config`)
    }

    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/m365-oauth-callback`

    // Exchange code for tokens
    const tokenRes = await fetch(`https://login.microsoftonline.com/${settings.m365_tenant_id || 'common'}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     settings.m365_client_id,
        client_secret: settings.m365_client_secret,
        code,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      })
    })
    const tokens = await tokenRes.json()
    if (tokens.error) return Response.redirect(`${origin}/settings?m365=error&reason=${encodeURIComponent(tokens.error_description || tokens.error)}`)

    const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    // Get the user's M365 profile
    const profileRes = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName,displayName', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    })
    const profile = await profileRes.json()
    const m365Email = profile.mail || profile.userPrincipalName

    // Upsert the employee's token record
    await supabase.from('employee_m365_accounts').upsert({
      employee_email:    employeeEmail,
      tenant_id:         tenantId,
      m365_user_id:      profile.id,
      m365_email:        m365Email,
      m365_access_token: tokens.access_token,
      m365_refresh_token: tokens.refresh_token,
      m365_token_expiry: expiry,
      m365_last_error:   null,
    }, { onConflict: 'employee_email' })

    return Response.redirect(`${origin}/email?m365=connected`)
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors })
  }
})
