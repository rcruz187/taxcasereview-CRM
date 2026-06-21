-- ============================================================================
-- Daily autopay batch — automatic run
-- ============================================================================
-- Schedules the run-autopay-batch Edge Function to fire once a day so
-- client-enrolled (and staff-enrolled) monthly autopay actually charges
-- itself instead of waiting on someone to click "Run Today's Batch" by hand.
--
-- Runs at 13:15 UTC, which is 9:15 AM Eastern during Daylight Time (most of
-- the year, including now) and 8:15 AM Eastern during Standard Time (winter)
-- — a fixed UTC cron time can't auto-follow DST, so it just lands within
-- business hours either way rather than exactly on 9:15 every day. Same
-- trade-off already accepted elsewhere in this project; adjust the "13 15"
-- below if you'd rather it run at a different time.
--
-- Requires the pg_cron and pg_net extensions to be enabled first:
-- Supabase Dashboard → Database → Extensions → enable "pg_cron" and "pg_net".
--
-- Replace YOUR_SERVICE_ROLE_KEY below with the real key from
-- Supabase Dashboard → Project Settings → API → service_role key
-- before running this in the SQL Editor.
-- ============================================================================

select cron.schedule(
  'run-autopay-batch-daily',
  '15 13 * * *',
  $$
  select net.http_post(
    url := 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/run-autopay-batch',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- To check it's scheduled:
-- select * from cron.job where jobname = 'run-autopay-batch-daily';

-- To remove it later if needed:
-- select cron.unschedule('run-autopay-batch-daily');
