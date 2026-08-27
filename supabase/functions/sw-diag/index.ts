import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (_req) => {
  // DIAGNOSTIC ONLY — reports which known secrets are present (names only, never values)
  const secrets = {
    SW_SIGNING_SECRET: !!Deno.env.get('SW_SIGNING_SECRET'),
    GROQ_API_KEY:      !!Deno.env.get('GROQ_API_KEY'),
    BREVO_API_KEY:     !!Deno.env.get('BREVO_API_KEY'),
    STRIPE_SECRET_KEY: !!Deno.env.get('STRIPE_SECRET_KEY'),
  }
  return new Response(JSON.stringify(secrets), {
    headers: { 'Content-Type': 'application/json' }
  })
})
