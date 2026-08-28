-- Command Center CRM tab reporting fixes.
-- 1) Make storage aggregation valid and explicit.
-- 2) Provide a TaxRes-only demo feed using calevents.product_id.

create or replace function public.admin_storage_stats()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_total_bytes bigint := 0;
  v_total_objects integer := 0;
  v_by_bucket jsonb := '{}'::jsonb;
begin
  if not public._is_platform_admin() then
    raise exception 'Not authorized.';
  end if;

  select coalesce(sum(coalesce((metadata->>'size')::bigint,0)),0), count(*)::int
    into v_total_bytes, v_total_objects
  from storage.objects;

  select coalesce(jsonb_object_agg(bucket_id, jsonb_build_object('bytes',bytes,'objects',objects)), '{}'::jsonb)
    into v_by_bucket
  from (
    select bucket_id,
           coalesce(sum(coalesce((metadata->>'size')::bigint,0)),0)::bigint as bytes,
           count(*)::int as objects
    from storage.objects
    group by bucket_id
  ) b;

  return jsonb_build_object(
    'total_bytes', v_total_bytes,
    'total_objects', v_total_objects,
    'by_bucket', v_by_bucket
  );
end;
$$;

revoke all on function public.admin_storage_stats() from public, anon;
grant execute on function public.admin_storage_stats() to authenticated, service_role;

create or replace function public.admin_taxres_demo_stats()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_today date := current_date;
begin
  if not public._is_platform_admin() then
    raise exception 'Not authorized.';
  end if;

  return jsonb_build_object(
    'today_count', (
      select count(*)
      from public.calevents
      where date::date = v_today
        and product_id = 'taxres_crm'
    ),
    'upcoming', (
      select coalesce(jsonb_agg(e order by e.start), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'id', id,
          'title', coalesce("clientName", title, 'Demo'),
          'start', date::text || 'T' || coalesce(time,'09:00'),
          'type', "eventType",
          'product_id', product_id,
          'tenant_id', tenant_id
        ) as e,
        (date::date + coalesce(nullif(time,''),'09:00')::time) as start
        from public.calevents
        where product_id = 'taxres_crm'
          and (date::date + coalesce(nullif(time,''),'09:00')::time) >= now()
        order by start
        limit 10
      ) q
    )
  );
end;
$$;

revoke all on function public.admin_taxres_demo_stats() from public, anon;
grant execute on function public.admin_taxres_demo_stats() to authenticated, service_role;
