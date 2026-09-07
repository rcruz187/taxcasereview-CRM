-- ============================================================
-- Tax Case Review CRM — Migration v3
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. SignalWire columns on settings table ──────────────────
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS sw_space_url     TEXT,
  ADD COLUMN IF NOT EXISTS sw_project_id    TEXT,
  ADD COLUMN IF NOT EXISTS sw_api_token     TEXT,
  ADD COLUMN IF NOT EXISTS sw_sip_username  TEXT,
  ADD COLUMN IF NOT EXISTS sw_sip_password  TEXT,
  ADD COLUMN IF NOT EXISTS sw_inbound_did   TEXT;

-- ── 2. call_logs table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  direction     TEXT NOT NULL DEFAULT 'outbound', -- 'inbound' | 'outbound'
  from_number   TEXT,
  to_number     TEXT,
  duration_sec  INTEGER DEFAULT 0,
  status        TEXT DEFAULT 'completed', -- 'completed' | 'missed' | 'failed' | 'busy' | 'no-answer'
  recording_url TEXT,
  notes         TEXT,
  lead_id       UUID REFERENCES leads(id) ON DELETE SET NULL,
  client_id     UUID REFERENCES clients(id) ON DELETE SET NULL,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL
);

-- ── 3. sms_logs table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  direction   TEXT NOT NULL DEFAULT 'outbound',
  from_number TEXT,
  to_number   TEXT,
  body        TEXT,
  status      TEXT DEFAULT 'sent', -- 'sent' | 'delivered' | 'failed' | 'received'
  lead_id     UUID REFERENCES leads(id) ON DELETE SET NULL,
  client_id   UUID REFERENCES clients(id) ON DELETE SET NULL,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL
);

-- ── 4. fax_logs table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fax_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  direction   TEXT NOT NULL DEFAULT 'outbound',
  from_number TEXT,
  to_number   TEXT,
  pages       INTEGER DEFAULT 1,
  status      TEXT DEFAULT 'sent', -- 'sent' | 'delivered' | 'failed' | 'received'
  fax_url     TEXT,
  notes       TEXT,
  lead_id     UUID REFERENCES leads(id) ON DELETE SET NULL,
  client_id   UUID REFERENCES clients(id) ON DELETE SET NULL,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL
);

-- ── 5. Disable RLS + grant full access on new tables ─────────
ALTER TABLE call_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs  DISABLE ROW LEVEL SECURITY;
ALTER TABLE fax_logs  DISABLE ROW LEVEL SECURITY;

GRANT ALL ON call_logs TO anon, authenticated, service_role;
GRANT ALL ON sms_logs  TO anon, authenticated, service_role;
GRANT ALL ON fax_logs  TO anon, authenticated, service_role;

-- ── 6. Indexes for common queries ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_call_logs_lead_id   ON call_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_client_id ON call_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_created   ON call_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_logs_lead_id    ON sms_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_client_id  ON sms_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_created    ON sms_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fax_logs_lead_id    ON fax_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_fax_logs_client_id  ON fax_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_fax_logs_created    ON fax_logs(created_at DESC);

-- ── Done ─────────────────────────────────────────────────────
SELECT 'Migration v3 complete' AS status;
