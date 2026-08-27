import { Navigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import AdminPortal from './AdminPortal'

const PLATFORM_OWNER_EMAILS = new Set([
  'info@romylabs.com',
  'romy@romylabs.com',
  'romy@taxrescrm.net',
  'romy@taxcasereview.org',
])

export default function AdminPortalGuard() {
  const { user, checking } = useApp()
  if (checking) return null
  const email = user?.email?.toLowerCase() || ''
  if (!PLATFORM_OWNER_EMAILS.has(email)) return <Navigate to="/" replace />
  return <AdminPortal />
}
