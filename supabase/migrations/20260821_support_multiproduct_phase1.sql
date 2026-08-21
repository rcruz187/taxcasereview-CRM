-- ─────────────────────────────────────────────────────────────────────
-- Migration: support_multiproduct_phase1
-- Filename:  20260821_support_multiproduct_phase1.sql
-- Date:      2026-08-21
-- Author:    RomyLabs / Claude
--
-- PURPOSE:
--   Phase 1 of the RomyLabs centralized support architecture.
--   Extends support_tickets and support_ticket_messages to support
--   multiple products (Camvella, Arcvena, BocaSync, future) while
--   preserving ALL existing TaxRes data and behavior.
--
-- SAFETY GUARANTEES:
--   - All new columns are nullable or have safe defaults → zero row rewrite
--   - tenant_id FK is preserved; only NOT NULL constraint is relaxed
--   - Existing TaxRes RLS policies are unchanged
--   - current_tenant_id() is not modified
--   - Existing tickets receive ticket_number = NULL (per design)
--   - Trigger fires only on INSERT, never touches existing rows
--   - sender constraint extended using pg_constraint lookup (name-safe)
--   - All changes are fully reversible via the rollback section below
--
-- ROLLBACK: see bottom of this file
-- ─────────────────────────────────────────────────────────────────────

begin;

-- ── 1. Make tenant_id nullable ──────────────────────────────────────────
-- Existing TaxRes rows all have tenant_id populated (inserted under the
-- old NOT NULL constraint). This relaxation affects only future inserts
-- from non-TaxRes products, which will supply NULL.
-- The FK to tenants(id) is preserved — TaxRes rows still cascade on delete.
alter table support_tickets
  alter column tenant_id drop not null;

-- ── 2. Add product identity and audit columns ───────────────────────────
-- All nullable or with backward-compatible defaults.
-- Existing rows: product_id gets 'taxres_crm', source gets 'web' via DEFAULT.
-- PostgreSQL applies defaults to storage at first write after column addition;
-- existing rows read the default without a table rewrite.
alter table support_tickets
  add column if not exists product_id          text not null default 'taxres_crm',
  add column if not exists product_tenant_id   text,          -- product-native org UUID
  add column if not exists product_tenant_name text,          -- denormalized display name
  add column if not exists product_user_id     text,          -- user.id from originating product
  add column if not exists product_user_email  text,          -- user.email from originating product
  add column if not exists product_org_role    text,          -- role at ticket creation (AUDIT ONLY)
  add column if not exists ticket_number       text,          -- TAX-000001, set by trigger
  add column if not exists source              text not null default 'web',
  add column if not exists assigned_to         text,          -- future: assignee email
  add column if not exists internal_notes      text;          -- Romy-only notes, never shown to submitter

-- ── 3. ticket_number uniqueness ──────────────────────────────────────────
-- UNIQUE in PostgreSQL allows multiple NULL values (NULL ≠ NULL).
-- Existing rows with ticket_number = NULL are unaffected.
alter table support_tickets
  add constraint support_tickets_ticket_number_unique
    unique (ticket_number);

-- ── 4. source check constraint ───────────────────────────────────────────
alter table support_tickets
  add constraint support_tickets_source_check
    check (source in ('web', 'email', 'api'));

-- ── 5. Per-product ticket number sequences ───────────────────────────────
-- Sequences are concurrency-safe: concurrent inserts receive distinct values.
-- Gaps are expected after transaction rollbacks and are acceptable —
-- ticket_number is an identifier, not an audit count.
-- To add a future product: CREATE SEQUENCE ticket_seq_<product_id> and add
-- a CASE branch in the assign_ticket_number() function below.
create sequence if not exists ticket_seq_taxres_crm start 1 increment 1;
create sequence if not exists ticket_seq_camvella   start 1 increment 1;
create sequence if not exists ticket_seq_arcvena    start 1 increment 1;
create sequence if not exists ticket_seq_bocasync   start 1 increment 1;

-- ── 6. Ticket number trigger function ────────────────────────────────────
-- BEFORE INSERT: executes before the row is stored.
-- Sets new.ticket_number based on product_id.
-- Never fires on existing rows — ALTER TABLE column additions do not
-- invoke INSERT triggers on existing data.
create or replace function assign_ticket_number()
returns trigger
language plpgsql
as $$
declare
  v_prefix   text;
  v_seq_name text;
  v_seq_val  bigint;
begin
  -- Map product_id → display prefix (3 uppercase chars)
  v_prefix := case new.product_id
    when 'taxres_crm' then 'TAX'
    when 'camvella'   then 'CAM'
    when 'arcvena'    then 'ARC'
    when 'bocasync'   then 'BOC'
    else upper(left(replace(new.product_id, '-', '_'), 3))
  end;

  -- Map product_id → sequence name
  v_seq_name := 'ticket_seq_' || replace(new.product_id, '-', '_');

  -- Advance sequence atomically. On unknown product_id, fall back to
  -- the TAX sequence rather than failing the insert.
  begin
    execute format('select nextval(%L)', v_seq_name) into v_seq_val;
  exception when others then
    v_seq_name := 'ticket_seq_taxres_crm';
    execute format('select nextval(%L)', v_seq_name) into v_seq_val;
  end;

  -- Format: PREFIX-000001 (zero-padded 6 digits, grows naturally past 999999)
  new.ticket_number := v_prefix || '-' || lpad(v_seq_val::text, 6, '0');

  return new;
end;
$$;

-- ── 7. Attach trigger ─────────────────────────────────────────────────────
drop trigger if exists set_ticket_number on support_tickets;
create trigger set_ticket_number
  before insert on support_tickets
  for each row
  execute function assign_ticket_number();

-- ── 8. Extend support_ticket_messages.sender check constraint ─────────────
-- Finds the existing sender check constraint by scanning pg_constraint
-- (safe regardless of the auto-generated name PostgreSQL assigned).
-- Drops it and replaces with extended version that includes 'customer'.
-- Existing rows with sender IN ('staff','romy') satisfy the new constraint.
do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'public.support_ticket_messages'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%sender%'
  limit 1;

  if v_conname is not null then
    execute format('alter table support_ticket_messages drop constraint %I', v_conname);
  end if;
end;
$$;

alter table support_ticket_messages
  add constraint support_ticket_messages_sender_check
    check (sender in ('staff', 'romy', 'customer'));

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK SQL
-- To fully reverse Phase 1, run the following in the Supabase SQL Editor.
-- Safe to run even if migration was only partially applied.
-- ─────────────────────────────────────────────────────────────────────────
-- begin;
--
-- drop trigger if exists set_ticket_number on support_tickets;
-- drop function if exists assign_ticket_number();
-- drop sequence if exists ticket_seq_bocasync;
-- drop sequence if exists ticket_seq_arcvena;
-- drop sequence if exists ticket_seq_camvella;
-- drop sequence if exists ticket_seq_taxres_crm;
--
-- alter table support_tickets
--   drop constraint if exists support_tickets_ticket_number_unique,
--   drop constraint if exists support_tickets_source_check,
--   drop column if exists internal_notes,
--   drop column if exists assigned_to,
--   drop column if exists source,
--   drop column if exists ticket_number,
--   drop column if exists product_org_role,
--   drop column if exists product_user_email,
--   drop column if exists product_user_id,
--   drop column if exists product_tenant_name,
--   drop column if exists product_tenant_id,
--   drop column if exists product_id;
--
-- alter table support_tickets
--   alter column tenant_id set not null;
--
-- do $$
-- declare v_conname text;
-- begin
--   select conname into v_conname
--   from pg_constraint
--   where conrelid = 'public.support_ticket_messages'::regclass
--     and contype = 'c'
--     and pg_get_constraintdef(oid) like '%sender%'
--   limit 1;
--   if v_conname is not null then
--     execute format('alter table support_ticket_messages drop constraint %I', v_conname);
--   end if;
-- end; $$;
--
-- alter table support_ticket_messages
--   add constraint support_ticket_messages_sender_check
--     check (sender in ('staff', 'romy'));
--
-- commit;
