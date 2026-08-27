const fs = require('fs')

function mustReplace(text, from, to, label) {
  const count = text.split(from).length - 1
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`)
  return text.replace(from, to)
}

const adminPath = 'src/pages/AdminPortal.jsx'
let admin = fs.readFileSync(adminPath, 'utf8')

const ccStart = admin.indexOf('function CommandCenter()')
const ccEnd = admin.indexOf('const CONTENT_LABELS', ccStart)
if (ccStart === -1 || ccEnd === -1) throw new Error('CommandCenter boundaries not found')

const adminBefore = admin.slice(0, ccStart)
let commandCenter = admin.slice(ccStart, ccEnd)
const adminAfter = admin.slice(ccEnd)

commandCenter = mustReplace(
  commandCenter,
  "  const [data, setData] = useState(null)\n",
  "  const [data, setData] = useState(null)\n  const [crmAccount, setCrmAccount] = useState('all')\n",
  'CommandCenter top-level crmAccount state'
)
commandCenter = mustReplace(
  commandCenter,
  "            const [crmAccount, setCrmAccount] = React.useState('all')\n",
  '',
  'remove conditional CRM hook'
)
commandCenter = mustReplace(
  commandCenter,
  "        const [statsRes, tenantsRes, storageRes] = await Promise.all([\n          supabase.rpc('admin_command_center_stats'),\n          supabase.rpc('admin_tenant_overview'),\n          supabase.rpc('admin_storage_stats'),\n        ])",
  "        const withTimeout = (promise, label, ms = 12000) => Promise.race([\n          promise,\n          new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' timed out after ' + ms + 'ms')), ms)),\n        ])\n        const [statsRes, tenantsRes, storageRes] = await Promise.all([\n          withTimeout(supabase.rpc('admin_command_center_stats'), 'admin_command_center_stats'),\n          withTimeout(supabase.rpc('admin_tenant_overview'), 'admin_tenant_overview'),\n          withTimeout(supabase.rpc('admin_storage_stats'), 'admin_storage_stats'),\n        ])",
  'CommandCenter RPC timeout guard'
)

admin = adminBefore + commandCenter + adminAfter
fs.writeFileSync(adminPath, admin)

const appPath = 'src/App.jsx'
let app = fs.readFileSync(appPath, 'utf8')
if (app.includes("const ADMIN_EMAIL = 'romy@taxrescrm.net'")) {
  app = mustReplace(
    app,
    "const ADMIN_EMAIL = 'romy@taxrescrm.net'",
    "const ADMIN_EMAILS = new Set(['info@romylabs.com','romy@romylabs.com','romy@taxrescrm.net','romy@taxcasereview.org'])\nconst isPlatformOwner = (email) => ADMIN_EMAILS.has((email || '').toLowerCase())",
    'platform owner allowlist'
  )
}
app = app.replaceAll("user?.email?.toLowerCase() === ADMIN_EMAIL", "isPlatformOwner(user?.email)")
if (!app.includes('const isPlatformOwner =')) throw new Error('platform owner allowlist missing after repair')
fs.writeFileSync(appPath, app)

console.log('Direct source repair applied successfully.')
