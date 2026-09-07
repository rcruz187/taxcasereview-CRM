CREATE OR REPLACE FUNCTION check_linkedin_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_health     jsonb;
  v_post       record;
  v_alert_key  text;
  v_fired      int := 0;
  v_r          int;
  v_resolved   int := 0;
BEGIN
  v_health := get_linkedin_health();

  -- Cron down
  IF (v_health->>'status') = 'down' THEN
    v_alert_key := 'cron_down_' || TO_CHAR(NOW(), 'YYYY-MM-DD');
    INSERT INTO linkedin_alert_log (alert_type, incident_key, details)
    VALUES ('cron_down', v_alert_key, v_health)
    ON CONFLICT (alert_type, incident_key) WHERE resolved_at IS NULL DO NOTHING;
    IF FOUND THEN
      PERFORM send_linkedin_alert(
        '🚨 LinkedIn Scheduler DOWN',
        '<p>linkedin-publish-fire has not run in >35 min. Last: ' ||
          COALESCE(v_health->>'fire_last', 'never') ||
          '</p><p>Check Supabase → Scheduled Jobs.</p>'
      );
      v_fired := v_fired + 1;
    END IF;
  ELSE
    UPDATE linkedin_alert_log SET resolved_at = NOW()
    WHERE alert_type = 'cron_down' AND resolved_at IS NULL;
    GET DIAGNOSTICS v_resolved = ROW_COUNT;
  END IF;

  -- Stuck posts
  FOR v_post IN
    SELECT id, ROUND(EXTRACT(EPOCH FROM (NOW() - updated_at))/60) AS mins
    FROM linkedin_posts
    WHERE tenant_id = 'a0000000-0000-0000-0000-000000000001'
    AND   status    = 'publishing'
    AND   updated_at < NOW() - INTERVAL '5 minutes'
  LOOP
    v_alert_key := 'stuck_' || v_post.id::text;
    INSERT INTO linkedin_alert_log (alert_type, incident_key, details)
    VALUES ('stuck_post', v_alert_key, jsonb_build_object('post_id', v_post.id, 'minutes_stuck', v_post.mins))
    ON CONFLICT (alert_type, incident_key) WHERE resolved_at IS NULL DO NOTHING;
    IF FOUND THEN
      PERFORM send_linkedin_alert(
        '⚠️ LinkedIn post stuck in publishing',
        '<p>Post ' || v_post.id || ' stuck ' || v_post.mins || ' min. Orphaned lock — no duplicate sent to LinkedIn. Check Admin Portal → LinkedIn → Queue.</p>'
      );
      v_fired := v_fired + 1;
    END IF;
  END LOOP;

  -- Overdue posts
  FOR v_post IN
    SELECT id, scheduled_at, ROUND(EXTRACT(EPOCH FROM (NOW() - scheduled_at))/60) AS mins
    FROM linkedin_posts
    WHERE tenant_id   = 'a0000000-0000-0000-0000-000000000001'
    AND   status      = 'approved'
    AND   scheduled_at <= NOW() - INTERVAL '30 minutes'
  LOOP
    v_alert_key := 'overdue_' || v_post.id::text;
    INSERT INTO linkedin_alert_log (alert_type, incident_key, details)
    VALUES ('overdue_post', v_alert_key,
      jsonb_build_object('post_id', v_post.id, 'scheduled_at', v_post.scheduled_at, 'minutes_overdue', v_post.mins))
    ON CONFLICT (alert_type, incident_key) WHERE resolved_at IS NULL DO NOTHING;
    IF FOUND THEN
      PERFORM send_linkedin_alert(
        '⚠️ LinkedIn post overdue — ' || v_post.mins || ' min past schedule',
        '<p>Post ' || v_post.id || ' scheduled for ' || v_post.scheduled_at || ' has not published. Check Admin Portal → LinkedIn → Scheduler Health.</p>'
      );
      v_fired := v_fired + 1;
    END IF;
  END LOOP;

  -- Failed posts
  FOR v_post IN
    SELECT id, error_msg, retry_count
    FROM linkedin_posts
    WHERE tenant_id = 'a0000000-0000-0000-0000-000000000001'
    AND   status    = 'failed'
  LOOP
    v_alert_key := 'api_fail_' || v_post.id::text;
    INSERT INTO linkedin_alert_log (alert_type, incident_key, details)
    VALUES ('api_failure', v_alert_key,
      jsonb_build_object('post_id', v_post.id, 'error', LEFT(COALESCE(v_post.error_msg,''), 300)))
    ON CONFLICT (alert_type, incident_key) WHERE resolved_at IS NULL DO NOTHING;
    IF FOUND THEN
      PERFORM send_linkedin_alert(
        '🚨 LinkedIn post FAILED after ' || v_post.retry_count || ' retries',
        '<p>Post ' || v_post.id || ' permanently failed. Error: ' || LEFT(COALESCE(v_post.error_msg,'unknown'), 200) || '</p><p>Go to Admin Portal → LinkedIn → Queue to retry or delete.</p>'
      );
      v_fired := v_fired + 1;
    END IF;
  END LOOP;

  -- Auto-resolve alerts for now-published posts
  UPDATE linkedin_alert_log al SET resolved_at = NOW()
  WHERE resolved_at IS NULL
  AND   alert_type IN ('stuck_post', 'overdue_post', 'api_failure')
  AND   EXISTS (
    SELECT 1 FROM linkedin_posts lp
    WHERE lp.id::text = REPLACE(REPLACE(REPLACE(al.incident_key,'stuck_',''),'overdue_',''),'api_fail_','')
    AND   lp.status   = 'published'
  );
  GET DIAGNOSTICS v_r = ROW_COUNT;
  v_resolved := v_resolved + v_r;

  RETURN jsonb_build_object(
    'ok', true, 'alerts_fired', v_fired, 'alerts_resolved', v_resolved, 'health', v_health
  );
END;
$$;

-- Monitor cron: every 30 minutes
SELECT cron.schedule(
  'linkedin-monitor',
  '*/30 * * * *',
  $$SELECT check_linkedin_health()$$
);
