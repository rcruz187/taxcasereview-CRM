// linkedin-publish v5 — 2026-08-14
// All operations go through this edge function (service role).
// No RPCs used — current_tenant_id() is unreliable for admin tenant users.
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

  // Verify JWT
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ ok: false, error: 'Unauthorized' }, 401)

  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (authError || !user) return json({ ok: false, error: 'Unauthorized' }, 401)

  // Get tenant_id via service role — bypasses current_tenant_id() entirely
  const { data: emp, error: empError } = await supabase
    .from('employees')
    .select('tenant_id')
    .eq('email', user.email)
    .limit(1)
    .single()
  if (empError || !emp?.tenant_id) return json({ ok: false, error: 'No tenant found' }, 403)
  const tenantId = emp.tenant_id

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch (_) {}
  const action = body.action as string

  // ── OAuth callback ─────────────────────────────────────────────────────────
  if (action === 'oauth_callback') {
    const code         = body.code as string
    const redirect_uri = body.redirect_uri as string
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
    console.log('LinkedIn token response:', JSON.stringify(tokenData))
    if (!tokenData.access_token) {
      return json({ ok: false, error: 'Token exchange failed', detail: tokenData }, 400)
    }

    // Get LinkedIn profile
    const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    })
    const profile = await profileRes.json()

    // Store connection — token stays server-side only
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
    const { data, error } = await supabase
      .from('linkedin_connections')
      .select('display_name, expires_at, scopes')
      .eq('tenant_id', tenantId)
      .limit(1)
      .single()

    if (error || !data) return json({ ok: true, connected: false })
    return json({
      ok:           true,
      connected:    true,
      display_name: data.display_name,
      expires_at:   data.expires_at,
      expired:      new Date(data.expires_at) < new Date(),
      scopes:       data.scopes,
    })
  }

  // ── Save / update post ─────────────────────────────────────────────────────
  if (action === 'save_draft') {
    const p_body         = (body.body as string || '').trim()
    const p_status       = (body.status as string) || 'draft'
    const p_scheduled_at = body.scheduled_at as string | null || null
    const p_id           = body.id as string | null || null

    if (!p_body) return json({ ok: false, error: 'Post body is required' }, 400)

    if (p_id) {
      // Update existing post
      const { data: updated, error } = await supabase
        .from('linkedin_posts')
        .update({
          body:         p_body,
          status:       p_status,
          scheduled_at: p_scheduled_at,
          updated_at:   new Date().toISOString(),
        })
        .eq('id', p_id)
        .eq('tenant_id', tenantId)
        .select()
        .single()
      if (error) return json({ ok: false, error: error.message }, 500)
      return json({ ok: true, post: updated })
    } else {
      // Insert new post
      const { data: inserted, error } = await supabase
        .from('linkedin_posts')
        .insert({
          tenant_id:    tenantId,
          body:         p_body,
          status:       p_status,
          scheduled_at: p_scheduled_at,
        })
        .select()
        .single()
      if (error) return json({ ok: false, error: error.message }, 500)
      return json({ ok: true, post: inserted })
    }
  }

  // ── List posts ─────────────────────────────────────────────────────────────
  if (action === 'list_posts') {
    const limit = Number(body.limit) || 100
    const { data: posts, error } = await supabase
      .from('linkedin_posts')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) return json({ ok: false, error: error.message }, 500)
    return json({ ok: true, posts: posts || [] })
  }

  // ── Delete post ────────────────────────────────────────────────────────────
  if (action === 'delete_post') {
    const post_id = body.post_id as string
    if (!post_id) return json({ ok: false, error: 'post_id required' }, 400)
    await supabase.from('linkedin_posts').delete()
      .eq('id', post_id).eq('tenant_id', tenantId)
    return json({ ok: true })
  }

  // ── Publish ────────────────────────────────────────────────────────────────
  if (action === 'publish') {
    const post_id = body.post_id as string
    if (!post_id) return json({ ok: false, error: 'post_id required' }, 400)

    const { data: conn, error: connError } = await supabase
      .from('linkedin_connections')
      .select('access_token, expires_at, linkedin_person_id')
      .eq('tenant_id', tenantId)
      .limit(1)
      .single()

    if (connError || !conn) return json({ ok: false, error: 'LinkedIn not connected' }, 401)
    if (new Date(conn.expires_at) < new Date()) {
      return json({ ok: false, error: 'LinkedIn token expired — please reconnect' }, 401)
    }

    const { data: post, error: postError } = await supabase
      .from('linkedin_posts')
      .select('id, body, status, tenant_id')
      .eq('id', post_id)
      .eq('tenant_id', tenantId)
      .single()

    if (postError || !post) return json({ ok: false, error: 'Post not found' }, 404)
    if (post.status === 'published') return json({ ok: false, error: 'Already published' }, 409)

    // Lock against duplicate publish
    await supabase.from('linkedin_posts')
      .update({ status: 'publishing', updated_at: new Date().toISOString() })
      .eq('id', post_id).eq('tenant_id', tenantId)

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
        status: 'failed', error_msg: JSON.stringify(publishData), updated_at: new Date().toISOString(),
      }).eq('id', post_id).eq('tenant_id', tenantId)
      return json({ ok: false, error: 'LinkedIn API error', detail: publishData }, 500)
    }

    const liPostId = publishData.id
    const liUrl    = `https://www.linkedin.com/feed/update/${liPostId}`

    await supabase.from('linkedin_posts').update({
      status: 'published', published_at: new Date().toISOString(),
      linkedin_post_id: liPostId, linkedin_url: liUrl,
      error_msg: null, updated_at: new Date().toISOString(),
    }).eq('id', post_id).eq('tenant_id', tenantId)

    return json({ ok: true, post_id: liPostId, url: liUrl })
  }

  // ── Disconnect ─────────────────────────────────────────────────────────────
  if (action === 'disconnect') {
    await supabase.from('linkedin_connections').delete().eq('tenant_id', tenantId)
    return json({ ok: true })
  }

  return json({ ok: false, error: 'Unknown action' }, 400)
})
