alter table public.linkedin_connections
  add column if not exists publish_target_type text not null default 'PERSON',
  add column if not exists linkedin_organization_id text;

alter table public.linkedin_connections
  drop constraint if exists linkedin_connections_publish_target_type_check;

alter table public.linkedin_connections
  add constraint linkedin_connections_publish_target_type_check
  check (publish_target_type in ('PERSON','ORGANIZATION'));
