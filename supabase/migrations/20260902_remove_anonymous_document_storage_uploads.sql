-- Public client/organizer uploads now go through token-bound Edge Functions
-- (portal-action / organizer-action). Direct anonymous writes to the private
-- documents bucket are no longer required and must remain disabled.
drop policy if exists organizer_docs_storage_insert on storage.objects;
drop policy if exists portal_docs_storage_insert on storage.objects;
