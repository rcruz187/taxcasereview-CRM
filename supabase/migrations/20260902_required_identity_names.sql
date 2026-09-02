alter table public.clients alter column name set not null;
alter table public.leads alter column name set not null;
alter table public.employees alter column name set not null;

alter table public.clients drop constraint if exists clients_name_not_blank;
alter table public.clients add constraint clients_name_not_blank check (btrim(name) <> '');
alter table public.leads drop constraint if exists leads_name_not_blank;
alter table public.leads add constraint leads_name_not_blank check (btrim(name) <> '');
alter table public.employees drop constraint if exists employees_name_not_blank;
alter table public.employees add constraint employees_name_not_blank check (btrim(name) <> '');
