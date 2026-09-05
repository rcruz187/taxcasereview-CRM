-- BocaSync inbound SMS routing and unmatched SMS triage.

BEGIN;

CREATE TABLE IF NOT EXISTS public.practice_sms_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  label text,
  default_assignee uuid REFERENCES public.practice_users(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_sms_numbers_phone_nonempty CHECK (length(trim(phone_number)) >= 7)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_practice_sms_numbers_phone
  ON public.practice_sms_numbers(regexp_replace(phone_number,'[^0-9+]','','g'));
CREATE INDEX IF NOT EXISTS idx_practice_sms_numbers_practice
  ON public.practice_sms_numbers(practice_id,active);

DROP TRIGGER IF EXISTS practice_sms_numbers_set_updated_at ON public.practice_sms_numbers;
CREATE TRIGGER practice_sms_numbers_set_updated_at
BEFORE UPDATE ON public.practice_sms_numbers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.inbox_unmatched_sms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  sms_number_id uuid REFERENCES public.practice_sms_numbers(id) ON DELETE SET NULL,
  provider_message_id text,
  from_number text NOT NULL,
  to_number text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched','linked','ignored')),
  linked_patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_inbox_unmatched_sms_provider
  ON public.inbox_unmatched_sms(practice_id,provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_unmatched_sms_practice_status
  ON public.inbox_unmatched_sms(practice_id,status,received_at DESC);

ALTER TABLE public.practice_sms_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_unmatched_sms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS practice_sms_numbers_select ON public.practice_sms_numbers;
CREATE POLICY practice_sms_numbers_select ON public.practice_sms_numbers
FOR SELECT TO authenticated
USING (
  public.has_my_permission(practice_id,'messages.view')
  OR public.has_my_permission(practice_id,'settings.view')
);

DROP POLICY IF EXISTS practice_sms_numbers_manage ON public.practice_sms_numbers;
CREATE POLICY practice_sms_numbers_manage ON public.practice_sms_numbers
FOR ALL TO authenticated
USING (
  public.has_my_permission(practice_id,'messages.manage')
  OR public.has_my_permission(practice_id,'settings.manage')
)
WITH CHECK (
  public.has_my_permission(practice_id,'messages.manage')
  OR public.has_my_permission(practice_id,'settings.manage')
);

DROP POLICY IF EXISTS inbox_unmatched_sms_select ON public.inbox_unmatched_sms;
CREATE POLICY inbox_unmatched_sms_select ON public.inbox_unmatched_sms
FOR SELECT TO authenticated
USING (public.has_my_permission(practice_id,'messages.view'));

DROP POLICY IF EXISTS inbox_unmatched_sms_update ON public.inbox_unmatched_sms;
CREATE POLICY inbox_unmatched_sms_update ON public.inbox_unmatched_sms
FOR UPDATE TO authenticated
USING (public.has_my_permission(practice_id,'messages.manage'))
WITH CHECK (public.has_my_permission(practice_id,'messages.manage'));

REVOKE INSERT, DELETE ON public.inbox_unmatched_sms FROM authenticated;

COMMIT;
