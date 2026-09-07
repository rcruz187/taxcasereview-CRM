alter table public.call_logs add column if not exists tenant_id uuid references public.tenants(id) default public.current_tenant_id();

update public.call_logs cl
set tenant_id = coalesce(
  (select c.tenant_id from public.clients c where c.id::text = cl.client_id limit 1),
  (select l.tenant_id from public.leads l where l.id::text = cl.lead_id limit 1),
  public.current_tenant_id()
)
where tenant_id is null;

do $$
begin
  if not exists (select 1 from public.call_logs where tenant_id is null) then
    alter table public.call_logs alter column tenant_id set not null;
  end if;
end $$;

drop policy if exists authenticated_only on public.call_logs;
drop policy if exists tenant_scoped_staff_only on public.call_logs;
create policy tenant_scoped_staff_only on public.call_logs
for all to public
using (auth.role() = 'authenticated' and tenant_id = public.current_tenant_id())
with check (auth.role() = 'authenticated' and tenant_id = public.current_tenant_id());

create index if not exists call_logs_tenant_created_idx
on public.call_logs(tenant_id, created_at desc);
