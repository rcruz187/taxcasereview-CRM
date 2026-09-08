-- AquaGrid RomyLabs Admin Portal product registration
-- SOURCE-ONLY on incubator/aquagrid-admin-integration.
-- Apply only through the Admin Portal sandbox migration path after AquaGrid name/domain lock.

begin;

insert into public.romylabs_products(product_id,name,active,description)
values(
  'aquagrid',
  'AquaGrid',
  true,
  'Mobile-first pool service operating system and CRM — working product name pending final domain lock'
)
on conflict (product_id) do update
set name=excluded.name,
    active=excluded.active,
    description=excluded.description;

insert into public.romylabs_product_support(
  product_id,support_enabled,ticket_prefix,next_ticket_seq,
  display_name,notify_email,secret_env_key
)
values(
  'aquagrid',true,'AQUA',1,
  'AquaGrid','info@romylabs.com','AQUAGRID_SUPPORT_SECRET'
)
on conflict (product_id) do update
set support_enabled=excluded.support_enabled,
    ticket_prefix=excluded.ticket_prefix,
    display_name=excluded.display_name,
    notify_email=excluded.notify_email,
    secret_env_key=excluded.secret_env_key,
    updated_at=now();

create or replace function public.booking_create_product(
  p_name text,
  p_email text,
  p_phone text,
  p_event_type text,
  p_date date,
  p_time text,
  p_notes text,
  p_product text,
  p_tenant text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
  v_product text;
  v_label text;
  v_booking_id text;
begin
  v_product := lower(trim(coalesce(p_product, '')));

  if v_product not in (
    'taxres_crm','romylabs','camvella','arcvena','bocasync',
    'groundivo','oculivo','restore_relay','aquagrid'
  ) then
    v_product := 'taxres_crm';
  end if;

  v_label := case v_product
    when 'romylabs' then '[RomyLabs]'
    when 'camvella' then '[Camvella]'
    when 'arcvena' then '[Arcvena]'
    when 'bocasync' then '[BocaSync]'
    when 'groundivo' then '[GroundIVO]'
    when 'oculivo' then '[Oculivo]'
    when 'restore_relay' then '[Restore Relay]'
    when 'aquagrid' then '[AquaGrid]'
    else '[TaxRes CRM]'
  end;

  v_result := public.booking_create(
    p_name,
    p_email,
    p_phone,
    p_event_type,
    p_date,
    p_time,
    p_notes,
    p_tenant
  );

  if coalesce((v_result->>'ok')::boolean, false) then
    update public.calevents
       set product_id=v_product,
           title=v_label || ' ' || p_event_type || ' — ' || trim(p_name)
     where booking_token=v_result->>'booking_token'
       and product_id is null
     returning id into v_booking_id;

    v_result := v_result || jsonb_build_object(
      'product_id',v_product,
      'booking_id',v_booking_id
    );
  end if;

  return v_result;
end;
$function$;

commit;
