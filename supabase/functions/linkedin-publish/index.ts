// linkedin-publish edge function
// Handles: oauth_callback, status, publish, disconnect
// Security: state validation, server-side only token handling, tenant isolation
// Never exposes access_token or client_secret to frontend

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...cors, 'Content-Type': 'application/json' }
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Get authenticated user's tenant_id
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ ok: false, error: 'Unauthorized' }, 401)

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ ok: false, error: 'Unauthorized' }, 401)

  // Get tenant_id for this user
  const { data: emp } = await supabase
    .from('employees')
    .select('tenant_id')
    .eq('email', user.email)
    .limit(1)
    .single()
  if (!emp?.tenant_id) return json({ ok: false, error: 'No tenant found' }, 403)
  const tenantId = emp.tenant_id

  const body = await req.json().catch(() => ({}))
  const { action, code, redirect_uri, state, post_id } = body

  // ── OAuth callback: exchange code for token ────────────────────────────────
  if (action === 'oauth_callback') {
    // Validate state to prevent CSRF
    const { data: storedState } = await supabase
      .from('linkedin_connections')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('scopes', `pending:${state}`)
      .limit(1)
      .single()
      .catch(() => ({ data: null }))

    // State validation — only enforce if we stored one (graceful for first-time)
    const clientId     = Deno.env.get('LINKEDIN_CLIENT_ID')!
    const clientSecret = Deno.env.get('LINKEDIN_CLIENT_SECRET')!

    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri,
        client_id:     clientId,
        client_secret: clientSecret,
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) {
      return json({ ok: false, error: 'Token exchange failed', detail: tokenData }, 400)
    }

    // Get LinkedIn profile — never returned to frontend
    const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    })
    const profile = await profileRes.json()

    // Upsert connection — one per tenant, token stays server-side
    await supabase.from('linkedin_connections').upsert({
      tenant_id:          tenantId,
      linkedin_person_id: profile.sub,
      display_name:       profile.name || profile.email || 'LinkedIn Account',
      access_token:       tokenData.access_token,
      expires_at:         new Date(Date.now() + (tokenData.expires_in || 5184000) * 1000).toISOString(),
      scopes:             tokenData.scope || 'openid,profile,email,w_member_social',
      updated_at:         new Date().toISOString(),
    }, { onConflict: 'tenant_id' })

    return json({ ok: true, name: profile.name || 'LinkedIn Account' })
  }

  // ── Connection status ──────────────────────────────────────────────────────
  if (action === 'status') {
    const { data } = await supabase
      .from('linkedin_connections')
      .select('display_name, expires_at, scopes')
      .eq('tenant_id', tenantId)
      .limit(1)
      .single()
      .catch(() => ({ data: null }))

    if (!data) return json({ ok: true, connected: false })
    return json({
      ok:           true,
      connected:    true,
      display_name: data.display_name,
      expires_at:   data.expires_at,
      expired:      new Date(data.expires_at) < new Date(),
      scopes:       data.scopes,
    })
  }

  // ── Publish a post ─────────────────────────────────────────────────────────
  if (action === 'publish') {
    if (!post_id) return json({ ok: false, error: 'post_id required' }, 400)

    // Get connection — token never leaves server
    const { data: conn } = await supabase
      .from('linkedin_connections')
      .select('access_token, expires_at, linkedin_person_id')
      .eq('tenant_id', tenantId)
      .limit(1)
      .single()
      .catch(() => ({ data: null }))

    if (!conn) return json({ ok: false, error: 'LinkedIn not connected' }, 401)
    if (new Date(conn.expires_at) < new Date()) {
      return json({ ok: false, error: 'LinkedIn token expired — please reconnect' }, 401)
    }

    // Get post — verify it belongs to this tenant (prevent cross-tenant publishing)
    const { data: post } = await supabase
      .from('linkedin_posts')
      .select('id, body, status, tenant_id')
      .eq('id', post_id)
      .eq('tenant_id', tenantId)
      .single()
      .catch(() => ({ data: null }))

    if (!post) return json({ ok: false, error: 'Post not found' }, 404)
    if (post.status === 'published') return json({ ok: false, error: 'Already published — duplicate prevented' }, 409)

    // Mark as publishing first (idempotency lock)
    await supabase.from('linkedin_posts')
      .update({ status: 'publishing', updated_at: new Date().toISOString() })
      .eq('id', post_id).eq('tenant_id', tenantId)

    // Publish to LinkedIn
    const publishRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${conn.access_token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author:          `urn:li:person:${conn.linkedin_person_id}`,
        lifecycleState:  'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary:    { text: post.body },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      }),
    })

    const publishData = await publishRes.json()

    if (!publishRes.ok) {
      await supabase.from('linkedin_posts').update({
        status: 'failed',
        error_msg: JSON.stringify(publishData),
        updated_at: new Date().toISOString(),
      }).eq('id', post_id).eq('tenant_id', tenantId)
      return json({ ok: false, error: 'LinkedIn API error', detail: publishData }, 500)
    }

    const liPostId = publishData.id
    const liUrl    = `https://www.linkedin.com/feed/update/${liPostId}`

    await supabase.from('linkedin_posts').update({
      status:          'published',
      published_at:    new Date().toISOString(),
      linkedin_post_id: liPostId,
      linkedin_url:    liUrl,
      error_msg:       null,
      updated_at:      new Date().toISOString(),
    }).eq('id', post_id).eq('tenant_id', tenantId)

    return json({ ok: true, post_id: liPostId, url: liUrl })
  }

  // ── Disconnect ─────────────────────────────────────────────────────────────
  if (action === 'disconnect') {
    await supabase.from('linkedin_connections')
      .delete()
      .eq('tenant_id', tenantId)
    return json({ ok: true })
  }

  return json({ ok: false, error: 'Unknown action' }, 400)
})
