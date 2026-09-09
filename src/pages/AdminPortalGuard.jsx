import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import AdminPortal from './AdminPortal'

const ROMYLABS_CONTROL_TENANT = 'a0000000-0000-0000-0000-000000000001'

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
      // /crm-admin uses the dedicated RomyLabs control-plane tenant for
      // tenant-scoped infrastructure such as phone state and voicemail.
      // This prevents a previous Jump In — or a TaxRes owner login — from
      // making RomyLabs calls resolve against the wrong office.
      try { sessionStorage.removeItem('admin_impersonation') } catch (_) {}
      const { error } = await supabase.rpc('set_admin_tenant_override', { p_tenant_id: ROMYLABS_CONTROL_TENANT })
      if (error) {
        console.error('Admin Portal control-plane tenant setup failed:', error)
        if (!cancelled) return
      }
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
