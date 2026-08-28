-- Exact Supabase Storage usage for TCR Settings / platform owner views.
-- Previous authorization used COALESCE(access, role), which rejected valid
-- Super Admin users whose legacy access value is "Staff" but role is
-- "Super Admin". Check both columns independently instead.

create or replace function public.get_project_storage_usage()
returns jsonb
language plpgsql
security definer
set search_path = public, storage, auth, pg_temp
as $$
declare
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_allowed boolean := false;
  v_result jsonb;
begin
  select exists (
    select 1
    from public.employees e
    where lower(e.email) = v_email
      and (
        coalesce(e.access,'') in ('Super Admin','Admin')
        or coalesce(e.role,'') in ('Super Admin','Admin')
      )
      and coalesce(e.status,'Active') = 'Active'
  ) into v_allowed;

  if not v_allowed then
    raise exception 'Not authorized to view project storage usage';
  end if;

  with bucket_usage as (
    select
      bucket_id,
      count(*)::bigint as objects,
      coalesce(sum(coalesce(nullif(metadata->>'size','')::bigint,0)),0)::bigint as bytes
    from storage.objects
    group by bucket_id
  )
  select jsonb_build_object(
    'total_bytes', coalesce(sum(bytes),0),
    'total_objects', coalesce(sum(objects),0),
    'buckets', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'bucket_id', bucket_id,
          'objects', objects,
          'bytes', bytes
        ) order by bytes desc
      ),
      '[]'::jsonb
    ),
    'measured_at', now()
  )
  into v_result
  from bucket_usage;

  return v_result;
end;
$$;

revoke all on function public.get_project_storage_usage() from public, anon;
grant execute on function public.get_project_storage_usage() to authenticated, service_role;
