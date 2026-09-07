create or replace function public.admin_product_calendar_events(p_product_id text default 'romylabs'::text)
returns table(id text, title text, event_date date, event_time text, end_time text, event_type text, client_name text, contact_email text, notes text, source text, status text, product_id text, created_at timestamp with time zone)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if lower(coalesce(auth.jwt()->>'email','')) not in (
    'info@romylabs.com',
    'romy@romylabs.com',
    'romy@taxrescrm.net',
    'romy@taxcasereview.org'
  ) then
    raise exception 'not authorized';
  end if;

  return query
  select
    c.id::text,
    c.title::text,
    c.date::date,
    c.time::text,
    c."endTime"::text,
    coalesce(c."eventType"::text, c.type::text),
    coalesce(c."clientName"::text, c.client::text),
    c.contact_email::text,
    c.notes::text,
    c.source::text,
    c.status::text,
    c.product_id::text,
    c.created_at
  from public.calevents c
  where c.product_id is not null
    and c.date is not null
    and c.date::date >= date '2020-01-01'
    and (p_product_id is null or p_product_id = 'all' or c.product_id = p_product_id)
  order by c.date::date asc, nullif(c.time,'')::time asc nulls last, c.created_at asc;
end;
$function$;
