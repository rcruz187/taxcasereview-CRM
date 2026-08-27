-- Restrict platform-level admin, LinkedIn credential, and demo mutation data.
drop policy if exists admin_actions_staff on public.admin_actions;
create policy admin_actions_platform_admin
  on public.admin_actions for all to authenticated
  using (_is_platform_admin())
  with check (_is_platform_admin());

drop policy if exists linkedin_credentials_auth on public.linkedin_credentials;
create policy linkedin_credentials_platform_admin
  on public.linkedin_credentials for all to authenticated
  using (_is_platform_admin())
  with check (_is_platform_admin());

drop policy if exists linkedin_posts_auth on public.linkedin_posts;
create policy linkedin_posts_tenant_or_admin
  on public.linkedin_posts for all to authenticated
  using (_is_platform_admin() or tenant_id = current_tenant_id())
  with check (_is_platform_admin() or tenant_id = current_tenant_id());

drop policy if exists demo_profiles_write on public.demo_profiles;
create policy demo_profiles_platform_admin_write
  on public.demo_profiles for all to authenticated
  using (_is_platform_admin())
  with check (_is_platform_admin());
