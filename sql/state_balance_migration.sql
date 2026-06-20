-- ============================================================================
-- Est. State Balance field for Leads + Clients
-- Mirrors the existing "irsBalance" field, shown/asked only when IRS or
-- State is "State" or "Both IRS + State".
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================================

ALTER TABLE leads   ADD COLUMN IF NOT EXISTS "stateBalance" text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "stateBalance" text;
