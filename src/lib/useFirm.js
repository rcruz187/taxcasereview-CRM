/**
 * useFirm — shared hook that loads firm branding from Supabase settings.
 * Used by all document generators and the sidebar so that when the firm
 * updates their name, logo, or address in Settings everything updates.
 *
 * Multi-tenant: settings is RLS-scoped by current_tenant_id(), so each login
 * automatically gets its OWN tenant's branding here — no overlay needed.
 */
import { useState, useEffect } from 'react'
import { supabase } from './supabase'

const BUCKET = 'firm-assets'

let _cache = null   // module-level cache so we only hit DB once per session

async function loadFirmData() {
  const { data: s } = await supabase.from('settings').select('*').limit(1).maybeSingle()
  // Each tenant shows ONLY its own uploaded logo (settings.logourl). We do NOT
  // fall back to the shared firm-assets/logo bucket file — that single file is
  // global and gets overwritten by whichever tenant last uploaded, which would
  // bleed one firm's logo onto another. No logourl → neutral bundled default.
  const logo = (s && s.logourl) ? s.logourl : '/taxcasereview-CRM/logo.png'
  return { firm: s || {}, logoUrl: logo }
}

export function useFirm() {
  const [firm, setFirm]     = useState(_cache?.firm || null)
  const [logoUrl, setLogo]  = useState(_cache?.logoUrl || '')
  const [loading, setLoading] = useState(!_cache)

  useEffect(() => {
    if (_cache) return
    loadFirmData().then(data => { _cache = data; setFirm(data.firm); setLogo(data.logoUrl); setLoading(false) })
  }, [])

  function refresh() {
    _cache = null
    setLoading(true)
    loadFirmData().then(data => { _cache = data; setFirm(data.firm); setLogo(data.logoUrl); setLoading(false) })
  }

  const name      = firm?.name     || 'Tax Case Review'
  const tagline   = firm?.tagline  || 'IRS Resolution Services'
  const address   = [firm?.address, firm?.city, firm?.state, firm?.zip].filter(Boolean).join(', ')
  const phone     = firm?.phone    || ''
  const email     = firm?.email    || ''
  const website   = firm?.website  || ''

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

  function footer() {
    return `${name} · ${address || ''} · ${email || ''} · Not a law firm`
  }

  return { firm, logoUrl, loading, refresh, name, tagline, address, phone, email, website, letterhead, footer }
}
