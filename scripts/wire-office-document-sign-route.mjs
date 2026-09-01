import fs from 'node:fs'
const p='src/App.jsx'
let s=fs.readFileSync(p,'utf8')
if(!s.includes("const OfficeDocumentSign = lazy(() => import('./pages/OfficeDocumentSign'))")){
  const anchor="const RomyLabsAgreementSign = lazy(() => import('./pages/RomyLabsAgreementSign'))"
  if(!s.includes(anchor))throw new Error('Agreement lazy import anchor not found')
  s=s.replace(anchor,anchor+"\nconst OfficeDocumentSign = lazy(() => import('./pages/OfficeDocumentSign'))")
}
if(!s.includes('path="/office-sign/:token"')){
  const anchor='<Route path="/agreement/:token" element={<RomyLabsAgreementSign />} />'
  if(!s.includes(anchor))throw new Error('Public agreement route anchor not found')
  s=s.replace(anchor,anchor+'\n      <Route path="/office-sign/:token" element={<OfficeDocumentSign />} />')
}
fs.writeFileSync(p,s)
