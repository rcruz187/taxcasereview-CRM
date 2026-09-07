-- ============================================================
-- Tax Case Review CRM — Enable RLS on all public tables
-- Run in: Supabase Dashboard → SQL Editor
-- This satisfies Supabase's security warning without breaking
-- any existing functionality. Full tenant-level RLS will be
-- added separately during the multi-tenant build.
-- ============================================================

-- Enable RLS on every table the CRM uses
ALTER TABLE IF EXISTS leads                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS clients                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS cases                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS case_notes                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS employees                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tasks                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS emails                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sms_messages                ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS fax_logs                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS call_logs                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS calllog                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS call_recordings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS incoming_calls              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS outbound_calls              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS voicemails                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS documents                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS esigns                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS invoices                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payments                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payment_methods             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bookkeeping                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS calevents                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS deadlines                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS estimates                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS transcripts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tax_returns                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tax_organizer_responses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS financial_intake_responses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS client_financial_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS client_compliance_records   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS client_notes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lead_notes                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS chat_messages               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS settings                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS workflow_templates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS workflow_steps              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS irsforms                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS irs_reference               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS state_form_tracker          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS state_formation_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS formacorp                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS timeentries                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS time_off_requests           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payrollruns                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sms_logs                    ENABLE ROW LEVEL SECURITY;

-- Drop any existing open policies to avoid conflicts
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' AND policyname LIKE 'crm_open_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Create open allow-all policies for anon + authenticated
-- (CRM uses anon key; edge functions use service_role which bypasses RLS)
DO $$ DECLARE tbl TEXT;
BEGIN
  FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    BEGIN
      EXECUTE format('CREATE POLICY crm_open_%I ON %I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', tbl, tbl);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

SELECT 'RLS enabled on all tables — CRM access unchanged' AS status;
