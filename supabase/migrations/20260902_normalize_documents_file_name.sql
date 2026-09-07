create or replace function public.normalize_documents_file_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.file_name := coalesce(new.file_name, '');
  return new;
end;
$$;

drop trigger if exists trg_normalize_documents_file_name on public.documents;
create trigger trg_normalize_documents_file_name
before insert or update of file_name on public.documents
for each row execute function public.normalize_documents_file_name();

update public.documents set file_name = '' where file_name is null;
