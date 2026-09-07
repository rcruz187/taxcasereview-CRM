-- Harden RomyLabs billing/admin authorization after Supabase security-advisor review.
-- Anonymous callers must never be treated like trusted service-role callers merely
-- because auth.email() is NULL, and the billing dashboard must not retain PUBLIC
-- EXECUTE through PostgreSQL's default function privileges.

create or replace function public._is_platform_admin() returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.employees
      where lower(email) = lower(coalesce(auth.email(), ''))
        and access = 'Super Admin'
        and tenant_id = '61a89aef-0e7e-4ea2-b222-44ab2024655a'
    )
$$;

revoke all on function public._is_platform_admin() from public;
revoke all on function public._is_platform_admin() from anon;
grant execute on function public._is_platform_admin() to authenticated;
grant execute on function public._is_platform_admin() to service_role;

revoke all on function public.romylabs_billing_dashboard() from public;
revoke all on function public.romylabs_billing_dashboard() from anon;
grant execute on function public.romylabs_billing_dashboard() to authenticated;
grant execute on function public.romylabs_billing_dashboard() to service_role;
