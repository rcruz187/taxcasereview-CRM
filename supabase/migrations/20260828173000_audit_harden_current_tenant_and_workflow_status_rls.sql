-- Full-audit hardening: inactive employee sessions must not resolve a tenant,
-- and workflow status configuration must remain tenant-scoped.

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    case when public._is_platform_admin() then (
      select o.tenant_id
      from public.admin_tenant_overrides o
      where o.admin_email = lower(coalesce(auth.jwt()->>'email', auth.email(), ''))
        and o.updated_at > now() - interval '8 hours'
      limit 1
    ) end,
    (
      select t.id
      from public.tenants t
      join public.employees e on e.tenant_id = t.id
      where lower(e.email) = lower(coalesce(auth.jwt()->>'email', auth.email(), ''))
        and coalesce(lower(e.status), '') = 'active'
      limit 1
    )
  )
$$;

drop policy if exists authenticated_only on public.workflow_status_categories;
drop policy if exists authenticated_only on public.workflow_statuses;
