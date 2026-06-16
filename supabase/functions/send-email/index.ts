import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { to, subject, html, text } = await req.json()

    if (!to || !subject || (!html && !text)) {
      return new Response(JSON.stringify({ error: 'Missing required fields: to, subject, html/text' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Read SMTP settings from DB
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const { data: cfg } = await supabase.from('settings').select(
      'smtp_host, smtp_port, smtp_email, smtp_password, smtp_name, smtp_encryption'
    ).limit(1).maybeSingle()

    if (!cfg?.smtp_host || !cfg?.smtp_email || !cfg?.smtp_password) {
      return new Response(JSON.stringify({ error: 'SMTP not configured in Settings' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const port = parseInt(cfg.smtp_port || '587')
    const secure = cfg.smtp_encryption === 'SSL' || port === 465
    const fromName = cfg.smtp_name || 'Tax Case Review'
    const fromEmail = cfg.smtp_email

    // Build raw SMTP email via fetch to a Deno SMTP library
    // Using smtp from deno.land
    const { SmtpClient } = await import('https://deno.land/x/smtp@v0.7.0/mod.ts')
    const client = new SmtpClient()

    const connectConfig = {
      hostname: cfg.smtp_host,
      port,
      username: cfg.smtp_email,
      password: cfg.smtp_password,
    }

    if (secure) {
      await client.connectTLS(connectConfig)
    } else {
      await client.connect(connectConfig)
    }

    await client.send({
      from: `${fromName} <${fromEmail}>`,
      to,
      subject,
      content: text || '',
      html: html || '',
    })

    await client.close()

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('send-email error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Send failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
