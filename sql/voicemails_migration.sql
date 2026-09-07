CREATE TABLE IF NOT EXISTS voicemails (
  id bigserial PRIMARY KEY,
  from_number text,
  to_number text,
  recording_url text,
  duration_seconds int,
  call_sid text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE voicemails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "voicemails_all" ON voicemails;
CREATE POLICY "voicemails_all" ON voicemails FOR ALL USING (true) WITH CHECK (true);
