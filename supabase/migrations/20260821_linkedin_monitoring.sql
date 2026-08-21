-- LinkedIn publishing monitoring — alert deduplication + health RPC
-- Read-only from publishing path — cannot trigger, lock, or duplicate a post.

-- ── Alert log: one row per incident type, prevents spam ──────────────────────
CREATE TABLE IF NOT EXISTS linkedin_alert_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type   text NOT NULL,          -- 'stuck_post' | 'overdue_post' | 'api_failure' | 'cron_down'
  incident_key text NOT NULL,          -- unique key per incident (e.g. post_id or cron name+date)
  alerted_at   timestamptz NOT NULL DEFAULT NOW(),
  resolved_at  timestamptz,            -- set when incident clears
  details      jsonb,
  CONSTRAINT uq_alert_incident UNIQUE (alert_type, incident_key, resolved_at)
);

CREATE INDEX IF NOT EXISTS idx_alert_log_type_key ON linkedin_alert_log (alert_type, incident_key);
CREATE INDEX IF NOT EXISTS idx_alert_log_resolved ON linkedin_alert_log (resolved_at) WHERE resolved_at IS NULL;

-- ── Health read function — pure read, no side effects ────────────────────────
CREATE OR REPLACE FUNCTION get_linkedin_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE  -- marks this as read-only; cannot call DML
AS $$
DECLARE
  v_result         jsonb;
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
  -- Last fire run
  SELECT start_time, status INTO v_fire_last, v_fire_status
  FROM cron.job_run_details jrd
  JOIN cron.job j ON j.jobid = jrd.jobid
  WHERE j.jobname = 'linkedin-publish-fire'
  ORDER BY jrd.start_time DESC LIMIT 1;

  -- Last process run
  SELECT start_time, status INTO v_process_last, v_process_status
  FROM cron.job_run_details jrd
  JOIN cron.job j ON j.jobid = jrd.jobid
  WHERE j.jobname = 'linkedin-publish-process'
  ORDER BY jrd.start_time DESC LIMIT 1;

  -- Last successful automatic publication (has pg_net_req: in error_msg history OR published via scheduler)
  -- We identify scheduler-published posts by the absence of a manual publish marker;
  -- conservative: any published post in the last 30 days
  SELECT MAX(published_at) INTO v_last_auto_pub
  FROM linkedin_posts
  WHERE tenant_id  = 'a0000000-0000-0000-0000-000000000001'
  AND   status     = 'published'
  AND   published_at IS NOT NULL;

  -- Next scheduled publication
  SELECT MIN(scheduled_at) INTO v_next_sched
  FROM linkedin_posts
  WHERE tenant_id  = 'a0000000-0000-0000-0000-000000000001'
  AND   status     = 'approved'
  AND   scheduled_at IS NOT NULL;

  -- Stuck posts: in 'publishing' state for >5 minutes (orphaned lock)
  SELECT COUNT(*) INTO v_stuck_count
  FROM linkedin_posts
  WHERE tenant_id  = 'a0000000-0000-0000-0000-000000000001'
  AND   status     = 'publishing'
  AND   updated_at < NOW() - INTERVAL '5 minutes';

  -- Failed posts
  SELECT COUNT(*) INTO v_failed_count
  FROM linkedin_posts
  WHERE tenant_id  = 'a0000000-0000-0000-0000-000000000001'
  AND   status     = 'failed';

  -- Overdue: approved + scheduled_at <= NOW() - 30min (should have been picked up)
  SELECT COUNT(*) INTO v_overdue_count
  FROM linkedin_posts
  WHERE tenant_id   = 'a0000000-0000-0000-0000-000000000001'
  AND   status      = 'approved'
  AND   scheduled_at <= NOW() - INTERVAL '30 minutes';

  -- Open alerts
  SELECT COUNT(*) INTO v_open_alerts
  FROM linkedin_alert_log
  WHERE resolved_at IS NULL;

  -- Overall health
  v_health_status := CASE
    WHEN v_fire_last IS NULL OR v_fire_last < NOW() - INTERVAL '35 minutes'  THEN 'down'
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

-- ── Monitor function — detects incidents, sends alerts, deduplicates ──────────
-- Called by cron every 30 min. READ-ONLY on linkedin_posts — cannot publish.
CREATE OR REPLACE FUNCTION check_linkedin_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_health      jsonb;
  v_post        record;
  v_alert_key   text;
  v_alert_fired int := 0;
  v_resolved    int := 0;
  v_req_id      bigint;
BEGIN
  v_health := get_linkedin_health();

  -- ── 1. Cron down alert ───────────────────────────────────────────────────
  IF (v_health->>'status') = 'down' THEN
    v_alert_key := 'cron_down_' || TO_CHAR(NOW(), 'YYYY-MM-DD');
    INSERT INTO linkedin_alert_log (alert_type, incident_key, details)
    VALUES ('cron_down', v_alert_key, v_health)
    ON CONFLICT (alert_type, incident_key, resolved_at) DO NOTHING;

    IF FOUND THEN
      -- Fire alert via send-email edge function through pg_net
      PERFORM net.http_post(
        url     := 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/send-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
        ),
        body    := jsonb_build_object(
          'to',        'romy@taxrescrm.net',
          'subject',   '🚨 LinkedIn Scheduler DOWN — cron not running',
          'html',      '<p>The <strong>linkedin-publish-fire</strong> cron has not run in >35 minutes.</p><p>Last run: ' || COALESCE(v_health->>'fire_last', 'never') || '</p><p>Check Supabase Dashboard → Database → Scheduled Jobs immediately.</p>',
          'tenant_id', 'a0000000-0000-0000-0000-000000000001'
        )
      );
      v_alert_fired := v_alert_fired + 1;
    END IF;
  ELSE
    -- Resolve any open cron_down alerts
    UPDATE linkedin_alert_log SET resolved_at = NOW()
    WHERE alert_type = 'cron_down' AND resolved_at IS NULL;
    GET DIAGNOSTICS v_resolved = ROW_COUNT;
  END IF;

  -- ── 2. Stuck posts alert (orphaned publishing lock) ───────────────────────
  FOR v_post IN
    SELECT id, updated_at,
           EXTRACT(EPOCH FROM (NOW() - updated_at))/60 AS minutes_stuck
    FROM linkedin_posts
    WHERE tenant_id = 'a0000000-0000-0000-0000-000000000001'
    AND   status    = 'publishing'
    AND   updated_at < NOW() - INTERVAL '5 minutes'
  LOOP
    v_alert_key := 'stuck_' || v_post.id::text;
    INSERT INTO linkedin_alert_log (alert_type, incident_key, details)
    VALUES ('stuck_post', v_alert_key,
      jsonb_build_object('post_id', v_post.id, 'minutes_stuck', v_post.minutes_stuck))
    ON CONFLICT (alert_type, incident_key, resolved_at) DO NOTHING;

    IF FOUND THEN
      PERFORM net.http_post(
        url     := 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/send-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
        ),
        body    := jsonb_build_object(
          'to',        'romy@taxrescrm.net',
          'subject',   '⚠️ LinkedIn post stuck in publishing — manual review needed',
          'html',      '<p>Post <code>' || v_post.id || '</code> has been stuck at <strong>publishing</strong> for ' || ROUND(v_post.minutes_stuck) || ' minutes.</p><p>This is an orphaned lock — no duplicate was sent to LinkedIn. Go to Admin Portal → LinkedIn → Queue to review and reset it.</p>',
          'tenant_id', 'a0000000-0000-0000-0000-000000000001'
        )
      );
      v_alert_fired := v_alert_fired + 1;
    END IF;
  END LOOP;

  -- ── 3. Overdue posts alert ────────────────────────────────────────────────
  FOR v_post IN
    SELECT id, scheduled_at,
           EXTRACT(EPOCH FROM (NOW() - scheduled_at))/60 AS minutes_overdue
    FROM linkedin_posts
    WHERE tenant_id   = 'a0000000-0000-0000-0000-000000000001'
    AND   status      = 'approved'
    AND   scheduled_at <= NOW() - INTERVAL '30 minutes'
  LOOP
    v_alert_key := 'overdue_' || v_post.id::text;
    INSERT INTO linkedin_alert_log (alert_type, incident_key, details)
    VALUES ('overdue_post', v_alert_key,
      jsonb_build_object('post_id', v_post.id, 'scheduled_at', v_post.scheduled_at, 'minutes_overdue', v_post.minutes_overdue))
    ON CONFLICT (alert_type, incident_key, resolved_at) DO NOTHING;

    IF FOUND THEN
      PERFORM net.http_post(
        url     := 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/send-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
        ),
        body    := jsonb_build_object(
          'to',        'romy@taxrescrm.net',
          'subject',   '⚠️ LinkedIn post overdue — scheduled ' || ROUND(v_post.minutes_overdue) || ' min ago',
          'html',      '<p>Post <code>' || v_post.id || '</code> was scheduled for ' || v_post.scheduled_at || ' and has not published.</p><p>The scheduler may be failing to pick it up. Check Admin Portal → LinkedIn → Scheduler Health.</p>',
          'tenant_id', 'a0000000-0000-0000-0000-000000000001'
        )
      );
      v_alert_fired := v_alert_fired + 1;
    END IF;
  END LOOP;

  -- ── 4. Failed API responses: posts with error_msg 'HTTP 4xx/5xx:...' ─────
  FOR v_post IN
    SELECT id, error_msg, retry_count
    FROM linkedin_posts
    WHERE tenant_id = 'a0000000-0000-0000-0000-000000000001'
    AND   status    = 'failed'
    AND   error_msg IS NOT NULL
  LOOP
    v_alert_key := 'api_fail_' || v_post.id::text;
    INSERT INTO linkedin_alert_log (alert_type, incident_key, details)
    VALUES ('api_failure', v_alert_key,
      jsonb_build_object('post_id', v_post.id, 'error', v_post.error_msg, 'retries', v_post.retry_count))
    ON CONFLICT (alert_type, incident_key, resolved_at) DO NOTHING;

    IF FOUND THEN
      PERFORM net.http_post(
        url     := 'https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/send-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
        ),
        body    := jsonb_build_object(
          'to',        'romy@taxrescrm.net',
          'subject',   '🚨 LinkedIn post FAILED after ' || v_post.retry_count || ' retries',
          'html',      '<p>Post <code>' || v_post.id || '</code> has permanently failed.</p><p>Error: ' || LEFT(v_post.error_msg, 300) || '</p><p>Go to Admin Portal → LinkedIn → Queue to manually retry or delete it.</p>',
          'tenant_id', 'a0000000-0000-0000-0000-000000000001'
        )
      );
      v_alert_fired := v_alert_fired + 1;
    END IF;
  END LOOP;

  -- ── 5. Auto-resolve alerts for posts that are now published ──────────────
  UPDATE linkedin_alert_log al
  SET resolved_at = NOW()
  WHERE resolved_at IS NULL
  AND   alert_type IN ('stuck_post', 'overdue_post', 'api_failure')
  AND   EXISTS (
    SELECT 1 FROM linkedin_posts lp
    WHERE lp.id::text = REPLACE(
      REPLACE(REPLACE(al.incident_key, 'stuck_', ''), 'overdue_', ''), 'api_fail_', ''
    )
    AND lp.status = 'published'
  );
  GET DIAGNOSTICS v_resolved = v_resolved + ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'alerts_fired', v_alert_fired,
    'alerts_resolved', v_resolved,
    'health', v_health
  );
END;
$$;

-- ── Monitoring cron: every 30 min ─────────────────────────────────────────────
SELECT cron.schedule(
  'linkedin-monitor',
  '*/30 * * * *',
  $$SELECT check_linkedin_health()$$
);
