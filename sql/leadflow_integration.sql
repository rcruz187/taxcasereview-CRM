-- ============================================================================
-- LeadFlow Integration — Scoped Access Functions
-- ============================================================================
-- These functions let LeadFlow create/update leads, open cases, and book
-- calendar appointments using ONLY the public anon key — no service_role
-- or secret key needed at all.
--
-- How it works: each function is "SECURITY DEFINER", meaning it runs with
-- the database owner's full permissions internally, but the function itself
-- only does exactly what's described below. LeadFlow can call these three
-- functions and nothing else — it cannot read/write any other table,
-- cannot see SSNs, documents, payments, etc.
--
-- To revoke LeadFlow's access entirely later: run
--   REVOKE EXECUTE ON FUNCTION leadflow_upsert_lead, leadflow_create_case,
--     leadflow_book_appointment FROM anon;
-- (or just DROP the three functions)
-- ============================================================================


-- 1) Create or update a lead. If a lead with this email already exists,
--    it updates that lead instead of creating a duplicate, and marks the
--    investigation fee as paid.
CREATE OR REPLACE FUNCTION leadflow_upsert_lead(
  p_name                     text,
  p_email                    text,
  p_phone                    text    DEFAULT NULL,
  p_irs_balance              text    DEFAULT NULL,
  p_issue_type               text    DEFAULT NULL,
  p_state                    text    DEFAULT NULL,
  p_county                   text    DEFAULT NULL,
  p_notes                    text    DEFAULT NULL,
  p_stripe_payment_id        text    DEFAULT NULL,
  p_stripe_customer_id       text    DEFAULT NULL,
  p_investigation_fee_amount numeric DEFAULT NULL,
  p_assigned_to              text    DEFAULT 'Dana Richard'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_id text;
BEGIN
  SELECT id INTO v_id FROM leads WHERE email = p_email LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE leads SET
      status                   = 'Tax Inv Fee Paid',
      stripe_payment_id         = COALESCE(p_stripe_payment_id, stripe_payment_id),
      stripe_customer_id        = COALESCE(p_stripe_customer_id, stripe_customer_id),
      investigation_fee_paid     = true,
      investigation_fee_amount   = COALESCE(p_investigation_fee_amount, investigation_fee_amount),
      "irsBalance"               = COALESCE(p_irs_balance, "irsBalance"),
      "issueType"                = COALESCE(p_issue_type, "issueType"),
      state                      = COALESCE(p_state, state),
      county                     = COALESCE(p_county, county),
      phone                      = COALESCE(p_phone, phone)
    WHERE id = v_id;
  ELSE
    INSERT INTO leads (
      name, email, phone, "irsBalance", "issueType", state, county, notes,
      status, source, "assignedTo",
      stripe_payment_id, stripe_customer_id, investigation_fee_paid, investigation_fee_amount,
      created_at
    ) VALUES (
      p_name, p_email, p_phone, p_irs_balance, p_issue_type, p_state, p_county, p_notes,
      'Tax Inv Fee Paid', 'TaxCase Review Web', p_assigned_to,
      p_stripe_payment_id, p_stripe_customer_id, true, p_investigation_fee_amount,
      now()
    ) RETURNING id INTO v_id;
  END IF;

  -- Notify the team in Chat — fires every time a client pays via the website
  INSERT INTO chat_messages (channel, sender, text, created_at)
  VALUES (
    'general', '🔔 System',
    '💰 New paid lead from the website: **' || p_name || '** (' || p_email || ')' ||
      CASE WHEN p_investigation_fee_amount IS NOT NULL
        THEN ' — paid $' || p_investigation_fee_amount
        ELSE '' END ||
      CASE WHEN p_issue_type IS NOT NULL THEN '. Issue: ' || p_issue_type ELSE '' END ||
      CASE WHEN p_irs_balance IS NOT NULL THEN '. IRS balance: ' || p_irs_balance ELSE '' END || '.',
    now()
  );

  RETURN v_id;
END;
$func$;

GRANT EXECUTE ON FUNCTION leadflow_upsert_lead(
  text, text, text, text, text, text, text, text, text, text, numeric, text
) TO anon;


-- 2) Create a case linked to a lead by lead_id (UUID-style FK) and by
--    clientName (for display in the CRM, matching existing convention).
CREATE OR REPLACE FUNCTION leadflow_create_case(
  p_lead_id     text,
  p_client_name text,
  p_case_type   text DEFAULT 'OIC',
  p_irs_balance text DEFAULT NULL,
  p_tax_years   text DEFAULT NULL,
  p_assigned_to text DEFAULT 'Dana Richard',
  p_notes       text DEFAULT 'Investigation fee paid. Case opened automatically via payment system.'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_id text;
BEGIN
  INSERT INTO cases (
    "clientName", "caseType", status, "irsBalance", "taxYears", "assignedTo",
    "irsOrState", notes, lead_id, created_at
  ) VALUES (
    p_client_name, p_case_type, 'Open', p_irs_balance, p_tax_years, p_assigned_to,
    'IRS Federal', p_notes, p_lead_id, now()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$func$;

GRANT EXECUTE ON FUNCTION leadflow_create_case(
  text, text, text, text, text, text, text
) TO anon;


-- 3) Book a calendar appointment. Uses the CRM's real calendar table
--    (calevents) with its actual column names — date/time/endTime/eventType,
--    NOT a "start"/"end" ISO timestamp + "type" field.
--    p_date format: 'YYYY-MM-DD'   p_time / p_end_time format: 'HH:MM' (24hr)
CREATE OR REPLACE FUNCTION leadflow_book_appointment(
  p_client_name text,
  p_date        text,
  p_time        text,
  p_end_time    text DEFAULT NULL,
  p_event_type  text DEFAULT 'Consultation Call',
  p_assigned_to text DEFAULT 'Dana Richard',
  p_notes       text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_id text;
BEGIN
  INSERT INTO calevents (
    title, "clientName", "assignedTo", date, time, "endTime", "eventType",
    color, notes, recurring, status, created_at
  ) VALUES (
    'Tax Investigation Consultation — ' || p_client_name,
    p_client_name, p_assigned_to, p_date, p_time, p_end_time, p_event_type,
    'bb', p_notes, 'none', 'scheduled', now()
  ) RETURNING id INTO v_id;

  -- Notify the team in Chat (same as a manually-booked appointment)
  INSERT INTO chat_messages (channel, sender, text, created_at)
  VALUES (
    'general', '🔔 System',
    '📅 New appointment booked online: **' || p_client_name || '** on ' || p_date ||
      CASE WHEN p_time IS NOT NULL THEN ' at ' || p_time ELSE '' END ||
      ' (' || p_event_type || ').',
    now()
  );

  RETURN v_id;
END;
$func$;

GRANT EXECUTE ON FUNCTION leadflow_book_appointment(
  text, text, text, text, text, text, text
) TO anon;
