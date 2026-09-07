-- Per-seat pricing, adjustable per office by Romy from CRM Companies.
-- monthly_rate already exists (flat, hand-entered) — kept for a fixed/negotiated
-- override, but the real lever is per_seat_rate: employee_count × per_seat_rate
-- computed live, so it never goes stale as staff are added/removed. If
-- monthly_rate is set (non-null), it OVERRIDES the computed per-seat total —
-- covers a negotiated flat deal without losing the per-seat model for
-- everyone else.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS per_seat_rate numeric;

-- update_office already whitelists which tenants columns can be patched from
-- the UI (see get_office_detail/update_office in 20260729_office_detail.sql) —
-- add per_seat_rate to that whitelist so it's editable the same way contract
-- fields are.
CREATE OR REPLACE FUNCTION public.update_office(
  p_tenant_id uuid,
  p_patch jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed text[] := ARRAY['firm_name','firm_phone','firm_address','primary_contact_name',
    'primary_contact_email','contract_start_date','contract_end_date','monthly_rate','notes',
    'signalwire_phone_number','signalwire_project_id','plan_tier','brand_color','per_seat_rate'];
  v_set  text;
  v_keys text[];
BEGIN
  IF NOT public._is_platform_admin() THEN RAISE EXCEPTION 'Not authorized.'; END IF;
  SELECT array_agg(k) INTO v_keys FROM jsonb_object_keys(p_patch) k WHERE k = ANY(v_allowed);
  IF v_keys IS NULL OR array_length(v_keys,1) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'updated', 0);
  END IF;
  SELECT string_agg(format('%1$I = ($1->>%1$L)::%2$s', k,
           CASE WHEN k IN ('contract_start_date','contract_end_date') THEN 'date'
                WHEN k IN ('monthly_rate','per_seat_rate') THEN 'numeric'
                ELSE 'text' END), ', ')
  INTO v_set FROM unnest(v_keys) k;
  EXECUTE format('UPDATE tenants SET %s WHERE id = $2', v_set) USING p_patch, p_tenant_id;
  RETURN jsonb_build_object('ok', true, 'updated', array_length(v_keys,1));
END $function$;

-- get_office_detail: surface a computed billing summary alongside the raw
-- tenant row, so the UI doesn't have to recompute employee_count × rate itself.
CREATE OR REPLACE FUNCTION public.get_office_detail(p_tenant_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_seats int; v_seat_rate numeric; v_flat numeric;
BEGIN
  IF NOT public._is_platform_admin() THEN RAISE EXCEPTION 'Not authorized.'; END IF;
  SELECT count(*) INTO v_seats FROM employees WHERE tenant_id = p_tenant_id;
  SELECT per_seat_rate, monthly_rate INTO v_seat_rate, v_flat FROM tenants WHERE id = p_tenant_id;
  RETURN jsonb_build_object(
    'tenant', (SELECT to_jsonb(t) FROM tenants t WHERE t.id = p_tenant_id),
    'billing', jsonb_build_object(
      'seats', v_seats,
      'per_seat_rate', v_seat_rate,
      'computed_monthly', CASE WHEN v_seat_rate IS NOT NULL THEN v_seats * v_seat_rate ELSE NULL END,
      'flat_override', v_flat,
      'effective_monthly', coalesce(v_flat, CASE WHEN v_seat_rate IS NOT NULL THEN v_seats * v_seat_rate ELSE NULL END)
    ),
    'employees', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'email',e.email,'access',e.access) ORDER BY e.name),'[]'::jsonb)
                  FROM employees e WHERE e.tenant_id = p_tenant_id),
    'agreements', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'id',a.id,'file_name',a.file_name,'file_path',a.file_path,'file_size',a.file_size,
                     'label',a.label,'uploaded_by',a.uploaded_by,'created_at',a.created_at
                   ) ORDER BY a.created_at DESC),'[]'::jsonb)
                   FROM office_agreements a WHERE a.tenant_id = p_tenant_id)
  );
END $function$;

-- list_tenants: surface effective monthly billing on the office list too.
CREATE OR REPLACE FUNCTION public.list_tenants()
 RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._is_platform_admin() THEN RAISE EXCEPTION 'Not authorized to list offices.'; END IF;
  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'firm_name', t.firm_name, 'tenant_code', t.tenant_code,
      'firm_phone', t.firm_phone, 'plan_tier', t.plan_tier, 'status', t.status,
      'brand_color', t.brand_color, 'created_at', t.created_at,
      'deactivated_at', t.deactivated_at,
      'per_seat_rate', t.per_seat_rate,
      'employee_count', (SELECT count(*) FROM employees e WHERE e.tenant_id = t.id),
      'effective_monthly', coalesce(t.monthly_rate,
        CASE WHEN t.per_seat_rate IS NOT NULL
             THEN (SELECT count(*) FROM employees e WHERE e.tenant_id = t.id) * t.per_seat_rate
        END),
      'admin_email', (SELECT e.email FROM employees e WHERE e.tenant_id = t.id AND e.access = 'Super Admin' ORDER BY e.created_at LIMIT 1)
    ) ORDER BY t.created_at), '[]'::jsonb)
    FROM tenants t
  );
END $function$;
