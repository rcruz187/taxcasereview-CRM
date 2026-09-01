-- Security closeout: remove unintended elevated API exposure while preserving intentional gateways.

alter view public.admin_product_traffic_coverage set (security_invoker = true);

revoke all on function public._romylabs_product_name(text) from public, anon, authenticated;
grant execute on function public._romylabs_product_name(text) to service_role;

revoke all on function public.admin_product_calendar_events(text) from public, anon;
grant execute on function public.admin_product_calendar_events(text) to authenticated, service_role;

revoke all on function public.seed_product_traffic_channels() from public, anon, authenticated;
grant execute on function public.seed_product_traffic_channels() to service_role;
