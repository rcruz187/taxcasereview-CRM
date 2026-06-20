-- ============================================================================
-- Multiple saved cards per lead/client, with a default + verification info
-- (brand/last4/expiry/cardholder name — never the actual number). Lets a
-- rep switch which card to use, or split one payment across two cards.
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type text NOT NULL CHECK (record_type IN ('lead','client')),
  record_id uuid NOT NULL,
  stripe_payment_method_id text NOT NULL,
  type text,                 -- 'card' | 'us_bank_account'
  brand text,                -- e.g. 'visa', or bank name for ACH
  last4 text,
  exp_month int,
  exp_year int,
  cardholder_name text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_methods_record_idx ON payment_methods(record_type, record_id);

ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_methods_all" ON payment_methods FOR ALL USING (true) WITH CHECK (true);

-- leads.default_payment_method_id / payment_method_brand / payment_method_last4
-- and the matching columns on clients stay in place as a fast-path "current
-- default card" cache (kept in sync from code) so the existing autopay batch
-- run in Payments.jsx doesn't need to change — it just keeps reading those.
