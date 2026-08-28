-- Final acceptance: platform-only content/LinkedIn APIs are guarded in-function,
-- while cron/service internals are no longer directly executable by CRM sessions.

CREATE OR REPLACE FUNCTION public.get_content_drafts(p_status text DEFAULT NULL::text, p_limit integer DEFAULT 200)
RETURNS TABLE(id uuid, content_type text, title text, body text, status text, week_of date, metadata jsonb, created_at timestamptz, updated_at timestamptz, approved_at timestamptz, approved_by text, published_at timestamptz, archived_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  IF NOT public._is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY SELECT c.id,c.content_type,c.title,c.body,c.status,c.week_of,c.metadata,c.created_at,c.updated_at,c.approved_at,c.approved_by,c.published_at,c.archived_at
  FROM public.content_drafts c WHERE (p_status IS NULL OR c.status=p_status)
  ORDER BY c.week_of DESC,c.created_at DESC LIMIT LEAST(GREATEST(coalesce(p_limit,200),1),1000);
END; $$;

CREATE OR REPLACE FUNCTION public.get_linkedin_connection()
RETURNS TABLE(connected boolean, display_name text, expires_at timestamptz, connected_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  IF NOT public._is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY SELECT (c.expires_at>now()),c.display_name,c.expires_at,c.connected_at FROM public.linkedin_credentials c ORDER BY c.connected_at DESC LIMIT 1;
END; $$;

CREATE OR REPLACE FUNCTION public.get_linkedin_posts(p_status text DEFAULT NULL::text, p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid, content_draft_id uuid, body text, status text, scheduled_at timestamptz, published_at timestamptz, linkedin_post_id text, linkedin_url text, error_msg text, created_at timestamptz, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  IF NOT public._is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY SELECT p.id,p.content_draft_id,p.body,p.status,p.scheduled_at,p.published_at,p.linkedin_post_id,p.linkedin_url,p.error_msg,p.created_at,p.updated_at
  FROM public.linkedin_posts p WHERE (p_status IS NULL OR p.status=p_status)
  ORDER BY p.created_at DESC LIMIT LEAST(GREATEST(coalesce(p_limit,50),1),1000);
END; $$;

CREATE OR REPLACE FUNCTION public.save_content_draft(p_id uuid, p_title text, p_body text)
RETURNS public.content_drafts
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_row public.content_drafts;
BEGIN
  IF NOT public._is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.content_drafts SET title=p_title,body=p_body,updated_at=now() WHERE id=p_id RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Draft not found'; END IF;
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION public.update_content_status(p_id uuid, p_status text, p_actor text DEFAULT NULL::text)
RETURNS public.content_drafts
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_row public.content_drafts; v_actor text;
BEGIN
  IF NOT public._is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_status NOT IN ('draft','approved','published','archived','rejected') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  v_actor := coalesce(auth.email(),p_actor,'Platform Admin');
  UPDATE public.content_drafts SET status=p_status,
    approved_at=CASE WHEN p_status='approved' THEN now() ELSE approved_at END,
    approved_by=CASE WHEN p_status='approved' THEN v_actor ELSE approved_by END,
    published_at=CASE WHEN p_status='published' THEN now() ELSE published_at END,
    archived_at=CASE WHEN p_status='archived' THEN now() ELSE archived_at END,
    updated_at=now() WHERE id=p_id RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Draft not found'; END IF;
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION public.upsert_linkedin_post(p_id uuid DEFAULT NULL::uuid, p_body text DEFAULT NULL::text, p_status text DEFAULT 'draft'::text, p_scheduled_at timestamptz DEFAULT NULL::timestamptz, p_draft_id uuid DEFAULT NULL::uuid)
RETURNS public.linkedin_posts
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_row public.linkedin_posts; v_tenant constant uuid := 'a0000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  IF NOT public._is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_status NOT IN ('draft','approved','publishing','published','failed','archived') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.linkedin_posts(tenant_id,body,status,scheduled_at,content_draft_id) VALUES(v_tenant,p_body,p_status,p_scheduled_at,p_draft_id) RETURNING * INTO v_row;
  ELSE
    UPDATE public.linkedin_posts SET body=coalesce(p_body,body),status=coalesce(p_status,status),scheduled_at=p_scheduled_at,content_draft_id=coalesce(p_draft_id,content_draft_id),updated_at=now()
    WHERE id=p_id AND tenant_id=v_tenant RETURNING * INTO v_row;
  END IF;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Post not found'; END IF;
  RETURN v_row;
END; $$;

REVOKE EXECUTE ON FUNCTION public.check_linkedin_health() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_linkedin_responses() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.publish_due_linkedin_posts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_linkedin_alert(text,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_linkedin_health()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_fire_last timestamptz; v_fire_status text; v_process_last timestamptz; v_process_status text;
  v_last_auto_pub timestamptz; v_next_sched timestamptz; v_stuck_count int; v_failed_count int; v_overdue_count int; v_open_alerts int; v_health_status text;
BEGIN
  IF auth.email() IS NOT NULL AND NOT public._is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT MAX(jrd.start_time),MAX(jrd.status) INTO v_fire_last,v_fire_status FROM cron.job_run_details jrd JOIN cron.job j ON j.jobid=jrd.jobid WHERE j.jobname='linkedin-publish-fire' AND jrd.start_time>now()-interval '20 minutes';
  IF v_fire_last IS NULL THEN
    SELECT MAX(jrd.start_time) INTO v_fire_last FROM cron.job_run_details jrd JOIN cron.job j ON j.jobid=jrd.jobid WHERE j.jobname='linkedin-publish-fire';
    SELECT jrd.status INTO v_fire_status FROM cron.job_run_details jrd JOIN cron.job j ON j.jobid=jrd.jobid WHERE j.jobname='linkedin-publish-fire' ORDER BY jrd.start_time DESC LIMIT 1;
  END IF;
  SELECT MAX(jrd.start_time) INTO v_process_last FROM cron.job_run_details jrd JOIN cron.job j ON j.jobid=jrd.jobid WHERE j.jobname='linkedin-publish-process';
  SELECT jrd.status INTO v_process_status FROM cron.job_run_details jrd JOIN cron.job j ON j.jobid=jrd.jobid WHERE j.jobname='linkedin-publish-process' ORDER BY jrd.start_time DESC LIMIT 1;
  SELECT MAX(published_at) INTO v_last_auto_pub FROM public.linkedin_posts WHERE tenant_id='a0000000-0000-0000-0000-000000000001' AND status='published' AND published_at IS NOT NULL;
  SELECT MIN(scheduled_at) INTO v_next_sched FROM public.linkedin_posts WHERE tenant_id='a0000000-0000-0000-0000-000000000001' AND status='approved' AND scheduled_at IS NOT NULL;
  SELECT count(*) INTO v_stuck_count FROM public.linkedin_posts WHERE tenant_id='a0000000-0000-0000-0000-000000000001' AND status='publishing' AND updated_at<now()-interval '5 minutes';
  SELECT count(*) INTO v_failed_count FROM public.linkedin_posts WHERE tenant_id='a0000000-0000-0000-0000-000000000001' AND status='failed';
  SELECT count(*) INTO v_overdue_count FROM public.linkedin_posts WHERE tenant_id='a0000000-0000-0000-0000-000000000001' AND status='approved' AND scheduled_at<=now()-interval '30 minutes';
  SELECT count(*) INTO v_open_alerts FROM public.linkedin_alert_log WHERE resolved_at IS NULL;
  v_health_status := CASE WHEN v_fire_last IS NULL OR v_fire_last<now()-interval '35 minutes' THEN 'down' WHEN v_stuck_count>0 OR v_overdue_count>0 OR v_failed_count>0 THEN 'degraded' ELSE 'healthy' END;
  RETURN jsonb_build_object('status',v_health_status,'fire_last',v_fire_last,'fire_status',coalesce(v_fire_status,'never'),'process_last',v_process_last,'process_status',coalesce(v_process_status,'never'),'last_auto_pub',v_last_auto_pub,'next_scheduled',v_next_sched,'stuck_count',v_stuck_count,'failed_count',v_failed_count,'overdue_count',v_overdue_count,'open_alerts',v_open_alerts,'checked_at',now());
END; $$;
