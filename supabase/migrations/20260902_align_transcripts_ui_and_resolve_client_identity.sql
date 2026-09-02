alter table public.transcripts
  add column if not exists "clientName" text,
  add column if not exists "transcriptType" text,
  add column if not exists "taxYears" text,
  add column if not exists "taxYearsCustom" text,
  add column if not exists "requestDate" text,
  add column if not exists "receivedDate" text,
  add column if not exists method text,
  add column if not exists "assignedTo" text,
  add column if not exists updated_at timestamptz;

create or replace function public.tcr_sync_transcript_fields_and_client_id()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_client_id text;
  v_matches integer;
begin
  if new."clientName" is null and new.clientname is not null then new."clientName" := new.clientname; end if;
  if new.clientname is null and new."clientName" is not null then new.clientname := new."clientName"; end if;
  if new."transcriptType" is null and new.type is not null then new."transcriptType" := new.type; end if;
  if new.type is null and new."transcriptType" is not null then new.type := new."transcriptType"; end if;
  if new."taxYears" is null and new.taxyears is not null then new."taxYears" := new.taxyears; end if;
  if new.taxyears is null and new."taxYears" is not null then new.taxyears := new."taxYears"; end if;
  if new."requestDate" is null and new.requesteddate is not null then new."requestDate" := new.requesteddate; end if;
  if new.requesteddate is null and new."requestDate" is not null then new.requesteddate := new."requestDate"; end if;

  if new.client_id is null and new.tenant_id is not null and coalesce(new."clientName", new.clientname) is not null then
    select count(*), min(id::text)
      into v_matches, v_client_id
      from public.clients
     where tenant_id = new.tenant_id
       and name = coalesce(new."clientName", new.clientname);
    if v_matches = 1 then new.client_id := v_client_id; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tcr_sync_transcript_fields_and_client_id on public.transcripts;
create trigger tcr_sync_transcript_fields_and_client_id
before insert or update on public.transcripts
for each row execute function public.tcr_sync_transcript_fields_and_client_id();

create or replace function public.tcr_resolve_task_client_id()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_client_id text;
  v_matches integer;
begin
  if new.client_id is null and new.tenant_id is not null and new."clientName" is not null then
    select count(*), min(id::text)
      into v_matches, v_client_id
      from public.clients
     where tenant_id = new.tenant_id and name = new."clientName";
    if v_matches = 1 then new.client_id := v_client_id; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tcr_resolve_task_client_id on public.tasks;
create trigger tcr_resolve_task_client_id
before insert or update on public.tasks
for each row execute function public.tcr_resolve_task_client_id();

update public.tasks t
set client_id = c.id::text
from public.clients c
where t.client_id is null
  and t.tenant_id = c.tenant_id
  and t."clientName" = c.name
  and not exists (
    select 1 from public.clients c2
    where c2.tenant_id = c.tenant_id and c2.name = c.name and c2.id <> c.id
  );