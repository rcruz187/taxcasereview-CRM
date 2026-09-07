-- provision_tenant: atomically stand up a new office (tenant) so onboarding is
-- an RPC call, not hand-written SQL. Creates the tenants row, a settings row,
-- and the firm's first Super Admin employee. The matching Supabase auth login
-- (so the admin can actually sign in — current_tenant_id() joins on
-- auth.email()) is minted separately by the provision-tenant edge function,
-- which calls this RPC as the trusted backend after verifying the caller.
--
-- Guard: a real logged-in caller must be a Super Admin of the TCR platform
-- tenant (61a89aef…). The service role (auth.email() null) is the trusted
-- backend and passes. Uniqueness is checked before any insert so the function
-- can never half-create an office.
CREATE OR REPLACE FUNCTION public.provision_tenant(
  p_firm_name   text,
  p_tenant_code text,
  p_admin_name  text,
  p_admin_email text,
  p_firm_phone  text DEFAULT NULL,
  p_brand_color text DEFAULT NULL,
  p_plan_tier   text DEFAULT 'starter'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant      uuid;
  v_settings_id text;
  v_emp_id      text;
  v_caller      text := auth.email();
  v_code        text := trim(p_tenant_code);
  v_email       text := lower(trim(p_admin_email));
  v_name        text := nullif(trim(coalesce(p_admin_name,'')),'');
  -- plan_tier is constrained to starter/growth/pro; anything else falls back.
  v_tier        text := lower(coalesce(nullif(trim(p_plan_tier),''),'starter'));
BEGIN
  IF v_tier NOT IN ('starter','growth','pro') THEN v_tier := 'starter'; END IF;
  IF v_caller IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM employees
    WHERE email = v_caller AND access = 'Super Admin'
      AND tenant_id = '61a89aef-0e7e-4ea2-b222-44ab2024655a'
  ) THEN
    RAISE EXCEPTION 'Not authorized to provision a tenant.';
  END IF;

  IF p_firm_name IS NULL OR trim(p_firm_name) = '' THEN RAISE EXCEPTION 'Firm name is required.'; END IF;
  IF v_code  IS NULL OR v_code  = '' THEN RAISE EXCEPTION 'Tenant code is required.'; END IF;
  IF v_email IS NULL OR v_email = '' THEN RAISE EXCEPTION 'Admin email is required.'; END IF;

  IF EXISTS (SELECT 1 FROM tenants WHERE lower(tenant_code) = lower(v_code)) THEN
    RAISE EXCEPTION 'Tenant code "%" is already in use.', v_code;
  END IF;
  -- current_tenant_id() resolves a user's tenant by employees.email, so the
  -- admin email must be globally unique across employees or resolution breaks.
  IF EXISTS (SELECT 1 FROM employees WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'An employee with email "%" already exists.', v_email;
  END IF;

  INSERT INTO tenants (firm_name, tenant_code, firm_phone, plan_tier, status, brand_color, created_at)
  VALUES (trim(p_firm_name), v_code, p_firm_phone, v_tier, 'trial', p_brand_color, now())
  RETURNING id INTO v_tenant;

  v_settings_id := 'tenant_' || replace(v_tenant::text, '-', '');
  INSERT INTO settings (id, tenant_id) VALUES (v_settings_id, v_tenant);

  INSERT INTO employees (name, email, access, tenant_id)
  VALUES (coalesce(v_name, split_part(v_email,'@',1)), v_email, 'Super Admin', v_tenant)
  RETURNING id INTO v_emp_id;

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', v_tenant,
    'tenant_code', v_code,
    'settings_id', v_settings_id,
    'admin_employee_id', v_emp_id,
    'admin_email', v_email
  );
END $function$;
