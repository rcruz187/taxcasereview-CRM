const fs = require('fs')
const path = 'src/pages/AdminPortal.jsx'
let s = fs.readFileSync(path,'utf8')

function once(from,to,label){
  const n = s.split(from).length-1
  if(n!==1) throw new Error(`${label}: expected 1 match, found ${n}`)
  s = s.replace(from,to)
}

once(
  "import RomyLabsBilling from '../components/admin/RomyLabsBilling'",
  "import RomyLabsBilling from '../components/admin/RomyLabsBilling'\nimport TrafficCoverage from '../components/admin/TrafficCoverage'",
  'traffic coverage import'
)

once(
  "  { path:'/crm-admin/command-center', label:'Command Center', icon:'⚡' },",
  "  { path:'/crm-admin/command-center', label:'Command Center', icon:'⚡' },\n  { path:'/crm-admin/traffic',        label:'Traffic Coverage', icon:'🌐' },",
  'traffic nav'
)

once(
  '            <Route path="/command-center" element={<AdminRouteErrorBoundary><CommandCenter/></AdminRouteErrorBoundary>}/>',
  '            <Route path="/command-center" element={<AdminRouteErrorBoundary><CommandCenter/></AdminRouteErrorBoundary>}/>\n            <Route path="/traffic"        element={<AdminRouteErrorBoundary><TrafficCoverage/></AdminRouteErrorBoundary>}/>',
  'traffic route'
)

fs.writeFileSync(path,s)
console.log('Traffic Coverage wired into Admin Portal')
