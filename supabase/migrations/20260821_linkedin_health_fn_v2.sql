-- get_linkedin_health v2: 20-minute window query eliminates cron-collision false alerts
-- Root cause: when monitor and fire cron start at the same second (*/30 and */15 share
-- :00/:15/:30/:45 marks), LIMIT 1 returns no row because the fire job hasn't written
-- its completion record yet. MAX() over 20min window uses already-committed prior runs.

CREATE OR REPLACE FUNCTION get_linkedin_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_fire_last      timestamptz;
  v_fire_status    text;
  v_process_last   timestamptz;
  v_process_status text;
  v_last_auto_pub  timestamptz;
  v_next_sched     timestamptz;
  v_stuck_count    int;
  v_failed_count   int;
  v_overdue_count  int;
  v_open_alerts    int;
  v_health_status  text;
BEGIN
  -- 20min window: if fire ran any time in the last 20 min, the system is healthy
  -- This survives same-second race between monitor and fire (both start at :00/:30)
  SELECT MAX(start_time), MAX(status) INTO v_fire_last, v_fire_status
  FROM cron.job_run_details jrd
  JOIN cron.job j ON j.jobid = jrd.jobid
  WHERE j.jobname = 'linkedin-publish-fire'
  AND   jrd.start_time > NOW() - INTERVAL '20 minutes';

  -- Fall back to all-time last run if no recent run (handles cold-start)
  IF v_fire_last IS NULL THEN
    SELECT MAX(start_time) INTO v_fire_last
    FROM cron.job_run_details jrd
    JOIN cron.job j ON j.jobid = jrd.jobid
    WHERE j.jobname = 'linkedin-publish-fire';

    SELECT status INTO v_fire_status
    FROM cron.job_run_details jrd
    JOIN cron.job j ON j.jobid = jrd.jobid
    WHERE j.jobname = 'linkedin-publish-fire'
    ORDER BY jrd.start_time DESC LIMIT 1;
  END IF;

  SELECT MAX(start_time) INTO v_process_last
  FROM cron.job_run_details jrd
  JOIN cron.job j ON j.jobid = jrd.jobid
  WHERE j.jobname = 'linkedin-publish-process';

  SELECT status INTO v_process_status
  FROM cron.job_run_details jrd
  JOIN cron.job j ON j.jobid = jrd.jobid
  WHERE j.jobname = 'linkedin-publish-process'
  ORDER BY jrd.start_time DESC LIMIT 1;

  SELECT MAX(published_at) INTO v_last_auto_pub
  FROM linkedin_posts
  WHERE tenant_id = 'a0000000-0000-0000-0000-000000000001'
  AND   status    = 'published' AND published_at IS NOT NULL;

  SELECT MIN(scheduled_at) INTO v_next_sched
  FROM linkedin_posts
  WHERE tenant_id  = 'a0000000-0000-0000-0000-000000000001'
  AND   status     = 'approved' AND scheduled_at IS NOT NULL;

  SELECT COUNT(*) INTO v_stuck_count
  FROM linkedin_posts
  WHERE tenant_id  = 'a0000000-0000-0000-0000-000000000001'
  AND   status     = 'publishing'
  AND   updated_at < NOW() - INTERVAL '5 minutes';

  SELECT COUNT(*) INTO v_failed_count
  FROM linkedin_posts
  WHERE tenant_id = 'a0000000-0000-0000-0000-000000000001'
  AND   status    = 'failed';

  SELECT COUNT(*) INTO v_overdue_count
  FROM linkedin_posts
  WHERE tenant_id   = 'a0000000-0000-0000-0000-000000000001'
  AND   status      = 'approved'
  AND   scheduled_at <= NOW() - INTERVAL '30 minutes';

  SELECT COUNT(*) INTO v_open_alerts
  FROM linkedin_alert_log WHERE resolved_at IS NULL;

  -- 'down' = no run in last 35 min (confirmed 2 missed fire cycles)
  v_health_status := CASE
    WHEN v_fire_last IS NULL OR v_fire_last < NOW() - INTERVAL '35 minutes' THEN 'down'
    WHEN v_stuck_count > 0 OR v_overdue_count > 0 OR v_failed_count > 0     THEN 'degraded'
    ELSE 'healthy'
  END;

  RETURN jsonb_build_object(
    'status',          v_health_status,
    'fire_last',       v_fire_last,
    'fire_status',     COALESCE(v_fire_status, 'never'),
    'process_last',    v_process_last,
    'process_status',  COALESCE(v_process_status, 'never'),
    'last_auto_pub',   v_last_auto_pub,
    'next_scheduled',  v_next_sched,
    'stuck_count',     v_stuck_count,
    'failed_count',    v_failed_count,
    'overdue_count',   v_overdue_count,
    'open_alerts',     v_open_alerts,
    'checked_at',      NOW()
  );
END;
$$;
