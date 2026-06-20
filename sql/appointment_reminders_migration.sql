-- ============================================================================
-- calevents.reminder_sent — appointment reminders
-- ============================================================================
-- Backs the new send-appointment-reminders Edge Function, which a pg_cron
-- job invokes every 5 minutes. It looks for scheduled appointments inside
-- the reminder window (30 min before by default) that haven't already had
-- a reminder email sent, sends one, then flips this flag so it isn't sent
-- again on the next tick.
-- ============================================================================

ALTER TABLE calevents ADD COLUMN IF NOT EXISTS reminder_sent boolean DEFAULT false;
