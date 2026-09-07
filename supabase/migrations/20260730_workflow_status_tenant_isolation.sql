-- workflow_status_categories/workflow_statuses had NO tenant_id at all —
-- every office would share and be able to edit the exact same global set of
-- task-status categories/labels. Fine invisibly with TCR as the only real
-- tenant; a real cross-office leak the moment a 2nd office uses Tasks.
-- Existing rows are TCR's real, in-use config, so they backfill to TCR
-- (not a guess — TCR is the only tenant that has ever used this feature).

ALTER TABLE public.workflow_status_categories ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.workflow_statuses          ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

UPDATE public.workflow_status_categories SET tenant_id = '61a89aef-0e7e-4ea2-b222-44ab2024655a'::uuid WHERE tenant_id IS NULL;
UPDATE public.workflow_statuses          SET tenant_id = '61a89aef-0e7e-4ea2-b222-44ab2024655a'::uuid WHERE tenant_id IS NULL;

ALTER TABLE public.workflow_status_categories ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.workflow_statuses          ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.workflow_status_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_statuses          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.workflow_status_categories;
CREATE POLICY tenant_isolation ON public.workflow_status_categories
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON public.workflow_statuses;
CREATE POLICY tenant_isolation ON public.workflow_statuses
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- New categories/statuses get created via INSERT calls from Settings.jsx —
-- those need a default so the client doesn't have to know its own tenant_id
-- (current_tenant_id() already resolves it server-side).
ALTER TABLE public.workflow_status_categories ALTER COLUMN tenant_id SET DEFAULT current_tenant_id();
ALTER TABLE public.workflow_statuses          ALTER COLUMN tenant_id SET DEFAULT current_tenant_id();
