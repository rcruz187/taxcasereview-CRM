-- ============================================================================
-- Autopay / saved payment methods (Stripe) — cards + ACH bank debits
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================================

-- Clients: Stripe customer + saved payment method (non-sensitive display info
-- only — actual card/bank numbers live in Stripe, never in this database).
ALTER TABLE clients ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS default_payment_method_id text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS payment_method_type text;        -- 'card' | 'us_bank_account'
ALTER TABLE clients ADD COLUMN IF NOT EXISTS payment_method_brand text;      -- e.g. 'Visa', or bank name for ACH
ALTER TABLE clients ADD COLUMN IF NOT EXISTS payment_method_last4 text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS autopay_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS autopay_amount numeric;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS autopay_frequency text DEFAULT 'monthly'; -- 'weekly'|'biweekly'|'monthly'|'one-time'
ALTER TABLE clients ADD COLUMN IF NOT EXISTS autopay_next_charge date;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS autopay_last_result text;       -- 'succeeded' | 'failed' | null
ALTER TABLE clients ADD COLUMN IF NOT EXISTS autopay_last_charged_at timestamptz;

-- Leads already get stripe_customer_id from the LeadFlow website funnel —
-- nothing to add there, just carrying it forward on conversion (handled in code).

-- Payments: track which payments came from Stripe vs. were logged manually,
-- and keep the Stripe PaymentIntent id for reference/reconciliation.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual'; -- 'manual' | 'autopay'

-- Stripe publishable key lives in settings (safe to expose client-side —
-- Stripe designs publishable keys to be public). The SECRET key does NOT go
-- here — it must be set as an Edge Function secret in the Supabase dashboard
-- (Edge Functions → Secrets → STRIPE_SECRET_KEY), since anyone who could read
-- it could move money directly. That's different from how SignalWire's token
-- is handled in this app, and deliberately so given what's at stake.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS stripe_publishable_key text;
