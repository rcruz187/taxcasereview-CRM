-- Register RomyLabs Product #7 in the central product registry.
-- Restore Relay is the next CRM in the build queue, but is not public/commercial yet.
insert into public.romylabs_products (
  product_id,name,active,description,lifecycle,public,tagline,short_desc,
  marketing_url,app_url,cta_label,accent_color,icon_ref,industry,features,
  sort_order,seo_title,seo_description,updated_at
) values (
  'restore_relay',
  'Restore Relay CRM',
  true,
  'Restoration and roofing CRM for claim, project, client, crew, and field-service operations.',
  'building',
  false,
  'Built for restoration and roofing operations',
  'RomyLabs Product #7 — a restoration and roofing CRM for contractors managing claims, jobs, crews, customers, documents, and field workflows.',
  null,
  null,
  null,
  '#F97316',
  '🏚️',
  'Restoration & Roofing',
  array[
    'Claim & project management',
    'Customer & property CRM',
    'Job scheduling & dispatch',
    'Crew & field operations',
    'Photo & document workflows',
    'Estimates, invoices & payments'
  ]::text[],
  6,
  'Restore Relay CRM — Restoration & Roofing Management Software',
  'Restoration and roofing CRM for managing claims, projects, crews, customers, documents, estimates, and field operations.',
  now()
)
on conflict (product_id) do update set
  name=excluded.name,
  active=excluded.active,
  description=excluded.description,
  lifecycle=excluded.lifecycle,
  public=excluded.public,
  tagline=excluded.tagline,
  short_desc=excluded.short_desc,
  accent_color=excluded.accent_color,
  icon_ref=excluded.icon_ref,
  industry=excluded.industry,
  features=excluded.features,
  sort_order=excluded.sort_order,
  seo_title=excluded.seo_title,
  seo_description=excluded.seo_description,
  updated_at=now();
