-- call_ai_summaries table
-- Stores Gemini AI transcription + summary for each recorded call

CREATE TABLE IF NOT EXISTS call_ai_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  call_sid TEXT,
  from_number TEXT,
  to_number TEXT,
  duration_seconds INTEGER,
  recording_url TEXT,
  transcript TEXT,
  summary TEXT,
  key_points TEXT[] DEFAULT '{}',
  action_items TEXT[] DEFAULT '{}',
  sentiment TEXT DEFAULT 'Unknown',
  next_steps TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE call_ai_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON call_ai_summaries
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM employees WHERE user_id = auth.uid()
    )
  );

-- Index for fast lookup by case/client
CREATE INDEX IF NOT EXISTS idx_call_ai_summaries_case_id ON call_ai_summaries(case_id);
CREATE INDEX IF NOT EXISTS idx_call_ai_summaries_client_id ON call_ai_summaries(client_id);
CREATE INDEX IF NOT EXISTS idx_call_ai_summaries_tenant_id ON call_ai_summaries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_call_ai_summaries_call_sid ON call_ai_summaries(call_sid);

-- Grant service role full access
GRANT ALL ON call_ai_summaries TO service_role;
