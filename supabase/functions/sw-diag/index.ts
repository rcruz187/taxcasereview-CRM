import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (_req) => {
  // DIAGNOSTIC ONLY — reports which secrets are present (names only, never values)
  const hasSwSecret = Boolean(Deno.env.get('SW_SIGNING_SECRET'))
  const hasGroq = Boolean(Deno.env.get('GROQ_API_KEY'))
  const hasBrevo = Boolean(Deno.env.get('BREVO_API_KEY'))
  const hasStripe = Boolean(Deno.env.get('STRIPE_SECRET_KEY'))
  
  return new Response(JSON.stringify({
    SW_SIGNING_SECRET: hasSwSecret,
    GROQ_API_KEY: hasGroq,
    BREVO_API_KEY: hasBrevo,
    STRIPE_SECRET_KEY: hasStripe,
    total_env_keys: Object.keys(Deno.env.toObject()).length,
  }), { 
    headers: { 'Content-Type': 'application/json' } 
  })
})
