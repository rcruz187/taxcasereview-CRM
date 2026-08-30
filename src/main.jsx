// ─────────────────────────────────────────────────────────────────────────────
// main.jsx MUST remain minimal.
//
// HARD RULE: Only App is mounted here. Nothing else.
//
// DO NOT mount additional components directly in this file. Components mounted
// here run OUTSIDE App's ErrorBoundary and outside AppContext/auth state.
// Any crash here (network error, missing RPC, uninitialized context) brings
// down the entire application with a white screen — there is no recovery.
//
// Audit trail: EsignAuditBridge, EsignManagerAuditBridge, and TeamChatProBridge
// were mounted here and caused a full production outage (2026-08-27).
// They were removed to restore service. Their RPCs exist; if this functionality
// is needed, mount inside App.jsx wrapped in an ErrorBoundary.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import './polish.css'
import './theme-scrollbars.css'
import './taxres-mobile.css'
import App from './App.jsx'
import { getModel } from './lib/leadStatus'

// Emergency compatibility guards for lazy-loaded modules that were recently
// refactored to use new helpers/hooks without importing them locally. These are
// synchronous and side-effect free; they mount nothing. Keep the app available
// while the individual modules are normalized back to explicit imports.
globalThis.React = React
globalThis.getModel = getModel
globalThis.useMemo = React.useMemo

// A user can keep TCR open while a new GitHub Pages deploy replaces the hashed
// lazy-page chunks underneath that already-running tab. The old shell then asks
// for a chunk filename that no longer exists, which makes the clicked page fail
// and can make subsequent lazy routes look broken until a hard refresh.
// Detect only dynamic-import/chunk-load failures and perform ONE normal reload
// per 60 seconds. The current URL is preserved, so React Router returns the user
// to the page they clicked instead of leaving the shell poisoned.
;(function installStaleChunkRecovery() {
  const KEY = 'tcr_last_chunk_recovery'
  const WINDOW_MS = 60_000
  const matchesChunkFailure = value => {
    const msg = String(value?.message || value?.reason?.message || value?.reason || value || '')
    return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk|dynamically imported module/i.test(msg)
  }
  const recover = value => {
    if (!matchesChunkFailure(value)) return
    try {
      const last = Number(sessionStorage.getItem(KEY) || 0)
      const now = Date.now()
      if (now - last < WINDOW_MS) return
      sessionStorage.setItem(KEY, String(now))
    } catch {}
    window.location.reload()
  }
  window.addEventListener('unhandledrejection', event => recover(event.reason))
  window.addEventListener('error', event => recover(event.error || event.message))
})()

// Apply saved brand color instantly — before React renders (no flash)
;(function() {
  const hex = localStorage.getItem('tcr_brand_color')
  const rgb = localStorage.getItem('tcr_brand_rgb')
  if (!hex || !hex.startsWith('#')) return
  const root = document.documentElement
  root.style.setProperty('--blue', hex)
  root.style.setProperty('--b2',   hex)
  root.style.setProperty('--blt',  `rgba(${rgb},.18)`)
  root.style.setProperty('--b2c',  `rgba(${rgb},.14)`)
  // Re-inject override stylesheet so hardcoded rgba values also update
  const s = document.createElement('style')
  s.id = 'tcr-brand-override'
  s.textContent = `
    .nav-item.active { background: rgba(${rgb},.18) !important; color: ${hex} !important; border-left-color: ${hex} !important; }
    .btn.pri { background: ${hex} !important; border-color: ${hex} !important; }
    .btn.pri:hover { background: ${hex}dd !important; }
    .bdg.blue, .bdg.bb { background: rgba(${rgb},.18) !important; color: ${hex} !important; }
    .chip.active, .chip:hover, .chip.on { background: rgba(${rgb},.18) !important; color: ${hex} !important; border-color: ${hex} !important; }
    .tl-dot.blue { background: ${hex} !important; }
    .cal-event { background: ${hex} !important; }
    .cal-day.today { border-color: ${hex} !important; }
    .field input:focus, .field select:focus, .field textarea:focus { border-color: ${hex} !important; }
    .search-input:focus { border-color: ${hex} !important; }
    .metric:hover { border-color: ${hex} !important; }
    a { color: ${hex}; }
  `
  document.head.appendChild(s)
})()

// Restore deep-link URL after the GitHub Pages 404 SPA redirect.
// 404.html saves the original URL to sessionStorage.redirect before bouncing
// to the app root — we read it back here and replace the history entry so
// React Router sees the correct path + query string on first render.
;(function() {
  try {
    const saved = sessionStorage.getItem('redirect') || sessionStorage.redirect
    if (saved && saved.includes('/')) {
      sessionStorage.removeItem('redirect')
      try { delete sessionStorage.redirect } catch(e) {}
      window.history.replaceState(null, '', saved)
    }
  } catch(e) {}
})()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Register service worker to ensure all users always get fresh deploys
// service worker removed
