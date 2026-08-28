from pathlib import Path

p = Path('src/App.jsx')
s = p.read_text()

old_gate = '''function AdminGate() {
  const { user } = useApp()
  const navigate = useNavigate()

  // Check for active impersonation session
  const isImpersonating = !!sessionStorage.getItem('admin_impersonation')
  const impParam = new URLSearchParams(window.location.search).get('imp')

  useEffect(() => {
    // Only redirect to admin portal if NOT in an impersonation session
    if (isPlatformOwner(user?.email) && !isImpersonating && !impParam) {
      navigate('/crm-admin', { replace: true })
    }
  }, [user])

  // If impersonating, always show the CRM shell regardless of email
  if (isImpersonating || impParam) return <Shell />
  if (isPlatformOwner(user?.email) && !isImpersonating) return null
  return <Shell />
}
'''

new_gate = '''function AdminGate() {
  const { user } = useApp()
  const navigate = useNavigate()
  const isAdminHost = window.location.hostname.toLowerCase() === 'admin.romylabs.com'

  // Check for active impersonation session
  const isImpersonating = !!sessionStorage.getItem('admin_impersonation')
  const impParam = new URLSearchParams(window.location.search).get('imp')

  useEffect(() => {
    // Admin routing is host-scoped. Owner credentials on TaxRes must stay in CRM.
    if (isAdminHost && isPlatformOwner(user?.email) && !isImpersonating && !impParam) {
      navigate('/crm-admin', { replace: true })
    }
  }, [user, isAdminHost, isImpersonating, impParam, navigate])

  // Product hosts always render their CRM, including for RomyLabs owners.
  if (!isAdminHost) return <Shell />
  if (isImpersonating || impParam) return <Shell />
  if (isPlatformOwner(user?.email) && !isImpersonating) return null
  return <Shell />
}
'''

old_route = '''      <Route path="/crm-admin/*" element={
        <RequireAuth>
          <Suspense fallback={<div style={{minHeight:'100vh',background:'#0d0c1a'}}/>}>
            <AdminPortalGuard />
          </Suspense>
        </RequireAuth>
      } />
'''

new_route = '''      <Route path="/crm-admin/*" element={
        window.location.hostname.toLowerCase() === 'admin.romylabs.com' ? (
          <RequireAuth>
            <Suspense fallback={<div style={{minHeight:'100vh',background:'#0d0c1a'}}/>}>
              <AdminPortalGuard />
            </Suspense>
          </RequireAuth>
        ) : <Navigate to="/" replace />
      } />
'''

if old_gate not in s:
    raise SystemExit('AdminGate block not found; aborting')
if old_route not in s:
    raise SystemExit('crm-admin route block not found; aborting')

s = s.replace(old_gate, new_gate, 1)
s = s.replace(old_route, new_route, 1)
s = s.replace('          {/* romy@taxrescrm.net always goes to the admin portal */}\n', '          {/* Owner routing is host-scoped: product hosts remain in CRM. */}\n', 1)
p.write_text(s)
