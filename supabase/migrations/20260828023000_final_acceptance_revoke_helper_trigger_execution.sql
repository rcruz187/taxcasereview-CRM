REVOKE EXECUTE ON FUNCTION public.encrypt_email_password(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.encrypt_email_password(text,text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.notify_romylabs_site_rebuild() FROM PUBLIC, anon, authenticated;
