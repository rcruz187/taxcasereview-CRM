-- Accounting integrations (QuickBooks Online + Xero), per tenant. Same shape
-- for both providers so the sync engine and UI can treat them symmetrically —
-- provider-specific quirks live in the edge functions, not the schema.
--
-- Design: one row per tenant per provider in accounting_connections. Access
-- tokens are short-lived (both QBO and Xero: ~1hr) and refresh tokens are
-- long-lived (QBO: 100 days, refreshed on use; Xero: 60 days, refreshed on
-- use) — both providers REQUIRE refresh-token rotation on every use, so the
-- edge functions always store the newest refresh_token they receive back.
-- Tokens are never exposed to the frontend; only edge functions (service
-- role) read/write this table.

CREATE TABLE IF NOT EXISTS public.accounting_connections (
  id                text PRIMARY KEY DEFAULT ('acct' || extract(epoch from clock_timestamp())::bigint::text),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider          text NOT NULL CHECK (provider IN ('quickbooks','xero')),
  -- QBO: the "realm ID" / company ID. Xero: the "tenant ID" (Xero's own org
  -- id, unrelated to our tenants.id) — both stored here under one name since
  -- each provider only ever has one and the meaning is provider-specific.
  external_company_id text,
  external_company_name text,
  access_token      text,
  refresh_token     text,
  token_expires_at  timestamptz,
  connected_by      text,       -- employee email who did the OAuth connect
  connected_at      timestamptz,
  last_synced_at    timestamptz,
  last_sync_result  jsonb,      -- {ok, synced_invoices, synced_payments, errors[]}
  status            text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected','connected','error')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider)
);
ALTER TABLE public.accounting_connections ENABLE ROW LEVEL SECURITY;
-- No permissive policy — only SECURITY DEFINER RPCs / the service role touch
-- this table (it holds live OAuth tokens), same pattern as portal_sessions
-- and office_agreements.

-- get_accounting_status: what the Settings page needs to render — NEVER
-- returns the actual tokens, just connection state, scoped to the CALLER'S
-- OWN tenant (not platform-admin-gated — every office manages its own
-- accounting connection).
CREATE OR REPLACE FUNCTION public.get_accounting_status()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := current_tenant_id();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No tenant context.'; END IF;
  RETURN (
    SELECT coalesce(jsonb_object_agg(provider, jsonb_build_object(
      'status', status,
      'external_company_name', external_company_name,
      'connected_by', connected_by,
      'connected_at', connected_at,
      'last_synced_at', last_synced_at,
      'last_sync_result', last_sync_result
    )), '{}'::jsonb)
    FROM accounting_connections WHERE tenant_id = v_tenant
  );
END $function$;

-- disconnect_accounting: lets an office's own admin remove a connection
-- (token revocation with the provider itself happens in the edge function
-- before this is called, if the provider's API supports it — this RPC just
-- clears the stored row either way).
CREATE OR REPLACE FUNCTION public.disconnect_accounting(p_provider text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := current_tenant_id();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No tenant context.'; END IF;
  DELETE FROM accounting_connections WHERE tenant_id = v_tenant AND provider = p_provider;
  RETURN jsonb_build_object('ok', true);
END $function$;
