revoke execute on function public.sync_outbound_call_to_calllog() from public;
revoke execute on function public.sync_outbound_call_to_calllog() from anon;
revoke execute on function public.sync_outbound_call_to_calllog() from authenticated;
grant execute on function public.sync_outbound_call_to_calllog() to service_role;
