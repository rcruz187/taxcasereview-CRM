-- Verizon Business calling integration fields
-- Per-tenant: each office configures their own Verizon account
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS verizon_api_key        text,
  ADD COLUMN IF NOT EXISTS verizon_account_id     text,
  ADD COLUMN IF NOT EXISTS verizon_phone_number   text,
  ADD COLUMN IF NOT EXISTS verizon_api_url        text DEFAULT 'https://api.verizon.com/v1',
  ADD COLUMN IF NOT EXISTS calling_provider       text DEFAULT 'signalwire'; -- 'signalwire' | 'verizon' | 'none'
