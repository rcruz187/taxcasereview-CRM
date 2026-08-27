-- Lead Workflow Model: tenant-level pipeline configuration
-- Allows each TaxRes CRM office to choose its sales model independently.
-- 
-- 'investigation-resolution' (default) = existing TCR flow:
--   New Lead → ... → Tax Inv Agreement Signed → Tax Inv Fee Paid →
--   Tax Investigation Active → IRS Facts Received → Addendum Signed →
--   Resolution Fee Paid → Converted to Client
--
-- 'direct-resolution' = Nashville / direct-sale flow (stage sequence TBD)
--
-- All existing tenants safely get 'investigation-resolution' by DEFAULT.
-- No existing behavior changes on migration.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS lead_workflow_model TEXT
  DEFAULT 'investigation-resolution'
  CHECK (lead_workflow_model IN ('investigation-resolution', 'direct-resolution'));

-- Confirm existing tenants get the correct default
UPDATE settings
  SET lead_workflow_model = 'investigation-resolution'
  WHERE lead_workflow_model IS NULL;
