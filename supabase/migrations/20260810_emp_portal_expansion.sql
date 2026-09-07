-- Employee Portal Expansion — Clients, Cases, SMS scoped to logged-in rep
-- All functions use the existing emp_token pattern for security

-- 1. emp_clients — returns clients assigned to this employee
CREATE OR REPLACE FUNCTION emp_clients(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_emp employees%ROWTYPE;
  v_result JSONB;
BEGIN
  SELECT * INTO v_emp FROM employees WHERE portal_token = p_token AND portal_token IS NOT NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'invalid token'); END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'phone', COALESCE(c.phone, c.mobile),
      'email', c.email,
      'status', c.status,
      'pipeline_stage', c.pipeline_stage,
      'balance', c.balance,
      'type', c.type
    ) ORDER BY c.name
  ) INTO v_result
  FROM clients c
  WHERE c.tenant_id = v_emp.tenant_id
    AND (c.associate = v_emp.name OR c.para = v_emp.name);

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- 2. emp_cases — returns cases assigned to this employee
CREATE OR REPLACE FUNCTION emp_cases(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_emp employees%ROWTYPE;
  v_result JSONB;
BEGIN
  SELECT * INTO v_emp FROM employees WHERE portal_token = p_token AND portal_token IS NOT NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'invalid token'); END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', ca.id,
      'client_name', cl.name,
      'client_phone', COALESCE(cl.phone, cl.mobile),
      'type', ca.type,
      'status', ca.status,
      'resolution', ca.resolution,
      'balance', ca.balance,
      'updated_at', ca.updated_at
    ) ORDER BY ca.updated_at DESC NULLS LAST
  ) INTO v_result
  FROM cases ca
  JOIN clients cl ON cl.id = ca.client_id
  WHERE ca.tenant_id = v_emp.tenant_id
    AND (ca.associate = v_emp.name OR ca.para = v_emp.name);

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- 3. emp_sms_threads — returns SMS threads for clients assigned to this rep
CREATE OR REPLACE FUNCTION emp_sms_threads(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_emp employees%ROWTYPE;
  v_result JSONB;
BEGIN
  SELECT * INTO v_emp FROM employees WHERE portal_token = p_token AND portal_token IS NOT NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'invalid token'); END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'client_id', c.id,
      'client_name', c.name,
      'phone', COALESCE(c.phone, c.mobile),
      'last_message', (
        SELECT body FROM sms_messages
        WHERE tenant_id = v_emp.tenant_id
          AND (from_number LIKE '%' || RIGHT(COALESCE(c.phone,c.mobile,''),10) || '%'
            OR to_number LIKE '%' || RIGHT(COALESCE(c.phone,c.mobile,''),10) || '%')
        ORDER BY created_at DESC LIMIT 1
      ),
      'last_at', (
        SELECT created_at FROM sms_messages
        WHERE tenant_id = v_emp.tenant_id
          AND (from_number LIKE '%' || RIGHT(COALESCE(c.phone,c.mobile,''),10) || '%'
            OR to_number LIKE '%' || RIGHT(COALESCE(c.phone,c.mobile,''),10) || '%')
        ORDER BY created_at DESC LIMIT 1
      )
    ) ORDER BY c.name
  ) INTO v_result
  FROM clients c
  WHERE c.tenant_id = v_emp.tenant_id
    AND (c.associate = v_emp.name OR c.para = v_emp.name)
    AND COALESCE(c.phone, c.mobile) IS NOT NULL;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION emp_clients(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION emp_cases(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION emp_sms_threads(TEXT) TO anon, authenticated;
