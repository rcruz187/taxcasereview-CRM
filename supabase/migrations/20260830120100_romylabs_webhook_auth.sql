-- Stores only the digest of the Stalwart MTA Hook bearer token.
-- The raw credential belongs only in Stalwart/provider configuration.

CREATE TABLE IF NOT EXISTS public.romylabs_webhook_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL UNIQUE,
  token_sha256 text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz
);

ALTER TABLE public.romylabs_webhook_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.romylabs_webhook_credentials FROM anon, authenticated;

-- Production receives its token digest through an applied migration/rotation.
-- Do not commit the live bearer token or its operational rotation workflow here.
