-- Add the columns the self-healing Settings save flagged as missing
ALTER TABLE settings ADD COLUMN IF NOT EXISTS sw_inbound_did text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS email_signature text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS primary_color text;
