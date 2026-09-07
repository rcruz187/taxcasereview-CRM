create index if not exists idx_employees_active_email_tenant
  on public.employees (lower(email), tenant_id)
  where coalesce(lower(status),'')='active';

alter policy clients_select_perm on public.clients
  using (tenant_id = (select public.current_tenant_id()) and (select public.current_employee_permission('perm_clients')) >= 1);
alter policy clients_insert_perm on public.clients
  with check (tenant_id = (select public.current_tenant_id()) and (select public.current_employee_permission('perm_clients')) >= 2);
alter policy clients_update_perm on public.clients
  using (tenant_id = (select public.current_tenant_id()) and (select public.current_employee_permission('perm_clients')) >= 2)
  with check (tenant_id = (select public.current_tenant_id()) and (select public.current_employee_permission('perm_clients')) >= 2);
alter policy clients_delete_perm on public.clients
  using (tenant_id = (select public.current_tenant_id()) and (select public.current_employee_permission('perm_clients')) >= 3);

alter policy leads_select_perm on public.leads
  using (tenant_id = (select public.current_tenant_id()) and (select public.current_employee_permission('perm_leads')) >= 1);
alter policy leads_insert_perm on public.leads
  with check (tenant_id = (select public.current_tenant_id()) and (select public.current_employee_permission('perm_leads')) >= 2);
alter policy leads_update_perm on public.leads
  using (tenant_id = (select public.current_tenant_id()) and (select public.current_employee_permission('perm_leads')) >= 2)
  with check (tenant_id = (select public.current_tenant_id()) and (select public.current_employee_permission('perm_leads')) >= 2);
alter policy leads_delete_perm on public.leads
  using (tenant_id = (select public.current_tenant_id()) and (select public.current_employee_permission('perm_leads')) >= 3);

alter policy calevents_select_perm on public.calevents
  using (tenant_id = (select public.current_tenant_id()) and (select public.current_employee_permission('perm_schedule')) >= 1);
alter policy calevents_insert_perm on public.calevents
  with check (tenant_id = (select public.current_tenant_id()) and (select public.current_employee_permission('perm_schedule')) >= 2);
alter policy calevents_update_perm on public.calevents
  using (tenant_id = (select public.current_tenant_id()) and (select public.current_employee_permission('perm_schedule')) >= 2)
  with check (tenant_id = (select public.current_tenant_id()) and (select public.current_employee_permission('perm_schedule')) >= 2);
alter policy calevents_delete_perm on public.calevents
  using (tenant_id = (select public.current_tenant_id()) and (select public.current_employee_permission('perm_schedule')) >= 3);

alter policy chat_select_perm on public.chat_messages
  using (tenant_id = (select public.current_tenant_id()) and (select public.current_employee_permission('perm_comms')) >= 1);
alter policy chat_insert_perm on public.chat_messages
  with check (tenant_id = (select public.current_tenant_id()) and (select public.current_employee_permission('perm_comms')) >= 2);
alter policy chat_update_perm on public.chat_messages
  using (tenant_id = (select public.current_tenant_id()) and (select public.current_employee_permission('perm_comms')) >= 2)
  with check (tenant_id = (select public.current_tenant_id()) and (select public.current_employee_permission('perm_comms')) >= 2);
alter policy chat_delete_perm on public.chat_messages
  using (tenant_id = (select public.current_tenant_id()) and (select public.current_employee_permission('perm_comms')) >= 3);

alter policy esigns_select_perm on public.esigns
  using (tenant_id = (select public.current_tenant_id()) and (select public.current_employee_permission('perm_documents')) >= 1);
alter policy esigns_insert_perm on public.esigns
  with check (tenant_id = (select public.current_tenant_id()) and (select public.current_employee_permission('perm_documents')) >= 2);
alter policy esigns_update_perm on public.esigns
  using (tenant_id = (select public.current_tenant_id()) and (select public.current_employee_permission('perm_documents')) >= 2)
  with check (tenant_id = (select public.current_tenant_id()) and (select public.current_employee_permission('perm_documents')) >= 2);
alter policy esigns_delete_perm on public.esigns
  using (tenant_id = (select public.current_tenant_id()) and (select public.current_employee_permission('perm_documents')) >= 3);

alter policy tenant_isolation on public.tasks
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

alter policy tenant_scoped_staff_only on public.call_logs
  using (auth.role() = 'authenticated' and tenant_id = (select public.current_tenant_id()))
  with check (auth.role() = 'authenticated' and tenant_id = (select public.current_tenant_id()));
