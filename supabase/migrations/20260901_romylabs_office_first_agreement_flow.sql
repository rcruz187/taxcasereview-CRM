create or replace function public.admin_romylabs_link_prospect_office(p_prospect_id uuid,p_tenant_id uuid)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare p public.prospects%rowtype;
begin
  if not public._is_platform_admin() then raise exception 'Not authorized'; end if;
  select * into p from public.prospects where id=p_prospect_id for update;
  if not found then raise exception 'Prospect not found'; end if;
  if not exists(select 1 from public.tenants where id=p_tenant_id) then raise exception 'Office not found'; end if;
  if p.tenant_id is not null and p.tenant_id<>p_tenant_id then raise exception 'Prospect already linked to another office'; end if;
  update public.prospects
     set tenant_id=p_tenant_id,
         converted_at=coalesce(converted_at,now()),
         stage='Won',
         won_lost_date=coalesce(won_lost_date,current_date),
         next_action='Send/complete agreement from Office Documents',
         updated_at=now()
   where id=p_prospect_id;
  return jsonb_build_object('ok',true,'prospect_id',p_prospect_id,'tenant_id',p_tenant_id);
end $$;
revoke all on function public.admin_romylabs_link_prospect_office(uuid,uuid) from public,anon;
grant execute on function public.admin_romylabs_link_prospect_office(uuid,uuid) to authenticated,service_role;

create or replace function public.admin_romylabs_prospect_for_tenant(p_tenant_id uuid)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare p public.prospects%rowtype;
begin
  if not public._is_platform_admin() then raise exception 'Not authorized'; end if;
  select * into p
    from public.prospects
   where tenant_id=p_tenant_id
   order by converted_at desc nulls last,updated_at desc
   limit 1;
  if not found then return null; end if;
  return to_jsonb(p);
end $$;
revoke all on function public.admin_romylabs_prospect_for_tenant(uuid) from public,anon;
grant execute on function public.admin_romylabs_prospect_for_tenant(uuid) to authenticated,service_role;
