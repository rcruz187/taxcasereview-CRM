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
import './theme-scrollbars.css'
import App from './App.jsx'
import { getModel } from './lib/leadStatus'

// Emergency compatibility guards for lazy-loaded modules that were recently
// refactored to use new helpers/hooks without importing them locally. These are
// synchronous and side-effect free; they mount nothing. Keep the app available
// while the individual modules are normalized back to explicit imports.
globalThis.React = React
globalThis.getModel = getModel
globalThis.useMemo = React.useMemo

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

// HR routes include both outer public routes (/kiosk, /employee) and inner CRM
// routes. Production users reported that client-side transitions into this
// mixed route group could leave a stale lazy-route shell until Ctrl+F5. Make
// sidebar HR navigation perform a normal same-origin document navigation so
// the destination always boots with the correct route graph and current deploy.
// This is deliberately scoped to sidebar .nav-item links only; it changes no
// auth, permissions, payroll/time-clock logic, or links elsewhere in the app.
const HR_NAV_PATHS = new Set([
  '/kiosk', '/employee', '/timeclock', '/timeoff', '/payroll', '/activity-report'
])
document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const link = event.target?.closest?.('a.nav-item[href]')
  if (!link) return
  try {
    const url = new URL(link.href, window.location.href)
    if (url.origin !== window.location.origin || !HR_NAV_PATHS.has(url.pathname)) return
    event.preventDefault()
    window.location.assign(url.href)
  } catch (_) {}
}, true)

// Register service worker to ensure all users always get fresh deploys
// service worker removed
