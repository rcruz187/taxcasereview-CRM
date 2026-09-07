-- Replaces the dead inbound-Verto-dial architecture. Real inbound callers
-- now get held in a SignalWire <Conference>, with a row here tracking
-- each one so the CRM can show the incoming-call banner and poll for
-- new calls. When staff clicks "Answer", the browser dials the business
-- number itself, which receive-call recognizes as an "agent join" and
-- bridges into the matching conference_name.
--
-- status values: 'ringing' (just came in, banner showing) ->
--   'answered' (staff clicked Answer, bridging in) or
--   'missed'   (timed out after 25s or staff clicked Decline — caller
--               was redirected to voicemail)

CREATE TABLE IF NOT EXISTS incoming_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  callsid text UNIQUE NOT NULL,
  conference_name text NOT NULL,
  from_number text,
  status text NOT NULL DEFAULT 'ringing',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE incoming_calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "incoming_calls_all" ON incoming_calls;
CREATE POLICY "incoming_calls_all" ON incoming_calls FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_incoming_calls_status_created
  ON incoming_calls (status, created_at DESC);
