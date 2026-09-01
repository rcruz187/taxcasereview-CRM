alter table public.esigns add column if not exists workflow_triggered_at timestamptz;

create index if not exists esigns_workflow_trigger_claim_idx
on public.esigns(id, workflow_triggered_at)
where signed_at is not null;
