-- ============================================================================
-- Phase B: Replace support_tickets.product_id CHECK with FK to romylabs_products
-- Approved 2026-08-21
-- ============================================================================
-- Safety: all existing support_tickets rows have product_id='taxres_crm',
-- which exists in romylabs_products. FK will have zero conflicts.
-- The FK is DEFERRABLE INITIALLY DEFERRED for safe batch operations.
-- ============================================================================

BEGIN;

ALTER TABLE support_tickets
  DROP CONSTRAINT support_tickets_product_id_check;

ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_product_id_fk
    FOREIGN KEY (product_id) REFERENCES romylabs_products(product_id)
    DEFERRABLE INITIALLY DEFERRED;

COMMIT;
