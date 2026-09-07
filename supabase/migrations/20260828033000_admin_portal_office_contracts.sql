-- Admin Portal closeout: make office-list/detail RPCs reproducible and owner-authorized.
-- These functions are SECURITY DEFINER but remain gated by _is_platform_admin().

create or replace function public.admin_tenant_overview()
returns table(
  id uuid,
  firm_name text,
  tenant_code text,
  plan_tier text,
  status text,
  brand_color text,
  created_at timestamptz,
  employee_count bigint,
  client_count bigint,
  lead_count bigint,
  cases_count bigint,
  tasks_count bigint,
  transactions_count bigint,
  transaction_count bigint,
  total_collected numeric,
  storage_bytes bigint,
  per_seat_rate numeric,
  monthly_rate numeric,
  effective_monthly numeric,
  last_activity timestamptz
)
language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  if not public._is_platform_admin() then raise exception 'Not authorized'; end if;
  return query
  select
    t.id,t.firm_name,t.tenant_code,t.plan_tier,t.status,t.brand_color,t.created_at,
    (select count(*) from public.employees e where e.tenant_id=t.id),
    (select count(*) from public.clients c where c.tenant_id=t.id),
    (select count(*) from public.leads l where l.tenant_id=t.id),
    (select count(*) from public.cases c where c.tenant_id=t.id),
    (select count(*) from public.tasks k where k.tenant_id=t.id),
    (select count(*) from public.payment_transactions p where p.tenant_id=t.id),
    (select count(*) from public.payment_transactions p where p.tenant_id=t.id),
    coalesce((select sum(coalesce(p.amount,0)) from public.payment_transactions p where p.tenant_id=t.id),0)::numeric,
    coalesce((select sum(coalesce(d.file_size,0)) from public.documents d where d.tenant_id=t.id),0)::bigint,
    t.per_seat_rate,t.monthly_rate,
    coalesce(t.monthly_rate,case when t.per_seat_rate is not null then (select count(*) from public.employees e where e.tenant_id=t.id)*t.per_seat_rate end),
    greatest(
      coalesce((select max(a.created_at) from public.activity_log a where a.tenant_id=t.id),'-infinity'::timestamptz),
      coalesce((select max(c.updated_at) from public.clients c where c.tenant_id=t.id),'-infinity'::timestamptz),
      coalesce((select max(l.updated_at) from public.leads l where l.tenant_id=t.id),'-infinity'::timestamptz)
    )
  from public.tenants t
  order by t.created_at;
end $$;

revoke all on function public.admin_tenant_overview() from public,anon;
grant execute on function public.admin_tenant_overview() to authenticated,service_role;

create or replace function public.get_office_full(p_tenant_id uuid)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_tenant jsonb;
begin
  if not public._is_platform_admin() then raise exception 'Not authorized'; end if;
  select to_jsonb(t) into v_tenant from public.tenants t where t.id=p_tenant_id;
  if v_tenant is null then raise exception 'Office not found'; end if;
  return jsonb_build_object(
    'tenant',v_tenant,
    'employees',(select coalesce(jsonb_agg(to_jsonb(e) order by e.name),'[]'::jsonb) from public.employees e where e.tenant_id=p_tenant_id),
    'client_count',(select count(*) from public.clients c where c.tenant_id=p_tenant_id),
    'lead_count',(select count(*) from public.leads l where l.tenant_id=p_tenant_id),
    'cases_count',(select count(*) from public.cases c where c.tenant_id=p_tenant_id),
    'tasks_count',(select count(*) from public.tasks k where k.tenant_id=p_tenant_id),
    'transaction_count',(select count(*) from public.payment_transactions p where p.tenant_id=p_tenant_id),
    'total_collected',coalesce((select sum(coalesce(p.amount,0)) from public.payment_transactions p where p.tenant_id=p_tenant_id),0),
    'storage_bytes',coalesce((select sum(coalesce(d.file_size,0)) from public.documents d where d.tenant_id=p_tenant_id),0),
    'last_activity',(select max(a.created_at) from public.activity_log a where a.tenant_id=p_tenant_id),
    'recent_actions',(select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) from (select a.* from public.admin_audit_log a where a.target_tenant_id=p_tenant_id order by a.created_at desc limit 20) x),
    'support_tickets',(select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) from (select s.* from public.support_tickets s where s.tenant_id=p_tenant_id order by s.created_at desc limit 20) x)
  );
end $$;
revoke all on function public.get_office_full(uuid) from public,anon;
grant execute on function public.get_office_full(uuid) to authenticated,service_role;

-- Legacy/new-office surface still calls list_tenants; explicitly secure and expose it to owner sessions.
revoke all on function public.list_tenants() from public,anon;
grant execute on function public.list_tenants() to authenticated,service_role;
