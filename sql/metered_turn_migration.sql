-- ============================================================================
-- Free TURN server credentials (Metered.ca / Open Relay Project)
-- ============================================================================
-- Backs the new turn-credentials Edge Function. Without a TURN server, the
-- video calling (Huddle + client meeting links) only works reliably when
-- both people happen to be on networks that allow a direct peer-to-peer
-- connection -- a real and fairly common chunk of real-world connections
-- (different ISPs, corporate firewalls, some cellular/CGNAT setups) can't
-- connect directly and need a relay. Metered's Open Relay Project gives
-- 20GB/month of TURN relay free, no credit card -- plenty for a 3-person
-- team plus occasional client meetings.
-- ============================================================================

ALTER TABLE settings ADD COLUMN IF NOT EXISTS metered_app_name text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS metered_api_key text;
