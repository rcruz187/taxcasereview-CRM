-- ============================================================================
-- Phase C: Replace assign_ticket_number() trigger
-- Approved 2026-08-21
-- ============================================================================
-- Replaces the CASE+sequence-based trigger with the two-gate, row-lock
-- counter implementation. Reads next_ticket_seq from romylabs_product_support
-- via SELECT FOR UPDATE for concurrency safety.
--
-- Gate 1: romylabs_products.active must be true
-- Gate 2: romylabs_product_support.support_enabled must be true
--
-- On success: atomically increments next_ticket_seq, assigns ticket_number.
-- On failure: raises EXCEPTION with a clear operational message.
--
-- The four legacy PostgreSQL sequences remain in the database untouched
-- as rollback infrastructure. This function no longer references them.
-- ============================================================================

CREATE OR REPLACE FUNCTION assign_ticket_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_prefix  text;
  v_next    bigint;
  v_active  boolean;
BEGIN
  -- If ticket_number already supplied (data migration path), preserve it.
  IF NEW.ticket_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Gate 1: product must exist in romylabs_products with active = true
  SELECT active INTO v_active
  FROM   romylabs_products
  WHERE  product_id = NEW.product_id;

  IF NOT FOUND OR NOT v_active THEN
    RAISE EXCEPTION
      'assign_ticket_number: product_id ''%'' not found in romylabs_products '
      'or is not active. Activate the product before enabling support.',
      NEW.product_id;
  END IF;

  -- Gate 2: product must have support_enabled = true in romylabs_product_support.
  -- SELECT FOR UPDATE serializes concurrent ticket inserts for the same product,
  -- preventing duplicate ticket numbers under high concurrency.
  SELECT ticket_prefix, next_ticket_seq
  INTO   v_prefix, v_next
  FROM   romylabs_product_support
  WHERE  product_id      = NEW.product_id
    AND  support_enabled = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'assign_ticket_number: product_id ''%'' is not support-enabled. '
      'Set support_enabled = true in romylabs_product_support to activate '
      'the support channel for this product.',
      NEW.product_id;
  END IF;

  -- Atomically increment the counter within this transaction.
  -- The FOR UPDATE lock above ensures no other transaction reads the same
  -- next_ticket_seq value until this transaction commits.
  UPDATE romylabs_product_support
  SET    next_ticket_seq = next_ticket_seq + 1,
         updated_at      = now()
  WHERE  product_id = NEW.product_id;

  -- Assign using the pre-increment value (v_next).
  -- Format: PREFIX-000001 (6-digit zero-padded; grows past 999999 naturally).
  NEW.ticket_number := v_prefix || '-' || lpad(v_next::text, 6, '0');

  RETURN NEW;
END;
$$;
