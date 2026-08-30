-- RomyLabs central multi-brand inbound email router.
-- Runtime schema was first verified/applied in production, then captured here for source control.

BEGIN;

CREATE TABLE IF NOT EXISTS public.romylabs_mailboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_address text NOT NULL,
  product_id text NOT NULL,
  tenant_id uuid,
  display_name text NOT NULL,
  outbound_from text NOT NULL,
  inbox_owner text NOT NULL DEFAULT 'info@romylabs.com',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT romylabs_mailboxes_email_nonempty CHECK (length(trim(email_address)) > 3),
  CONSTRAINT romylabs_mailboxes_outbound_nonempty CHECK (length(trim(outbound_from)) > 3)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_romylabs_mailboxes_email_lower
  ON public.romylabs_mailboxes (lower(email_address));
CREATE INDEX IF NOT EXISTS idx_romylabs_mailboxes_product_active
  ON public.romylabs_mailboxes (product_id, active);

ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS received_mailbox text;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS reply_from text;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS product_id text;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS in_reply_to text;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS references_header text;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS assigned_to text;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS route_id uuid;

CREATE INDEX IF NOT EXISTS idx_emails_received_mailbox
  ON public.emails (lower(received_mailbox)) WHERE received_mailbox IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emails_product_received
  ON public.emails (product_id, received_at DESC) WHERE received_mailbox IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_emails_inbound_message_route
  ON public.emails (message_id, route_id)
  WHERE direction = 'inbound' AND message_id IS NOT NULL AND route_id IS NOT NULL;

INSERT INTO public.romylabs_mailboxes
  (email_address, product_id, tenant_id, display_name, outbound_from, inbox_owner, active)
VALUES
  ('info@romylabs.com','romylabs','a0000000-0000-0000-0000-000000000001','RomyLabs','info@romylabs.com','info@romylabs.com',true),
  ('romy@romylabs.com','romylabs','a0000000-0000-0000-0000-000000000001','RomyLabs','romy@romylabs.com','info@romylabs.com',true),
  ('romy@camvella.com','camvella','a0000000-0000-0000-0000-000000000001','Camvella','romy@camvella.com','info@romylabs.com',true),
  ('support@camvella.com','camvella','a0000000-0000-0000-0000-000000000001','Camvella Support','support@camvella.com','info@romylabs.com',true),
  ('romy@arcvena.com','arcvena','a0000000-0000-0000-0000-000000000001','Arcvena','romy@arcvena.com','info@romylabs.com',true),
  ('support@arcvena.com','arcvena','a0000000-0000-0000-0000-000000000001','Arcvena Support','support@arcvena.com','info@romylabs.com',true),
  ('romy@bocasync.com','bocasync','a0000000-0000-0000-0000-000000000001','BocaSync','romy@bocasync.com','info@romylabs.com',true),
  ('support@bocasync.com','bocasync','a0000000-0000-0000-0000-000000000001','BocaSync Support','support@bocasync.com','info@romylabs.com',true)
ON CONFLICT (lower(email_address)) DO UPDATE SET
  product_id = EXCLUDED.product_id,
  tenant_id = EXCLUDED.tenant_id,
  display_name = EXCLUDED.display_name,
  outbound_from = EXCLUDED.outbound_from,
  inbox_owner = EXCLUDED.inbox_owner,
  active = EXCLUDED.active,
  updated_at = now();

ALTER TABLE public.romylabs_mailboxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS romylabs_mailboxes_admin_select ON public.romylabs_mailboxes;
CREATE POLICY romylabs_mailboxes_admin_select ON public.romylabs_mailboxes
FOR SELECT TO authenticated
USING (
  lower(coalesce(auth.jwt()->>'email','')) IN (
    'info@romylabs.com',
    'romy@romylabs.com',
    'romy@taxrescrm.net',
    'romy@taxcasereview.org'
  )
);

DROP POLICY IF EXISTS romylabs_mailboxes_admin_manage ON public.romylabs_mailboxes;
CREATE POLICY romylabs_mailboxes_admin_manage ON public.romylabs_mailboxes
FOR ALL TO authenticated
USING (lower(coalesce(auth.jwt()->>'email','')) IN ('info@romylabs.com','romy@romylabs.com'))
WITH CHECK (lower(coalesce(auth.jwt()->>'email','')) IN ('info@romylabs.com','romy@romylabs.com'));

COMMIT;
