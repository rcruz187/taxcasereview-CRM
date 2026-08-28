const fs=require('fs');
const p='src/pages/AdminPortal.jsx';
let s=fs.readFileSync(p,'utf8');
const importAnchor="import AIAssistant from '../components/AIAssistant'\n";
if(!s.includes("../components/admin/RomyLabsBilling")){
  if(!s.includes(importAnchor)) throw new Error('AdminPortal import anchor missing');
  s=s.replace(importAnchor, importAnchor+"import RomyLabsBilling from '../components/admin/RomyLabsBilling'\n");
}
const oldRoute='<Route path="/billing"        element={<Billing/>}/>';
const newRoute='<Route path="/billing"        element={<AdminRouteErrorBoundary><RomyLabsBilling/></AdminRouteErrorBoundary>}/>';
if(s.includes(oldRoute)) s=s.replace(oldRoute,newRoute);
if(!s.includes(newRoute)) throw new Error('Billing route was not wired');
fs.writeFileSync(p,s);
