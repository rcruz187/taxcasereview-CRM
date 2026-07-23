// firmBranding.js — one live source of firm identity for EMAIL + DOCUMENT
// templates.
//
// Many templates are giant inline HTML strings built at call time, so they
// can't easily await a fetch. Instead this module exports a mutable FIRM
// object that is filled once at app start (and refreshed after Settings
// saves). Templates interpolate ${FIRM.name} / ${FIRM.logoUrl} etc. and always
// render the CURRENT tenant's branding.
//
// Every value comes from that tenant's own `settings` row (RLS-scoped), so a
// demo/prospect tenant renders its own firm — never Tax Case Review's.

import { supabase } from './supabase'

// Slug for per-tenant asset folders (blank IRS/state form templates carrying
// that firm's representative details). Derived from the firm name rather than a
// tenant id so it needs no schema change and stays readable on disk.
export function firmSlug(name) {
  return String(name || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export const FIRM = {
  name: '',
  slug: '',
  logoUrl: '',
  address: '',   // full one-line address
  phone: '',
  email: '',
  website: '',
  fax: '',
  loaded: false,
}

export async function loadFirmBranding() {
  try {
    const { data: s } = await supabase
      .from('settings')
      .select('name,firmname,logourl,address,firmaddress,city,state,zip,phone,firmphone,email,firmemail,website,firm_fax_number')
      .limit(1).maybeSingle()
    if (!s) return FIRM

    const name = s.name || s.firmname || ''
    // Prefer the structured address parts; fall back to the legacy one-liner.
    const cityLine = [s.city, s.state].filter(Boolean).join(', ')
    const built = [s.address, cityLine, s.zip].filter(Boolean).join(', ')
    const address = built || s.firmaddress || ''

    FIRM.name = name
    FIRM.slug = firmSlug(name)
    // The browser tab is part of the product's face — a prospect signed into
    // their demo should not see another firm's name above their own CRM. The
    // static index.html title remains the pre-login fallback.
    try { document.title = `${name} — IRS Resolution CRM` } catch (_) {}
    FIRM.logoUrl = s.logourl || ''
    FIRM.address = address
    FIRM.phone = s.phone || s.firmphone || ''
    FIRM.email = s.email || s.firmemail || ''
    FIRM.website = s.website || ''
    FIRM.fax = s.firm_fax_number || ''
    FIRM.loaded = true
  } catch (_) { /* leave whatever we have; templates degrade gracefully */ }
  return FIRM
}

// Footer line used at the bottom of most transactional emails.
// For PUBLIC/anon pages (SignPage, intake + organizer wizards, client portal).
// Anonymous visitors can't read `settings` under RLS, so branding comes from
// the anon-safe booking_get_public_meta RPC instead. Call this on mount of any
// page a logged-out client can reach, or it will render the default firm.
export async function loadFirmBrandingPublic() {
  try {
    const { data } = await supabase.rpc('booking_get_public_meta')
    if (data) {
      if (data.firm_name) FIRM.name = data.firm_name
      if (data.logo_url) FIRM.logoUrl = data.logo_url
      FIRM.loaded = true
    }
  } catch (_) { /* keep defaults */ }
  return FIRM
}

export function firmFooterLine() {
  return [FIRM.name, FIRM.address, FIRM.phone].filter(Boolean).join(' · ')
}
