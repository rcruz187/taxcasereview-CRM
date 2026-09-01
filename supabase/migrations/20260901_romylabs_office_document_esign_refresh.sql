create or replace function public.admin_romylabs_refresh_office_signing_link(p_document_id uuid,p_expires_days integer default 14)
returns jsonb language plpgsql security definer set search_path=public,extensions
as $$
declare v_token text; v_hash text; v_row public.romylabs_office_signing_documents;
begin
  if not public._is_platform_admin() then raise exception 'not authorized'; end if;
  select * into v_row from public.romylabs_office_signing_documents where id=p_document_id;
  if not found then return jsonb_build_object('ok',false,'error','not found'); end if;
  if v_row.status in ('signed','void') then return jsonb_build_object('ok',false,'error','document cannot be resent'); end if;
  v_token:=encode(gen_random_bytes(32),'hex');
  v_hash:=encode(digest(v_token,'sha256'),'hex');
  update public.romylabs_office_signing_documents
  set token_hash=v_hash,status='sent',sent_at=now(),expires_at=now()+make_interval(days=>greatest(coalesce(p_expires_days,14),1)),updated_at=now(),audit=audit||jsonb_build_array(jsonb_build_object('event','resent','at',now(),'actor',coalesce(auth.jwt()->>'email','platform-admin')))
  where id=p_document_id;
  return jsonb_build_object('ok',true,'id',p_document_id,'token',v_token,'sign_url','/office-sign/'||v_token,'signer_email',v_row.signer_email,'signer_name',v_row.signer_name,'title',v_row.title,'firm_name',v_row.firm_name);
end $$;
revoke all on function public.admin_romylabs_refresh_office_signing_link(uuid,integer) from public,anon;
grant execute on function public.admin_romylabs_refresh_office_signing_link(uuid,integer) to authenticated;
