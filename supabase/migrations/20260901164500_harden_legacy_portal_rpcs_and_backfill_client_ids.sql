-- Harden legacy public portal RPCs so alternate/direct RPC paths cannot bypass
-- the tenant+client scoping enforced by the Edge Functions.

create temporary table _portal_unique_entities on commit drop as
with entities as (
  select tenant_id,id::text id,lower(trim(name)) nm from public.clients where deleted_at is null and nullif(trim(name),'') is not null
  union all
  select tenant_id,id::text id,lower(trim(name)) nm from public.leads where deleted_at is null and nullif(trim(name),'') is not null
)
select tenant_id,nm,min(id) id from entities group by tenant_id,nm having count(*)=1;

update public.documents x set client_id=u.id from _portal_unique_entities u where x.client_id is null and u.tenant_id=x.tenant_id and u.nm=lower(trim(coalesce(x.client,x.clientname,'')));
update public.bookkeeping x set client_id=u.id from _portal_unique_entities u where x.client_id is null and u.tenant_id=x.tenant_id and u.nm=lower(trim(coalesce(x.client_name,'')));
update public.payments x set client_id=u.id from _portal_unique_entities u where x.client_id is null and u.tenant_id=x.tenant_id and u.nm=lower(trim(coalesce(x."clientName",'')));
update public.client_notes x set client_id=u.id from _portal_unique_entities u where x.client_id is null and u.tenant_id=x.tenant_id and u.nm=lower(trim(coalesce(x.clientname,'')));
update public.tax_organizer_responses x set client_id=u.id from _portal_unique_entities u where x.client_id is null and u.tenant_id=x.tenant_id and u.nm=lower(trim(coalesce(x.client_name,'')));
update public.invoices x set client_id=u.id from _portal_unique_entities u where x.client_id is null and u.tenant_id=x.tenant_id and u.nm=lower(trim(coalesce(x."clientName",'')));
update public.sms_messages x set client_id=u.id from _portal_unique_entities u where x.client_id is null and u.tenant_id=x.tenant_id and u.nm=lower(trim(coalesce(x."clientName",'')));
update public.client_financial_profiles x set client_id=u.id from _portal_unique_entities u where x.client_id is null and u.tenant_id=x.tenant_id and u.nm=lower(trim(coalesce(x.client_name,'')));
update public.emails x set client_id=u.id from _portal_unique_entities u where x.client_id is null and u.tenant_id=x.tenant_id and u.nm=lower(trim(coalesce(x."clientName",'')));
update public.client_compliance_records x set client_id=u.id from _portal_unique_entities u where x.client_id is null and u.tenant_id=x.tenant_id and u.nm=lower(trim(coalesce(x.client_name,'')));

create or replace function public.portal_get_data(p_token text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public'
as $function$
declare sess record; client_json jsonb; result jsonb;
begin
  select token,client_id,is_lead,client_name,tenant_id,expires_at into sess from public.portal_sessions where token=p_token and expires_at>now() and tenant_id is not null limit 1;
  if sess.token is null then raise exception 'Session expired — please log in again.'; end if;
  if sess.is_lead then
    select jsonb_build_object('id',l.id,'name',l.name,'email',l.email) into client_json from public.leads l where l.id::text=sess.client_id::text and l.tenant_id=sess.tenant_id limit 1;
  else
    select jsonb_build_object('id',c.id,'name',c.name,'email',c.email,'autopay_enabled',c.autopay_enabled,'autopay_amount',c.autopay_amount,'autopay_frequency',c.autopay_frequency,'autopay_next_charge',c.autopay_next_charge,'default_payment_method_id',c.default_payment_method_id,'payment_method_brand',c.payment_method_brand,'payment_method_last4',c.payment_method_last4,'payment_plan_changes',c.payment_plan_changes) into client_json from public.clients c where c.id::text=sess.client_id::text and c.tenant_id=sess.tenant_id limit 1;
  end if;
  if client_json is null then raise exception 'Portal record is unavailable.'; end if;
  select jsonb_build_object(
    'client',client_json,'isLead',sess.is_lead,
    'compliance',coalesce((select jsonb_agg(x) from public.client_compliance_records x where x.tenant_id=sess.tenant_id and x.client_id::text=sess.client_id::text),'[]'::jsonb),
    'documents',coalesce((select jsonb_agg(x order by x.created_at desc) from public.documents x where x.tenant_id=sess.tenant_id and x.client_id::text=sess.client_id::text),'[]'::jsonb),
    'bookkeeping',coalesce((select jsonb_agg(x order by x.date desc) from public.bookkeeping x where x.tenant_id=sess.tenant_id and x.client_id::text=sess.client_id::text),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(x order by x.created_at desc) from public.payments x where x.tenant_id=sess.tenant_id and x.client_id::text=sess.client_id::text),'[]'::jsonb),
    'notes',coalesce((select jsonb_agg(x order by x.created_at desc) from public.client_notes x where x.tenant_id=sess.tenant_id and x.client_id::text=sess.client_id::text and x.visible_to_client=true),'[]'::jsonb),
    'organizers',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'tax_year',x.tax_year,'status',x.status,'updated_at',x.updated_at) order by x.tax_year desc) from public.tax_organizer_responses x where x.tenant_id=sess.tenant_id and x.client_id::text=sess.client_id::text),'[]'::jsonb),
    'invoices',coalesce((select jsonb_agg(x order by x.created_at desc) from public.invoices x where x.tenant_id=sess.tenant_id and x.client_id::text=sess.client_id::text and lower(coalesce(x.status,''))<>'paid'),'[]'::jsonb),
    'sms',coalesce((select jsonb_agg(x order by x.created_at asc) from public.sms_messages x where x.tenant_id=sess.tenant_id and x.client_id::text=sess.client_id::text),'[]'::jsonb),
    'emails',coalesce((select jsonb_agg(x order by x.created_at desc) from public.emails x where x.tenant_id=sess.tenant_id and x.client_id::text=sess.client_id::text and x.deleted_at is null),'[]'::jsonb),
    'financialProfile',(select to_jsonb(x) from public.client_financial_profiles x where x.tenant_id=sess.tenant_id and x.client_id::text=sess.client_id::text limit 1)
  ) into result;
  return result;
end;
$function$;

create or replace function public.portal_action_save_financial_profile(p_token text,p_expenses jsonb)
returns void language plpgsql security definer set search_path to 'pg_catalog','public'
as $function$
declare sess record; existing_id text;
begin
  select token,client_id,client_name,tenant_id,expires_at into sess from public.portal_sessions where token=p_token and expires_at>now() and tenant_id is not null limit 1;
  if sess.token is null then raise exception 'Session expired'; end if;
  if p_expenses is null or pg_column_size(p_expenses)>102400 then raise exception 'Invalid financial profile'; end if;
  select id into existing_id from public.client_financial_profiles where tenant_id=sess.tenant_id and client_id::text=sess.client_id::text limit 1;
  if existing_id is not null then
    update public.client_financial_profiles set expenses=p_expenses,client_name=sess.client_name,updated_at=now() where id=existing_id and tenant_id=sess.tenant_id and client_id::text=sess.client_id::text;
  else
    insert into public.client_financial_profiles(client_name,expenses,updated_at,tenant_id,client_id) values(sess.client_name,p_expenses,now(),sess.tenant_id,sess.client_id);
  end if;
end $function$;

create or replace function public.portal_action_create_organizer(p_token text,p_year text,p_client_email text)
returns public.tax_organizer_responses language plpgsql security definer set search_path to 'pg_catalog','public'
as $function$
declare sess record; rec public.tax_organizer_responses; v_email text; v_year int;
begin
  select token,client_id,is_lead,client_name,tenant_id,expires_at into sess from public.portal_sessions where token=p_token and expires_at>now() and tenant_id is not null limit 1;
  if sess.token is null then raise exception 'Session expired'; end if;
  if p_year !~ '^\d{4}$' then raise exception 'Invalid year'; end if;
  v_year:=p_year::int; if v_year<2000 or v_year>extract(year from now())::int+1 then raise exception 'Invalid year'; end if;
  if sess.is_lead then select email into v_email from public.leads where id::text=sess.client_id::text and tenant_id=sess.tenant_id limit 1;
  else select email into v_email from public.clients where id::text=sess.client_id::text and tenant_id=sess.tenant_id limit 1; end if;
  select * into rec from public.tax_organizer_responses where tenant_id=sess.tenant_id and client_id::text=sess.client_id::text and tax_year=p_year limit 1;
  if rec.id is not null then return rec; end if;
  insert into public.tax_organizer_responses(client_name,client_email,tax_year,answers,status,created_at,updated_at,tenant_id,client_id) values(sess.client_name,coalesce(v_email,''),p_year,'{}'::jsonb,'In Progress',now(),now(),sess.tenant_id,sess.client_id) returning * into rec;
  return rec;
end $function$;

create or replace function public.portal_action_upload_document(p_token text,p_file_name text,p_doc_type text,p_file_url text,p_file_size bigint)
returns void language plpgsql security definer set search_path to 'pg_catalog','public'
as $function$
declare sess record; v_url text:=coalesce(p_file_url,'');
begin
  select token,client_id,client_name,tenant_id,expires_at into sess from public.portal_sessions where token=p_token and expires_at>now() and tenant_id is not null limit 1;
  if sess.token is null then raise exception 'Session expired'; end if;
  if length(trim(coalesce(p_file_name,'')))<1 or length(p_file_name)>255 or coalesce(p_file_size,0)<=0 or coalesce(p_file_size,0)>15728640 then raise exception 'Invalid document'; end if;
  if v_url !~ '^https://mpxgxfqdbquzkrvvejkh\.supabase\.co/storage/v1/object/(sign|public)/documents/' then raise exception 'Invalid document location'; end if;
  insert into public.documents(name,client,clientname,"docType",notes,file_url,url,file_name,filename,file_size,source,created_at,tenant_id,client_id) values(left(p_file_name,255),sess.client_name,sess.client_name,left(coalesce(p_doc_type,'Other'),100),'Uploaded by client via portal',v_url,v_url,left(p_file_name,255),left(p_file_name,255),p_file_size,'client_portal',now(),sess.tenant_id,sess.client_id);
end $function$;
