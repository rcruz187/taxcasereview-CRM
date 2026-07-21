/**
 * useFirm — shared hook that loads firm branding from Supabase settings.
 * Used by all document generators and the sidebar so that when the firm
 * updates their name, logo, or address in Settings everything updates.
 */
import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { getActiveDemoProfile, profileToFirm } from './demoBranding'

const BUCKET = 'firm-assets'

let _cache = null   // module-level cache so we only hit DB once per session

async function loadFirmData() {
  const [{ data: s }, { data: logoData }, demo] = await Promise.all([
    supabase.from('settings').select('*').limit(1).maybeSingle(),
    supabase.storage.from(BUCKET).getPublicUrl('logo'),
    getActiveDemoProfile(),
  ])
  let firmData = s || {}
  let logo = logoData?.publicUrl || '/taxcasereview-CRM/logo.png'
  // Demo overlay — present as the active prospect without touching real data.
  const dp = profileToFirm(demo)
  if (dp) {
    firmData = { ...firmData, ...dp }
    if (dp._logoUrl) logo = dp._logoUrl
  }
  return { firm: firmData, logoUrl: logo }
}

export function useFirm() {
  const [firm, setFirm]     = useState(_cache?.firm || null)
  const [logoUrl, setLogo]  = useState(_cache?.logoUrl || '')
  const [loading, setLoading] = useState(!_cache)

  useEffect(() => {
    let alive = true
    async function go() {
      if (_cache) { setFirm(_cache.firm); setLogo(_cache.logoUrl); setLoading(false); return }
      const data = await loadFirmData()
      _cache = data
      if (!alive) return
      setFirm(data.firm); setLogo(data.logoUrl); setLoading(false)
    }
    go()
    // When Demo Mode switches prospect, rebuild branding app-wide.
    function onDemoChange() { _cache = null; go() }
    window.addEventListener('demo-branding-changed', onDemoChange)
    return () => { alive = false; window.removeEventListener('demo-branding-changed', onDemoChange) }
  }, [])

  // Force refresh (called after logo upload or settings save)
  function refresh() {
    _cache = null
    setLoading(true)
    loadFirmData().then(data => { _cache = data; setFirm(data.firm); setLogo(data.logoUrl); setLoading(false) })
  }

  // Derived helpers used in doc headers
  const name      = firm?.name     || 'Tax Case Review'
  const tagline   = firm?.tagline  || 'IRS Resolution Services'
  const address   = [firm?.address, firm?.city, firm?.state, firm?.zip].filter(Boolean).join(', ')
  const phone     = firm?.phone    || ''
  const email     = firm?.email    || ''
  const website   = firm?.website  || ''

  // Build the letterhead HTML string used at top of every generated doc
  function letterhead(subtitle = '') {
    return `
      <div style="display:flex;align-items:center;gap:16px;border-bottom:3px solid #1A7FD4;padding-bottom:14px;margin-bottom:20px">
        ${logoUrl
          ? `<img src="${logoUrl}" style="height:64px;width:auto;object-fit:contain;flex-shrink:0" alt="${name} logo"/>`
          : `<div style="width:64px;height:64px;background:#1A7FD4;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;font-weight:900;flex-shrink:0">${name[0]}</div>`
        }
        <div>
          <div style="font-size:22px;font-weight:900;color:#1A7FD4;line-height:1.1">${name}</div>
          <div style="font-size:12px;color:#64748b;margin-top:2px">${tagline}</div>
          ${subtitle ? `<div style="font-size:13px;font-weight:700;color:#0f172a;margin-top:4px">${subtitle}</div>` : ''}
        </div>
        <div style="margin-left:auto;text-align:right;font-size:11px;color:#64748b;line-height:1.7">
          ${address ? address + '<br/>' : ''}
          ${phone ? phone + '<br/>' : ''}
          ${email ? email + '<br/>' : ''}
          ${website || ''}
        </div>
      </div>`
  }

  // Footer line used at bottom of every generated doc
  function footer() {
    return `${name} · ${address || ''} · ${email || ''} · Not a law firm`
  }

  return { firm, logoUrl, loading, refresh, name, tagline, address, phone, email, website, letterhead, footer }
}
