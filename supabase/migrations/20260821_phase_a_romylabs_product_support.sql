-- ============================================================================
-- Phase A: Create romylabs_product_support registry table
-- Approved 2026-08-21
-- ============================================================================
-- Creates the support-specific registry with data-driven ticket counters.
-- No existing tables modified. Purely additive.
-- next_ticket_seq seeds from live sequence state:
--   taxres_crm: last consumed = 1 (TAX-000001 issued), seed = 2
--   camvella:   last consumed = 4 (CAM-000001..4 issued), seed = 5
--   arcvena:    never used, seed = 1
--   bocasync:   never used, seed = 1
-- ============================================================================

BEGIN;

CREATE TABLE romylabs_product_support (
  product_id       text        PRIMARY KEY
                               REFERENCES romylabs_products(product_id),
  support_enabled  boolean     NOT NULL DEFAULT false,
  ticket_prefix    text        NOT NULL,
  next_ticket_seq  bigint      NOT NULL DEFAULT 1,
  display_name     text        NOT NULL,
  notify_email     text,
  secret_env_key   text        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_product_support_prefix  UNIQUE (ticket_prefix),
  CONSTRAINT chk_ticket_prefix_format   CHECK  (ticket_prefix ~ '^[A-Z]{2,6}$')
);

ALTER TABLE romylabs_product_support ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_only" ON romylabs_product_support
  USING (
    auth.email() = 'romy@taxcasereview.org'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  );

-- Seed: exactly 4 rows, counters initialized from live sequence state
INSERT INTO romylabs_product_support
  (product_id, support_enabled, ticket_prefix, next_ticket_seq,
   display_name, notify_email, secret_env_key)
VALUES
  ('taxres_crm', true,  'TAX', 2, 'Tax Res CRM', 'romy@taxcasereview.org', 'TAXRES_SUPPORT_SECRET'),
  ('camvella',   true,  'CAM', 5, 'Camvella',    'info@romylabs.com',      'CAMVELLA_SUPPORT_SECRET'),
  ('arcvena',    false, 'ARC', 1, 'Arcvena',     'info@romylabs.com',      'ARCVENA_SUPPORT_SECRET'),
  ('bocasync',   false, 'BOC', 1, 'BocaSync',    'info@romylabs.com',      'BOCASYNC_SUPPORT_SECRET');

COMMIT;
