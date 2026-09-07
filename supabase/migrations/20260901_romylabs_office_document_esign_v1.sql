-- DocuSign-style office document e-signing for every RomyLabs product office.
create extension if not exists pgcrypto;

create table if not exists public.romylabs_office_signing_documents (
  id uuid primary key default gen_random_uuid(),
  product_key text not null,
  external_office_id text not null,
  firm_name text not null,
  title text not null,
  source_filename text not null,
  source_mime text not null default 'application/pdf',
  source_path text not null,
  signed_path text,
  signer_name text,
  signer_email text not null,
  fields jsonb not null default '[]'::jsonb,
  token_hash text not null unique,
  status text not null default 'draft' check (status in ('draft','sent','viewed','signed','declined','void','expired')),
  sent_at timestamptz,
  opened_at timestamptz,
  signed_at timestamptz,
  voided_at timestamptz,
  expires_at timestamptz,
  signature_name text,
  signer_ip text,
  signer_user_agent text,
  audit jsonb not null default '[]'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists romylabs_office_signing_docs_office_idx
  on public.romylabs_office_signing_documents(product_key, external_office_id, created_at desc);

alter table public.romylabs_office_signing_documents enable row level security;
drop policy if exists "platform admins manage office signing documents" on public.romylabs_office_signing_documents;
create policy "platform admins manage office signing documents" on public.romylabs_office_signing_documents
for all to authenticated using (public._is_platform_admin()) with check (public._is_platform_admin());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('romylabs-esign','romylabs-esign',false,26214400,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=26214400,allowed_mime_types=array['application/pdf'];

drop policy if exists "platform admins manage romylabs esign files" on storage.objects;
create policy "platform admins manage romylabs esign files" on storage.objects
for all to authenticated using (bucket_id='romylabs-esign' and public._is_platform_admin())
with check (bucket_id='romylabs-esign' and public._is_platform_admin());

create or replace function public.admin_romylabs_create_office_signing_document(
  p_product_key text,p_external_office_id text,p_firm_name text,p_title text,
  p_source_filename text,p_source_path text,p_signer_name text,p_signer_email text,
  p_fields jsonb,p_expires_days integer default 14
) returns jsonb
language plpgsql security definer set search_path=public,extensions
as $$
declare v_id uuid; v_token text; v_hash text;
begin
  if not public._is_platform_admin() then raise exception 'not authorized'; end if;
  if coalesce(trim(p_signer_email),'')='' then raise exception 'signer email required'; end if;
  if jsonb_typeof(coalesce(p_fields,'[]'::jsonb)) <> 'array' then raise exception 'fields must be an array'; end if;
  v_token:=encode(gen_random_bytes(32),'hex');
  v_hash:=encode(digest(v_token,'sha256'),'hex');
  insert into public.romylabs_office_signing_documents(
    product_key,external_office_id,firm_name,title,source_filename,source_path,signer_name,signer_email,fields,token_hash,status,sent_at,expires_at,created_by,audit
  ) values(
    p_product_key,p_external_office_id,p_firm_name,p_title,p_source_filename,p_source_path,p_signer_name,p_signer_email,coalesce(p_fields,'[]'::jsonb),v_hash,'sent',now(),now()+make_interval(days=>greatest(coalesce(p_expires_days,14),1)),auth.jwt()->>'email',
    jsonb_build_array(jsonb_build_object('event','created','at',now(),'actor',coalesce(auth.jwt()->>'email','platform-admin')),jsonb_build_object('event','sent','at',now(),'actor',coalesce(auth.jwt()->>'email','platform-admin')))
  ) returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id,'token',v_token,'sign_url','/office-sign/'||v_token);
end $$;

create or replace function public.admin_romylabs_office_signing_documents(p_product_key text,p_external_office_id text)
returns setof public.romylabs_office_signing_documents
language sql security definer set search_path=public
as $$
  select d.* from public.romylabs_office_signing_documents d
  where public._is_platform_admin() and d.product_key=p_product_key and d.external_office_id=p_external_office_id
  order by d.created_at desc;
$$;

create or replace function public.admin_romylabs_void_office_signing_document(p_document_id uuid,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public
as $$
begin
  if not public._is_platform_admin() then raise exception 'not authorized'; end if;
  update public.romylabs_office_signing_documents
  set status='void',voided_at=now(),updated_at=now(),audit=audit||jsonb_build_array(jsonb_build_object('event','voided','at',now(),'actor',coalesce(auth.jwt()->>'email','platform-admin'),'reason',p_reason))
  where id=p_document_id and status not in('signed','void');
  return jsonb_build_object('ok',found);
end $$;

revoke all on function public.admin_romylabs_create_office_signing_document(text,text,text,text,text,text,text,text,jsonb,integer) from public,anon;
revoke all on function public.admin_romylabs_office_signing_documents(text,text) from public,anon;
revoke all on function public.admin_romylabs_void_office_signing_document(uuid,text) from public,anon;
grant execute on function public.admin_romylabs_create_office_signing_document(text,text,text,text,text,text,text,text,jsonb,integer) to authenticated;
grant execute on function public.admin_romylabs_office_signing_documents(text,text) to authenticated;
grant execute on function public.admin_romylabs_void_office_signing_document(uuid,text) to authenticated;
