-- usage_metrics: daily snapshots of Supabase project usage (Cached Egress,
-- Storage, DB size), pulled via the Management API by the
-- fetch-usage-metrics edge function on a daily cron. Lets the CRM show
-- usage trends in-app instead of requiring a trip to the Supabase
-- dashboard, and lets us alert before hitting plan limits.
create table if not exists usage_metrics (
  id                 uuid primary key default gen_random_uuid(),
  snapshot_date      date not null default current_date,
  cached_egress_gb   numeric,
  egress_limit_gb    numeric default 5,
  storage_used_mb    numeric,
  storage_limit_mb   numeric default 1024,
  db_size_mb         numeric,
  raw_response       jsonb,
  fetched_at         timestamptz not null default now()
);

-- Only one snapshot per day — re-running the cron same-day overwrites, doesn't duplicate
create unique index if not exists usage_metrics_one_per_day on usage_metrics (snapshot_date);

alter table usage_metrics disable row level security;
grant all on usage_metrics to anon, authenticated, service_role;
