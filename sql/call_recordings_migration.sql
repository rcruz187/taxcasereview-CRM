CREATE TABLE IF NOT EXISTS call_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_sid text,
  from_number text,
  to_number text,
  recording_url text,
  duration_seconds integer,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE call_recordings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON call_recordings FOR ALL TO authenticated USING (true) WITH CHECK (true);
