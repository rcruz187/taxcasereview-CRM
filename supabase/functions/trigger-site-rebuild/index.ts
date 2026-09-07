// trigger-site-rebuild — fires CF Pages deploy hook for romylabs.com
// Called by: Supabase DB Webhook on romylabs_products INSERT/UPDATE
// The deploy hook URL is stored in Supabase Vault as CF_PAGES_DEPLOY_HOOK_ROMYLABS
// If the secret is not set, the function logs and returns gracefully (does not error).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    // Optional: validate Supabase webhook secret if present
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET')
    if (webhookSecret) {
      const inbound = req.headers.get('x-webhook-secret')
      if (inbound !== webhookSecret) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }
    }

    const hookUrl = Deno.env.get('CF_PAGES_DEPLOY_HOOK_ROMYLABS')
    if (!hookUrl) {
      console.warn('[trigger-site-rebuild] CF_PAGES_DEPLOY_HOOK_ROMYLABS not set — skipping rebuild trigger')
      return new Response(JSON.stringify({ ok: true, triggered: false, reason: 'hook_not_configured' }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    const res = await fetch(hookUrl, { method: 'POST' })
    const body = await res.text()
    console.log(`[trigger-site-rebuild] CF Pages deploy hook response: ${res.status} ${body.slice(0, 200)}`)

    return new Response(JSON.stringify({ ok: res.ok, status: res.status, triggered: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('[trigger-site-rebuild] Error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }
})
