-- Oculivo central support registry
-- Source-tracked support registration for RomyLabs Admin Portal routing.

insert into public.romylabs_product_support
  (product_id, support_enabled, ticket_prefix, next_ticket_seq, display_name, notify_email, secret_env_key)
values
  ('oculivo', true, 'OCU', 1, 'Oculivo', 'info@romylabs.com', 'OCULIVO_SUPPORT_SECRET')
on conflict (product_id) do update set
  support_enabled = excluded.support_enabled,
  ticket_prefix = excluded.ticket_prefix,
  display_name = excluded.display_name,
  notify_email = excluded.notify_email,
  secret_env_key = excluded.secret_env_key;
