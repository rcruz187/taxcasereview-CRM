const fs = require('fs');
const p = 'src/pages/AdminPortal.jsx';
let s = fs.readFileSync(p, 'utf8');
function replaceOnce(oldText, newText, label) {
  if (!s.includes(oldText)) throw new Error(`${label} anchor missing; source changed`);
  s = s.replace(oldText, newText);
}
replaceOnce(
`function ProductReportingSelector({ value, onChange, channel, gscConnected, activeGscProduct, registryProducts, marketingConnectedProducts=[] }) {`,
`function ProductReportingSelector({ value, onChange, channel, gscConnected, activeGscProduct, registryProducts, marketingConnectedProducts=[], seoConnectedProducts=[] }) {`,
'ProductReportingSelector signature');
replaceOnce(
`        const isGscLive = channel === 'seo' && gscConnected && p.key === activeGscProduct`,
`        const isGscLive = channel === 'seo' && (seoConnectedProducts.includes(p.key) || (gscConnected && p.key === activeGscProduct))`,
'GSC live selector logic');
replaceOnce(
`  const [ga4EnabledProducts, setGa4EnabledProducts] = React.useState([])\n  const [ga4LiveProducts, setGa4LiveProducts] = React.useState([])`,
`  const [ga4EnabledProducts, setGa4EnabledProducts] = React.useState([])\n  const [ga4LiveProducts, setGa4LiveProducts] = React.useState([])\n  const [gscLiveProducts, setGscLiveProducts] = React.useState([])`,
'GSC live state');
replaceOnce(
`  React.useEffect(() => {\n    supabase.from('product_traffic_channels').select('product_id,status,tracking_id').eq('channel_key','ga4').then(({ data, error }) => {`,
`  React.useEffect(() => {\n    supabase.from('product_traffic_channels').select('product_id,status').eq('channel_key','search_console').then(({ data, error }) => {\n      if (error) { setGscLiveProducts([]); return }\n      setGscLiveProducts((data || []).filter(r => r.status === 'live').map(r => r.product_id))\n    })\n    supabase.from('product_traffic_channels').select('product_id,status,tracking_id').eq('channel_key','ga4').then(({ data, error }) => {`,
'GSC registry load');
replaceOnce(
`          <ProductReportingSelector value={seoProduct} onChange={setSeoProduct} channel="seo"\n            gscConnected={gscConnected} activeGscProduct={seoProduct}\n            registryProducts={reportingProducts} />`,
`          <ProductReportingSelector value={seoProduct} onChange={setSeoProduct} channel="seo"\n            gscConnected={gscConnected} activeGscProduct={seoProduct}\n            registryProducts={reportingProducts} seoConnectedProducts={gscLiveProducts} />`,
'SEO selector props');
fs.writeFileSync(p, s);
console.log('Patched SEO selector to reflect all live Search Console products from central registry');
// one-shot trigger
