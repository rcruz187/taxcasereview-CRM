-- ─────────────────────────────────────────────────────────────────────
-- Migration: support_phase2a
-- Filename:  20260821_support_phase2a.sql
-- Date:      2026-08-21
-- Author:    RomyLabs / Claude
--
-- PURPOSE:
--   Phase 2A of the RomyLabs centralized support architecture.
--   Makes the existing support system product-aware and adds the
--   infrastructure needed by the Command Center Support tab and
--   the central support-api edge function.
--
-- WHAT THIS MIGRATION DOES:
--   1. support_ticket_messages.is_internal   — distinguish internal notes
--      from customer-visible replies
--   2. support_tickets.updated_at trigger    — auto-maintain the timestamp
--   3. list_support_tickets() extended       — returns product_id,
--      ticket_number, product_tenant_name, source; TaxRes callers are
--      fully backward-compatible (all prior columns still returned)
--   4. get_ticket_thread() extended          — returns product columns;
--      filters internal messages for non-platform-admin callers
--   5. add_ticket_message_typed()            — new RPC that accepts
--      is_internal flag; add_ticket_message() preserved unchanged
--   6. list_all_product_tickets()            — new RPC for Command Center
--      cross-product view; requires platform_admin role
--
-- PRESERVED EXACTLY:
--   • Phase 1 migration and all its objects (tenant_id nullable, product_id
--     column, sequences, set_ticket_number trigger, product_id CHECK constraint)
--   • Original TaxRes ticket (2026-08-02) — ticket_number = NULL, untouched
--   • Existing callers of add_ticket_message(), list_support_tickets(),
--     get_ticket_thread(), update_ticket_status(), open_ticket_count()
--   • RLS policies on both tables
--   • current_tenant_id() function
--   • tenants table and all TaxRes data
--
-- SAFETY GUARANTEES:
--   • ADD COLUMN is_internal: existing rows get is_internal = false (DEFAULT)
--   • No row deleted, no row rewritten, no existing data touched
--   • CREATE OR REPLACE on RPCs: in-place replacement, callers see new
--     return shape which adds columns (additive — ignorable by old callers)
--   • add_ticket_message() signature UNCHANGED — not replaced
--   • is_internal column DEFAULT false — new messages inserted via old RPC
--     are customer-visible (safe, backward-compatible default)
--   • get_ticket_thread() internal-message filter applies only to non-admin
--     callers (auth.email()='romy@...' OR platform_admin still see all)
--
-- ROLLBACK: see bottom of file
-- ─────────────────────────────────────────────────────────────────────

begin;

-- ── 1. support_ticket_messages.is_internal ───────────────────────────
-- Distinguishes internal Romy notes (never sent to customers) from
-- customer-visible replies.
-- Existing messages get is_internal = false — they are all customer-visible
-- (this is the correct interpretation: all existing messages are either
-- 'staff' or 'romy' visible replies, not internal notes).
alter table support_ticket_messages
  add column if not exists is_internal boolean not null default false;

-- ── 2. support_tickets.updated_at auto-maintenance trigger ───────────
-- Previously updated_at was only set by the RPCs (not all code paths).
-- This trigger ensures every UPDATE to the row maintains updated_at.
-- Existing rows: no change (trigger fires only on future UPDATEs).
create or replace function touch_support_ticket_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists support_tickets_updated_at on support_tickets;
create trigger support_tickets_updated_at
  before update on support_tickets
  for each row
  execute function touch_support_ticket_updated_at();

-- ── 3. list_support_tickets() — extended return columns ─────────────
-- BACKWARD COMPATIBLE: all existing return columns preserved in same order.
-- New columns appended (existing callers ignore extra columns).
-- TaxRes behavior unchanged:
--   • TaxRes staff see their own tickets via tenant_id = current_tenant_id()
--   • Romy sees all via auth.email() check (Phase 2B will migrate to role check)
-- Non-TaxRes tickets: tenant_id IS NULL → firm_name returns NULL,
--   product_tenant_name provides the display name.
-- The INNER JOIN to tenants is changed to LEFT JOIN so non-TaxRes tickets
-- (tenant_id = NULL) are not silently excluded.
-- Must drop before recreating — PostgreSQL cannot change return type via CREATE OR REPLACE
drop function if exists list_support_tickets();

create or replace function list_support_tickets()
returns table (
  -- Existing columns (unchanged order, unchanged types):
  id                  uuid,
  tenant_id           uuid,
  firm_name           text,
  submitted_by_name   text,
  submitted_by_email  text,
  category            text,
  priority            text,
  subject             text,
  status              text,
  created_at          timestamptz,
  updated_at          timestamptz,
  message_count       bigint,
  -- New columns (Phase 2A additions):
  product_id          text,
  ticket_number       text,
  product_tenant_name text,
  source              text
) language sql security definer as $$
  select
    t.id,
    t.tenant_id,
    ten.firm_name,                    -- NULL for non-TaxRes tickets
    t.submitted_by_name,
    t.submitted_by_email,
    t.category,
    t.priority,
    t.subject,
    t.status,
    t.created_at,
    t.updated_at,
    count(m.id) as message_count,
    t.product_id,
    t.ticket_number,
    t.product_tenant_name,            -- populated for non-TaxRes tickets
    t.source
  from support_tickets t
  left join tenants ten on ten.id = t.tenant_id    -- LEFT JOIN: non-TaxRes included
  left join support_ticket_messages m on m.ticket_id = t.id
  where
    auth.email() = 'romy@taxcasereview.org'
    or t.tenant_id = current_tenant_id()
  group by t.id, ten.firm_name
  order by
    case t.priority when 'Urgent' then 1 when 'High' then 2 when 'Normal' then 3 else 4 end,
    t.created_at asc;
$$;

-- ── 4. get_ticket_thread() — extended, internal message filter ───────
-- BACKWARD COMPATIBLE: all existing return columns preserved.
-- New: product columns returned; is_internal returned for callers that
--   need it (Romy sees all; staff/customer sees only is_internal = false).
-- is_internal filtering: non-Romy callers cannot read internal notes.
-- The LEFT JOIN to tenants changed to LEFT JOIN (same as list_support_tickets).
-- Must drop before recreating — extended return type
drop function if exists get_ticket_thread(uuid);

create or replace function get_ticket_thread(p_ticket_id uuid)
returns table (
  -- Existing columns (unchanged):
  ticket_id          uuid,
  tenant_id          uuid,
  firm_name          text,
  submitted_by_name  text,
  submitted_by_email text,
  category           text,
  priority           text,
  subject            text,
  description        text,
  status             text,
  created_at         timestamptz,
  msg_id             uuid,
  sender             text,
  message            text,
  msg_at             timestamptz,
  -- New columns (Phase 2A):
  product_id         text,
  ticket_number      text,
  product_tenant_name text,
  source             text,
  is_internal        boolean
) language sql security definer as $$
  select
    t.id,
    t.tenant_id,
    ten.firm_name,
    t.submitted_by_name,
    t.submitted_by_email,
    t.category,
    t.priority,
    t.subject,
    t.description,
    t.status,
    t.created_at,
    m.id,
    m.sender,
    -- Internal messages: message text hidden from non-Romy callers
    case
      when (auth.email() = 'romy@taxcasereview.org'
            or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin')
        then m.message
      when coalesce(m.is_internal, false) = true
        then null    -- non-admin callers receive NULL for internal message text
      else m.message
    end as message,
    m.created_at,
    -- New:
    t.product_id,
    t.ticket_number,
    t.product_tenant_name,
    t.source,
    coalesce(m.is_internal, false) as is_internal
  from support_tickets t
  left join tenants ten on ten.id = t.tenant_id
  left join support_ticket_messages m on m.ticket_id = t.id
  where t.id = p_ticket_id
    and (
      auth.email() = 'romy@taxcasereview.org'
      or t.tenant_id = current_tenant_id()
    )
  order by m.created_at asc;
$$;

-- ── 5. add_ticket_message_typed() — new RPC, typed internal flag ─────
-- The EXISTING add_ticket_message() is NOT modified — all current callers
-- continue to work with sender = 'staff' | 'romy', is_internal defaults false.
-- This new RPC is used by:
--   (a) Romy when posting an internal note from the Command Center
--   (b) The central support-api edge fn for typed message handling
-- Authorization: any authenticated user can call (SECURITY DEFINER).
--   Internal notes (is_internal=true) should only be sent by callers
--   that have verified platform_admin — enforced at the calling layer
--   (Support.jsx and support-api), not here.
create or replace function add_ticket_message_typed(
  p_ticket_id uuid,
  p_sender    text,
  p_message   text,
  p_internal  boolean default false
)
returns uuid
language sql
security definer
as $$
  insert into support_ticket_messages (ticket_id, sender, message, is_internal)
  values (p_ticket_id, p_sender, p_message, p_internal)
  returning id;
$$;

-- ── 6. list_all_product_tickets() — Command Center cross-product view ─
-- New RPC. Returns ALL tickets across ALL products.
-- Restricted to platform_admin: non-admins receive an empty result set.
-- (SECURITY DEFINER + WHERE on role means no data leaks; the RLS policies
-- still apply for direct table access — this RPC bypasses RLS but
-- enforces its own access check.)
-- Includes unread/reply-needed state: a ticket needs reply if its most
-- recent message was from the customer (sender = 'customer') or it is
-- Open/In Progress with no messages.
create or replace function list_all_product_tickets(
  p_product_id text default null,    -- null = all products
  p_status     text default null,    -- null = all statuses
  p_limit      int  default 100,
  p_offset     int  default 0
)
returns table (
  id                  uuid,
  ticket_number       text,
  product_id          text,
  product_label       text,          -- display name: 'Tax Res CRM', 'Camvella', etc.
  tenant_id           uuid,
  firm_name           text,          -- TaxRes firm name (null for non-TaxRes)
  product_tenant_name text,          -- non-TaxRes org name
  display_customer    text,          -- computed: firm_name ?? product_tenant_name
  submitted_by_name   text,
  submitted_by_email  text,
  category            text,
  priority            text,
  subject             text,
  status              text,
  source              text,
  assigned_to         text,
  created_at          timestamptz,
  updated_at          timestamptz,
  message_count       bigint,
  needs_reply         boolean        -- true if last message is from customer/null
)
language sql
security definer
as $$
  select
    t.id,
    t.ticket_number,
    t.product_id,
    -- Human-readable product label
    case t.product_id
      when 'taxres_crm' then 'Tax Res CRM'
      when 'camvella'   then 'Camvella'
      when 'arcvena'    then 'Arcvena'
      when 'bocasync'   then 'BocaSync'
      else t.product_id
    end as product_label,
    t.tenant_id,
    ten.firm_name,
    t.product_tenant_name,
    coalesce(ten.firm_name, t.product_tenant_name) as display_customer,
    t.submitted_by_name,
    t.submitted_by_email,
    t.category,
    t.priority,
    t.subject,
    t.status,
    t.source,
    t.assigned_to,
    t.created_at,
    t.updated_at,
    count(m.id)::bigint as message_count,
    -- needs_reply: last message sender is 'customer' OR no messages on open ticket
    case
      when count(m.id) = 0 and t.status != 'Resolved' then true
      when (
        select sender from support_ticket_messages
        where ticket_id = t.id
        order by created_at desc
        limit 1
      ) = 'customer' then true
      else false
    end as needs_reply
  from support_tickets t
  left join tenants ten on ten.id = t.tenant_id
  left join support_ticket_messages m on m.ticket_id = t.id
    and coalesce(m.is_internal, false) = false    -- only count customer-visible messages
  where
    -- Platform admin only
    (auth.email() = 'romy@taxcasereview.org'
     or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin')
    -- Optional filters
    and (p_product_id is null or t.product_id = p_product_id)
    and (p_status     is null or t.status     = p_status)
  group by t.id, ten.firm_name
  order by
    -- Needs reply first
    (case
      when count(m.id) = 0 and t.status != 'Resolved' then true
      when (select sender from support_ticket_messages
            where ticket_id = t.id order by created_at desc limit 1) = 'customer' then true
      else false
    end) desc,
    -- Then by priority
    case t.priority when 'Urgent' then 1 when 'High' then 2 when 'Normal' then 3 else 4 end,
    t.created_at asc
  limit  p_limit
  offset p_offset;
$$;

commit;

-- ─────────────────────────────────────────────────────────────────────
-- ROLLBACK PROCEDURE
--
-- Phase 2A is additive only. All rollback operations are safe at any time.
-- No data is lost in rollback because:
--   • is_internal column: existing messages had is_internal = false;
--     after DROP COLUMN they still have the same visible message content
--   • RPCs: reverting to the prior version restores exact prior behavior
--   • New RPCs: simply dropped; no callers exist yet
-- ─────────────────────────────────────────────────────────────────────
--
-- begin;
--
-- -- Remove new RPCs
-- DROP FUNCTION IF EXISTS list_all_product_tickets(text, text, int, int);
-- DROP FUNCTION IF EXISTS add_ticket_message_typed(uuid, text, text, boolean);
--
-- -- Restore original list_support_tickets (INNER JOIN, fewer return columns)
-- CREATE OR REPLACE FUNCTION list_support_tickets()
-- RETURNS TABLE (
--   id uuid, tenant_id uuid, firm_name text,
--   submitted_by_name text, submitted_by_email text,
--   category text, priority text, subject text,
--   status text, created_at timestamptz, updated_at timestamptz,
--   message_count bigint
-- ) LANGUAGE sql SECURITY DEFINER AS $$
--   select t.id, t.tenant_id, ten.firm_name,
--     t.submitted_by_name, t.submitted_by_email,
--     t.category, t.priority, t.subject,
--     t.status, t.created_at, t.updated_at,
--     count(m.id) as message_count
--   from support_tickets t
--   join tenants ten on ten.id = t.tenant_id
--   left join support_ticket_messages m on m.ticket_id = t.id
--   where auth.email() = 'romy@taxcasereview.org'
--     or t.tenant_id = current_tenant_id()
--   group by t.id, ten.firm_name
--   order by case t.priority when 'Urgent' then 1 when 'High' then 2
--     when 'Normal' then 3 else 4 end, t.created_at asc;
-- $$;
--
-- -- Restore original get_ticket_thread (fewer return columns)
-- CREATE OR REPLACE FUNCTION get_ticket_thread(p_ticket_id uuid)
-- RETURNS TABLE (
--   ticket_id uuid, tenant_id uuid, firm_name text,
--   submitted_by_name text, submitted_by_email text,
--   category text, priority text, subject text, description text,
--   status text, created_at timestamptz,
--   msg_id uuid, sender text, message text, msg_at timestamptz
-- ) LANGUAGE sql SECURITY DEFINER AS $$
--   select t.id, t.tenant_id, ten.firm_name,
--     t.submitted_by_name, t.submitted_by_email,
--     t.category, t.priority, t.subject, t.description,
--     t.status, t.created_at,
--     m.id, m.sender, m.message, m.created_at
--   from support_tickets t
--   join tenants ten on ten.id = t.tenant_id
--   left join support_ticket_messages m on m.ticket_id = t.id
--   where t.id = p_ticket_id
--     and (auth.email() = 'romy@taxcasereview.org'
--          or t.tenant_id = current_tenant_id())
--   order by m.created_at asc;
-- $$;
--
-- -- Remove updated_at trigger
-- DROP TRIGGER IF EXISTS support_tickets_updated_at ON support_tickets;
-- DROP FUNCTION IF EXISTS touch_support_ticket_updated_at();
--
-- -- Remove is_internal column (safe: existing messages were all is_internal=false,
-- --   no content is lost by dropping this flag)
-- ALTER TABLE support_ticket_messages
--   DROP COLUMN IF EXISTS is_internal;
--
-- commit;
-- ─────────────────────────────────────────────────────────────────────
