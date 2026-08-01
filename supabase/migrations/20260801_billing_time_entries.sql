-- ─── billing_activity_types ─────────────────────────────────────────
-- Pre-seeded list of billable activity categories (per-tenant overrideable).
create table if not exists billing_activity_types (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references tenants(id) on delete cascade,
  name        text not null,
  default_rate numeric(10,2),
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);
alter table billing_activity_types enable row level security;
create policy "tenant_own_activity_types" on billing_activity_types
  for all using (tenant_id = current_tenant_id() or tenant_id is null);

-- Seed standard activity types (tenant_id null = shared/global fallback)
insert into billing_activity_types (name, default_rate, sort_order) values
  ('Tax Research',          200.00, 1),
  ('IRS Correspondence',    200.00, 2),
  ('Client Communication',  150.00, 3),
  ('Document Review',       150.00, 4),
  ('Form Preparation',      175.00, 5),
  ('Transcript Analysis',   200.00, 6),
  ('Investigation',         200.00, 7),
  ('Offer in Compromise',   225.00, 8),
  ('Installment Agreement', 175.00, 9),
  ('Appeals',               225.00, 10),
  ('Lien/Levy Work',        200.00, 11),
  ('Penalty Abatement',     175.00, 12),
  ('Administrative',         75.00, 13),
  ('Other',                 150.00, 14)
on conflict do nothing;

-- ─── billing_time_entries ────────────────────────────────────────────
create table if not exists billing_time_entries (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  client_id     uuid references clients(id) on delete set null,
  client_name   text not null,
  task_id       text,
  task_title    text,
  activity_type text not null,
  date          date not null default current_date,
  hours         numeric(6,2) not null check (hours > 0),
  rate          numeric(10,2) not null check (rate >= 0),
  description   text,
  employee_name text not null,
  billed        boolean not null default false,
  invoice_id    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table billing_time_entries enable row level security;
create policy "tenant_own_time_entries" on billing_time_entries
  for all using (tenant_id = current_tenant_id());

-- ─── auto-stamp tenant_id on insert ─────────────────────────────────
create or replace function billing_time_entries_set_tenant()
returns trigger language plpgsql as $$
begin
  if new.tenant_id is null then
    new.tenant_id := current_tenant_id();
  end if;
  return new;
end;
$$;
drop trigger if exists billing_time_entries_tenant on billing_time_entries;
create trigger billing_time_entries_tenant
  before insert on billing_time_entries
  for each row execute function billing_time_entries_set_tenant();
