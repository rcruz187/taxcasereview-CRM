const fs = require('fs');
const p = 'src/pages/AdminPortal.jsx';
let s = fs.readFileSync(p, 'utf8');
const oldText = `        {FIRM.logoUrl && (\n          <img src={FIRM.logoUrl} alt={FIRM.name || 'TaxRes CRM'}\n            style={{ height:44, objectFit:'contain', display:'block', marginBottom:16 }}\n            onError={e=>{e.target.style.display='none'}} />\n        )}`;
const newText = `        <img src="/romylabs-logo.png" alt="RomyLabs"\n          style={{ height:44, objectFit:'contain', display:'block', marginBottom:16 }}\n          onError={e=>{e.target.style.display='none'}} />`;
if (!s.includes(oldText)) throw new Error('Overview branding anchor missing; source changed');
s = s.replace(oldText, newText);
fs.writeFileSync(p, s);
console.log('Replaced TaxRes tenant branding on Admin Overview with RomyLabs logo');
// one-shot trigger
