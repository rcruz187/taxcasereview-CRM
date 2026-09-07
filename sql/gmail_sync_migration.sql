-- Gmail sync support: lets the CRM actually pull mail in from Gmail
-- (inbox + sent) instead of only logging what's composed inside the CRM.

ALTER TABLE emails ADD COLUMN IF NOT EXISTS gmail_message_id text;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS gmail_thread_id text;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS from_address text;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS received_at timestamptz;

-- Prevents importing the same Gmail message twice across sync runs.
CREATE UNIQUE INDEX IF NOT EXISTS emails_gmail_message_id_uniq
  ON emails (gmail_message_id) WHERE gmail_message_id IS NOT NULL;

-- Sync state lives in settings (same table everything else's config lives in).
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gmail_last_sync_at timestamptz;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gmail_backfill_phase text DEFAULT 'inbox'; -- 'inbox' -> 'sent' -> 'done'
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gmail_backfill_page_token text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gmail_last_cleanup_at timestamptz;
