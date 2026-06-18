-- Unread tracking: Inbox badge count should reflect unread, not total.
-- Defaults to true (read) so manually-composed/sent emails don't show as
-- "unread" — only Gmail sync explicitly sets this false for inbox mail.
ALTER TABLE emails ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT true;

-- Attachment metadata (filename/size/Gmail ids) — NOT the file bytes
-- themselves. Attachments are fetched from Gmail on demand when someone
-- clicks to download, so this table never balloons with binary data.
ALTER TABLE emails ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;

-- Logo for the HTML email signature.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS email_signature_logo_url text;
