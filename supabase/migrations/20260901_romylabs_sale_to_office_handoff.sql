-- Sales-to-office handoff migration. The schema is also applied directly to production.
alter table public.prospects add column if not exists tenant_id uuid references public.tenants(id) on delete set null;
alter table public.prospects add column if not exists converted_at timestamptz;
alter table public.romylabs_sales_agreements add column if not exists tenant_id uuid references public.tenants(id) on delete set null;
alter table public.romylabs_sales_agreements add column if not exists office_agreement_id uuid references public.office_agreements(id) on delete set null;

create or replace function public.admin_romylabs_attach_signed_agreement(p_agreement_id uuid, p_tenant_id uuid)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  a public.romylabs_sales_agreements%rowtype;
  p public.prospects%rowtype;
  v_doc_id uuid;
  v_path text;
begin
  if not public._is_platform_admin() then raise exception 'Not authorized'; end if;
  select * into a from public.romylabs_sales_agreements where id=p_agreement_id for update;
  if not found then raise exception 'Agreement not found'; end if;
  if a.status <> 'signed' then raise exception 'Agreement must be signed before office creation'; end if;
  if not exists(select 1 from public.tenants where id=p_tenant_id) then raise exception 'Office not found'; end if;
  select * into p from public.prospects where id=a.prospect_id;
  if a.tenant_id is not null and a.tenant_id <> p_tenant_id then raise exception 'Agreement is already linked to another office'; end if;

  v_path := 'sales-agreement:' || a.id::text;
  select id into v_doc_id from public.office_agreements where tenant_id=p_tenant_id and file_path=v_path limit 1;
  if v_doc_id is null then
    insert into public.office_agreements(tenant_id,file_name,file_path,file_size,label,uploaded_by)
    values(p_tenant_id,regexp_replace(coalesce(a.firm_name,'Office'),'[^A-Za-z0-9 _-]','','g') || ' - Signed SaaS Agreement.html',v_path,octet_length(coalesce(a.agreement_html,'')),coalesce(a.agreement_title,'Signed RomyLabs SaaS Agreement'),coalesce(a.sent_by,a.created_by,'info@romylabs.com'))
    returning id into v_doc_id;
  end if;

  update public.romylabs_sales_agreements set tenant_id=p_tenant_id,office_agreement_id=v_doc_id,updated_at=now() where id=a.id;
  update public.prospects set tenant_id=p_tenant_id,converted_at=coalesce(converted_at,now()),stage='Won',won_lost_date=coalesce(won_lost_date,current_date),next_action='Office created — begin onboarding',updated_at=now() where id=a.prospect_id;
  update public.tenants set primary_contact_name=coalesce(nullif(a.signer_name,''),primary_contact_name),primary_contact_email=coalesce(nullif(a.signer_email,''),primary_contact_email),contract_start_date=coalesce(contract_start_date,current_date),per_seat_rate=coalesce(a.price_per_seat,per_seat_rate),monthly_rate=coalesce(a.monthly_amount,monthly_rate),billing_seats=coalesce(a.seats,billing_seats),billing_notes=concat_ws(' | ',nullif(billing_notes,''),'Signed RomyLabs agreement '||a.id::text) where id=p_tenant_id;
  insert into public.romylabs_sales_agreement_events(agreement_id,event_type,event_at,metadata) values(a.id,'office_created',now(),jsonb_build_object('tenant_id',p_tenant_id,'office_agreement_id',v_doc_id));
  return jsonb_build_object('ok',true,'tenant_id',p_tenant_id,'agreement_id',a.id,'office_agreement_id',v_doc_id);
end $$;
revoke all on function public.admin_romylabs_attach_signed_agreement(uuid,uuid) from public,anon;
grant execute on function public.admin_romylabs_attach_signed_agreement(uuid,uuid) to authenticated,service_role;

create or replace function public.admin_romylabs_signed_agreement_html(p_agreement_id uuid)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare a public.romylabs_sales_agreements%rowtype;
begin
  if not public._is_platform_admin() then raise exception 'Not authorized'; end if;
  select * into a from public.romylabs_sales_agreements where id=p_agreement_id;
  if not found then raise exception 'Agreement not found'; end if;
  if a.status <> 'signed' then raise exception 'Agreement is not signed'; end if;
  return jsonb_build_object('id',a.id,'title',a.agreement_title,'html',a.agreement_html,'firm_name',a.firm_name,'signed_name',a.signed_name,'signed_at',a.signed_at,'signer_email',a.signer_email,'seats',a.seats,'price_per_seat',a.price_per_seat,'monthly_amount',a.monthly_amount);
end $$;
revoke all on function public.admin_romylabs_signed_agreement_html(uuid) from public,anon;
grant execute on function public.admin_romylabs_signed_agreement_html(uuid) to authenticated,service_role;

create or replace function public.get_office_full(p_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_t tenants%rowtype;
begin
  if not public._is_platform_admin() then raise exception 'Not authorized'; end if;
  select * into v_t from public.tenants where id=p_tenant_id;
  if not found then raise exception 'Tenant not found: %',p_tenant_id; end if;
  return jsonb_build_object(
    'tenant',row_to_json(v_t),
    'employees',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'email',e.email,'role',e.role,'access',e.access,'avatar_url',e.avatar_url,'created_at',e.created_at,'last_activity',(select max(al.created_at) from public.activity_log al where al.tenant_id=p_tenant_id and al.employee_email=e.email)) order by e.name),'[]'::jsonb) from public.employees e where e.tenant_id=p_tenant_id),
    'client_count',(select count(*) from public.clients c where c.tenant_id=p_tenant_id),
    'lead_count',(select count(*) from public.leads l where l.tenant_id=p_tenant_id),
    'storage_bytes',(select coalesce(sum(d.file_size),0) from public.documents d where d.tenant_id=p_tenant_id),
    'last_activity',(select max(al.created_at) from public.activity_log al where al.tenant_id=p_tenant_id),
    'recent_actions',(select coalesce(jsonb_agg(jsonb_build_object('action',aa.action,'admin_email',aa.admin_email,'created_at',aa.created_at,'detail',aa.detail) order by aa.created_at desc),'[]'::jsonb) from public.admin_actions aa where aa.target_tenant_id=p_tenant_id),
    'support_tickets',(select coalesce(jsonb_agg(jsonb_build_object('id',st.id,'subject',st.subject,'status',st.status,'priority',st.priority,'category',st.category,'submitted_by_name',st.submitted_by_name,'submitted_by_email',st.submitted_by_email,'created_at',st.created_at) order by st.created_at desc),'[]'::jsonb) from public.support_tickets st where st.tenant_id=p_tenant_id),
    'agreements',(select coalesce(jsonb_agg(jsonb_build_object('id',oa.id,'file_name',oa.file_name,'file_path',oa.file_path,'file_size',oa.file_size,'label',oa.label,'uploaded_by',oa.uploaded_by,'created_at',oa.created_at) order by oa.created_at desc),'[]'::jsonb) from public.office_agreements oa where oa.tenant_id=p_tenant_id)
  );
end $$;
revoke all on function public.get_office_full(uuid) from public,anon;
grant execute on function public.get_office_full(uuid) to authenticated,service_role;
