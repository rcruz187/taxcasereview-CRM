-- Harden RomyLabs admin RPC execute grants.
-- These functions already enforce _is_platform_admin() internally; this migration
-- also removes unnecessary PUBLIC/anon EXECUTE capability at the database ACL layer.

REVOKE ALL ON FUNCTION public.admin_romylabs_agreements_for_office(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_romylabs_agreements_for_office(text,text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_romylabs_create_office_agreement(text,text,text,text,text,integer,numeric,numeric,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_romylabs_create_office_agreement(text,text,text,text,text,integer,numeric,numeric,integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_romylabs_office_registry(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_romylabs_office_registry(text,text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_romylabs_upsert_office_registry(text,text,text,text,text,text,integer,numeric,date,date,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_romylabs_upsert_office_registry(text,text,text,text,text,text,integer,numeric,date,date,text,jsonb) TO authenticated, service_role;
