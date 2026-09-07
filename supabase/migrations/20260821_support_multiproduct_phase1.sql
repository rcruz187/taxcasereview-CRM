-- ─────────────────────────────────────────────────────────────────────
-- Migration: support_multiproduct_phase1
-- Filename:  20260821_support_multiproduct_phase1.sql
-- Version:   2 (revised per Romy review — 2026-08-21)
-- Author:    RomyLabs / Claude
--
-- PURPOSE:
--   Phase 1 of the RomyLabs centralized support architecture.
--   Extends support_tickets and support_ticket_messages to support
--   Camvella, Arcvena, BocaSync alongside existing TaxRes, while
--   preserving ALL existing TaxRes data and behavior unchanged.
--
-- CHANGES IN v2 vs v1 (commit 00be4b3c1270):
--   [1] assign_ticket_number(): fallback removed; unknown product_id
--       now raises EXCEPTION instead of consuming the TaxRes sequence.
--   [2] support_tickets.product_id now has a CHECK constraint that
--       limits values to the four approved Phase 1 product IDs.
--   [3] assign_ticket_number() now guards NEW.ticket_number IS NULL,
--       preserving any caller-supplied value.
--   [4] Rollback documentation corrected: zero-data-loss only pre-Phase-4.
--   [5] sender constraint detection upgraded: pg_attribute column join
--       instead of pg_get_constraintdef() text match, eliminating any
--       risk of accidentally selecting an unrelated check constraint.
--
-- SAFETY GUARANTEES:
--   - All new columns are nullable or have safe defaults → zero row rewrite
--   - tenant_id FK preserved; only NOT NULL constraint relaxed
--   - Existing TaxRes RLS policies unchanged
--   - current_tenant_id() not modified
--   - Existing support RPCs not modified
--   - Support.jsx and /crm-admin/support unchanged
--   - Existing TaxRes tickets untouched (ticket_number = NULL per design)
--   - Trigger fires only on INSERT and only when ticket_number IS NULL
--   - No UI changes, no support-api, no Camvella integration
--   - Rollback limitations documented accurately below
--
-- DO NOT APPLY until Romy supplies production row-count baseline
-- and approves this specific revision.
-- ─────────────────────────────────────────────────────────────────────

begin;

-- ── 1. Make tenant_id nullable ──────────────────────────────────────────
-- The FK to tenants(id) is preserved — TaxRes rows still cascade on delete.
-- Existing rows all have tenant_id populated (inserted under the old NOT NULL
-- constraint). This relaxation affects only new non-TaxRes inserts (NULL).
alter table support_tickets
  alter column tenant_id drop not null;

-- ── 2. Add product identity and audit columns ───────────────────────────
-- All nullable or with backward-compatible defaults.
-- product_id DEFAULT 'taxres_crm': existing rows read this default value
-- without a row rewrite (PostgreSQL 12+ virtual default behavior).
-- product_org_role is AUDIT METADATA ONLY — never used for authorization.
alter table support_tickets
  add column if not exists product_id          text not null default 'taxres_crm',
  add column if not exists product_tenant_id   text,
  add column if not exists product_tenant_name text,
  add column if not exists product_user_id     text,
  add column if not exists product_user_email  text,
  add column if not exists product_org_role    text,
  add column if not exists ticket_number       text,
  add column if not exists source              text not null default 'web',
  add column if not exists assigned_to         text,
  add column if not exists internal_notes      text;

-- ── 3. product_id CHECK constraint — approved Phase 1 values only ───────
-- Future products are added deliberately through a separate migration
-- (new sequence + new product_id value added to this constraint).
-- Existing rows have product_id = 'taxres_crm' (the DEFAULT) and satisfy
-- this constraint without any UPDATE statement.
alter table support_tickets
  add constraint support_tickets_product_id_check
    check (product_id in ('taxres_crm', 'camvella', 'arcvena', 'bocasync'));

-- ── 4. ticket_number uniqueness ─────────────────────────────────────────
-- UNIQUE in PostgreSQL allows multiple NULL values (SQL standard: NULL ≠ NULL).
-- Existing rows with ticket_number = NULL are unaffected.
alter table support_tickets
  add constraint support_tickets_ticket_number_unique
    unique (ticket_number);

-- ── 5. source CHECK constraint ──────────────────────────────────────────
alter table support_tickets
  add constraint support_tickets_source_check
    check (source in ('web', 'email', 'api'));

-- ── 6. Per-product ticket number sequences ───────────────────────────────
-- Sequences are concurrency-safe: concurrent inserts receive distinct values
-- from nextval() regardless of transaction isolation level.
-- IMPORTANT: PostgreSQL sequences can have gaps after transaction rollbacks.
-- This is expected and acceptable — ticket_number is an identifier, not
-- an audit count. Do not rely on ticket numbers being contiguous.
create sequence if not exists ticket_seq_taxres_crm start 1 increment 1;
create sequence if not exists ticket_seq_camvella   start 1 increment 1;
create sequence if not exists ticket_seq_arcvena    start 1 increment 1;
create sequence if not exists ticket_seq_bocasync   start 1 increment 1;

-- ── 7. Ticket number trigger function ────────────────────────────────────
-- Fires BEFORE INSERT on support_tickets.
-- Assigns ticket_number ONLY when NEW.ticket_number IS NULL, preserving
-- any caller-supplied value (enables future controlled imports/restores).
-- Unknown product_id raises EXCEPTION — does NOT fall back to another
-- sequence or prefix. Only the four Phase 1 product IDs are accepted.
-- To add a future product: add a CASE branch here AND CREATE SEQUENCE above.
create or replace function assign_ticket_number()
returns trigger
language plpgsql
as $$
declare
  v_prefix   text;
  v_seq_name text;
  v_seq_val  bigint;
begin
  -- If caller supplied a ticket_number, preserve it unchanged.
  if new.ticket_number is not null then
    return new;
  end if;

  -- Map product_id to display prefix and sequence name.
  -- Any product_id not listed here is a hard error — no fallback.
  case new.product_id
    when 'taxres_crm' then
      v_prefix   := 'TAX';
      v_seq_name := 'ticket_seq_taxres_crm';
    when 'camvella' then
      v_prefix   := 'CAM';
      v_seq_name := 'ticket_seq_camvella';
    when 'arcvena' then
      v_prefix   := 'ARC';
      v_seq_name := 'ticket_seq_arcvena';
    when 'bocasync' then
      v_prefix   := 'BOC';
      v_seq_name := 'ticket_seq_bocasync';
    else
      raise exception
        'assign_ticket_number: unsupported product_id ''%''. '
        'Add a sequence and CASE branch before using this product_id.',
        new.product_id;
  end case;

  -- Advance the sequence atomically.
  execute format('select nextval(%L)', v_seq_name) into v_seq_val;

  -- Format: PREFIX-000001 (6-digit zero-padded; grows past 999999 naturally)
  new.ticket_number := v_prefix || '-' || lpad(v_seq_val::text, 6, '0');

  return new;
end;
$$;

-- ── 8. Attach trigger ────────────────────────────────────────────────────
-- BEFORE INSERT, FOR EACH ROW.
-- Does not fire on existing rows — ALTER TABLE column additions do not
-- invoke INSERT triggers on pre-existing data.
drop trigger if exists set_ticket_number on support_tickets;
create trigger set_ticket_number
  before insert on support_tickets
  for each row
  execute function assign_ticket_number();

-- ── 9. Extend support_ticket_messages.sender CHECK constraint ─────────────
-- Locates the existing sender check constraint using a pg_attribute column
-- join (not a text match on pg_get_constraintdef), which is definitive:
-- it can only match a constraint whose conkey[] includes the 'sender' column
-- attnum — it cannot accidentally select an unrelated check constraint.
-- Existing rows (sender IN ('staff','romy')) satisfy the new constraint.
do $$
declare
  v_conname text;
begin
  select c.conname into v_conname
  from pg_constraint c
  join pg_attribute a
    on  a.attrelid = c.conrelid
    and a.attnum   = any(c.conkey)
  where c.conrelid = 'public.support_ticket_messages'::regclass
    and c.contype  = 'c'
    and a.attname  = 'sender'
  limit 1;

  if v_conname is not null then
    execute format(
      'alter table support_ticket_messages drop constraint %I',
      v_conname
    );
  end if;
end;
$$;

alter table support_ticket_messages
  add constraint support_ticket_messages_sender_check
    check (sender in ('staff', 'romy', 'customer'));

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK PROCEDURES
--
-- TWO ROLLBACK PATHS — choose based on whether Phase 4+ data exists.
-- Phase 4 is when non-TaxRes products begin creating tickets via support-api.
-- ─────────────────────────────────────────────────────────────────────────

-- ── ROLLBACK PATH A: Pre-Phase-4 (safe to drop columns) ──────────────────
-- Use when: no multi-product tickets have been created yet.
-- This is zero-data-loss ONLY if product_id is still 'taxres_crm' on all rows
-- and ticket_number is still NULL on all rows (no new sequences consumed).
-- Verify first:
--   SELECT count(*) FROM support_tickets WHERE product_id != 'taxres_crm';
--   → must return 0 before proceeding
--
-- begin;
--
-- drop trigger  if exists set_ticket_number on support_tickets;
-- drop function if exists assign_ticket_number();
-- drop sequence if exists ticket_seq_bocasync;
-- drop sequence if exists ticket_seq_arcvena;
-- drop sequence if exists ticket_seq_camvella;
-- drop sequence if exists ticket_seq_taxres_crm;
--
-- alter table support_tickets
--   drop constraint if exists support_tickets_product_id_check,
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
--   select c.conname into v_conname
--   from pg_constraint c
--   join pg_attribute a
--     on  a.attrelid = c.conrelid
--     and a.attnum   = any(c.conkey)
--   where c.conrelid = 'public.support_ticket_messages'::regclass
--     and c.contype  = 'c'
--     and a.attname  = 'sender'
--   limit 1;
--   if v_conname is not null then
--     execute format(
--       'alter table support_ticket_messages drop constraint %I', v_conname);
--   end if;
-- end; $$;
--
-- alter table support_ticket_messages
--   add constraint support_ticket_messages_sender_check
--     check (sender in ('staff', 'romy'));
--
-- commit;

-- ── ROLLBACK PATH B: Post-Phase-4 (data-preserving) ──────────────────────
-- Use when: non-TaxRes tickets exist (product_id != 'taxres_crm' OR
-- ticket_number IS NOT NULL). Dropping columns would destroy that data.
--
-- DO NOT use Path A if:
--   SELECT count(*) FROM support_tickets WHERE product_id != 'taxres_crm'
--   returns > 0.
--
-- Data-preserving strategy:
--   1. Archive multi-product ticket data before schema change:
--      CREATE TABLE support_tickets_multiproduct_archive AS
--        SELECT * FROM support_tickets WHERE product_id != 'taxres_crm';
--   2. Delete non-TaxRes tickets (or move them to archive table)
--   3. Remove sequences, trigger, function
--   4. Drop the new columns (now safe — all remaining rows are TaxRes)
--   5. Restore tenant_id NOT NULL
--   6. Restore sender constraint
--   7. Retain archive table until it can be migrated elsewhere
--
-- This is a non-trivial operation requiring a specific migration script
-- written at rollback time with full knowledge of what data exists.
-- Do not drop columns blindly. Write and review the rollback migration
-- before executing it.
-- ─────────────────────────────────────────────────────────────────────────
