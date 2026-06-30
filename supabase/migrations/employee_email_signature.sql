-- Per-employee email signature, replacing the single firm-wide settings.email_signature.
-- Run this in Supabase SQL Editor.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS email_signature text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS email_signature_logo_url text;

-- One-time backfill: copy the existing firm-wide signature to every employee
-- so nobody's outgoing email signature goes blank the moment this ships.
-- Safe to run even if settings table or row doesn't exist.
DO $$
DECLARE
  firm_sig text;
  firm_logo text;
BEGIN
  SELECT email_signature, email_signature_logo_url
    INTO firm_sig, firm_logo
    FROM settings LIMIT 1;

  IF firm_sig IS NOT NULL THEN
    UPDATE employees
       SET email_signature = firm_sig
     WHERE email_signature IS NULL;
  END IF;

  IF firm_logo IS NOT NULL THEN
    UPDATE employees
       SET email_signature_logo_url = firm_logo
     WHERE email_signature_logo_url IS NULL;
  END IF;
EXCEPTION WHEN undefined_table THEN
  -- settings table doesn't exist yet — nothing to backfill, no-op
  NULL;
END $$;
