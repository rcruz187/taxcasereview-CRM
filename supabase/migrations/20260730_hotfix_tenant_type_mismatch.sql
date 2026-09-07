-- HOTFIX for the 7/29 anon-RPC tenant-resolution migration
-- (20260729_anon_rpc_tenant_resolution.sql): every function declared
-- `v_tenant text` but the tables being inserted into (timeentries,
-- time_off_requests, tax_organizer_responses, client_financial_profiles,
-- documents) all have tenant_id as UUID, not text. This broke every one of
-- these flows outright (INSERT fails with a type-mismatch error) — caught by
-- testing kiosk_clock_in live before Romy's call. Fix: declare v_tenant as
-- uuid throughout and drop the now-unneeded ::text casts on the coalesce
-- fallback. Signatures are unchanged (CREATE OR REPLACE only).

CREATE OR REPLACE FUNCTION public.emp_clock_in(p_token text, p_date text, p_in_time text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id text; v_name text; v_row timeentries; v_tenant uuid;
BEGIN
  SELECT o_employee_id, o_employee_name INTO v_id, v_name FROM emp_session(p_token);
  v_tenant := coalesce((SELECT tenant_id FROM employees WHERE id = v_id),
                       '61a89aef-0e7e-4ea2-b222-44ab2024655a'::uuid);
  INSERT INTO timeentries (employee, date, "inTime", "outTime", hours, notes, method, tenant_id)
  VALUES (v_name, p_date, p_in_time, NULL, NULL, NULL, 'Employee Portal', v_tenant)
  RETURNING * INTO v_row;
  RETURN row_to_json(v_row);
END $function$;

CREATE OR REPLACE FUNCTION public.kiosk_clock_in(p_employee text, p_date text, p_in_time text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_row timeentries; v_tenant uuid;
BEGIN
  IF p_employee IS NULL OR trim(p_employee) = '' THEN
    RAISE EXCEPTION 'Employee is required.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM employees WHERE name = p_employee) THEN
    RAISE EXCEPTION 'Unknown employee.';
  END IF;
  v_tenant := coalesce((SELECT tenant_id FROM employees WHERE name = p_employee LIMIT 1),
                       '61a89aef-0e7e-4ea2-b222-44ab2024655a'::uuid);
  INSERT INTO timeentries (employee, date, "inTime", "outTime", hours, notes, method, tenant_id)
  VALUES (p_employee, p_date, p_in_time, NULL, NULL, NULL, 'Kiosk', v_tenant)
  RETURNING * INTO v_row;
  RETURN row_to_json(v_row);
END $function$;

CREATE OR REPLACE FUNCTION public.emp_timeoff_submit(p_token text, p_type text, p_start_date date, p_end_date date, p_days numeric, p_reason text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id text; v_name text; v_emails json; v_tenant uuid;
BEGIN
  SELECT o_employee_id, o_employee_name INTO v_id, v_name FROM emp_session(p_token);
  IF p_end_date < p_start_date THEN RAISE EXCEPTION 'End date must be after start date.'; END IF;
  v_tenant := coalesce((SELECT tenant_id FROM employees WHERE id = v_id),
                       '61a89aef-0e7e-4ea2-b222-44ab2024655a'::uuid);
  INSERT INTO time_off_requests
    (employee_id, employee_name, type, start_date, end_date, days, reason, status, tenant_id)
  VALUES
    (v_id, v_name, p_type, p_start_date, p_end_date, p_days, p_reason, 'pending', v_tenant);
  SELECT COALESCE(json_agg(DISTINCT email), '[]'::json) INTO v_emails
  FROM employees
  WHERE access IN ('Super Admin','Admin') AND email IS NOT NULL AND tenant_id = v_tenant;
  RETURN json_build_object('ok', true, 'admin_emails', v_emails);
END $function$;

CREATE OR REPLACE FUNCTION public.kiosk_timeoff_submit(p_employee_id text, p_type text, p_start_date date, p_end_date date, p_days numeric, p_reason text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_name text; v_emails json; v_tenant uuid;
BEGIN
  SELECT name INTO v_name FROM employees WHERE id = p_employee_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Unknown employee.'; END IF;
  IF p_end_date < p_start_date THEN RAISE EXCEPTION 'End date must be after start date.'; END IF;
  v_tenant := coalesce((SELECT tenant_id FROM employees WHERE id = p_employee_id),
                       '61a89aef-0e7e-4ea2-b222-44ab2024655a'::uuid);
  INSERT INTO time_off_requests
    (employee_id, employee_name, type, start_date, end_date, days, reason, status, tenant_id)
  VALUES
    (p_employee_id, v_name, p_type, p_start_date, p_end_date, p_days, p_reason, 'pending', v_tenant);
  SELECT COALESCE(json_agg(DISTINCT email), '[]'::json) INTO v_emails
  FROM employees
  WHERE access IN ('Super Admin','Admin') AND email IS NOT NULL AND tenant_id = v_tenant;
  RETURN json_build_object('ok', true, 'admin_emails', v_emails);
END $function$;

CREATE OR REPLACE FUNCTION public.portal_action_create_organizer(p_token text, p_year text, p_client_email text)
 RETURNS tax_organizer_responses LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE sess record; rec public.tax_organizer_responses; v_tenant uuid;
BEGIN
  SELECT * INTO sess FROM public.portal_sessions WHERE token = p_token AND expires_at > now();
  IF sess.token IS NULL THEN RAISE EXCEPTION 'Session expired'; END IF;
  v_tenant := coalesce((SELECT tenant_id FROM clients WHERE id = sess.client_id),
                       (SELECT tenant_id FROM leads WHERE id = sess.client_id),
                       '61a89aef-0e7e-4ea2-b222-44ab2024655a'::uuid);
  INSERT INTO public.tax_organizer_responses (client_name, client_email, tax_year, answers, status, created_at, updated_at, tenant_id)
  VALUES (sess.client_name, coalesce(p_client_email,''), p_year, '{}'::jsonb, 'In Progress', now(), now(), v_tenant)
  RETURNING * INTO rec;
  RETURN rec;
END $function$;

CREATE OR REPLACE FUNCTION public.portal_action_save_financial_profile(p_token text, p_expenses jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE sess record; v_tenant uuid;
BEGIN
  SELECT * INTO sess FROM public.portal_sessions WHERE token = p_token AND expires_at > now();
  IF sess.token IS NULL THEN RAISE EXCEPTION 'Session expired'; END IF;
  v_tenant := coalesce((SELECT tenant_id FROM clients WHERE id = sess.client_id),
                       (SELECT tenant_id FROM leads WHERE id = sess.client_id),
                       '61a89aef-0e7e-4ea2-b222-44ab2024655a'::uuid);
  INSERT INTO public.client_financial_profiles (client_name, expenses, updated_at, tenant_id)
  VALUES (sess.client_name, p_expenses, now(), v_tenant)
  ON CONFLICT (client_name) DO UPDATE SET expenses = excluded.expenses, updated_at = excluded.updated_at;
END $function$;

CREATE OR REPLACE FUNCTION public.portal_action_upload_document(p_token text, p_file_name text, p_doc_type text, p_file_url text, p_file_size bigint)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE sess record; v_tenant uuid;
BEGIN
  SELECT * INTO sess FROM public.portal_sessions WHERE token = p_token AND expires_at > now();
  IF sess.token IS NULL THEN RAISE EXCEPTION 'Session expired'; END IF;
  v_tenant := coalesce((SELECT tenant_id FROM clients WHERE id = sess.client_id),
                       (SELECT tenant_id FROM leads WHERE id = sess.client_id),
                       '61a89aef-0e7e-4ea2-b222-44ab2024655a'::uuid);
  INSERT INTO public.documents (name, client, "docType", notes, file_url, file_name, file_size, created_at, tenant_id)
  VALUES (p_file_name, sess.client_name, p_doc_type, 'Uploaded by client via portal', p_file_url, p_file_name, p_file_size, now(), v_tenant);
END $function$;
