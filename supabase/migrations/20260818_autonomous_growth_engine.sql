-- autonomous_growth_engine — tables and cron jobs for the marketing automation system
-- Creates: marketing_gsc_performance, marketing_weekly_reports
-- Adds cron: weekly-growth-report (Monday 8am ET), content-generator (Monday 9am ET)
-- Safe: all CREATE TABLE IF NOT EXISTS, all cron.unschedule before re-schedule

-- ── marketing_gsc_performance ─────────────────────────────────────────────
-- Stores GSC query data synced by gsc-data edge function
CREATE TABLE IF NOT EXISTS public.marketing_gsc_performance (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date        date NOT NULL,
  query       text NOT NULL,
  clicks      integer DEFAULT 0,
  impressions integer DEFAULT 0,
  ctr         numeric(6,4) DEFAULT 0,
  position    numeric(6,2) DEFAULT 0,
  page        text,
  synced_at   timestamptz DEFAULT now(),
  UNIQUE (date, query)
);

ALTER TABLE public.marketing_gsc_performance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_gsc_admin_only ON public.marketing_gsc_performance;
CREATE POLICY marketing_gsc_admin_only ON public.marketing_gsc_performance
  USING (auth.email() IN ('romy@taxcasereview.org','romy@taxrescrm.net'));

-- ── marketing_weekly_reports ──────────────────────────────────────────────
-- Log of weekly report sends (idempotency + history)
CREATE TABLE IF NOT EXISTS public.marketing_weekly_reports (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  week_ending    date NOT NULL,
  sent_at        timestamptz DEFAULT now(),
  impressions    integer,
  clicks         integer,
  sessions       integer,
  prospects_new  integer DEFAULT 0,
  demos          integer DEFAULT 0,
  li_published   integer DEFAULT 0,
  owner_actions  integer DEFAULT 0,
  UNIQUE (tenant_id, week_ending)
);

ALTER TABLE public.marketing_weekly_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_weekly_admin_only ON public.marketing_weekly_reports;
CREATE POLICY marketing_weekly_admin_only ON public.marketing_weekly_reports
  USING (auth.email() IN ('romy@taxcasereview.org','romy@taxrescrm.net'));

-- ── Add linkedin_post columns if missing ─────────────────────────────────
-- linkedin_posts.title and category already exist per 8/16 build
-- Add error_msg if not present
ALTER TABLE public.linkedin_posts
  ADD COLUMN IF NOT EXISTS error_msg text;

-- ── Cron: weekly-growth-report — Monday 8am ET (13:00 UTC, before DST / 12:00 UTC after DST)
-- We use 13:00 UTC which is 8am ET in winter (EST=UTC-5) and 9am ET in summer (EDT=UTC-4)
-- This gives ~8-9am ET year-round, acceptable drift
SELECT cron.unschedule('weekly-growth-report') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'weekly-growth-report'
);

SELECT cron.schedule(
  'weekly-growth-report',
  '0 13 * * 1',  -- Monday 13:00 UTC = ~8am ET
  $$
  SELECT net.http_post(
    url := (SELECT 'https://' || value FROM vault.secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/weekly-growth-report',
    headers := ('{"Content-Type":"application/json","Authorization":"Bearer ' ||
      (SELECT value FROM vault.secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY') || '"}')::jsonb,
    body := '{"action":"run"}'::jsonb
  );
  $$
);

-- ── Cron: content-generator — Monday 9am ET (14:00 UTC)
-- Generates weekly content drafts AFTER the growth report is already sent
SELECT cron.unschedule('content-generator-weekly') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'content-generator-weekly'
);

SELECT cron.schedule(
  'content-generator-weekly',
  '0 14 * * 1',  -- Monday 14:00 UTC = ~9am ET
  $$
  SELECT net.http_post(
    url := (SELECT 'https://' || value FROM vault.secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/content-generator',
    headers := ('{"Content-Type":"application/json","Authorization":"Bearer ' ||
      (SELECT value FROM vault.secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY') || '"}')::jsonb,
    body := '{"useCrmData":true}'::jsonb
  );
  $$
);

-- ── Cron: daily-briefing — every day 8am ET (13:00 UTC)
-- Already exists in some form; ensure it's scheduled
SELECT cron.unschedule('daily-briefing') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-briefing'
);

SELECT cron.schedule(
  'daily-briefing',
  '0 13 * * *',  -- Daily 13:00 UTC = ~8am ET
  $$
  SELECT net.http_post(
    url := 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/daily-briefing',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
