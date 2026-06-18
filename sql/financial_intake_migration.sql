-- Financial Intake — new client-facing financial breakdown form (separate from
-- the Tax Organizer / tax_organizer_responses table, which is for return prep).
CREATE TABLE IF NOT EXISTS financial_intake_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text,
  client_email text,
  status text DEFAULT 'Sent',
  answers jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  submitted_at timestamptz
);

ALTER TABLE financial_intake_responses ENABLE ROW LEVEL SECURITY;

-- Public can read/update their own row by id (the link itself is the auth —
-- same trust model as tax_organizer_responses/sign tokens already in use).
CREATE POLICY IF NOT EXISTS "financial_intake_public_select" ON financial_intake_responses
  FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "financial_intake_public_update" ON financial_intake_responses
  FOR UPDATE USING (true);
CREATE POLICY IF NOT EXISTS "financial_intake_public_insert" ON financial_intake_responses
  FOR INSERT WITH CHECK (true);
