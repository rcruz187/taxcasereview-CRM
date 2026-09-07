const fs = require('fs');
const path = 'src/pages/AdminPortal.jsx';
let s = fs.readFileSync(path, 'utf8');

const replacements = [
  ["{ key:'marketing', label:'Marketing' }", "{ key:'marketing', label:'Product Usage' }"],
  ["{/* ═══ MARKETING TAB ═══ */}", "{/* ═══ PRODUCT USAGE TAB ═══ */}"],
  ["const title = channel === 'marketing' ? 'Marketing analytics' : 'SEO reporting'", "const title = channel === 'marketing' ? 'Product usage analytics' : 'SEO reporting'"],
  ["const details = `${label} does not have a dedicated ${channel === 'marketing' ? 'GA4 Data API connection' : 'Search Console data connection'} in the RomyLabs reporting hub yet.`", "const details = `${label} does not have a dedicated ${channel === 'marketing' ? 'GA4 product-usage connection' : 'Search Console data connection'} in the RomyLabs reporting hub yet.`"],
  ["{ label:'Sessions Today',", "{ label:'Tracked Sessions Today',"],
  ["{ label:'Users Today',", "{ label:'Active Users Today',"],
  ["<div style={CC.sectionLabel}>Traffic sources — today</div>", "<div style={CC.sectionLabel}>Session sources — today</div>"],
  ["<div style={CC.sectionLabel}>Top pages — last 7 days</div>", "<div style={CC.sectionLabel}>Most-used routes — last 7 days</div>"],
  ["<span style={{ fontSize:12, color:'#94a3b8' }}>{p.views} sessions</span>", "<span style={{ fontSize:12, color:'#94a3b8' }}>{p.views} tracked sessions</span>"],
];

for (const [from, to] of replacements) {
  if (s.includes(from)) {
    s = s.replace(from, to);
  } else if (!s.includes(to)) {
    throw new Error(`Missing both original and patched source fragment: ${from}`);
  }
}

const anchor = `{tab==='marketing' && (<>\n          <ProductReportingSelector value={marketingProduct}`;
const patchedAnchor = `{tab==='marketing' && (<>\n          <div style={{ marginBottom:16, padding:'12px 16px', borderRadius:10, background:'rgba(14,165,233,.07)', border:'1px solid rgba(14,165,233,.18)' }}>\n            <div style={{ fontSize:12, fontWeight:800, color:'#7dd3fc', marginBottom:4 }}>Product Usage · GA4 tracked activity</div>\n            <div style={{ fontSize:11, color:'#64748b', lineHeight:1.5 }}>These metrics show tracked website/app sessions and route activity. They are not the same as marketing leads or SEO performance. Use SEO for organic search visibility and Sales for lead/demo conversion.</div>\n          </div>\n          <ProductReportingSelector value={marketingProduct}`;

if (s.includes(anchor)) {
  s = s.replace(anchor, patchedAnchor);
} else if (!s.includes('Product Usage · GA4 tracked activity')) {
  throw new Error('Missing Product Usage tab anchor and explanatory banner');
}

fs.writeFileSync(path, s);
console.log('Admin Product Usage labels verified/patched successfully');
