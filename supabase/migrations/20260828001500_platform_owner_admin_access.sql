-- Align database platform authorization with the dedicated RomyLabs admin portal.
create or replace function public._is_platform_admin() returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    auth.role() = 'service_role'
    or lower(coalesce(auth.email(), '')) in (
      'info@romylabs.com',
      'romy@romylabs.com',
      'romy@taxrescrm.net',
      'romy@taxcasereview.org'
    )
    or exists (
      select 1 from public.employees
      where lower(email)=lower(coalesce(auth.email(),''))
        and access='Super Admin'
        and tenant_id='61a89aef-0e7e-4ea2-b222-44ab2024655a'
    )
$$;
revoke all on function public._is_platform_admin() from public, anon;
grant execute on function public._is_platform_admin() to authenticated, service_role;
