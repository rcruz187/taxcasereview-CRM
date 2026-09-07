-- Supports multiple agents (Romy, Dana, Yesenia, future employees) being
-- logged in and on the phones at the same time, without cross-wiring into
-- each other's calls.
--
-- BACKGROUND: until now, every browser connected to SignalWire RELAY under
-- the literal shared resource name 'office', and receive-call's isAgentJoin
-- branch bridged whichever browser's self-dial landed first into "the most
-- recent ringing/pending row" -- with no concept of WHICH agent that
-- self-dial belonged to. With one person (Romy) that was harmless. With two
-- or more people online at once, two agents clicking Answer (or both
-- starting outbound calls) close together had no way to be told apart,
-- risking a real caller getting bridged to the wrong agent, or two agents
-- bridged into each other's call.
--
-- FIX: claiming a call now happens BEFORE the self-dial fires, as an atomic
-- conditional UPDATE from the browser (only succeeds if the row is still
-- unclaimed). Whichever agent's click wins the database race gets
-- claimed_by set to their name; the other agent's update affects zero rows,
-- so their UI knows immediately it lost the race and shows "Already
-- answered by ___" instead of dialing in at all. receive-call's
-- isAgentJoin branch is otherwise unchanged -- it still bridges into "the
-- most recently claimed row," but now that's unambiguous because only one
-- agent's browser will actually go on to self-dial for any given row.

-- incoming_calls: record which agent (by display name) claimed a ringing
-- call, so a second agent who also clicks Answer gets told who beat them
-- to it instead of silently bridging in alongside (or instead of) them.
ALTER TABLE incoming_calls ADD COLUMN IF NOT EXISTS claimed_by text;

-- outbound_calls: record which agent originated the call. Not strictly
-- needed for collision-prevention (each outbound call already gets its own
-- fresh conference_name), but kept for consistency/visibility and in case
-- it's useful later (e.g. "show me Dana's outbound calls today").
ALTER TABLE outbound_calls ADD COLUMN IF NOT EXISTS agent_name text;

-- Helpful for claim queries (status + recency lookups), matching the
-- existing idx_incoming_calls_status_created pattern.
CREATE INDEX IF NOT EXISTS idx_outbound_calls_status_created
  ON outbound_calls (status, created_at DESC);
