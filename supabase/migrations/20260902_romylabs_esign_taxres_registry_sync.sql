-- Automatically expose real TaxRes offices to the universal RomyLabs office/e-sign registry.
-- Demo and platform-admin pseudo tenants stay out of the customer-office registry.

create or replace function public.sync_taxres_tenant_to_romylabs_office_registry()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if upper(coalesce(new.tenant_code,'')) in ('DEMO','ADMIN') then
    delete from public.romylabs_office_registry where product_key='taxres_crm' and external_office_id=new.id::text;
    return new;
  end if;
  insert into public.romylabs_office_registry(
    product_key,external_office_id,firm_name,primary_contact_name,primary_contact_email,primary_contact_phone,seats,monthly_amount,trial_start_date,trial_end_date,status,metadata,updated_at
  ) values(
    'taxres_crm',new.id::text,new.firm_name,new.primary_contact_name,new.primary_contact_email,new.firm_phone,new.billing_seats,new.monthly_rate,
    case when new.status='trial' then new.created_at::date else new.contract_start_date end,
    case when new.status='trial' then new.trial_ends_at::date else new.contract_end_date end,
    new.status,jsonb_build_object('tenant_code',new.tenant_code,'source','taxres_tenants'),now()
  )
  on conflict(product_key,external_office_id) do update set
    firm_name=excluded.firm_name,
    primary_contact_name=excluded.primary_contact_name,
    primary_contact_email=excluded.primary_contact_email,
    primary_contact_phone=excluded.primary_contact_phone,
    seats=excluded.seats,
    monthly_amount=excluded.monthly_amount,
    trial_start_date=excluded.trial_start_date,
    trial_end_date=excluded.trial_end_date,
    status=excluded.status,
    metadata=excluded.metadata,
    updated_at=now();
  return new;
end $$;

drop trigger if exists trg_sync_taxres_tenant_to_romylabs_office_registry on public.tenants;
create trigger trg_sync_taxres_tenant_to_romylabs_office_registry
after insert or update of firm_name,primary_contact_name,primary_contact_email,firm_phone,billing_seats,monthly_rate,trial_ends_at,contract_start_date,contract_end_date,status,tenant_code
on public.tenants
for each row execute function public.sync_taxres_tenant_to_romylabs_office_registry();

insert into public.romylabs_office_registry(
  product_key,external_office_id,firm_name,primary_contact_name,primary_contact_email,primary_contact_phone,seats,monthly_amount,trial_start_date,trial_end_date,status,metadata,updated_at
)
select 'taxres_crm',t.id::text,t.firm_name,t.primary_contact_name,t.primary_contact_email,t.firm_phone,t.billing_seats,t.monthly_rate,
  case when t.status='trial' then t.created_at::date else t.contract_start_date end,
  case when t.status='trial' then t.trial_ends_at::date else t.contract_end_date end,
  t.status,jsonb_build_object('tenant_code',t.tenant_code,'source','taxres_tenants'),now()
from public.tenants t
where upper(coalesce(t.tenant_code,'')) not in ('DEMO','ADMIN')
on conflict(product_key,external_office_id) do update set
  firm_name=excluded.firm_name,
  primary_contact_name=excluded.primary_contact_name,
  primary_contact_email=excluded.primary_contact_email,
  primary_contact_phone=excluded.primary_contact_phone,
  seats=excluded.seats,
  monthly_amount=excluded.monthly_amount,
  trial_start_date=excluded.trial_start_date,
  trial_end_date=excluded.trial_end_date,
  status=excluded.status,
  metadata=excluded.metadata,
  updated_at=now();
