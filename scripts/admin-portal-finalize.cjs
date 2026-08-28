// Admin portal deterministic finalizer — intentionally source-scoped.
const fs=require('fs');
function replaceOnce(s, from, to, label){
  if(s.includes(to)) return s;
  const n=s.split(from).length-1;
  if(n!==1) throw new Error(`${label}: expected exactly one source match, found ${n}`);
  return s.replace(from,to);
}
let app=fs.readFileSync('src/App.jsx','utf8');
app=replaceOnce(app,"const AdminPortal = lazy(() => import('./pages/AdminPortal'))","const AdminPortalGuard = lazy(() => import('./pages/AdminPortalGuard'))",'AdminPortal lazy import');
app=replaceOnce(app,'<RequireAuth adminOnly>\n          <Suspense fallback={<div style={{minHeight:\'100vh\',background:\'#0d0c1a\'}}/>}>\n            <AdminPortal />\n          </Suspense>\n        </RequireAuth>','<RequireAuth>\n          <Suspense fallback={<div style={{minHeight:\'100vh\',background:\'#0d0c1a\'}}/>}>\n            <AdminPortalGuard />\n          </Suspense>\n        </RequireAuth>','admin owner guard route');
fs.writeFileSync('src/App.jsx',app);
let portal=fs.readFileSync('src/pages/AdminPortal.jsx','utf8');
portal=replaceOnce(portal,"import AIAssistant from '../components/AIAssistant'","import AIAssistant from '../components/AIAssistant'\nimport RomyLabsBilling from '../components/admin/RomyLabsBilling'",'billing import');
portal=replaceOnce(portal,'<Route path="/billing"        element={<Billing/>}/>','<Route path="/billing"        element={<AdminRouteErrorBoundary><RomyLabsBilling/></AdminRouteErrorBoundary>}/>','SaaS billing route');
fs.writeFileSync('src/pages/AdminPortal.jsx',portal);
