-- Prevent production capacity/QA certification traffic from polluting real Team Chat.
-- Heavy load tests may still exercise other boundaries, but synthetic QA chat
-- messages must never be persisted in the live user-visible chat stream.

create or replace function public.block_qa_certification_chat_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.source,'') = 'qa_certification'
     or coalesce(new.text,'') like '[QA CERT %' then
    raise exception 'QA certification chat messages are blocked in production';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_qa_certification_chat_insert on public.chat_messages;
create trigger trg_block_qa_certification_chat_insert
before insert on public.chat_messages
for each row
execute function public.block_qa_certification_chat_insert();
