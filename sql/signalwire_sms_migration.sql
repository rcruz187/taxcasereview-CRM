-- Wire SMS up to SignalWire for real sending (was log-only before)
ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS signalwire_sms_id text;
ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS sent_by text;
ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS error_msg text;
