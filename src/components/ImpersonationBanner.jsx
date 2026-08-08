// ImpersonationBanner — shows at the top of the CRM when you're in an
// admin impersonation session. Always visible so you never forget you're
// acting as Super Admin inside another office.

import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'

export default function ImpersonationBanner() {
  const { impersonation } = useApp()
  const navigate = useNavigate()

  if (!impersonation) return null

  function exitSession() {
    sessionStorage.removeItem('admin_impersonation')
    // Navigate back to admin portal
    window.location.href = '/crm-admin'
  }

  const elapsed = Math.floor((Date.now() - new Date(impersonation.started_at).getTime()) / 60000)

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
      background: 'linear-gradient(90deg, #7c3aed, #6366f1)',
      padding: '8px 20px',
      display: 'flex', alignItems: 'center', gap: 12,
      fontSize: 13, color: '#fff',
      boxShadow: '0 2px 12px rgba(99,102,241,.4)'
    }}>
      <span style={{ fontSize: 16 }}>🛡️</span>
      <span style={{ fontWeight: 700 }}>Admin Session</span>
      <span style={{ opacity: .7 }}>·</span>
      <span>You're inside <strong>{impersonation.firm_name}</strong> as Super Admin</span>
      <span style={{ opacity: .7 }}>·</span>
      <span style={{ opacity: .7, fontSize: 12 }}>Started {elapsed === 0 ? 'just now' : `${elapsed}m ago`}</span>
      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 11, opacity: .7 }}>All actions are logged</span>
      <button onClick={exitSession}
        style={{
          padding: '5px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,.4)',
          background: 'rgba(255,255,255,.15)', color: '#fff',
          cursor: 'pointer', fontSize: 12, fontWeight: 700,
          backdropFilter: 'blur(4px)'
        }}>
        ✕ Exit Session
      </button>
    </div>
  )
}
