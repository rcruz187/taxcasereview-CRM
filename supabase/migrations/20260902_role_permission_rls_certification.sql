begin;

-- Platform administration is limited to the service role and explicit RomyLabs
-- owner identities. A tenant Super Admin is not a platform-wide administrator.
create or replace function public._is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.role() = 'service_role'
    or lower(coalesce(auth.jwt()->>'email', auth.email(), '')) in (
      'info@romylabs.com',
      'romy@romylabs.com',
      'romy@taxrescrm.net',
      'romy@taxcasereview.org'
    );
$$;

create or replace function public.current_employee_permission(p_column text)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v integer;
begin
  if auth.role() = 'service_role' or public._is_platform_admin() then
    return 3;
  end if;

  if p_column not in ('perm_leads','perm_clients','perm_billing','perm_schedule','perm_documents','perm_irs','perm_comms','perm_reports','perm_hr','perm_settings') then
    return 0;
  end if;

  execute format(
    'select coalesce(%I,0)::int from public.employees where lower(email)=lower($1) and tenant_id=public.current_tenant_id() and coalesce(lower(status),'''')=''active'' limit 1',
    p_column
  ) into v using coalesce(auth.jwt()->>'email', auth.email(), '');
  return coalesce(v,0);
end;
$$;

revoke all on function public.current_employee_permission(text) from public, anon;
grant execute on function public.current_employee_permission(text) to authenticated, service_role;

-- Leads
alter table public.leads enable row level security;
drop policy if exists tenant_isolation on public.leads;
drop policy if exists tenant_scoped_staff_only on public.leads;
create policy leads_select_perm on public.leads for select to authenticated using (tenant_id=public.current_tenant_id() and public.current_employee_permission('perm_leads')>=1);
create policy leads_insert_perm on public.leads for insert to authenticated with check (tenant_id=public.current_tenant_id() and public.current_employee_permission('perm_leads')>=2);
create policy leads_update_perm on public.leads for update to authenticated using (tenant_id=public.current_tenant_id() and public.current_employee_permission('perm_leads')>=2) with check (tenant_id=public.current_tenant_id() and public.current_employee_permission('perm_leads')>=2);
create policy leads_delete_perm on public.leads for delete to authenticated using (tenant_id=public.current_tenant_id() and public.current_employee_permission('perm_leads')>=3);

-- Clients
alter table public.clients enable row level security;
drop policy if exists tenant_isolation on public.clients;
drop policy if exists tenant_scoped_staff_only on public.clients;
create policy clients_select_perm on public.clients for select to authenticated using (tenant_id=public.current_tenant_id() and public.current_employee_permission('perm_clients')>=1);
create policy clients_insert_perm on public.clients for insert to authenticated with check (tenant_id=public.current_tenant_id() and public.current_employee_permission('perm_clients')>=2);
create policy clients_update_perm on public.clients for update to authenticated using (tenant_id=public.current_tenant_id() and public.current_employee_permission('perm_clients')>=2) with check (tenant_id=public.current_tenant_id() and public.current_employee_permission('perm_clients')>=2);
create policy clients_delete_perm on public.clients for delete to authenticated using (tenant_id=public.current_tenant_id() and public.current_employee_permission('perm_clients')>=3);

-- Meetings/calendar
alter table public.calevents enable row level security;
drop policy if exists tenant_isolation on public.calevents;
drop policy if exists tenant_scoped_staff_only on public.calevents;
create policy calevents_select_perm on public.calevents for select to authenticated using (tenant_id=public.current_tenant_id() and public.current_employee_permission('perm_schedule')>=1);
create policy calevents_insert_perm on public.calevents for insert to authenticated with check (tenant_id=public.current_tenant_id() and public.current_employee_permission('perm_schedule')>=2);
create policy calevents_update_perm on public.calevents for update to authenticated using (tenant_id=public.current_tenant_id() and public.current_employee_permission('perm_schedule')>=2) with check (tenant_id=public.current_tenant_id() and public.current_employee_permission('perm_schedule')>=2);
create policy calevents_delete_perm on public.calevents for delete to authenticated using (tenant_id=public.current_tenant_id() and public.current_employee_permission('perm_schedule')>=3);

-- E-sign
alter table public.esigns enable row level security;
drop policy if exists tenant_isolation on public.esigns;
drop policy if exists tenant_scoped_staff_only on public.esigns;
create policy esigns_select_perm on public.esigns for select to authenticated using (tenant_id=public.current_tenant_id() and public.current_employee_permission('perm_documents')>=1);
create policy esigns_insert_perm on public.esigns for insert to authenticated with check (tenant_id=public.current_tenant_id() and public.current_employee_permission('perm_documents')>=2);
create policy esigns_update_perm on public.esigns for update to authenticated using (tenant_id=public.current_tenant_id() and public.current_employee_permission('perm_documents')>=2) with check (tenant_id=public.current_tenant_id() and public.current_employee_permission('perm_documents')>=2);
create policy esigns_delete_perm on public.esigns for delete to authenticated using (tenant_id=public.current_tenant_id() and public.current_employee_permission('perm_documents')>=3);

-- Team Chat
alter table public.chat_messages enable row level security;
drop policy if exists chat_messages_access on public.chat_messages;
drop policy if exists tenant_isolation on public.chat_messages;
create policy chat_select_perm on public.chat_messages for select to authenticated using (tenant_id=public.current_tenant_id() and public.current_employee_permission('perm_comms')>=1);
create policy chat_insert_perm on public.chat_messages for insert to authenticated with check (tenant_id=public.current_tenant_id() and public.current_employee_permission('perm_comms')>=2);
create policy chat_update_perm on public.chat_messages for update to authenticated using (tenant_id=public.current_tenant_id() and public.current_employee_permission('perm_comms')>=2) with check (tenant_id=public.current_tenant_id() and public.current_employee_permission('perm_comms')>=2);
create policy chat_delete_perm on public.chat_messages for delete to authenticated using (tenant_id=public.current_tenant_id() and public.current_employee_permission('perm_comms')>=3);

commit;
