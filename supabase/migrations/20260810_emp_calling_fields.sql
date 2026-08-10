-- Add calling fields to employees table
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS extension TEXT,
  ADD COLUMN IF NOT EXISTS direct_number TEXT,
  ADD COLUMN IF NOT EXISTS team TEXT,
  ADD COLUMN IF NOT EXISTS sip_username TEXT,
  ADD COLUMN IF NOT EXISTS sip_password TEXT;

-- Add team field to settings for IVR routing
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS ivr_teams JSONB DEFAULT '[]'::jsonb;
-- ivr_teams format: [{"name":"Resolution","extension":"1","members":["Chris Bennett","Adam Barr"]}]
