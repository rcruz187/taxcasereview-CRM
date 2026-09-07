-- Supports inbound SMS, fax, and call forwarding alongside the existing
-- outbound sending. Safe to run even if some of these already exist.

-- sms_messages didn't actually exist yet (despite the SMS page assuming
-- it did) — creating it fresh with everything the code expects.
-- Note: "clientName" is intentionally quoted/mixed-case to match the
-- exact column name the frontend already inserts/reads.
CREATE TABLE IF NOT EXISTS sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clientName" text,
  phone text,
  body text,
  status text DEFAULT 'Sent',
  direction text DEFAULT 'outbound',
  signalwire_sms_id text,
  sent_by text,
  error_msg text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sms_messages_all" ON sms_messages;
CREATE POLICY "sms_messages_all" ON sms_messages FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS fax_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_number text,
  from_number text,
  client_name text,
  subject text,
  notes text,
  file_name text,
  file_url text,
  signalwire_fax_id text,
  status text DEFAULT 'Sent',
  direction text DEFAULT 'outbound',
  sent_by text,
  sent_at timestamptz,
  error_msg text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE fax_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fax_logs_all" ON fax_logs;
CREATE POLICY "fax_logs_all" ON fax_logs FOR ALL USING (true) WITH CHECK (true);

-- These are now redundant given the CREATE TABLE above already includes
-- direction, but kept so this migration is still safe to run against an
-- existing table that predates this file.
ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS direction text DEFAULT 'outbound';
ALTER TABLE fax_logs     ADD COLUMN IF NOT EXISTS direction text DEFAULT 'outbound';

-- A number to ring when someone calls the SignalWire number — used by the
-- receive-call Edge Function to forward the call there. Your own cell,
-- a front-desk line, whatever should actually ring.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS call_forward_number text;
