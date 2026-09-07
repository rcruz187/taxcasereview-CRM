-- ============================================================================
-- Financial Profile Phase 2: Compliance grids (Pers Fed/State, CP Fed, Biz
-- 940/941/1120s), P&L module, and 433-F supplemental fields.
-- ============================================================================

-- One row per (client, form_type, tax_year[, quarter]).
-- form_type: '1040' | 'STATE' | 'CP' | '940' | '941' | '1120S'
CREATE TABLE IF NOT EXISTS client_compliance_records (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  client_name text NOT NULL,
  form_type text NOT NULL,
  tax_year integer NOT NULL,
  quarter integer, -- 1-4, only for CP and 941; NULL otherwise

  amount numeric,           -- assessed liability amount
  credits numeric,          -- payments/credits applied
  lien text,                -- lien filed? notes
  filed_status text,        -- "Filed", "Not Filed", "SFR", etc.
  assessment_date date,      -- used to auto-calc CSED (+10yrs)
  csed date,                 -- Collection Statute Expiration Date
  deposit numeric,          -- for 940/941: deposits made
  notes text,

  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),

  UNIQUE (client_name, form_type, tax_year, quarter)
);

ALTER TABLE client_compliance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated" ON client_compliance_records;
CREATE POLICY "Allow all for authenticated" ON client_compliance_records
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_compliance_client ON client_compliance_records (client_name);
CREATE INDEX IF NOT EXISTS idx_compliance_client_form ON client_compliance_records (client_name, form_type);


-- ─── P&L + 433-F supplemental fields on client_financial_profiles ──────────

-- P&L: base year income/deduction line items + array of "missing year" allocations
-- pl_base_year: { year, income: {gross_receipts, returns_allowances, total_receipts,
--   cogs, gross_profit, other_income}, deductions: {advertising, car_truck, ...} }
-- pl_missing_years: jsonb array, each: { year } — allocated amounts computed client-side
--   from pl_base_year ratios (matches workbook's H3/G3 * row formula)
ALTER TABLE client_financial_profiles ADD COLUMN IF NOT EXISTS pl_base_year jsonb DEFAULT '{}';
ALTER TABLE client_financial_profiles ADD COLUMN IF NOT EXISTS pl_missing_years jsonb DEFAULT '[]';

-- 433-F: a handful of fields not already on the profile (rest is pulled live
-- from Intake / Assets&Equity / I&E / Clients).
-- 433f_extra: { union_dues, court_ordered_alimony, other_expense_specify_1..4,
--   business_ein, business_type, num_employees, health_insurance_12mo, health_insurance_months }
ALTER TABLE client_financial_profiles ADD COLUMN IF NOT EXISTS f433_extra jsonb DEFAULT '{}';
