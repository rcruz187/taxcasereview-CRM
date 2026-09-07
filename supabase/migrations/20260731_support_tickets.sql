-- ─── support_tickets ────────────────────────────────────────────────
create table if not exists support_tickets (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  submitted_by_name  text not null,
  submitted_by_email text not null,
  category         text not null check (category in ('Bug Report','Feature Request','Account Issue','Billing Question','Other')),
  priority         text not null default 'Normal' check (priority in ('Low','Normal','High','Urgent')),
  subject          text not null,
  description      text not null,
  status           text not null default 'Open' check (status in ('Open','In Progress','Resolved')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table support_tickets enable row level security;

-- Offices can read/insert their own tickets only
create policy "tenant_own_tickets" on support_tickets
  for all using (tenant_id = current_tenant_id());

-- ─── support_ticket_messages ────────────────────────────────────────
create table if not exists support_ticket_messages (
  id        uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  sender    text not null check (sender in ('staff','romy')),
  message   text not null,
  created_at timestamptz not null default now()
);

alter table support_ticket_messages enable row level security;

-- Messages inherit the ticket's tenant scope via a join
create policy "tenant_own_ticket_messages" on support_ticket_messages
  for all using (
    ticket_id in (
      select id from support_tickets where tenant_id = current_tenant_id()
    )
  );

-- ─── open_ticket_count (for sidebar badge) ─────────────────────────
-- Returns count of non-resolved tickets for the caller's own tenant.
-- Platform admin (Romy) sees ALL open tickets across every office.
create or replace function open_ticket_count()
returns bigint language sql security definer as $$
  select count(*) from support_tickets
  where status <> 'Resolved'
    and (
      auth.email() = 'romy@taxcasereview.org'
      or tenant_id = current_tenant_id()
    );
$$;

-- ─── list_support_tickets ───────────────────────────────────────────
create or replace function list_support_tickets()
returns table (
  id uuid, tenant_id uuid, firm_name text,
  submitted_by_name text, submitted_by_email text,
  category text, priority text, subject text,
  status text, created_at timestamptz, updated_at timestamptz,
  message_count bigint
) language sql security definer as $$
  select
    t.id, t.tenant_id,
    ten.firm_name,
    t.submitted_by_name, t.submitted_by_email,
    t.category, t.priority, t.subject,
    t.status, t.created_at, t.updated_at,
    count(m.id) as message_count
  from support_tickets t
  join tenants ten on ten.id = t.tenant_id
  left join support_ticket_messages m on m.ticket_id = t.id
  where
    auth.email() = 'romy@taxcasereview.org'
    or t.tenant_id = current_tenant_id()
  group by t.id, ten.firm_name
  order by
    case t.priority when 'Urgent' then 1 when 'High' then 2 when 'Normal' then 3 else 4 end,
    t.created_at asc;
$$;

-- ─── get_ticket_thread ──────────────────────────────────────────────
create or replace function get_ticket_thread(p_ticket_id uuid)
returns table (
  ticket_id uuid, tenant_id uuid, firm_name text,
  submitted_by_name text, submitted_by_email text,
  category text, priority text, subject text, description text,
  status text, created_at timestamptz,
  msg_id uuid, sender text, message text, msg_at timestamptz
) language sql security definer as $$
  select
    t.id, t.tenant_id, ten.firm_name,
    t.submitted_by_name, t.submitted_by_email,
    t.category, t.priority, t.subject, t.description,
    t.status, t.created_at,
    m.id, m.sender, m.message, m.created_at
  from support_tickets t
  join tenants ten on ten.id = t.tenant_id
  left join support_ticket_messages m on m.ticket_id = t.id
  where t.id = p_ticket_id
    and (
      auth.email() = 'romy@taxcasereview.org'
      or t.tenant_id = current_tenant_id()
    )
  order by m.created_at asc;
$$;

-- ─── update_ticket_status ───────────────────────────────────────────
create or replace function update_ticket_status(p_ticket_id uuid, p_status text, p_priority text default null)
returns void language sql security definer as $$
  update support_tickets set
    status     = p_status,
    priority   = coalesce(p_priority, priority),
    updated_at = now()
  where id = p_ticket_id
    and auth.email() = 'romy@taxcasereview.org';
$$;

-- ─── add_ticket_message ─────────────────────────────────────────────
create or replace function add_ticket_message(p_ticket_id uuid, p_sender text, p_message text)
returns uuid language sql security definer as $$
  insert into support_ticket_messages (ticket_id, sender, message)
  values (p_ticket_id, p_sender, p_message)
  returning id;
$$;
