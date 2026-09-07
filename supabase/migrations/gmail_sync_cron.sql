-- Used by gmail-sync-cron edge function to surface sync errors in the UI
-- (replaces the in-memory lastError that used to live in the browser when
-- sync ran client-side).
alter table settings add column if not exists gmail_last_error text;
