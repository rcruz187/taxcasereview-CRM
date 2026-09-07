-- ============================================================================
-- calevents.product_id — multi-product booking identity
-- ============================================================================
-- Approved 2026-08-21. Adds product_id to calevents so every booking carries
-- its source product. Existing TaxRes bookings are backfilled to 'taxres_crm'.
-- The CHECK constraint mirrors the support_tickets approved product list.
--
-- Safety guarantees:
--   • Existing rows: product_id backfilled to 'taxres_crm', nothing else touched
--   • All existing columns, values, times, tokens, tenant_id unchanged
--   • Column is nullable so new rows can be inserted without product_id
--     (old code paths remain safe during rollout)
-- ============================================================================

BEGIN;

ALTER TABLE calevents
  ADD COLUMN IF NOT EXISTS product_id text
    CHECK (product_id IS NULL OR product_id IN (
      'taxres_crm', 'romylabs', 'camvella', 'arcvena', 'bocasync'
    ));

-- Backfill: all existing calevents are TaxRes CRM bookings
UPDATE calevents
  SET product_id = 'taxres_crm'
  WHERE product_id IS NULL;

COMMIT;
