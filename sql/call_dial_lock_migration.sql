-- Prevents receive-call from ringing the browser twice for the same inbound
-- call. SignalWire has been hitting the receive-call webhook MORE THAN ONCE
-- for the same CallSid within a few seconds of each other. Previously every
-- hit generated a brand new <Dial><Verto> command, which rang the browser
-- twice for one phone call — the two ring attempts collided and both
-- instantly hung up. This table is a simple lock: the first hit for a given
-- CallSid claims it and is allowed to dial; any repeat hit for that same
-- CallSid is turned away with a harmless empty response instead of ringing
-- again.
CREATE TABLE IF NOT EXISTS call_dial_locks (
  callsid text PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE call_dial_locks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "call_dial_locks_all" ON call_dial_locks;
CREATE POLICY "call_dial_locks_all" ON call_dial_locks FOR ALL USING (true) WITH CHECK (true);
