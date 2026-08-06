import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App.jsx'

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
  // Method 1: restore from sessionStorage (set by 404.html on deep-link 404)
  const saved = sessionStorage.getItem('redirect')
  if (saved) {
    sessionStorage.removeItem('redirect')
    if (saved.includes('/taxcasereview-CRM/')) {
      window.history.replaceState(null, '', saved)
      return
    }
  }
  // Method 2: ?route=/path&rest=params on the root URL
  // Allows taxresolutioncrm.github.io/taxcasereview-CRM/?route=/book&demo=true
  // without needing the 404.html redirect chain at all
  const sp = new URLSearchParams(window.location.search)
  const route = sp.get('route')
  if (route && route.startsWith('/')) {
    sp.delete('route')
    const rest = sp.toString()
    const newPath = '/taxcasereview-CRM' + route + (rest ? '?' + rest : '')
    window.history.replaceState(null, '', newPath)
  }
})()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Register service worker to ensure all users always get fresh deploys
// service worker removed
