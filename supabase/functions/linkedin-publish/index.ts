import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { action, post_id, code, redirect_uri } = await req.json().catch(() => ({}))

  // ── OAuth callback: exchange code for token ───────────────────────────────
  if (action === 'oauth_callback') {
    const clientId     = Deno.env.get('LINKEDIN_CLIENT_ID')!
    const clientSecret = Deno.env.get('LINKEDIN_CLIENT_SECRET')!

    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:   'authorization_code',
        code,
        redirect_uri,
        client_id:     clientId,
        client_secret: clientSecret,
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) {
      return new Response(JSON.stringify({ ok: false, error: tokenData }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    // Get LinkedIn profile
    const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    })
    const profile = await profileRes.json()

    // Store credentials
    await supabase.from('linkedin_credentials').delete().neq('id', '00000000-0000-0000-0000-000000000000') // clear old
    await supabase.from('linkedin_credentials').insert({
      access_token:       tokenData.access_token,
      expires_at:         new Date(Date.now() + (tokenData.expires_in || 5184000) * 1000).toISOString(),
      linkedin_person_id: profile.sub,
      display_name:       profile.name || profile.email || 'LinkedIn Account',
    })

    return new Response(JSON.stringify({ ok: true, name: profile.name }), { headers: { 'Content-Type': 'application/json' } })
  }

  // ── Publish a post ────────────────────────────────────────────────────────
  if (action === 'publish') {
    // Get credentials
    const { data: creds } = await supabase
      .from('linkedin_credentials')
      .select('access_token, expires_at, linkedin_person_id')
      .order('connected_at', { ascending: false })
      .limit(1)
      .single()

    if (!creds || new Date(creds.expires_at) < new Date()) {
      return new Response(JSON.stringify({ ok: false, error: 'LinkedIn not connected or token expired' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }

    // Get the post body
    const { data: post } = await supabase
      .from('linkedin_posts')
      .select('body')
      .eq('id', post_id)
      .single()

    if (!post) {
      return new Response(JSON.stringify({ ok: false, error: 'Post not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    }

    // Publish to LinkedIn
    const publishRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${creds.access_token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author:          `urn:li:person:${creds.linkedin_person_id}`,
        lifecycleState:  'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: post.body },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      }),
    })

    const publishData = await publishRes.json()

    if (!publishRes.ok) {
      await supabase.from('linkedin_posts').update({
        status: 'failed', error_msg: JSON.stringify(publishData), updated_at: new Date().toISOString()
      }).eq('id', post_id)
      return new Response(JSON.stringify({ ok: false, error: publishData }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    const postId  = publishData.id
    const postUrl = `https://www.linkedin.com/feed/update/${postId}`

    await supabase.from('linkedin_posts').update({
      status: 'published', published_at: new Date().toISOString(),
      linkedin_post_id: postId, linkedin_url: postUrl, error_msg: null, updated_at: new Date().toISOString()
    }).eq('id', post_id)

    return new Response(JSON.stringify({ ok: true, post_id: postId, url: postUrl }), { headers: { 'Content-Type': 'application/json' } })
  }

  // ── Disconnect ────────────────────────────────────────────────────────────
  if (action === 'disconnect') {
    await supabase.from('linkedin_credentials').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ ok: false, error: 'Unknown action' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
})
