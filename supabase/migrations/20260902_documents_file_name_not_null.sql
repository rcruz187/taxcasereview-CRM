update public.documents
set file_name = coalesce(nullif(btrim(file_name), ''), nullif(btrim(name), ''), 'document')
where file_name is null or btrim(file_name) = '';

create or replace function public.normalize_document_file_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.file_name := coalesce(nullif(btrim(new.file_name), ''), nullif(btrim(new.name), ''), 'document');
  return new;
end;
$$;

drop trigger if exists trg_documents_normalize_file_name on public.documents;
create trigger trg_documents_normalize_file_name
before insert or update of file_name, name on public.documents
for each row execute function public.normalize_document_file_name();

alter table public.documents alter column file_name set not null;
