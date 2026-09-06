drop policy if exists marketing_gsc_snapshots_admin_read on public.marketing_gsc_snapshots;
create policy marketing_gsc_snapshots_admin_read
  on public.marketing_gsc_snapshots
  for select
  to authenticated
  using (public._is_platform_admin());
