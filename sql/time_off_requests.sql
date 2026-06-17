-- ============================================================================
-- Time Off requests — same pattern as PHL Land Care's build, adapted to this
-- schema (employees here are matched by name, like timeentries already does,
-- not by a short employee_id code).
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================================

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS pto_balance      numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sick_balance     numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vacation_balance numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS time_off_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid REFERENCES employees(id) ON DELETE SET NULL,
  employee_name text NOT NULL,
  type          text NOT NULL CHECK (type IN ('pto','sick','vacation')),
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  days          numeric NOT NULL,
  reason        text,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','cancelled')),
  reviewed_by   text,
  reviewed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_off_employee ON time_off_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_time_off_status   ON time_off_requests(status);

CREATE OR REPLACE FUNCTION set_time_off_updated_at()
RETURNS TRIGGER AS $func$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_time_off_updated_at ON time_off_requests;
CREATE TRIGGER trg_time_off_updated_at
  BEFORE UPDATE ON time_off_requests
  FOR EACH ROW EXECUTE FUNCTION set_time_off_updated_at();

-- RLS: the /clockin kiosk is unauthenticated (anon key, no login), same as
-- timeentries already is, so requests must be insertable/readable by anon —
-- scoped so anon can never insert a pre-approved request.
ALTER TABLE time_off_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view time off requests" ON time_off_requests;
CREATE POLICY "Anyone can view time off requests" ON time_off_requests
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can create time off requests" ON time_off_requests;
CREATE POLICY "Anyone can create time off requests" ON time_off_requests
  FOR INSERT WITH CHECK (status = 'pending');

DROP POLICY IF EXISTS "Anyone can update time off requests" ON time_off_requests;
CREATE POLICY "Anyone can update time off requests" ON time_off_requests
  FOR UPDATE USING (true);

-- Rollback:
-- DROP TABLE IF EXISTS time_off_requests;
-- ALTER TABLE employees DROP COLUMN IF EXISTS pto_balance, DROP COLUMN IF EXISTS sick_balance, DROP COLUMN IF EXISTS vacation_balance;
