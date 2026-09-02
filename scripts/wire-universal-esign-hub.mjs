import fs from 'node:fs'
const path='src/pages/AdminPortal.jsx'
let s=fs.readFileSync(path,'utf8')

const lazyAnchor="const NewOffice    = lazy(() => import('./NewOffice'))"
if(!s.includes("const ESignaturesHub = lazy(() => import('./ESignaturesHub'))")){
  if(!s.includes(lazyAnchor)) throw new Error('AdminPortal lazy import anchor missing')
  s=s.replace(lazyAnchor,"const ESignaturesHub = lazy(() => import('./ESignaturesHub'))\n"+lazyAnchor)
}

const navAnchor="  { path:'/crm-admin/offices',        label:'Offices',         icon:'🏢' },"
if(!s.includes("path:'/crm-admin/esign'")){
  if(!s.includes(navAnchor)) throw new Error('AdminPortal Offices nav anchor missing')
  s=s.replace(navAnchor,navAnchor+"\n  { path:'/crm-admin/esign',          label:'E-Signatures',    icon:'✍️' },")
}

if(!s.includes('path="/esign"')){
  const candidates=[
    '        <Route path="/offices"        element={<Offices/>}/>',
    '      <Route path="/offices"        element={<Offices/>}/>',
    '<Route path="/offices"        element={<Offices/>}/>'
  ]
  const anchor=candidates.find(x=>s.includes(x))
  if(!anchor) throw new Error('AdminPortal Offices route anchor missing')
  const prefix=anchor.match(/^\s*/)?.[0]||''
  s=s.replace(anchor,anchor+`\n${prefix}<Route path="/esign"          element={<AdminRouteErrorBoundary><ESignaturesHub/></AdminRouteErrorBoundary>}/>`)
}

fs.writeFileSync(path,s)
console.log('Universal E-Sign hub wired into AdminPortal')
