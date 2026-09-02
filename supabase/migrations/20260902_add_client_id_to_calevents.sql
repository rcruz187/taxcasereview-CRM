alter table public.calevents
  add column if not exists client_id text;

create index if not exists idx_calevents_tenant_client_id
  on public.calevents (tenant_id, client_id)
  where client_id is not null;
