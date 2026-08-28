-- Registry-driven product branding for RomyLabs website/admin surfaces.
alter table public.romylabs_products
  add column if not exists logo_url text;

create or replace function public.get_public_products()
returns table(
  product_id text,
  name text,
  lifecycle text,
  tagline text,
  short_desc text,
  description text,
  marketing_url text,
  app_url text,
  cta_label text,
  accent_color text,
  icon_ref text,
  logo_url text,
  industry text,
  features text[],
  sort_order integer,
  seo_title text,
  seo_description text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select
    product_id, name, lifecycle, tagline, short_desc, description,
    marketing_url, app_url, cta_label, accent_color, icon_ref, logo_url,
    industry, features, sort_order, seo_title, seo_description, updated_at
  from public.romylabs_products
  where public = true and active = true
  order by sort_order nulls last, name;
$$;

revoke all on function public.get_public_products() from public;
grant execute on function public.get_public_products() to anon, authenticated, service_role;
