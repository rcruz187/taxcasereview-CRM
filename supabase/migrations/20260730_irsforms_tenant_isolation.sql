-- irsforms had RLS enabled but only an "are you logged in" policy — no
-- tenant_id at all, so every office would share the exact same IRS Form
-- Tracker log. Currently 0 rows (Romy hasn't logged one yet), so no data
-- migration needed, just adding the column + real tenant-scoped policy
-- before the first row ever gets written.
ALTER TABLE public.irsforms ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT current_tenant_id() REFERENCES public.tenants(id);

DROP POLICY IF EXISTS authenticated_only ON public.irsforms;
DROP POLICY IF EXISTS tenant_isolation ON public.irsforms;
CREATE POLICY tenant_isolation ON public.irsforms
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
