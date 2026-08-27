-- Persist approved RomyLabs product identity during public booking creation.
-- The browser remains anonymous and never receives direct UPDATE access to calevents.

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
  if v_product not in ('taxres_crm','romylabs','camvella','arcvena','bocasync') then
    v_product := 'taxres_crm';
  end if;

  v_label := case v_product
    when 'romylabs' then '[RomyLabs]'
    when 'camvella' then '[Camvella]'
    when 'arcvena' then '[Arcvena]'
    when 'bocasync' then '[BocaSync]'
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
       set product_id = v_product,
           title = v_label || ' ' || p_event_type || ' — ' || trim(p_name)
     where booking_token = v_result->>'booking_token'
       and product_id is null
     returning id into v_booking_id;

    v_result := v_result || jsonb_build_object(
      'product_id', v_product,
      'booking_id', v_booking_id
    );
  end if;

  return v_result;
end;
$function$;

revoke all on function public.booking_create_product(text,text,text,text,date,text,text,text,text) from public;
grant execute on function public.booking_create_product(text,text,text,text,date,text,text,text,text)
  to anon, authenticated, service_role;

comment on function public.booking_create_product(text,text,text,text,date,text,text,text,text)
  is 'Creates a public booking and persists a validated RomyLabs product identity server-side.';
