const fs = require('fs');
const path = 'src/pages/AdminPortal.jsx';
let s = fs.readFileSync(path, 'utf8');
const old = `        const active = (data || []).filter(p => p.active && p.product_id !== 'phl' && !/^PHL(?:\\s|$)/i.test(p.name || '') && String(p.lifecycle || '').toLowerCase() !== 'internal')\n        setProducts(active)`;
const replacement = `        const registryActive = (data || []).filter(p => p.active && p.product_id !== 'phl' && !/^PHL(?:\\s|$)/i.test(p.name || '') && String(p.lifecycle || '').toLowerCase() !== 'internal')\n        // RomyLabs is the corporate parent, not a romylabs_products row. Keep it\n        // as a first-class LinkedIn workspace without polluting the product registry.\n        const corporate = { product_id:'romylabs', name:'RomyLabs Corporate', active:true, lifecycle:'corporate', public:true }\n        const active = [corporate, ...registryActive.filter(p => p.product_id !== 'romylabs')]\n        setProducts(active)`;
if (!s.includes(old)) throw new Error('LinkedIn product-loader anchor not found; refusing speculative patch');
s = s.replace(old, replacement);
fs.writeFileSync(path, s);
console.log('Added RomyLabs Corporate LinkedIn workspace');
