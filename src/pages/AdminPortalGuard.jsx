import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import AdminPortal from './AdminPortal'

const PLATFORM_OWNER_EMAILS = new Set([
  'info@romylabs.com',
  'romy@romylabs.com',
  'romy@taxrescrm.net',
  'romy@taxcasereview.org',
])

export default function AdminPortalGuard() {
  const { user, checking } = useApp()
  const [portalReady, setPortalReady] = useState(false)
  const email = user?.email?.toLowerCase() || ''
  const authorized = PLATFORM_OWNER_EMAILS.has(email)

  useEffect(() => {
    if (checking || !authorized) return
    let cancelled = false

    async function resetTenantContext() {
      // /crm-admin is the platform control plane, never a tenant session.
      // A previous Jump In may leave BOTH browser state and the durable
      // admin_tenant_overrides row pointing at CloudCPA/TCR/etc. Clear both
      // before rendering the portal so tenant context can never bleed in.
      try { sessionStorage.removeItem('admin_impersonation') } catch (_) {}
      try { await supabase.rpc('set_admin_tenant_override', { p_tenant_id: null }) } catch (_) {}
      if (!cancelled) setPortalReady(true)
    }

    resetTenantContext()
    return () => { cancelled = true }
  }, [checking, authorized, email])

  if (checking) return null
  if (!authorized) return <Navigate to="/" replace />
  if (!portalReady) return <div style={{minHeight:'100vh',background:'#0d0c1a'}} />
  return <AdminPortal />
}
