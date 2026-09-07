-- RomyLabs billing entitlement enforcement hardening.
-- Keeps billing state honest: an account is not marked suspended/restored until
-- the product-side entitlement adapter confirms the access change.

alter table public.romylabs_billing_accounts
  drop constraint if exists romylabs_billing_accounts_status_check;

alter table public.romylabs_billing_accounts
  add constraint romylabs_billing_accounts_status_check
  check (status in (
    'trial','active','past_due','suspension_pending','suspended','restore_pending','cancelled'
  ));

alter table public.romylabs_billing_accounts
  add column if not exists enforcement_error text,
  add column if not exists enforcement_updated_at timestamptz;

create index if not exists romylabs_billing_accounts_enforcement_idx
  on public.romylabs_billing_accounts(status, enforcement_updated_at)
  where status in ('suspension_pending','restore_pending');

comment on column public.romylabs_billing_accounts.enforcement_error is
  'Last server-side product entitlement adapter error. Null after confirmed enforcement.';
