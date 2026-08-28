import fs from 'node:fs'

const file='src/pages/Settings.jsx'
let src=fs.readFileSync(file,'utf8')
const oldQ=`  function connectQuickBooks() {\n    if (!myTenantId) { showToast('Still loading your account — try again in a moment'); return }\n    if (!firm.qb_client_id) { showToast('Save your QuickBooks Client ID/Secret first'); return }\n    const state = btoa(myTenantId)\n    const redirectUri = window.location.origin + '/auth/quickbooks-callback'\n    const authorizeUrl = \`https://appcenter.intuit.com/connect/oauth2?client_id=\${encodeURIComponent(firm.qb_client_id)}&redirect_uri=\${encodeURIComponent(redirectUri)}&response_type=code&scope=com.intuit.quickbooks.accounting&state=\${encodeURIComponent(state)}\`\n    window.location.href = authorizeUrl\n  }`
const newQ=`  async function connectQuickBooks() {\n    if (!myTenantId) { showToast('Still loading your account — try again in a moment'); return }\n    if (!firm.qb_client_id) { showToast('Save your QuickBooks Client ID/Secret first'); return }\n    const { data: state, error } = await supabase.rpc('create_accounting_oauth_state', { p_provider: 'quickbooks' })\n    if (error || !state) { showToast('Could not start secure QuickBooks connection'); return }\n    const redirectUri = window.location.origin + '/auth/quickbooks-callback'\n    const authorizeUrl = \`https://appcenter.intuit.com/connect/oauth2?client_id=\${encodeURIComponent(firm.qb_client_id)}&redirect_uri=\${encodeURIComponent(redirectUri)}&response_type=code&scope=com.intuit.quickbooks.accounting&state=\${encodeURIComponent(state)}\`\n    window.location.href = authorizeUrl\n  }`
const oldX=`  function connectXero() {\n    if (!myTenantId) { showToast('Still loading your account — try again in a moment'); return }\n    if (!firm.xero_client_id) { showToast('Save your Xero Client ID/Secret first'); return }\n    const state = btoa(myTenantId)\n    const redirectUri = window.location.origin + '/auth/xero-callback'\n    const authorizeUrl = \`https://login.xero.com/identity/connect/authorize?response_type=code&client_id=\${encodeURIComponent(firm.xero_client_id)}&redirect_uri=\${encodeURIComponent(redirectUri)}&scope=\${encodeURIComponent('accounting.transactions accounting.contacts offline_access')}&state=\${encodeURIComponent(state)}\`\n    window.location.href = authorizeUrl\n  }`
const newX=`  async function connectXero() {\n    if (!myTenantId) { showToast('Still loading your account — try again in a moment'); return }\n    if (!firm.xero_client_id) { showToast('Save your Xero Client ID/Secret first'); return }\n    const { data: state, error } = await supabase.rpc('create_accounting_oauth_state', { p_provider: 'xero' })\n    if (error || !state) { showToast('Could not start secure Xero connection'); return }\n    const redirectUri = window.location.origin + '/auth/xero-callback'\n    const authorizeUrl = \`https://login.xero.com/identity/connect/authorize?response_type=code&client_id=\${encodeURIComponent(firm.xero_client_id)}&redirect_uri=\${encodeURIComponent(redirectUri)}&scope=\${encodeURIComponent('accounting.transactions accounting.contacts offline_access')}&state=\${encodeURIComponent(state)}\`\n    window.location.href = authorizeUrl\n  }`
if(src.includes(oldQ))src=src.replace(oldQ,newQ);else if(!src.includes("p_provider: 'quickbooks'"))throw new Error('QuickBooks OAuth patch anchor missing')
if(src.includes(oldX))src=src.replace(oldX,newX);else if(!src.includes("p_provider: 'xero'"))throw new Error('Xero OAuth patch anchor missing')
fs.writeFileSync(file,src)

const appFile='src/App.jsx'
let app=fs.readFileSync(appFile,'utf8')
if(!app.includes("const XeroCallback")){
  app=app.replace("const QuickBooksCallback  = lazy(() => import('./pages/QuickBooksCallback'))", "const QuickBooksCallback  = lazy(() => import('./pages/QuickBooksCallback'))\nconst XeroCallback = lazy(() => import('./pages/XeroCallback'))")
}
if(!app.includes('path="/auth/xero-callback"')){
  app=app.replace('<Route path="/auth/quickbooks-callback" element={<QuickBooksCallback />} />', '<Route path="/auth/quickbooks-callback" element={<QuickBooksCallback />} />\n      <Route path="/auth/xero-callback" element={<XeroCallback />} />')
}
fs.writeFileSync(appFile,app)
console.log('✓ Accounting OAuth uses one-time server-side state tokens and both callback routes are wired')
