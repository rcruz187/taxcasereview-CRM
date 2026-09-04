alter table public.outbound_calls
  add column if not exists display_name text,
  add column if not exists entity_type text;

alter table public.calllog
  add column if not exists direction text,
  add column if not exists raw_call_id uuid;

create unique index if not exists calllog_raw_call_id_uidx
  on public.calllog(raw_call_id)
  where raw_call_id is not null;

create or replace function public.sync_outbound_call_to_calllog()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.calllog(
      "clientName", phone, outcome, notes, created_at, tenant_id, direction, raw_call_id
    )
    values (
      coalesce(nullif(new.display_name,''), 'Outbound Call'),
      new.destination_number,
      case lower(coalesce(new.status,'pending'))
        when 'pending' then 'Dialing…'
        when 'ringing' then 'Ringing'
        when 'answered' then 'Answered'
        when 'connected' then 'Connected'
        when 'completed' then 'Completed'
        when 'failed' then 'Failed'
        else initcap(coalesce(new.status,'pending'))
      end,
      case when new.entity_type='reference' then 'IRS/State reference call' else null end,
      coalesce(new.created_at, now()),
      new.tenant_id,
      'Outbound',
      new.id
    )
    on conflict (raw_call_id) where raw_call_id is not null do nothing;
    return new;
  end if;

  if tg_op='UPDATE' and (
    new.status is distinct from old.status or
    new.display_name is distinct from old.display_name or
    new.entity_type is distinct from old.entity_type
  ) then
    update public.calllog
    set outcome = case lower(coalesce(new.status,'pending'))
        when 'pending' then 'Dialing…'
        when 'ringing' then 'Ringing'
        when 'answered' then 'Answered'
        when 'connected' then 'Connected'
        when 'completed' then 'Completed'
        when 'failed' then 'Failed'
        else initcap(coalesce(new.status,'pending'))
      end,
      "clientName" = coalesce(nullif(new.display_name,''), "clientName"),
      notes = case when new.entity_type='reference'
                   then coalesce(notes,'IRS/State reference call')
                   else notes end
    where raw_call_id=new.id and tenant_id=new.tenant_id;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_outbound_call_to_calllog_trg on public.outbound_calls;
create trigger sync_outbound_call_to_calllog_trg
after insert or update of status, display_name, entity_type
on public.outbound_calls
for each row execute function public.sync_outbound_call_to_calllog();
