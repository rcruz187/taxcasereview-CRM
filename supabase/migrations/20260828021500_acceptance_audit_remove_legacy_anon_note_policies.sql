-- Acceptance audit: remove legacy direct anonymous note access.
-- Public portal/organizer flows use token-validated SECURITY DEFINER RPCs instead.

drop policy if exists anon_insert on public.client_notes;
drop policy if exists anon_visible_notes_only on public.client_notes;
drop policy if exists anon_insert on public.lead_notes;
