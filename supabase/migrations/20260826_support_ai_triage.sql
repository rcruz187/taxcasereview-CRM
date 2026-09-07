BEGIN;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS ai_triage jsonb,
  ADD COLUMN IF NOT EXISTS ai_triaged_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_triage_model text;

COMMENT ON COLUMN public.support_tickets.ai_triage IS
  'Human-review-only AI support analysis. Must never be treated as an automatic customer response or automatic ticket disposition.';

COMMIT;
