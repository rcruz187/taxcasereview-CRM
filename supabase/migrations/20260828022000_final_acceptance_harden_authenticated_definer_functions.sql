CREATE OR REPLACE FUNCTION public.add_ticket_message(
  p_ticket_id uuid,
  p_sender text,
  p_message text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_ticket_tenant uuid;
  v_sender text;
  v_id uuid;
BEGIN
  SELECT tenant_id INTO v_ticket_tenant
  FROM public.support_tickets
  WHERE id = p_ticket_id;

  IF v_ticket_tenant IS NULL THEN RAISE EXCEPTION 'Ticket not found'; END IF;
  IF NOT public._is_platform_admin() AND v_ticket_tenant IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COALESCE(NULLIF(name,''), email) INTO v_sender
  FROM public.employees
  WHERE lower(email) = lower(coalesce(auth.email(),''))
    AND tenant_id = public.current_tenant_id()
  LIMIT 1;

  IF v_sender IS NULL AND public._is_platform_admin() THEN
    v_sender := coalesce(auth.email(), 'Platform Admin');
  END IF;
  IF v_sender IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;

  INSERT INTO public.support_ticket_messages(ticket_id, sender, message, is_internal)
  VALUES (p_ticket_id, v_sender, p_message, false)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_ticket_message_typed(
  p_ticket_id uuid,
  p_sender text,
  p_message text,
  p_internal boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_ticket_tenant uuid;
  v_sender text;
  v_id uuid;
BEGIN
  SELECT tenant_id INTO v_ticket_tenant
  FROM public.support_tickets
  WHERE id = p_ticket_id;

  IF v_ticket_tenant IS NULL THEN RAISE EXCEPTION 'Ticket not found'; END IF;
  IF NOT public._is_platform_admin() AND v_ticket_tenant IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF coalesce(p_internal,false) AND NOT public._is_platform_admin() THEN
    RAISE EXCEPTION 'Internal messages are platform-admin only';
  END IF;

  SELECT COALESCE(NULLIF(name,''), email) INTO v_sender
  FROM public.employees
  WHERE lower(email) = lower(coalesce(auth.email(),''))
    AND tenant_id = public.current_tenant_id()
  LIMIT 1;

  IF v_sender IS NULL AND public._is_platform_admin() THEN
    v_sender := coalesce(auth.email(), 'Platform Admin');
  END IF;
  IF v_sender IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;

  INSERT INTO public.support_ticket_messages(ticket_id, sender, message, is_internal)
  VALUES (p_ticket_id, v_sender, p_message, coalesce(p_internal,false))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_next_tax_associate()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_tenant uuid := public.current_tenant_id();
  associates text[];
  idx integer;
  chosen text;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT array_agg(name ORDER BY name) INTO associates
  FROM public.employees
  WHERE tenant_id = v_tenant
    AND access = 'Tax Associate'
    AND coalesce(status,'Active') = 'Active';

  IF associates IS NULL OR array_length(associates,1) = 0 THEN RETURN NULL; END IF;

  SELECT coalesce(last_round_robin_index,0) INTO idx
  FROM public.settings
  WHERE tenant_id = v_tenant
  LIMIT 1;

  idx := coalesce(idx,0) % array_length(associates,1);
  chosen := associates[idx + 1];

  UPDATE public.settings
  SET last_round_robin_index = idx + 1
  WHERE tenant_id = v_tenant;

  RETURN chosen;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_addendum_installments(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_addendum_installments(text, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.leadflow_book_appointment(text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leadflow_book_appointment(text, text, text, text, text, text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.leadflow_create_case(text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leadflow_create_case(text, text, text, text, text, text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.leadflow_upsert_lead(text, text, text, text, text, text, text, text, text, text, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leadflow_upsert_lead(text, text, text, text, text, text, text, text, text, text, numeric, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.assign_ticket_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_chat_channels() FROM PUBLIC, anon, authenticated;
