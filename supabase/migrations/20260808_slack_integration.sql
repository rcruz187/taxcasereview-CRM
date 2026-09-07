-- Slack integration — per-tenant
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS slack_bot_token      text,        -- Bot User OAuth Token (xoxb-...)
  ADD COLUMN IF NOT EXISTS slack_signing_secret text,        -- used to verify Slack webhook payloads
  ADD COLUMN IF NOT EXISTS slack_channel_map    jsonb,       -- {"C0123SLACK": "general", "C0456SLACK": "tax-team"}
  ADD COLUMN IF NOT EXISTS slack_sync_enabled   boolean DEFAULT false;

-- Track which Slack messages have already been imported to avoid duplicates
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS source       text,      -- 'slack', 'm365', null = native CRM
  ADD COLUMN IF NOT EXISTS external_id  text;      -- Slack ts or M365 message id

CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_external_id_idx
  ON chat_messages(tenant_id, external_id) WHERE external_id IS NOT NULL;
