import fs from 'node:fs'

const appPath='src/App.jsx'
let app=fs.readFileSync(appPath,'utf8')
if(!app.includes("const OfficeDocumentSign = lazy(() => import('./pages/OfficeDocumentSign'))")){
  const anchor="const RomyLabsAgreementSign = lazy(() => import('./pages/RomyLabsAgreementSign'))"
  if(!app.includes(anchor))throw new Error('Agreement lazy import anchor not found')
  app=app.replace(anchor,anchor+"\nconst OfficeDocumentSign = lazy(() => import('./pages/OfficeDocumentSign'))")
}
if(!app.includes('path="/office-sign/:token"')){
  const anchor='<Route path="/agreement/:token" element={<RomyLabsAgreementSign />} />'
  if(!app.includes(anchor))throw new Error('Public agreement route anchor not found')
  app=app.replace(anchor,anchor+'\n      <Route path="/office-sign/:token" element={<OfficeDocumentSign />} />')
}
if(!app.includes("'/office-sign'")){
  const anchor="const publicPaths = ['/book', '/sign', '/agreement', '/portal', '/clockin', '/kiosk',"
  if(!app.includes(anchor))throw new Error('Public path list anchor not found')
  app=app.replace(anchor,"const publicPaths = ['/book', '/sign', '/agreement', '/office-sign', '/portal', '/clockin', '/kiosk',")
}
fs.writeFileSync(appPath,app)

const senderPath='src/components/admin/UniversalOfficeESign.jsx'
let sender=fs.readFileSync(senderPath,'utf8')
if(!sender.includes("let createdRequest=false")){
  sender=sender.replace("    let path=''\n    try{","    let path=''\n    let createdRequest=false\n    try{")
  sender=sender.replace("      if(e||!data?.ok)throw new Error(e?.message||data?.error||'Could not create signing request')\n      const signUrl=", "      if(e||!data?.ok)throw new Error(e?.message||data?.error||'Could not create signing request')\n      createdRequest=true\n      const signUrl=")
  sender=sender.replace("      if(path&&!docs.some(d=>d.source_path===path))await supabase.storage.from('romylabs-esign').remove([path]).catch(()=>{})", "      if(path&&!createdRequest){ try{ await supabase.storage.from('romylabs-esign').remove([path]) }catch(_){} }")
}
fs.writeFileSync(senderPath,sender)
