-- Production guard: synthetic QA leads must never pollute real office call queues.
create or replace function public.prevent_qa_lead_artifacts()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.id::text,'') like 'qa\_%' escape '\'
     and coalesce(new.phone,'') = '0000000000'
     and (coalesce(new.name,'') ilike 'QA Lead%' or coalesce(new.name,'') ilike 'QA Isolation%')
  then
    raise exception 'Synthetic QA lead artifacts are not allowed in production';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_qa_lead_artifacts_trg on public.leads;
create trigger prevent_qa_lead_artifacts_trg
  before insert on public.leads
  for each row execute function public.prevent_qa_lead_artifacts();
