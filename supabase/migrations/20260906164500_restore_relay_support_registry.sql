-- Restore Relay central support registry
-- Keeps the live RomyLabs support configuration represented in source.

insert into public.romylabs_product_support
  (product_id, support_enabled, ticket_prefix, next_ticket_seq, display_name, notify_email, secret_env_key)
values
  ('restore_relay', true, 'RRL', 1, 'Restore Relay', 'info@romylabs.com', 'RESTORE_RELAY_SUPPORT_SECRET')
on conflict (product_id) do update set
  support_enabled = excluded.support_enabled,
  ticket_prefix = excluded.ticket_prefix,
  display_name = excluded.display_name,
  notify_email = excluded.notify_email,
  secret_env_key = excluded.secret_env_key,
  updated_at = now();
