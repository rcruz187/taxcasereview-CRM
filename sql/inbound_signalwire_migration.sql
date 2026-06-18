-- Supports inbound SMS, fax, and call forwarding alongside the existing
-- outbound sending. Safe to run even if some of these already exist.

ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS direction text DEFAULT 'outbound';
ALTER TABLE fax_logs     ADD COLUMN IF NOT EXISTS direction text DEFAULT 'outbound';

-- A number to ring when someone calls the SignalWire number — used by the
-- receive-call Edge Function to forward the call there. Your own cell,
-- a front-desk line, whatever should actually ring.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS call_forward_number text;
