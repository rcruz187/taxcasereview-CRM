drop policy if exists avatars_anon_upload on storage.objects;
drop policy if exists avatars_anon_update on storage.objects;
drop policy if exists avatars_authenticated_upload on storage.objects;
drop policy if exists avatars_authenticated_update on storage.objects;

create policy avatars_authenticated_upload on storage.objects
for insert to authenticated
with check (
  bucket_id = 'avatars'
  and exists (
    select 1
    from public.employees e
    where lower(e.email) = lower(auth.jwt() ->> 'email')
      and e.tenant_id = public.current_tenant_id()
      and storage.objects.name like e.id::text || '-%'
  )
);

create policy avatars_authenticated_update on storage.objects
for update to authenticated
using (
  bucket_id = 'avatars'
  and exists (
    select 1
    from public.employees e
    where lower(e.email) = lower(auth.jwt() ->> 'email')
      and e.tenant_id = public.current_tenant_id()
      and storage.objects.name like e.id::text || '-%'
  )
)
with check (
  bucket_id = 'avatars'
  and exists (
    select 1
    from public.employees e
    where lower(e.email) = lower(auth.jwt() ->> 'email')
      and e.tenant_id = public.current_tenant_id()
      and storage.objects.name like e.id::text || '-%'
  )
);
