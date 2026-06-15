-- ============================================================================
-- Employee IRS Credentials (CAF / PTIN / SOR)
-- Per-employee fields, visible only to admins + the employee themselves
-- (enforced in app, not RLS, to keep this simple/consistent with other
-- employee fields like hourlyRate which are also app-gated).
-- ============================================================================
ALTER TABLE employees ADD COLUMN IF NOT EXISTS caf TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS ptin TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS "sorShortId" TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS "sorUsername" TEXT;


-- ============================================================================
-- Shared IRS Reference Wiki
-- Phone numbers, addresses, state-specific info, and tips. Anyone can
-- add/edit (shared wiki style) — no RLS restrictions beyond standard
-- authenticated access.
-- ============================================================================
CREATE TABLE IF NOT EXISTS irs_reference (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  category    TEXT NOT NULL,        -- e.g. 'IRS Phone Numbers', 'Mailing Addresses', 'State Info', 'Tips & Procedures'
  title       TEXT NOT NULL,        -- e.g. 'Tax Practitioner Line', 'Audit Reconsideration'
  content     TEXT,                 -- the number / address / description
  notes       TEXT,                 -- extra detail (e.g. "option 2 personal, option 3 biz")
  state       TEXT,                 -- optional, for state-specific entries (e.g. 'FL', 'CA', or NULL for federal/general)
  sort_order  INTEGER DEFAULT 0,
  created_by  TEXT,                 -- email of who added it
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS but allow all authenticated users full read/write (shared wiki)
ALTER TABLE irs_reference ENABLE ROW LEVEL SECURITY;

DO $func$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'irs_reference' AND policyname = 'irs_reference_all_access'
  ) THEN
    CREATE POLICY irs_reference_all_access ON irs_reference
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$func$;


-- ============================================================================
-- Seed data: Romy's IRS rep info, IRS phone numbers, mailing address, tips
-- ============================================================================

-- Romy's personal IRS info (also settable per-employee via Employees page,
-- but seeded here as a reference entry too)
INSERT INTO irs_reference (category, title, content, notes, sort_order) VALUES
  ('Rep Info — Romy Cruz', 'CAF', '0312-27862R', NULL, 1),
  ('Rep Info — Romy Cruz', 'PTIN', 'P01982875', NULL, 2),
  ('Rep Info — Romy Cruz', 'SOR Short ID', 'JBF1CGA29O', NULL, 3),
  ('Rep Info — Romy Cruz', 'SOR Username', 'rcruz187', NULL, 4);

-- IRS Phone Numbers
INSERT INTO irs_reference (category, title, content, notes, sort_order) VALUES
  ('IRS Phone Numbers', 'Tax Practitioner Line', '866-860-4259', 'Option 2 for personal tax practitioner, option 3 for business tax practitioner', 1),
  ('IRS Phone Numbers', 'ACS (Automated Collection)', '800-829-3903 / 800-829-7650', NULL, 2),
  ('IRS Phone Numbers', 'Exempt Organizations', '877-829-5500', 'Option 4, then option 4 again', 3),
  ('IRS Phone Numbers', 'Examination Department', '866-897-0161', NULL, 4),
  ('IRS Phone Numbers', 'Appeals', '855-865-3401', NULL, 5),
  ('IRS Phone Numbers', 'Bankruptcy (BK) Department', '800-973-0424', NULL, 6),
  ('IRS Phone Numbers', 'Taxpayer Advocate Line', '877-777-4778', NULL, 7),
  ('IRS Phone Numbers', 'Taxpayer Protection Program', '800-830-5084', NULL, 8);

-- Audit Reconsideration
INSERT INTO irs_reference (category, title, content, notes, sort_order) VALUES
  ('Audit Reconsideration', 'Fax', '855-242-8479', NULL, 1),
  ('Audit Reconsideration', 'Mailing Address', 'Internal Revenue Service, 2970 Market St, Stop 4-E08.141, Philadelphia PA 19104', NULL, 2);

-- Tips & Procedures
INSERT INTO irs_reference (category, title, content, notes, sort_order) VALUES
  ('Tips & Procedures', '1065 Partnership Penalty Abatement', 'For 1065 Partnerships, request Revenue Procedure 84-35 to remove all penalties — the first-time penalty abatement is still available afterward.', NULL, 1);
