-- ── Activity Log ─────────────────────────────────────────────────────────────
-- Central table for tracking everything every employee does in the CRM.
-- Run in: Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS activity_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  employee_name TEXT NOT NULL,
  employee_email TEXT,
  action       TEXT NOT NULL,        -- 'lead_created', 'email_sent', 'call_made', etc.
  category     TEXT NOT NULL,        -- 'lead', 'client', 'call', 'email', 'payment', 'esign', 'document', 'session', 'case', 'task'
  description  TEXT,                 -- Human-readable: "Added lead: Drew Williams"
  entity_name  TEXT,                 -- The lead/client name involved
  entity_id    TEXT,                 -- UUID of the lead/client/case
  meta         JSONB DEFAULT '{}'    -- Extra data: duration, amount, status, etc.
);

-- Enable RLS
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_open_activity_log ON activity_log FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_activity_log_employee  ON activity_log(employee_name);
CREATE INDEX IF NOT EXISTS idx_activity_log_created   ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_date      ON activity_log(DATE(created_at));
CREATE INDEX IF NOT EXISTS idx_activity_log_category  ON activity_log(category);

SELECT 'activity_log table created' AS status;
