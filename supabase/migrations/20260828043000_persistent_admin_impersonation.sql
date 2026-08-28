-- Make RomyLabs Admin "Jump In" impersonation durable across PostgREST connections.

create table if not exists public.admin_tenant_overrides (
  admin_email text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  updated_at timestamptz not null default now()
);

alter table public.admin_tenant_overrides enable row level security;
revoke all on table public.admin_tenant_overrides from public, anon, authenticated;
grant all on table public.admin_tenant_overrides to service_role;

create or replace function public.set_admin_tenant_override(p_tenant_id uuid)
returns void
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_email text := lower(coalesce(auth.jwt()->>'email', auth.email(), ''));
begin
  if not public._is_platform_admin() then raise exception 'Not authorized'; end if;
  if v_email = '' then raise exception 'Authenticated admin email required'; end if;

  if p_tenant_id is null then
    delete from public.admin_tenant_overrides where admin_email = v_email;
    return;
  end if;

  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'Tenant not found';
  end if;

  insert into public.admin_tenant_overrides(admin_email,tenant_id,updated_at)
  values(v_email,p_tenant_id,now())
  on conflict(admin_email) do update
    set tenant_id=excluded.tenant_id, updated_at=now();
end $$;

create or replace function public.current_tenant_id()
returns uuid
language sql stable security definer set search_path=public,pg_temp
as $$
  select coalesce(
    case when public._is_platform_admin() then (
      select o.tenant_id
      from public.admin_tenant_overrides o
      where o.admin_email = lower(coalesce(auth.jwt()->>'email', auth.email(), ''))
        and o.updated_at > now() - interval '8 hours'
      limit 1
    ) end,
    (select t.id from public.tenants t
      join public.employees e on e.tenant_id=t.id
      where lower(e.email)=lower(coalesce(auth.jwt()->>'email', auth.email(), ''))
      limit 1)
  )
$$;

revoke all on function public.set_admin_tenant_override(uuid) from public,anon;
grant execute on function public.set_admin_tenant_override(uuid) to authenticated,service_role;
revoke all on function public.current_tenant_id() from public,anon;
grant execute on function public.current_tenant_id() to authenticated,service_role;
