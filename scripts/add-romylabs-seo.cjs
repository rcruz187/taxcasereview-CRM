const fs = require('fs')

const adminPath = 'src/pages/AdminPortal.jsx'
const gscPath = 'supabase/functions/gsc-data/index.ts'

let admin = fs.readFileSync(adminPath, 'utf8')
const oldSelector = `  const mapped = registryProducts.map(r => ({\n    key:       r.product_id,\n    label:     r.name,\n    icon:      r.icon_ref || '📦',\n    color:     r.accent_color || '#6366f1',\n    seo:       'pending',\n    marketing: 'pending',\n  }))`
const newSelector = `  const corporateSeo = channel === 'seo' ? [{\n    key:       'romylabs',\n    label:     'RomyLabs Corporate',\n    icon:      '◆',\n    color:     '#C6FF00',\n    seo:       'implemented',\n    marketing: 'pending',\n  }] : []\n  const mapped = [...corporateSeo, ...registryProducts.map(r => ({\n    key:       r.product_id,\n    label:     r.name,\n    icon:      r.icon_ref || '📦',\n    color:     r.accent_color || '#6366f1',\n    seo:       'pending',\n    marketing: 'pending',\n  }))]`
if (!admin.includes(oldSelector)) throw new Error('Admin selector contract not found; refusing broad edit')
admin = admin.replace(oldSelector, newSelector)
fs.writeFileSync(adminPath, admin)

let gsc = fs.readFileSync(gscPath, 'utf8')
const oldCandidate = `const GSC_SITE_CANDIDATES: Record<string, string[]> = {\n  taxres_crm: ['sc-domain:taxrescrm.net', 'https://taxrescrm.net/', 'https://www.taxrescrm.net/'],`
const newCandidate = `const GSC_SITE_CANDIDATES: Record<string, string[]> = {\n  romylabs: ['sc-domain:romylabs.com', 'https://romylabs.com/', 'https://www.romylabs.com/'],\n  taxres_crm: ['sc-domain:taxrescrm.net', 'https://taxrescrm.net/', 'https://www.taxrescrm.net/'],`
if (!gsc.includes(oldCandidate)) throw new Error('GSC candidate contract not found; refusing broad edit')
gsc = gsc.replace(oldCandidate, newCandidate)
fs.writeFileSync(gscPath, gsc)
