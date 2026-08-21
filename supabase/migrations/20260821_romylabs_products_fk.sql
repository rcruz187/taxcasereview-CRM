-- ============================================================================
-- romylabs_products registry + FK migration
-- Status: APPLIED 2026-08-21 — run 32512487038 (conclusion=success)
-- ============================================================================
--
-- PURPOSE:
--   Replaces the hardcoded CHECK constraint on calevents.product_id with a
--   FK reference to a new romylabs_products registry table.
--
--   After this migration:
--     Adding a new CRM product = 1 INSERT into romylabs_products
--                               + 1 entry in productBookingConfig.js
--     No DDL migration required per new product.
--
--   Same migration should later be applied to support_tickets.product_id
--   (separate decision — do not include here).
--
-- SAFETY:
--   - All 5 existing product_ids are seeded before the FK is added
--   - FK is DEFERRABLE INITIALLY DEFERRED → no row-level conflicts during tx
--   - All 8 existing calevents rows have valid product_ids → FK passes
--   - No data is modified; existing rows are untouched
--   - Transactional: rolls back completely on any error
--
-- VALIDATION PRESERVED:
--   - DB still rejects unknown product_ids (FK is as strict as CHECK)
--   - App layer (resolveProductConfig) still rejects unknowns client-side
--   - Two-layer validation: app gate + DB gate, unchanged
--
-- ADDING A FUTURE PRODUCT (after this migration is applied):
--   Step 1: add entry to src/lib/productBookingConfig.js (app layer)
--   Step 2: INSERT INTO romylabs_products (product_id, name, active)
--           VALUES ('newproduct', 'New Product Name', true);
--   No migration, no DDL, no downtime.
--
-- OPERATOR RULE:
--   productBookingConfig.js is the authoritative source. Always add to the
--   config FIRST; INSERT into romylabs_products SECOND.
--   A product in romylabs_products but absent from productBookingConfig.js
--   will never appear on a booking page (resolveProductConfig falls back
--   to taxres_crm). The safe direction: config leads, DB follows.
-- ============================================================================

BEGIN;

-- 1. Create the product registry table
CREATE TABLE IF NOT EXISTS romylabs_products (
  product_id   text PRIMARY KEY,
  name         text NOT NULL,
  active       boolean NOT NULL DEFAULT true,
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Platform admin only — no public read
ALTER TABLE romylabs_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_only" ON romylabs_products
  USING (
    auth.email() = 'romy@taxcasereview.org'
    OR (auth.jwt() ->> 'role') = 'platform_admin'
  );

-- 2. Seed with the 5 current approved products
INSERT INTO romylabs_products (product_id, name, active, description) VALUES
  ('taxres_crm', 'TaxRes CRM',  true,  'Tax resolution practice management CRM'),
  ('romylabs',   'RomyLabs',    true,  'RomyLabs platform — general product demos and partnership inquiries'),
  ('camvella',   'Camvella',    true,  'HOA and community association management CRM'),
  ('arcvena',    'Arcvena',     true,  'Field service CRM for electrical and trade contractors'),
  ('bocasync',   'BocaSync',    false, 'Dental practice management CRM — not yet commercially active')
ON CONFLICT (product_id) DO NOTHING;

-- 3. Drop the hardcoded CHECK constraint
ALTER TABLE calevents
  DROP CONSTRAINT IF EXISTS calevents_product_id_check;

-- 4. Add the FK constraint (DEFERRABLE for safety during batch operations)
ALTER TABLE calevents
  ADD CONSTRAINT calevents_product_id_fk
    FOREIGN KEY (product_id) REFERENCES romylabs_products(product_id)
    DEFERRABLE INITIALLY DEFERRED;

COMMIT;

-- ============================================================================
-- POST-MIGRATION VERIFICATION (run after applying):
--
--   SELECT product_id, name, active FROM romylabs_products ORDER BY product_id;
--   -- Expected: 5 rows, bocasync active=false
--
--   SELECT conname, contype FROM pg_constraint
--   WHERE conrelid = 'calevents'::regclass AND conname LIKE '%product%';
--   -- Expected: calevents_product_id_fk (type f = foreign key)
--   -- calevents_product_id_check should NOT appear
--
--   INSERT INTO calevents (id, tenant_id, product_id)
--   VALUES ('fk-test', 'a0000000-0000-0000-0000-000000000001', 'invalid');
--   -- Expected: FK violation (23503)
--
--   DELETE FROM calevents WHERE id = 'fk-test';
-- ============================================================================
