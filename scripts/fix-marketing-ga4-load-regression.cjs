const fs = require('fs');
const p = 'src/pages/AdminPortal.jsx';
let s = fs.readFileSync(p, 'utf8');
const oldText = `  useEffect(() => {\n    setGa4Data(null)\n    if (tab==='marketing' && ga4EnabledProducts.includes(marketingProduct)) loadGA4()\n  }, [tab, marketingProduct])`;
const newText = `  useEffect(() => {\n    setGa4Data(null)\n    if (tab==='marketing' && ga4EnabledProducts.includes(marketingProduct)) loadGA4()\n  }, [tab, marketingProduct, ga4EnabledProducts])`;
if (!s.includes(oldText)) throw new Error('GA4 load effect anchor missing; source changed');
s = s.replace(oldText, newText);
fs.writeFileSync(p, s);
console.log('Patched GA4 load effect to rerun after registry initialization');
// one-shot trigger
