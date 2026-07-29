-- list_tenants: lets the TCR platform admin see every office that exists,
-- not just their own — tenants' normal RLS (tenant_self_read) only shows a
-- caller their OWN row, which is correct for regular tenant admins but means
-- there was previously no way to see the full roster. SECURITY DEFINER on
-- purpose, gated the same way as provision_tenant (TCR platform Super Admin,
-- or the service-role backend).
CREATE OR REPLACE FUNCTION public.list_tenants()
 RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_caller text := auth.email();
BEGIN
  IF v_caller IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM employees
    WHERE email = v_caller AND access = 'Super Admin'
      AND tenant_id = '61a89aef-0e7e-4ea2-b222-44ab2024655a'
  ) THEN
    RAISE EXCEPTION 'Not authorized to list offices.';
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id,
      'firm_name', t.firm_name,
      'tenant_code', t.tenant_code,
      'firm_phone', t.firm_phone,
      'plan_tier', t.plan_tier,
      'status', t.status,
      'brand_color', t.brand_color,
      'created_at', t.created_at,
      'employee_count', (SELECT count(*) FROM employees e WHERE e.tenant_id = t.id),
      'admin_email', (SELECT e.email FROM employees e WHERE e.tenant_id = t.id AND e.access = 'Super Admin' ORDER BY e.created_at LIMIT 1)
    ) ORDER BY t.created_at), '[]'::jsonb)
    FROM tenants t
  );
END $function$;
