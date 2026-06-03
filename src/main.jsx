import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Apply saved brand color immediately on load — before any React renders
// This prevents a flash of the default blue on page refresh
;(function() {
  const saved = localStorage.getItem('tcr_brand_color')
  if (saved && saved.startsWith('#')) {
    document.documentElement.style.setProperty('--blue', saved)
    document.documentElement.style.setProperty('--blt', saved + '22')
    document.documentElement.style.setProperty('--b2c', saved + '33')
  }
})()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
