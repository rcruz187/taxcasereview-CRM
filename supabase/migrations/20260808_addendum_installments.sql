-- When a Service Addendum is signed, auto-create the 3 scheduled payment
-- installments from the lead's trade1/trade2/trade3 amounts and dates.
-- This is called from esign_finalize when p_doc_type = 'Service Addendum'.

CREATE OR REPLACE FUNCTION create_addendum_installments(
  p_lead_name  text,
  p_tenant_id  uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_lead record;
BEGIN
  SELECT "trade1Amount","trade1Date","trade2Amount","trade2Date",
         "trade3Amount","trade3Date","contractFee", id
  INTO v_lead
  FROM leads
  WHERE name = p_lead_name AND tenant_id = p_tenant_id
  ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  -- Insert each trade as a scheduled payment (only if amount > 0 and date set)
  IF v_lead."trade1Amount" IS NOT NULL AND v_lead."trade1Date" IS NOT NULL THEN
    INSERT INTO payments (
      "clientName", amount, date, scheduled_date, status,
      trade_type, notes, payment_status, tenant_id, created_at
    ) VALUES (
      p_lead_name,
      v_lead."trade1Amount"::numeric,
      COALESCE(v_lead."trade1Date", to_char(now(),'YYYY-MM-DD')),
      v_lead."trade1Date",
      'Pending',
      '1st Trade',
      'Auto-created from signed Service Addendum',
      'scheduled',
      p_tenant_id,
      now()
    ) ON CONFLICT DO NOTHING;
  END IF;

  IF v_lead."trade2Amount" IS NOT NULL AND v_lead."trade2Date" IS NOT NULL THEN
    INSERT INTO payments (
      "clientName", amount, date, scheduled_date, status,
      trade_type, notes, payment_status, tenant_id, created_at
    ) VALUES (
      p_lead_name,
      v_lead."trade2Amount"::numeric,
      COALESCE(v_lead."trade2Date", to_char(now(),'YYYY-MM-DD')),
      v_lead."trade2Date",
      'Pending',
      '2nd Trade',
      'Auto-created from signed Service Addendum',
      'scheduled',
      p_tenant_id,
      now()
    ) ON CONFLICT DO NOTHING;
  END IF;

  IF v_lead."trade3Amount" IS NOT NULL AND v_lead."trade3Date" IS NOT NULL THEN
    INSERT INTO payments (
      "clientName", amount, date, scheduled_date, status,
      trade_type, notes, payment_status, tenant_id, created_at
    ) VALUES (
      p_lead_name,
      v_lead."trade3Amount"::numeric,
      COALESCE(v_lead."trade3Date", to_char(now(),'YYYY-MM-DD')),
      v_lead."trade3Date",
      'Pending',
      '3rd Trade',
      'Auto-created from signed Service Addendum',
      'scheduled',
      p_tenant_id,
      now()
    ) ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION create_addendum_installments(text, uuid) TO authenticated, anon;
