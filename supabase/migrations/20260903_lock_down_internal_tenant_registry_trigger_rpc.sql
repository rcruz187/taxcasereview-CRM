-- Internal tenant->RomyLabs registry synchronization runs only as a PostgreSQL trigger.
-- It must never be directly callable through PostgREST by anonymous or signed-in clients.
REVOKE ALL ON FUNCTION public.sync_taxres_tenant_to_romylabs_office_registry() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_taxres_tenant_to_romylabs_office_registry() FROM anon, authenticated;
