-- Adds department tracking so the incoming-call banner can show which IVR
-- option the caller picked ("Tax Professional" vs "Front Desk"). Calls that
-- go straight to voicemail (Option 2, or any no-answer timeout) never get
-- a row here at all in the ringing state — see ivr-route.
ALTER TABLE incoming_calls ADD COLUMN IF NOT EXISTS department text;
