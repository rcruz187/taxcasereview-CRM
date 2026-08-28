-- RomyLabs platform-owner protection.
-- These identities must not be deleted, renamed, or deactivated from any CRM.

create schema if not exists app_private;

create or replace function app_private.is_protected_platform_owner_email(p_email text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select lower(coalesce(p_email, '')) in (
    'romy@romylabs.com',
    'info@romylabs.com',
    'romy@taxrescrm.net'
  );
$$;

create or replace function app_private.protect_platform_owner_record()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, app_private
as $$
declare
  old_row jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) else '{}'::jsonb end;
  new_row jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) else '{}'::jsonb end;
  old_email text := old_row ->> 'email';
  new_email text := new_row ->> 'email';
begin
  if tg_op = 'DELETE' then
    if app_private.is_protected_platform_owner_email(old_email) then
      raise exception 'Protected RomyLabs platform owner account cannot be deleted';
    end if;
    return old;
  end if;

  if app_private.is_protected_platform_owner_email(old_email) then
    if lower(coalesce(new_email,'')) <> lower(coalesce(old_email,'')) then
      raise exception 'Protected RomyLabs platform owner email cannot be changed';
    end if;

    if new_row ? 'status' and lower(coalesce(new_row ->> 'status','active')) <> 'active' then
      raise exception 'Protected RomyLabs platform owner account cannot be deactivated';
    end if;

    if new_row ? 'is_active' and coalesce((new_row ->> 'is_active')::boolean, true) is false then
      raise exception 'Protected RomyLabs platform owner account cannot be deactivated';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_romylabs_platform_owner_auth on auth.users;
create trigger protect_romylabs_platform_owner_auth
before delete or update on auth.users
for each row execute function app_private.protect_platform_owner_record();

do $$
declare
  t text;
begin
  foreach t in array array[
    'employees','users','profiles','staff','team_members','organization_members',
    'members','user_profiles','practice_users','workforce_members'
  ] loop
    if to_regclass('public.' || t) is not null
       and exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name=t and column_name='email'
       ) then
      execute format('drop trigger if exists protect_romylabs_platform_owner on public.%I', t);
      execute format(
        'create trigger protect_romylabs_platform_owner before delete or update on public.%I for each row execute function app_private.protect_platform_owner_record()',
        t
      );
    end if;
  end loop;
end $$;
