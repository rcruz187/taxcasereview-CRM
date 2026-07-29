-- "CRM Companies" / Office detail support: contract/agreement info, contacts,
-- deactivate/reactivate, and per-office agreement file uploads. Everything
-- here is gated the same way as provision_tenant/list_tenants — TCR platform
-- Super Admin only (or the service-role backend).

-- ── tenants: contract-facing fields not covered by existing columns ────────
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS primary_contact_name  text,
  ADD COLUMN IF NOT EXISTS primary_contact_email text,
  ADD COLUMN IF NOT EXISTS contract_start_date   date,
  ADD COLUMN IF NOT EXISTS contract_end_date     date,
  ADD COLUMN IF NOT EXISTS monthly_rate          numeric,
  ADD COLUMN IF NOT EXISTS notes                 text,
  ADD COLUMN IF NOT EXISTS deactivated_at         timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_reason     text;

-- ── office_agreements: uploaded contract/agreement files, one office can ───
-- have several over time (renewals, amendments) — a single logo-style column
-- isn't enough here.
CREATE TABLE IF NOT EXISTS public.office_agreements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  file_name    text NOT NULL,
  file_path    text NOT NULL,  -- path inside the PRIVATE office-agreements bucket
  file_size    bigint,
  label        text,            -- e.g. "Master Service Agreement", "2026 Renewal"
  uploaded_by  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.office_agreements ENABLE ROW LEVEL SECURITY;
-- No permissive policy: only the SECURITY DEFINER RPCs below (and service_role)
-- touch this table — same shape as portal_sessions/usage_metrics.

-- ── private storage bucket for agreement files (contracts should NOT be on a
-- guessable public URL the way firm-assets/documents are) ──────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('office-agreements', 'office-agreements', false)
ON CONFLICT (id) DO NOTHING;

-- Only the service role (edge functions) touches this bucket's objects —
-- no client-side policy needed since all access goes through RPCs/edge fns
-- that use the service key, matching the "no anon path" model already used
-- for portal_sessions.

-- ── shared platform-admin guard, reused by every RPC below ─────────────────
CREATE OR REPLACE FUNCTION public._is_platform_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT auth.email() IS NULL OR EXISTS (
    SELECT 1 FROM employees
    WHERE email = auth.email() AND access = 'Super Admin'
      AND tenant_id = '61a89aef-0e7e-4ea2-b222-44ab2024655a'
  )
$$;

-- ── get_office_detail: everything for one office's detail page ─────────────
CREATE OR REPLACE FUNCTION public.get_office_detail(p_tenant_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._is_platform_admin() THEN RAISE EXCEPTION 'Not authorized.'; END IF;
  RETURN jsonb_build_object(
    'tenant', (SELECT to_jsonb(t) FROM tenants t WHERE t.id = p_tenant_id),
    'employees', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'email',e.email,'access',e.access) ORDER BY e.name),'[]'::jsonb)
                  FROM employees e WHERE e.tenant_id = p_tenant_id),
    'agreements', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'id',a.id,'file_name',a.file_name,'file_path',a.file_path,'file_size',a.file_size,
                     'label',a.label,'uploaded_by',a.uploaded_by,'created_at',a.created_at
                   ) ORDER BY a.created_at DESC),'[]'::jsonb)
                   FROM office_agreements a WHERE a.tenant_id = p_tenant_id)
  );
END $function$;

-- ── update_office: edit contract/contact fields + phone numbers ────────────
CREATE OR REPLACE FUNCTION public.update_office(
  p_tenant_id uuid,
  p_patch jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed text[] := ARRAY['firm_name','firm_phone','firm_address','primary_contact_name',
    'primary_contact_email','contract_start_date','contract_end_date','monthly_rate','notes',
    'signalwire_phone_number','signalwire_project_id','plan_tier','brand_color'];
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
                WHEN k = 'monthly_rate' THEN 'numeric'
                ELSE 'text' END), ', ')
  INTO v_set FROM unnest(v_keys) k;
  EXECUTE format('UPDATE tenants SET %s WHERE id = $2', v_set) USING p_patch, p_tenant_id;
  RETURN jsonb_build_object('ok', true, 'updated', array_length(v_keys,1));
END $function$;

-- ── set_office_status: deactivate / reactivate ──────────────────────────────
CREATE OR REPLACE FUNCTION public.set_office_status(p_tenant_id uuid, p_status text, p_reason text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._is_platform_admin() THEN RAISE EXCEPTION 'Not authorized.'; END IF;
  IF p_status NOT IN ('trial','active','past_due','cancelled') THEN
    RAISE EXCEPTION 'Invalid status.';
  END IF;
  IF p_tenant_id = '61a89aef-0e7e-4ea2-b222-44ab2024655a' AND p_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot deactivate the TCR platform tenant.';
  END IF;
  UPDATE tenants SET
    status = p_status,
    deactivated_at = CASE WHEN p_status = 'cancelled' THEN now() ELSE NULL END,
    deactivated_reason = CASE WHEN p_status = 'cancelled' THEN p_reason ELSE NULL END
  WHERE id = p_tenant_id;
  RETURN jsonb_build_object('ok', true, 'status', p_status);
END $function$;

-- ── office_agreements CRUD (metadata only — file bytes handled by an edge fn
-- using the service key against the private bucket) ────────────────────────
CREATE OR REPLACE FUNCTION public.add_office_agreement(
  p_tenant_id uuid, p_file_name text, p_file_path text, p_file_size bigint, p_label text, p_uploaded_by text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT public._is_platform_admin() THEN RAISE EXCEPTION 'Not authorized.'; END IF;
  INSERT INTO office_agreements (tenant_id,file_name,file_path,file_size,label,uploaded_by)
  VALUES (p_tenant_id,p_file_name,p_file_path,p_file_size,p_label,p_uploaded_by)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $function$;

CREATE OR REPLACE FUNCTION public.delete_office_agreement(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_path text;
BEGIN
  IF NOT public._is_platform_admin() THEN RAISE EXCEPTION 'Not authorized.'; END IF;
  SELECT file_path INTO v_path FROM office_agreements WHERE id = p_id;
  DELETE FROM office_agreements WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'file_path', v_path);
END $function$;

-- list_tenants: surface status/deactivation so the office list can show it
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
      'employee_count', (SELECT count(*) FROM employees e WHERE e.tenant_id = t.id),
      'admin_email', (SELECT e.email FROM employees e WHERE e.tenant_id = t.id AND e.access = 'Super Admin' ORDER BY e.created_at LIMIT 1)
    ) ORDER BY t.created_at), '[]'::jsonb)
    FROM tenants t
  );
END $function$;
