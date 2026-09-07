-- Switch Fax from Telnyx to SignalWire
ALTER TABLE settings ADD COLUMN IF NOT EXISTS signalwire_backend text;
ALTER TABLE fax_logs ADD COLUMN IF NOT EXISTS signalwire_fax_id text;
