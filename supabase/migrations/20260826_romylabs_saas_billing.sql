-- RomyLabs SaaS subscription billing / collections.
-- Separate from tenant/customer billing inside individual CRM products.

create extension if not exists pgcrypto;

create table if not exists public.romylabs_billing_accounts (
  id uuid primary key default gen_random_uuid(),
  product_key text not null,
  external_tenant_id text not null,
  account_name text not null,
  billing_email text,
  currency text not null default 'USD',
  monthly_amount_cents bigint not null default 0 check (monthly_amount_cents >= 0),
  billing_day smallint not null default 1 check (billing_day between 1 and 28),
  status text not null default 'active' check (status in ('trial','active','past_due','suspended','cancelled')),
  auto_invoice boolean not null default true,
  auto_suspend boolean not null default false,
  notice_1_after_days integer not null default 10 check (notice_1_after_days >= 1),
  notice_2_after_days integer not null default 15 check (notice_2_after_days > notice_1_after_days),
  suspend_after_days integer not null default 20 check (suspend_after_days > notice_2_after_days),
  suspended_at timestamptz,
  suspension_reason text,
  last_paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_key, external_tenant_id)
);

create table if not exists public.romylabs_invoices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.romylabs_billing_accounts(id) on delete restrict,
  invoice_number text not null unique,
  period_start date not null,
  period_end date not null,
  issued_at timestamptz not null default now(),
  due_at timestamptz not null,
  amount_cents bigint not null check (amount_cents >= 0),
  amount_paid_cents bigint not null default 0 check (amount_paid_cents >= 0),
  status text not null default 'open' check (status in ('draft','open','paid','void','uncollectible')),
  notice_1_sent_at timestamptz,
  notice_2_sent_at timestamptz,
  final_deadline_at timestamptz,
  paid_at timestamptz,
  provider text,
  provider_invoice_id text,
  hosted_invoice_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, period_start, period_end)
);

create table if not exists public.romylabs_subscription_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.romylabs_invoices(id) on delete restrict,
  account_id uuid not null references public.romylabs_billing_accounts(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  status text not null check (status in ('pending','succeeded','failed','refunded','partially_refunded')),
  provider text,
  provider_payment_id text,
  failure_reason text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique(provider, provider_payment_id)
);

create table if not exists public.romylabs_collection_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.romylabs_billing_accounts(id) on delete restrict,
  invoice_id uuid references public.romylabs_invoices(id) on delete set null,
  event_type text not null check (event_type in ('invoice_created','invoice_sent','payment_received','payment_failed','notice_1_sent','notice_2_sent','suspension_due','suspended','restored','manual_hold','manual_override')),
  channel text,
  recipient text,
  detail jsonb not null default '{}'::jsonb,
  created_by text not null default 'system',
  created_at timestamptz not null default now()
);

create index if not exists romylabs_invoices_account_status_idx on public.romylabs_invoices(account_id,status,due_at);
create index if not exists romylabs_billing_accounts_status_idx on public.romylabs_billing_accounts(status,product_key);
create index if not exists romylabs_collection_events_account_idx on public.romylabs_collection_events(account_id,created_at desc);

alter table public.romylabs_billing_accounts enable row level security;
alter table public.romylabs_invoices enable row level security;
alter table public.romylabs_subscription_payments enable row level security;
alter table public.romylabs_collection_events enable row level security;

drop policy if exists romylabs_billing_accounts_platform_admin on public.romylabs_billing_accounts;
create policy romylabs_billing_accounts_platform_admin on public.romylabs_billing_accounts for all to authenticated using (public._is_platform_admin()) with check (public._is_platform_admin());
drop policy if exists romylabs_invoices_platform_admin on public.romylabs_invoices;
create policy romylabs_invoices_platform_admin on public.romylabs_invoices for all to authenticated using (public._is_platform_admin()) with check (public._is_platform_admin());
drop policy if exists romylabs_subscription_payments_platform_admin on public.romylabs_subscription_payments;
create policy romylabs_subscription_payments_platform_admin on public.romylabs_subscription_payments for all to authenticated using (public._is_platform_admin()) with check (public._is_platform_admin());
drop policy if exists romylabs_collection_events_platform_admin on public.romylabs_collection_events;
create policy romylabs_collection_events_platform_admin on public.romylabs_collection_events for all to authenticated using (public._is_platform_admin()) with check (public._is_platform_admin());

create or replace function public.romylabs_billing_dashboard()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select case when public._is_platform_admin() then jsonb_build_object(
    'accounts', coalesce((select jsonb_agg(to_jsonb(a) order by a.account_name) from public.romylabs_billing_accounts a), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(to_jsonb(i) order by i.issued_at desc) from public.romylabs_invoices i), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from public.romylabs_subscription_payments p), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from public.romylabs_collection_events e), '[]'::jsonb),
    'mrr_cents', coalesce((select sum(monthly_amount_cents) from public.romylabs_billing_accounts where status in ('active','past_due')),0),
    'past_due_cents', coalesce((select sum(greatest(amount_cents-amount_paid_cents,0)) from public.romylabs_invoices where status='open' and due_at < now()),0),
    'past_due_accounts', coalesce((select count(distinct account_id) from public.romylabs_invoices where status='open' and due_at < now()),0),
    'suspended_accounts', coalesce((select count(*) from public.romylabs_billing_accounts where status='suspended'),0)
  ) else null end;
$$;

grant execute on function public.romylabs_billing_dashboard() to authenticated;

comment on table public.romylabs_billing_accounts is 'RomyLabs SaaS subscription accounts only; never store CRM end-customer/patient billing here.';
comment on table public.romylabs_collection_events is 'Immutable-style audit trail for subscription collection notices, suspension, restoration, and overrides.';
