-- BocaSync message/email attachments
-- Private per-practice storage for communication and unmatched-email files.

BEGIN;

CREATE TABLE IF NOT EXISTS public.communication_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  communication_id uuid REFERENCES public.patient_communications(id) ON DELETE CASCADE,
  unmatched_email_id uuid REFERENCES public.inbox_unmatched_messages(id) ON DELETE CASCADE,
  filename text NOT NULL,
  mime_type text,
  size_bytes bigint,
  storage_path text NOT NULL,
  content_id text,
  disposition text NOT NULL DEFAULT 'attachment' CHECK (disposition IN ('attachment','inline')),
  source text NOT NULL DEFAULT 'outbound' CHECK (source IN ('outbound','inbound')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT communication_attachments_filename_nonempty CHECK (length(trim(filename)) > 0),
  CONSTRAINT communication_attachments_storage_path_nonempty CHECK (length(trim(storage_path)) > 0),
  CONSTRAINT communication_attachments_size_nonnegative CHECK (size_bytes IS NULL OR size_bytes >= 0),
  CONSTRAINT communication_attachments_one_parent CHECK (
    (communication_id IS NOT NULL AND unmatched_email_id IS NULL)
    OR (communication_id IS NULL AND unmatched_email_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_communication_attachments_communication
  ON public.communication_attachments(communication_id, created_at)
  WHERE communication_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_communication_attachments_unmatched
  ON public.communication_attachments(unmatched_email_id, created_at)
  WHERE unmatched_email_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_communication_attachments_practice
  ON public.communication_attachments(practice_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_communication_attachments_storage_path
  ON public.communication_attachments(storage_path);

ALTER TABLE public.communication_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS communication_attachments_select ON public.communication_attachments;
CREATE POLICY communication_attachments_select ON public.communication_attachments
FOR SELECT TO authenticated
USING (public.has_my_permission(practice_id,'messages.view'));

DROP POLICY IF EXISTS communication_attachments_manage ON public.communication_attachments;
CREATE POLICY communication_attachments_manage ON public.communication_attachments
FOR ALL TO authenticated
USING (public.has_my_permission(practice_id,'messages.manage'))
WITH CHECK (public.has_my_permission(practice_id,'messages.manage'));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-attachments',
  'message-attachments',
  false,
  15728640,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public=false,
    file_size_limit=EXCLUDED.file_size_limit,
    allowed_mime_types=EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS message_attachments_storage_select ON storage.objects;
CREATE POLICY message_attachments_storage_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id='message-attachments'
  AND EXISTS (
    SELECT 1 FROM public.practice_users viewer
    WHERE viewer.user_id=auth.uid()
      AND viewer.active=true
      AND name LIKE viewer.practice_id::text || '/%'
      AND public.has_my_permission(viewer.practice_id,'messages.view')
  )
);

DROP POLICY IF EXISTS message_attachments_storage_insert ON storage.objects;
CREATE POLICY message_attachments_storage_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id='message-attachments'
  AND EXISTS (
    SELECT 1 FROM public.practice_users viewer
    WHERE viewer.user_id=auth.uid()
      AND viewer.active=true
      AND name LIKE viewer.practice_id::text || '/%'
      AND public.has_my_permission(viewer.practice_id,'messages.manage')
  )
);

DROP POLICY IF EXISTS message_attachments_storage_update ON storage.objects;
CREATE POLICY message_attachments_storage_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id='message-attachments'
  AND EXISTS (
    SELECT 1 FROM public.practice_users viewer
    WHERE viewer.user_id=auth.uid()
      AND viewer.active=true
      AND name LIKE viewer.practice_id::text || '/%'
      AND public.has_my_permission(viewer.practice_id,'messages.manage')
  )
)
WITH CHECK (
  bucket_id='message-attachments'
  AND EXISTS (
    SELECT 1 FROM public.practice_users viewer
    WHERE viewer.user_id=auth.uid()
      AND viewer.active=true
      AND name LIKE viewer.practice_id::text || '/%'
      AND public.has_my_permission(viewer.practice_id,'messages.manage')
  )
);

DROP POLICY IF EXISTS message_attachments_storage_delete ON storage.objects;
CREATE POLICY message_attachments_storage_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id='message-attachments'
  AND EXISTS (
    SELECT 1 FROM public.practice_users viewer
    WHERE viewer.user_id=auth.uid()
      AND viewer.active=true
      AND name LIKE viewer.practice_id::text || '/%'
      AND public.has_my_permission(viewer.practice_id,'messages.manage')
  )
);

COMMIT;
