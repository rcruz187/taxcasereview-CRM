-- emp_login_branding: lets the Employee Portal show the correct firm's logo
-- as soon as the WORK EMAIL field is filled in, before the PIN is submitted.
-- Deliberately narrow: returns ONLY firm name + logo_url, nothing about the
-- employee (no id, no access level, no whether the email exists vs doesn't —
-- an unmatched email just gets empty branding, same shape as a match with no
-- logo set, so this reveals nothing beyond what the branding itself would).
-- Same tenant-resolution + fallback logic as emp_login's branding block.
CREATE OR REPLACE FUNCTION public.emp_login_branding(p_email text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_tenant uuid;
  v_firm   record;
begin
  select tenant_id into v_tenant from employees
  where lower(trim(email)) = lower(trim(p_email))
  order by created_at limit 1;

  select s.name, s.logourl into v_firm
    from settings s
   where s.tenant_id is not distinct from v_tenant
   order by s.id limit 1;

  if v_firm is null then
    select s.name, s.logourl into v_firm from settings s order by s.id limit 1;
  end if;

  return json_build_object('name', coalesce(v_firm.name,''), 'logo_url', coalesce(v_firm.logourl,''));
end $function$;
