// demoBranding.js — sales-demo overlay.
//
// Lets a Super Admin present the CRM as any prospect's firm WITHOUT touching
// the real settings row or any production data. The active prospect id lives in
// localStorage; branding readers (useFirm, the CC-auth doc, the public /book
// page via ?demo=<id>) prefer the active prospect when one is set, and fall
// straight back to the real firm settings when it isn't.
//
// Prospects live in the demo_profiles table (anon-readable so a prospect-branded
// /book link works with no login; writable only by the Super Admin).

import { supabase } from './supabase'

const KEY = 'tcr_demo_profile_id'
const _cache = {}   // id -> profile row

export function getActiveDemoId() {
  try { return localStorage.getItem(KEY) || '' } catch { return '' }
}

export function setActiveDemoId(id) {
  try {
    if (id) localStorage.setItem(KEY, id)
    else localStorage.removeItem(KEY)
  } catch { /* ignore */ }
  // Notify branding readers in this tab to refresh.
  try { window.dispatchEvent(new Event('demo-branding-changed')) } catch { /* ignore */ }
}

export async function fetchDemoProfile(id) {
  if (!id) return null
  if (_cache[id]) return _cache[id]
  try {
    const { data } = await supabase.from('demo_profiles').select('*').eq('id', id).maybeSingle()
    if (data) _cache[id] = data
    return data || null
  } catch {
    return null
  }
}

export async function getActiveDemoProfile() {
  return fetchDemoProfile(getActiveDemoId())
}

export async function listDemoProfiles() {
  try {
    const { data } = await supabase.from('demo_profiles').select('*').order('name')
    return data || []
  } catch {
    return []
  }
}

// Map a demo_profiles row onto the firm-branding shape the app uses.
export function profileToFirm(p) {
  if (!p) return null
  return {
    name: p.name || '',
    tagline: p.tagline || '',
    phone: p.phone || '',
    email: p.email || '',
    address: p.address || '',
    city: p.city || '',
    state: p.state || '',
    zip: p.zip || '',
    website: p.website || '',
    firm_fax_number: p.fax || '',
    _logoUrl: p.logo_url || '',
  }
}
