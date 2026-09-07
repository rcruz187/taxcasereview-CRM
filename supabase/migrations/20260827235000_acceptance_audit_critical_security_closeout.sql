-- Critical findings from final acceptance audit.
-- Private documents bucket must not be anonymously readable/writable.
drop policy if exists "Public read documents" on storage.objects;
drop policy if exists "Auth upload documents" on storage.objects;
drop policy if exists "documents bucket - allow all" on storage.objects;
drop policy if exists "documents bucket - allow all writes" on storage.objects;
create policy "documents_authenticated_select" on storage.objects for select to authenticated using (bucket_id='documents');
create policy "documents_authenticated_insert" on storage.objects for insert to authenticated with check (bucket_id='documents');
create policy "documents_authenticated_update" on storage.objects for update to authenticated using (bucket_id='documents') with check (bucket_id='documents');
create policy "documents_authenticated_delete" on storage.objects for delete to authenticated using (bucket_id='documents');

-- Vault helper is server-only.
revoke all on function public.get_secret(text) from public, anon, authenticated;
grant execute on function public.get_secret(text) to service_role;

-- Admin chat RPC must enforce platform-admin authorization.
create or replace function public.admin_get_all_chat_messages(p_limit integer default 300, p_channel text default null, p_tenant_id uuid default null)
returns table(id uuid, channel text, sender text, text text, created_at timestamptz, tenant_id uuid, huddle_id text, invite_to text, attachment_url text, attachment_name text, reply_to uuid)
language plpgsql security definer set search_path=public as $$
begin
  if not public._is_platform_admin() then raise exception 'Not authorized'; end if;
  return query select m.id,m.channel,m.sender,m.text,m.created_at,m.tenant_id,m.huddle_id,m.invite_to,m.attachment_url,m.attachment_name,m.reply_to
  from chat_messages m where (p_channel is null or m.channel=p_channel) and (p_tenant_id is null or m.tenant_id=p_tenant_id)
  order by m.created_at desc limit least(greatest(coalesce(p_limit,300),1),1000);
end $$;
revoke all on function public.admin_get_all_chat_messages(integer,text,uuid) from public, anon;
grant execute on function public.admin_get_all_chat_messages(integer,text,uuid) to authenticated, service_role;

-- Destructive purge RPCs are server-admin-only until dedicated guarded wrappers are used.
revoke all on function public.purge_client(text,boolean) from public, anon, authenticated;
revoke all on function public.purge_lead(text,boolean) from public, anon, authenticated;
grant execute on function public.purge_client(text,boolean) to service_role;
grant execute on function public.purge_lead(text,boolean) to service_role;

-- Remove anonymous execution from platform/admin/content/LinkedIn RPCs.
revoke execute on function public.admin_command_center_stats() from public, anon;
revoke execute on function public.admin_storage_stats() from public, anon;
revoke execute on function public.get_content_drafts(text,integer) from public, anon;
revoke execute on function public.get_linkedin_connection() from public, anon;
revoke execute on function public.get_linkedin_health() from public, anon;
revoke execute on function public.get_linkedin_posts(integer) from public, anon;
revoke execute on function public.get_linkedin_posts(text,integer) from public, anon;
revoke execute on function public.list_all_product_tickets(text,text,integer,integer) from public, anon;
revoke execute on function public.process_linkedin_responses() from public, anon;
revoke execute on function public.publish_due_linkedin_posts() from public, anon;
revoke execute on function public.save_content_draft(uuid,text,text) from public, anon;
revoke execute on function public.send_linkedin_alert(text,text) from public, anon;
revoke execute on function public.update_content_status(uuid,text,text) from public, anon;
revoke execute on function public.upsert_linkedin_post(uuid,text,text,timestamptz) from public, anon;
revoke execute on function public.upsert_linkedin_post(uuid,text,text,timestamptz,uuid) from public, anon;

-- Never trust user-editable user_metadata for platform authorization.
drop policy if exists platform_admin_only on public.romylabs_products;
create policy platform_admin_only on public.romylabs_products for all to authenticated using (public._is_platform_admin()) with check (public._is_platform_admin());