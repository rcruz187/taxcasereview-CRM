-- Close legacy permissive policies that exposed tenant financial/call data.
drop policy if exists crm_open_payment_transactions on public.payment_transactions;
create policy payment_transactions_tenant_staff
  on public.payment_transactions
  for all to authenticated
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

drop policy if exists crm_open_call_ai_summaries on public.call_ai_summaries;
create policy call_ai_summaries_tenant_staff
  on public.call_ai_summaries
  for all to authenticated
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());
