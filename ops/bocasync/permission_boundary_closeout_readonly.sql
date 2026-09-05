-- BocaSync read-only production certification for the 0036-0038 hardening pass.
-- Safe to run after 0036_harden_save_appointment_permission.sql,
-- 0037_permission_boundary_hardening.sql, and
-- 0038_security_definer_permission_hardening.sql.
-- No rows are modified.

WITH required_policies(table_name, policy_name) AS (
  VALUES
    ('appointments','appointments_permission_select'),
    ('appointments','appointments_permission_insert'),
    ('appointments','appointments_permission_update'),
    ('clinical_exams','clinical_exams_permission_select'),
    ('clinical_exams','clinical_exams_permission_insert'),
    ('clinical_exams','clinical_exams_permission_update'),
    ('patient_communications','patient_communications_permission_select'),
    ('patient_documents','patient_documents_permission_select'),
    ('patient_payments','patient_payments_permission_select'),
    ('patient_payment_plans','patient_payment_plans_permission_select'),
    ('patient_insurance_policies','patient_insurance_policies_permission_select'),
    ('insurance_claims','insurance_claims_permission_select'),
    ('inbound_faxes','inbound_faxes_permission_select'),
    ('team_chat_channels','team_chat_channels_permission_select'),
    ('team_chat_messages','team_chat_messages_permission_select'),
    ('employee_pay_profiles','employee_pay_profiles_permission_select'),
    ('time_entries','time_entries_permission_select'),
    ('payroll_periods','payroll_periods_permission_select'),
    ('practice_user_permission_overrides','practice_user_permission_overrides_permission_select')
),
policy_status AS (
  SELECT
    rp.table_name,
    rp.policy_name,
    EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname='public'
        AND p.tablename=rp.table_name
        AND p.policyname=rp.policy_name
    ) AS present
  FROM required_policies rp
),
function_status AS (
  SELECT
    to_regprocedure('public.has_my_permission(uuid,text)') IS NOT NULL AS has_my_permission_exists,
    to_regprocedure('public.save_appointment(uuid,uuid,timestamptz,timestamptz,uuid,uuid,text,uuid)') IS NOT NULL AS save_appointment_exists,
    to_regprocedure('public.get_appointment_range(uuid,timestamptz,timestamptz)') IS NOT NULL AS get_appointment_range_exists,
    to_regprocedure('public.get_schedule_day(uuid,date)') IS NOT NULL AS get_schedule_day_exists,
    to_regprocedure('public.get_appointment_editor_options(uuid)') IS NOT NULL AS appointment_editor_options_exists,
    to_regprocedure('public.create_team_channel(uuid,text)') IS NOT NULL AS create_team_channel_exists,
    to_regprocedure('public.clock_in_self(uuid,text)') IS NOT NULL AS clock_in_self_exists,
    to_regprocedure('public.clock_out_self(uuid,integer,text)') IS NOT NULL AS clock_out_self_exists,
    to_regprocedure('public.approve_time_entry(uuid)') IS NOT NULL AS approve_time_entry_exists,
    to_regprocedure('public.get_payroll_summary(uuid,date,date)') IS NOT NULL AS get_payroll_summary_exists,
    to_regprocedure('public.create_patient_payment_plan(uuid,uuid,integer,integer,integer,text,date,text)') IS NOT NULL AS create_payment_plan_exists,
    to_regprocedure('public.set_practice_user_role(uuid,uuid,text)') IS NOT NULL AS set_practice_user_role_exists
),
function_defs AS (
  SELECT
    COALESCE(pg_get_functiondef(to_regprocedure('public.save_appointment(uuid,uuid,timestamptz,timestamptz,uuid,uuid,text,uuid)')) ILIKE '%schedule.manage%', false) AS save_requires_schedule_manage,
    COALESCE(pg_get_functiondef(to_regprocedure('public.get_appointment_range(uuid,timestamptz,timestamptz)')) ILIKE '%schedule.view%', false) AS range_requires_schedule_view,
    COALESCE(pg_get_functiondef(to_regprocedure('public.get_schedule_day(uuid,date)')) ILIKE '%schedule.view%', false) AS day_requires_schedule_view,
    COALESCE(pg_get_functiondef(to_regprocedure('public.create_team_channel(uuid,text)')) ILIKE '%team_chat.use%', false) AS channel_requires_team_chat,
    COALESCE(pg_get_functiondef(to_regprocedure('public.clock_in_self(uuid,text)')) ILIKE '%timeclock.clock_self%', false) AS clock_in_requires_permission,
    COALESCE(pg_get_functiondef(to_regprocedure('public.approve_time_entry(uuid)')) ILIKE '%timeclock.manage%', false) AS approve_requires_permission,
    COALESCE(pg_get_functiondef(to_regprocedure('public.get_payroll_summary(uuid,date,date)')) ILIKE '%payroll.view%', false) AS payroll_requires_view,
    COALESCE(pg_get_functiondef(to_regprocedure('public.create_patient_payment_plan(uuid,uuid,integer,integer,integer,text,date,text)')) ILIKE '%payment_plans.manage%', false) AS payment_plan_requires_manage,
    COALESCE(pg_get_functiondef(to_regprocedure('public.set_practice_user_role(uuid,uuid,text)')) ILIKE '%permissions.manage%', false) AS role_change_requires_permission
),
storage_status AS (
  SELECT
    EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='storage'
        AND tablename='objects'
        AND policyname='patient_documents_storage_select'
        AND qual ILIKE '%patient-documents%'
    ) AS patient_document_storage_read_scoped,
    EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='storage'
        AND tablename='objects'
        AND policyname='patient_documents_storage_insert'
        AND with_check ILIKE '%patient-documents%'
    ) AS patient_document_storage_write_scoped
)
SELECT
  (SELECT bool_and(present) FROM policy_status) AS required_permission_policies_ok,
  (SELECT count(*) FROM policy_status WHERE NOT present) AS missing_permission_policy_count,
  fs.*,
  fd.*,
  ss.*
FROM function_status fs
CROSS JOIN function_defs fd
CROSS JOIN storage_status ss;

-- Optional detail: this returns zero rows when every required policy exists.
WITH required_policies(table_name, policy_name) AS (
  VALUES
    ('appointments','appointments_permission_select'),
    ('appointments','appointments_permission_insert'),
    ('appointments','appointments_permission_update'),
    ('clinical_exams','clinical_exams_permission_select'),
    ('clinical_exams','clinical_exams_permission_insert'),
    ('clinical_exams','clinical_exams_permission_update'),
    ('patient_communications','patient_communications_permission_select'),
    ('patient_documents','patient_documents_permission_select'),
    ('patient_payments','patient_payments_permission_select'),
    ('patient_payment_plans','patient_payment_plans_permission_select'),
    ('patient_insurance_policies','patient_insurance_policies_permission_select'),
    ('insurance_claims','insurance_claims_permission_select'),
    ('inbound_faxes','inbound_faxes_permission_select'),
    ('team_chat_channels','team_chat_channels_permission_select'),
    ('team_chat_messages','team_chat_messages_permission_select'),
    ('employee_pay_profiles','employee_pay_profiles_permission_select'),
    ('time_entries','time_entries_permission_select'),
    ('payroll_periods','payroll_periods_permission_select'),
    ('practice_user_permission_overrides','practice_user_permission_overrides_permission_select')
)
SELECT rp.*
FROM required_policies rp
WHERE NOT EXISTS (
  SELECT 1 FROM pg_policies p
  WHERE p.schemaname='public'
    AND p.tablename=rp.table_name
    AND p.policyname=rp.policy_name
)
ORDER BY rp.table_name,rp.policy_name;
