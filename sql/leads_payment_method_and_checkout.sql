-- ============================================================================
-- Payments tab on Leads: saved card on file (Option 1) + Stripe Checkout
-- link tracking (Option 2). Run this in: Supabase Dashboard → SQL Editor
-- ============================================================================

-- Saved payment method display info on leads — mirrors what clients already
-- have. The actual card/bank numbers are never stored here, only Stripe's
-- safe display fields (brand/last4), same as the existing client flow.
-- (leads.stripe_customer_id already exists — added by leadflow_integration.sql)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS default_payment_method_id text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS payment_method_type text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS payment_method_brand text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS payment_method_last4 text;

-- Stripe Checkout link tracking (Option 2 — hosted payment page texted/
-- emailed to the lead or client to fill in themselves). Lets the Payments
-- tab show whether a link is still outstanding.
ALTER TABLE leads   ADD COLUMN IF NOT EXISTS stripe_checkout_url text;
ALTER TABLE leads   ADD COLUMN IF NOT EXISTS stripe_checkout_sent_at timestamptz;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS stripe_checkout_url text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS stripe_checkout_sent_at timestamptz;
