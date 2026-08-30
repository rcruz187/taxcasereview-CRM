const fs = require('fs');
const p = 'src/pages/AdminPortal.jsx';
let s = fs.readFileSync(p, 'utf8');

function replaceOnce(oldText, newText, label) {
  if (!s.includes(oldText)) throw new Error(`${label} anchor missing; source changed`);
  s = s.replace(oldText, newText);
}

replaceOnce(
`function ProductReportingSelector({ value, onChange, channel, gscConnected, activeGscProduct, registryProducts }) {`,
`function ProductReportingSelector({ value, onChange, channel, gscConnected, activeGscProduct, registryProducts, marketingConnectedProducts=[] }) {`,
'ProductReportingSelector signature');

replaceOnce(
`        const isGscLive = channel === 'seo' && gscConnected && p.key === activeGscProduct\n        const statusLabel = isGscLive\n          ? 'GSC Connected'\n          : status === 'connected' ? 'Connected'`,
`        const isGscLive = channel === 'seo' && gscConnected && p.key === activeGscProduct\n        const isMarketingLive = channel === 'marketing' && marketingConnectedProducts.includes(p.key)\n        const statusLabel = isMarketingLive\n          ? 'GA4 Connected'\n          : isGscLive\n          ? 'GSC Connected'\n          : status === 'connected' ? 'Connected'`,
'Product selector live status');

replaceOnce(
`        const statusColor = (status === 'connected' || isGscLive) ? '#10b981'`,
`        const statusColor = (status === 'connected' || isGscLive || isMarketingLive) ? '#10b981'`,
'Product selector status color');

replaceOnce(
`  const [reportingProducts, setReportingProducts] = React.useState([])\n  const [ga4EnabledProducts, setGa4EnabledProducts] = React.useState([])`,
`  const [reportingProducts, setReportingProducts] = React.useState([])\n  const [ga4EnabledProducts, setGa4EnabledProducts] = React.useState([])\n  const [ga4LiveProducts, setGa4LiveProducts] = React.useState([])`,
'GA4 states');

replaceOnce(
`      if (error) { setGa4EnabledProducts([]); return }\n      setGa4EnabledProducts((data || []).filter(r => r.tracking_id && ['configured','live'].includes(r.status)).map(r => r.product_id))`,
`      if (error) { setGa4EnabledProducts([]); setGa4LiveProducts([]); return }\n      const rows = data || []\n      setGa4EnabledProducts(rows.filter(r => r.tracking_id && ['configured','live'].includes(r.status)).map(r => r.product_id))\n      setGa4LiveProducts(rows.filter(r => r.tracking_id && r.status === 'live').map(r => r.product_id))`,
'GA4 registry state split');

replaceOnce(
`      const today = new Date().toISOString().slice(0,10)\n      const [{ data: traffic }, { data: pages }, { data: syncLog }] = await Promise.all([\n        supabase.from('marketing_ga4_traffic').select('*').eq('product_id', marketingProduct).gte('date', new Date(Date.now()-7*86400000).toISOString().slice(0,10)).order('date',{ascending:false}),\n        supabase.from('marketing_ga4_pages').select('*').eq('product_id', marketingProduct).eq('date', today).order('sessions',{ascending:false}).limit(10),`,
`      const utcToday = new Date().toISOString().slice(0,10)\n      const [{ data: traffic }, { data: pages }, { data: syncLog }] = await Promise.all([\n        supabase.from('marketing_ga4_traffic').select('*').eq('product_id', marketingProduct).gte('date', new Date(Date.now()-7*86400000).toISOString().slice(0,10)).order('date',{ascending:false}),\n        supabase.from('marketing_ga4_pages').select('*').eq('product_id', marketingProduct).gte('date', new Date(Date.now()-8*86400000).toISOString().slice(0,10)).order('date',{ascending:false}).order('sessions',{ascending:false}).limit(100),`,
'GA4 cache queries');

replaceOnce(
`      // Aggregate totals for today\n      const todayRows = (traffic||[]).filter(r=>r.date===today)`,
`      // GA4 report dates follow each property's configured timezone, which may differ from UTC.\n      // Always use the latest date actually returned by GA4 instead of filtering against UTC "today".\n      const reportingDate = (traffic || []).reduce((latest, r) => (!latest || r.date > latest ? r.date : latest), '') || utcToday\n      const latestPageDate = (pages || []).reduce((latest, r) => (!latest || r.date > latest ? r.date : latest), '')\n      const latestPages = (pages || []).filter(r => !latestPageDate || r.date === latestPageDate).slice(0, 10)\n      const todayRows = (traffic||[]).filter(r=>r.date===reportingDate)`,
'GA4 reporting date');

replaceOnce(
`        topPages: (pages||[]).map(p=>({ path:p.page_path, views:p.sessions, avgTime: Math.round(p.avg_time_sec||0)+'s' })),`,
`        topPages: latestPages.map(p=>({ path:p.page_path, views:p.sessions, avgTime: Math.round(p.avg_time_sec||0)+'s' })),`,
'Latest pages mapping');

replaceOnce(
`          <ProductReportingSelector value={marketingProduct} onChange={setMarketingProduct} channel="marketing"\n            registryProducts={reportingProducts} />`,
`          <ProductReportingSelector value={marketingProduct} onChange={setMarketingProduct} channel="marketing"\n            registryProducts={reportingProducts} marketingConnectedProducts={ga4LiveProducts} />`,
'Marketing selector props');

fs.writeFileSync(p, s);
console.log('Patched Marketing GA4 timezone handling, live labels, and latest page batch');
