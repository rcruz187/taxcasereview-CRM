-- Runtime-contract repair identified by exhaustive front-to-back audit.

create table if not exists public.transcript_pull_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id(),
  client_name text not null,
  transcript_types text[] not null default '{}'::text[],
  tax_years text,
  provider text not null default 'manual',
  status text not null default 'Requested' check (status in ('Requested','In Progress','Completed','Canceled')),
  poa_record_id uuid references public.poa_records(id) on delete set null,
  requested_by text,
  notes text,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  result_analysis_ids uuid[] not null default '{}'::uuid[]
);
create index if not exists idx_transcript_pull_requests_tenant on public.transcript_pull_requests(tenant_id);
create index if not exists idx_transcript_pull_requests_client on public.transcript_pull_requests(tenant_id, client_name);
create index if not exists idx_transcript_pull_requests_status on public.transcript_pull_requests(tenant_id, status);
alter table public.transcript_pull_requests enable row level security;
revoke all on public.transcript_pull_requests from anon;
grant select,insert,update,delete on public.transcript_pull_requests to authenticated;
drop policy if exists transcript_pull_requests_tenant on public.transcript_pull_requests;
create policy transcript_pull_requests_tenant on public.transcript_pull_requests
for all to authenticated
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

create table if not exists public.state_formation_requirements (
  id text primary key default gen_random_uuid()::text,
  state text unique not null,
  state_name text not null,
  llc_filing_fee text,
  annual_report_fee text,
  processing_time text,
  sos_url text,
  notes text,
  updated_at timestamptz not null default now()
);
alter table public.state_formation_requirements enable row level security;
revoke all on public.state_formation_requirements from anon;
grant select on public.state_formation_requirements to authenticated;
drop policy if exists state_formation_requirements_read on public.state_formation_requirements;
create policy state_formation_requirements_read on public.state_formation_requirements
for select to authenticated using (true);

insert into public.state_formation_requirements(state,state_name) values
('AL','Alabama'),('AK','Alaska'),('AZ','Arizona'),('AR','Arkansas'),('CA','California'),('CO','Colorado'),('CT','Connecticut'),('DE','Delaware'),('FL','Florida'),('GA','Georgia'),('HI','Hawaii'),('ID','Idaho'),('IL','Illinois'),('IN','Indiana'),('IA','Iowa'),('KS','Kansas'),('KY','Kentucky'),('LA','Louisiana'),('ME','Maine'),('MD','Maryland'),('MA','Massachusetts'),('MI','Michigan'),('MN','Minnesota'),('MS','Mississippi'),('MO','Missouri'),('MT','Montana'),('NE','Nebraska'),('NV','Nevada'),('NH','New Hampshire'),('NJ','New Jersey'),('NM','New Mexico'),('NY','New York'),('NC','North Carolina'),('ND','North Dakota'),('OH','Ohio'),('OK','Oklahoma'),('OR','Oregon'),('PA','Pennsylvania'),('RI','Rhode Island'),('SC','South Carolina'),('SD','South Dakota'),('TN','Tennessee'),('TX','Texas'),('UT','Utah'),('VT','Vermont'),('VA','Virginia'),('WA','Washington'),('WV','West Virginia'),('WI','Wisconsin'),('WY','Wyoming')
on conflict(state) do update set state_name=excluded.state_name,updated_at=now();

update public.state_formation_requirements
set llc_filing_fee='$125', annual_report_fee='$138.75 (Annual Report)', processing_time='5 business days',
    sos_url='https://dos.myflorida.com/sunbiz/manage-business/efile/',
    notes='Annual report due between Jan 1 - May 1; $400 late fee if missed.', updated_at=now()
where state='FL';
