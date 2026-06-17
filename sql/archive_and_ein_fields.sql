-- ============================================================================
-- Archive support for Leads + Clients (soft-delete, never a real delete)
-- Plus EIN on leads (Clients already has it)
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================================

ALTER TABLE leads   ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false;
ALTER TABLE leads   ADD COLUMN IF NOT EXISTS ein text;

-- ============================================================================
-- Diagnostic: confirms whether irsDeadline / stateDeadline (claimed run last
-- session) actually exist, and shows the columns the app currently expects.
-- Run this and send back what it returns.
-- ============================================================================
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('leads','clients')
  AND column_name IN ('irsDeadline','stateDeadline','ein','archived')
ORDER BY table_name, column_name;
