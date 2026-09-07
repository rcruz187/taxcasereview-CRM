-- Normalize public booking slot transport to a JSON array so the browser
-- receives a stable list of HH:MM strings across PostgREST/Supabase clients.
create or replace function public.booking_get_slots_json(
  p_date date,
  p_tenant text default null
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(s order by s), '[]'::jsonb)
  from public.booking_get_slots(p_date, p_tenant) as s;
$$;

revoke all on function public.booking_get_slots_json(date,text) from public;
grant execute on function public.booking_get_slots_json(date,text) to anon, authenticated;
