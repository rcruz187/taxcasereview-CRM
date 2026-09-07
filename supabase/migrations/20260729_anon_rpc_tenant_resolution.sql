-- Multi-tenant correctness fix for anon-reachable SECURITY DEFINER RPCs.
-- Each previously stamped the hardcoded TCR tenant uuid on its INSERT, so any
-- second firm's portal / kiosk / employee-portal / intake writes silently filed
-- under TCR-001. Each now resolves the tenant from its own input and falls back
-- to TCR only when resolution yields nothing. For TCR this is behavior-
-- preserving: TCR clients/employees resolve to TCR's own tenant, identical to
-- the old literal. Signatures are byte-identical to the live definitions, so
-- CREATE OR REPLACE replaces in place (no PostgREST overload ambiguity).
-- TCR tenant uuid literal: 61a89aef-0e7e-4ea2-b222-44ab2024655a

-- ── Employee portal: clock in ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.emp_clock_in(p_token text, p_date text, p_in_time text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id text; v_name text; v_row timeentries; v_tenant text;
BEGIN
  SELECT o_employee_id, o_employee_name INTO v_id, v_name FROM emp_session(p_token);
  v_tenant := coalesce((SELECT tenant_id::text FROM employees WHERE id = v_id),
                       '61a89aef-0e7e-4ea2-b222-44ab2024655a');
  INSERT INTO timeentries (employee, date, "inTime", "outTime", hours, notes, method, tenant_id)
  VALUES (v_name, p_date, p_in_time, NULL, NULL, NULL, 'Employee Portal', v_tenant)
  RETURNING * INTO v_row;
  RETURN row_to_json(v_row);
END $function$;

-- ── Kiosk: clock in ────────────────────────────────────────────────────────
-- Kiosk passes only an employee NAME (no session, no tenant context). Resolve
-- the tenant from that employee. NOTE: a name shared across two firms is
-- ambiguous here — a true multi-firm kiosk should carry a tenant tag in its URL
-- (/clockin?t=<tenant_code>) and pass it through. Behavior-preserving for TCR.
CREATE OR REPLACE FUNCTION public.kiosk_clock_in(p_employee text, p_date text, p_in_time text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_row timeentries; v_tenant text;
BEGIN
  IF p_employee IS NULL OR trim(p_employee) = '' THEN
    RAISE EXCEPTION 'Employee is required.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM employees WHERE name = p_employee) THEN
    RAISE EXCEPTION 'Unknown employee.';
  END IF;
  v_tenant := coalesce((SELECT tenant_id::text FROM employees WHERE name = p_employee LIMIT 1),
                       '61a89aef-0e7e-4ea2-b222-44ab2024655a');
  INSERT INTO timeentries (employee, date, "inTime", "outTime", hours, notes, method, tenant_id)
  VALUES (p_employee, p_date, p_in_time, NULL, NULL, NULL, 'Kiosk', v_tenant)
  RETURNING * INTO v_row;
  RETURN row_to_json(v_row);
END $function$;

-- ── Employee portal: time-off request ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.emp_timeoff_submit(p_token text, p_type text, p_start_date date, p_end_date date, p_days numeric, p_reason text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id text; v_name text; v_emails json; v_tenant text;
BEGIN
  SELECT o_employee_id, o_employee_name INTO v_id, v_name FROM emp_session(p_token);
  IF p_end_date < p_start_date THEN RAISE EXCEPTION 'End date must be after start date.'; END IF;
  v_tenant := coalesce((SELECT tenant_id::text FROM employees WHERE id = v_id),
                       '61a89aef-0e7e-4ea2-b222-44ab2024655a');
  INSERT INTO time_off_requests
    (employee_id, employee_name, type, start_date, end_date, days, reason, status, tenant_id)
  VALUES
    (v_id, v_name, p_type, p_start_date, p_end_date, p_days, p_reason, 'pending', v_tenant);
  SELECT COALESCE(json_agg(DISTINCT email), '[]'::json) INTO v_emails
  FROM employees
  WHERE access IN ('Super Admin','Admin') AND email IS NOT NULL AND tenant_id::text = v_tenant;
  RETURN json_build_object('ok', true, 'admin_emails', v_emails);
END $function$;

-- ── Kiosk: time-off request ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kiosk_timeoff_submit(p_employee_id text, p_type text, p_start_date date, p_end_date date, p_days numeric, p_reason text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_name text; v_emails json; v_tenant text;
BEGIN
  SELECT name INTO v_name FROM employees WHERE id = p_employee_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Unknown employee.'; END IF;
  IF p_end_date < p_start_date THEN RAISE EXCEPTION 'End date must be after start date.'; END IF;
  v_tenant := coalesce((SELECT tenant_id::text FROM employees WHERE id = p_employee_id),
                       '61a89aef-0e7e-4ea2-b222-44ab2024655a');
  INSERT INTO time_off_requests
    (employee_id, employee_name, type, start_date, end_date, days, reason, status, tenant_id)
  VALUES
    (p_employee_id, v_name, p_type, p_start_date, p_end_date, p_days, p_reason, 'pending', v_tenant);
  SELECT COALESCE(json_agg(DISTINCT email), '[]'::json) INTO v_emails
  FROM employees
  WHERE access IN ('Super Admin','Admin') AND email IS NOT NULL AND tenant_id::text = v_tenant;
  RETURN json_build_object('ok', true, 'admin_emails', v_emails);
END $function$;

-- ── Client portal: create tax organizer ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.portal_action_create_organizer(p_token text, p_year text, p_client_email text)
 RETURNS tax_organizer_responses LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE sess record; rec public.tax_organizer_responses; v_tenant text;
BEGIN
  SELECT * INTO sess FROM public.portal_sessions WHERE token = p_token AND expires_at > now();
  IF sess.token IS NULL THEN RAISE EXCEPTION 'Session expired'; END IF;
  v_tenant := coalesce((SELECT tenant_id::text FROM clients WHERE id = sess.client_id),
                       (SELECT tenant_id::text FROM leads WHERE id = sess.client_id),
                       '61a89aef-0e7e-4ea2-b222-44ab2024655a');
  INSERT INTO public.tax_organizer_responses (client_name, client_email, tax_year, answers, status, created_at, updated_at, tenant_id)
  VALUES (sess.client_name, coalesce(p_client_email,''), p_year, '{}'::jsonb, 'In Progress', now(), now(), v_tenant)
  RETURNING * INTO rec;
  RETURN rec;
END $function$;

-- ── Client portal: save financial profile ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.portal_action_save_financial_profile(p_token text, p_expenses jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE sess record; v_tenant text;
BEGIN
  SELECT * INTO sess FROM public.portal_sessions WHERE token = p_token AND expires_at > now();
  IF sess.token IS NULL THEN RAISE EXCEPTION 'Session expired'; END IF;
  v_tenant := coalesce((SELECT tenant_id::text FROM clients WHERE id = sess.client_id),
                       (SELECT tenant_id::text FROM leads WHERE id = sess.client_id),
                       '61a89aef-0e7e-4ea2-b222-44ab2024655a');
  INSERT INTO public.client_financial_profiles (client_name, expenses, updated_at, tenant_id)
  VALUES (sess.client_name, p_expenses, now(), v_tenant)
  ON CONFLICT (client_name) DO UPDATE SET expenses = excluded.expenses, updated_at = excluded.updated_at;
END $function$;

-- ── Client portal: upload document ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.portal_action_upload_document(p_token text, p_file_name text, p_doc_type text, p_file_url text, p_file_size bigint)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE sess record; v_tenant text;
BEGIN
  SELECT * INTO sess FROM public.portal_sessions WHERE token = p_token AND expires_at > now();
  IF sess.token IS NULL THEN RAISE EXCEPTION 'Session expired'; END IF;
  v_tenant := coalesce((SELECT tenant_id::text FROM clients WHERE id = sess.client_id),
                       (SELECT tenant_id::text FROM leads WHERE id = sess.client_id),
                       '61a89aef-0e7e-4ea2-b222-44ab2024655a');
  INSERT INTO public.documents (name, client, "docType", notes, file_url, file_name, file_size, created_at, tenant_id)
  VALUES (p_file_name, sess.client_name, p_doc_type, 'Uploaded by client via portal', p_file_url, p_file_name, p_file_size, now(), v_tenant);
END $function$;

-- ── Financial intake submit: default profile tenant from the intake record ──
CREATE OR REPLACE FUNCTION public.financial_intake_submit(p_id text, p_answers jsonb, p_lead_patch jsonb, p_profile jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  rec record;
  update_set text;
  lead_rec record;
  assignee_email text;
  due_date date;
  profile_data jsonb;
  profile_error text;
  task_title text;
  existing_task_id text;
begin
  update public.financial_intake_responses
  set answers = p_answers, status = 'Submitted',
      submitted_at = now(), updated_at = now()
  where id::text = p_id
  returning * into rec;

  if rec.id is null then
    raise exception 'Intake record not found.';
  end if;

  begin
    if p_lead_patch is not null and p_lead_patch <> '{}'::jsonb then
      update public.leads l
      set
        dob = coalesce(l.dob, nullif(p_lead_patch->>'dob','')::date),
        "filingStatus" = coalesce(l."filingStatus", p_lead_patch->>'filingStatus'),
        county = coalesce(l.county, p_lead_patch->>'county')
      where l.name = rec.client_name;
    end if;
  exception when others then
    raise warning 'financial_intake_submit: lead patch failed: %', sqlerrm;
  end;

  begin
    if p_profile is not null and p_profile <> '{}'::jsonb then
      profile_data := p_profile;
      if not (profile_data ? 'tenant_id') then
        profile_data := profile_data || jsonb_build_object('tenant_id',
          coalesce(rec.tenant_id::text, '61a89aef-0e7e-4ea2-b222-44ab2024655a'));
      end if;
      if not (profile_data ? 'id') then
        profile_data := profile_data || jsonb_build_object('id', gen_random_uuid()::text);
      end if;

      select string_agg(format('%1$I = excluded.%1$I', key), ', ')
      into update_set
      from jsonb_object_keys(profile_data) as key
      where key not in ('client_name', 'id');

      if update_set is not null then
        execute format(
          'insert into public.client_financial_profiles select * from jsonb_populate_record(null::public.client_financial_profiles, %L) on conflict (client_name) do update set %s',
          profile_data,
          update_set
        );
      end if;
    end if;
  exception when others then
    profile_error := sqlerrm;
    raise warning 'financial_intake_submit: profile upsert failed: %', sqlerrm;
  end;

  begin
    select id, name, "assignedTo" into lead_rec from public.leads where name = rec.client_name limit 1;
    due_date := (current_date + 1);
    task_title := '🧾 Review financial intake — build resolution plan for ' || lead_rec.name;

    if lead_rec.id is not null then
      select id into existing_task_id from public.tasks
      where "clientName" = lead_rec.name and title = task_title limit 1;

      if existing_task_id is null then
        insert into public.tasks (title, "clientName", priority, "dueDate", done, "assignedTo", notes, created_at)
        values (
          task_title, lead_rec.name, 'High', due_date, false,
          coalesce(lead_rec."assignedTo", 'Unassigned'),
          'Client just submitted their financial intake. Review the Financial Profile (I&E, Assets & Equity tabs) and cross-reference with case details to determine the best resolution path (OIC, IA, CNC, etc.).',
          now()
        );

        insert into public.lead_notes (lead_id, lead_name, text, type, author, created_at)
        values (
          lead_rec.id, lead_rec.name,
          '🧾 Client submitted their Financial Intake form.',
          'System', 'System (Financial Intake)', now()
        );
      end if;

      if lead_rec."assignedTo" is not null then
        select email into assignee_email from public.employees
        where lower(name) = lower(lead_rec."assignedTo") limit 1;
      end if;
    end if;
  exception when others then
    raise warning 'financial_intake_submit: task/note/notification lookup failed: %', sqlerrm;
  end;

  return jsonb_build_object(
    'record', to_jsonb(rec),
    'assigneeName', lead_rec."assignedTo",
    'assigneeEmail', assignee_email,
    'profileError', profile_error
  );
end;
$function$;
