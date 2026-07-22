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

export const FIRM = {
  name: '',
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
export function firmFooterLine() {
  return [FIRM.name, FIRM.address, FIRM.phone].filter(Boolean).join(' · ')
}
