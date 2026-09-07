-- Prevent public demo bookings created in the same second from colliding on calevents.id.
-- calevents has a legacy second-resolution default ('ce' || epoch_seconds), so booking
-- creates its own UUID-backed text id without changing IDs used by the rest of the CRM.
create or replace function public.booking_create(
  p_name text,
  p_email text,
  p_phone text,
  p_event_type text,
  p_date date,
  p_time text,
  p_notes text,
  p_tenant text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tenant uuid;
  cfg jsonb;
  slot int;
  endt text;
  contact_notes text;
  v_lead_id leads.id%type;
  v_client_name text;
  note_text text;
  whenlbl text;
  v_notify text;
  v_token text;
  v_event_id text;
  e_clean text;
  ph_clean text;
begin
  if coalesce(trim(p_name),'')='' then return jsonb_build_object('ok',false,'message','Name is required.'); end if;
  begin v_tenant := nullif(trim(p_tenant),'')::uuid; exception when others then v_tenant := null; end;
  if v_tenant is not null and not exists (select 1 from tenants t where t.id = v_tenant) then v_tenant := null; end if;
  if v_tenant is null then select t.id into v_tenant from tenants t where t.tenant_code = 'TCR-001' limit 1; end if;
  select s.booking_config into cfg from settings s
    where s.tenant_id = v_tenant and s.booking_config is not null limit 1;
  if cfg is null or not coalesce((cfg->>'enabled')::boolean,false) then return jsonb_build_object('ok',false,'message','Online booking is currently unavailable.'); end if;

  perform pg_advisory_xact_lock(hashtext(v_tenant::text||' '||p_date::text||' '||p_time));
  if not exists (select 1 from booking_get_slots(p_date, v_tenant::text) s where s=p_time) then
    return jsonb_build_object('ok',false,'message','That time was just taken — please pick another slot.');
  end if;

  slot := coalesce((cfg->>'slotMinutes')::int,30);
  endt := to_char(p_time::time + (slot||' minutes')::interval,'HH24:MI');
  v_token := replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  v_event_id := 'ce' || replace(gen_random_uuid()::text,'-','');
  contact_notes := 'Booked online.'||E'\n'||'Email: '||coalesce(nullif(trim(p_email),''),'—')||E'\n'||'Phone: '||coalesce(nullif(trim(p_phone),''),'—')||case when coalesce(trim(p_notes),'')<>'' then E'\n'||'Notes: '||trim(p_notes) else '' end;

  insert into calevents (id,title,"clientName",date,time,"endTime","eventType",color,status,notes,source,created_at,booking_token,contact_email,tenant_id)
  values (v_event_id,p_event_type||' — '||trim(p_name),trim(p_name),to_char(p_date,'YYYY-MM-DD'),p_time,endt,p_event_type,'bb','scheduled',contact_notes,'online',now(),v_token,nullif(trim(p_email),''),v_tenant);

  e_clean := nullif(lower(trim(coalesce(p_email,''))),'');
  ph_clean := nullif(regexp_replace(coalesce(p_phone,''),'\D','','g'),'');
  begin
    select l.id into v_lead_id from leads l where l.tenant_id = v_tenant
      and ((e_clean is not null and lower(coalesce(l.email,''))=e_clean)
        or (ph_clean is not null and regexp_replace(coalesce(l.phone,''),'\D','','g')=ph_clean))
      order by l.created_at desc limit 1;
  exception when others then null; end;

  if v_lead_id is null then
    begin
      select c.name into v_client_name from clients c where c.tenant_id = v_tenant
        and ((e_clean is not null and lower(coalesce(c.email,''))=e_clean)
          or (ph_clean is not null and regexp_replace(coalesce(c.phone,''),'\D','','g')=ph_clean))
        limit 1;
    exception when others then null; end;
  end if;

  if v_lead_id is null and v_client_name is null then
    begin
      insert into leads (name,email,phone,status,created_at,tenant_id)
      values (trim(p_name),nullif(trim(p_email),''),nullif(trim(p_phone),''),'New',now(),v_tenant);
    exception when others then null; end;
  end if;

  whenlbl := to_char(p_date,'Mon FMDD, YYYY')||' at '||to_char(p_time::time,'FMHH12:MI AM')||' ET';
  note_text := '📅 Booked online: '||p_event_type||' — '||whenlbl||E'\n'||'Email: '||coalesce(nullif(trim(p_email),''),'—')||' · Phone: '||coalesce(nullif(trim(p_phone),''),'—')||case when coalesce(trim(p_notes),'')<>'' then E'\n'||'Notes: '||trim(p_notes) else '' end;
  v_notify := booking_note_and_rep(trim(p_name),p_email,p_phone,note_text,v_tenant);
  return jsonb_build_object('ok',true,'notify_email',v_notify,'booking_token',v_token);
end
$function$;
