from pathlib import Path

p = Path('src/pages/AdminPortal.jsx')
s = p.read_text()

old = """function ProductsTab({ supabase, taxresActivity = [] }) {
  const [selected, setSelected]     = useState(null)
"""
new = """function ProductsTab({ supabase, taxresActivity = [] }) {
  const [productParams] = useSearchParams()
  const portfolioFilter = productParams.get('portfolio') || ''
  const [selected, setSelected]     = useState(null)
"""
if old not in s:
    raise SystemExit('ProductsTab header not found')
s = s.replace(old, new, 1)

old = """  const filtered = filter === 'tenants' ? [...tenants].sort(sortByLifecycle)
                 : filter === 'planned'  ? products.filter(p => p.lifecycleStage === 'research')
                 : filter === 'products' ? products.filter(p => p.lifecycleStage !== 'research').sort(sortByLifecycle)
                 : [...products, ...tenants].sort(sortByLifecycle)
"""
new = """  const portfolioFiltered = portfolioFilter === 'total' ? products
    : portfolioFilter === 'live' ? products.filter(p => ['live','available'].includes(p.lifecycleStage))
    : portfolioFilter === 'coming' ? products.filter(p => p.lifecycleStage === 'coming')
    : portfolioFilter === 'building' ? products.filter(p => p.lifecycleStage === 'building')
    : portfolioFilter === 'research' ? products.filter(p => p.lifecycleStage === 'research')
    : portfolioFilter === 'internal' ? products.filter(p => p.lifecycleStage === 'internal')
    : portfolioFilter === 'attention' ? products.filter(p => p.connection === 'partial' || (p.lifecycleStage === 'coming' && !p.metricsUrl))
    : portfolioFilter === 'connected' ? products.filter(p => p.connection === 'connected')
    : portfolioFilter === 'partial' ? products.filter(p => p.connection === 'partial')
    : portfolioFilter === 'not_connected' ? products.filter(p => p.connection === 'not_connected')
    : null

  const filtered = portfolioFiltered ? [...portfolioFiltered].sort(sortByLifecycle)
                 : filter === 'tenants' ? [...tenants].sort(sortByLifecycle)
                 : filter === 'planned'  ? products.filter(p => p.lifecycleStage === 'research')
                 : filter === 'products' ? products.filter(p => p.lifecycleStage !== 'research').sort(sortByLifecycle)
                 : [...products, ...tenants].sort(sortByLifecycle)
"""
if old not in s:
    raise SystemExit('ProductsTab filtered block not found')
s = s.replace(old, new, 1)

old = """                    { label:'Total Products',  val:products.length, color:'#6366f1', big:true },
                    { label:'Live / Available', val:liveN,    color:'#10b981' },
                    { label:'Coming Soon',      val:comingN,  color:'#8b5cf6' },
                    { label:'Building',         val:buildN,   color:'#f59e0b' },
                    { label:'Research',         val:researchN,color:'#64748b' },
                    { label:'Internal',         val:internalN,color:'#475569' },
                    { label:'Need Attention',   val:attentionN, color:'#ef4444' },
                  ].map(k => (
                    <div key={k.label} style={{ background:`${k.color}10`, border:`1px solid ${k.color}20`,
                      borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
"""
new = """                    { label:'Total Products',  val:products.length, color:'#6366f1', big:true, filter:'total' },
                    { label:'Live / Available', val:liveN,    color:'#10b981', filter:'live' },
                    { label:'Coming Soon',      val:comingN,  color:'#8b5cf6', filter:'coming' },
                    { label:'Building',         val:buildN,   color:'#f59e0b', filter:'building' },
                    { label:'Research',         val:researchN,color:'#64748b', filter:'research' },
                    { label:'Internal',         val:internalN,color:'#475569', filter:'internal' },
                    { label:'Need Attention',   val:attentionN, color:'#ef4444', filter:'attention' },
                  ].map(k => (
                    <div key={k.label} role="button" tabIndex={0}
                      onClick={()=>setSearchParams({tab:'products',portfolio:k.filter})}
                      onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSearchParams({tab:'products',portfolio:k.filter})}}}
                      style={{ background:`${k.color}10`, border:`1px solid ${k.color}20`,
                      borderRadius:10, padding:'10px 12px', textAlign:'center', cursor:'pointer' }}>
"""
if old not in s:
    raise SystemExit('Lifecycle KPI block not found')
s = s.replace(old, new, 1)

old = """                    { label:'🟢 Connected', val:connectedN, color:'#10b981', note:'live metrics' },
                    { label:'🟡 Partial',   val:partialN,   color:'#f59e0b', note:'metrics deploy pending' },
                    { label:'⚪ Not Connected', val:noConnN, color:'#64748b', note:'planned / research' },
                  ].map(k => (
                    <div key={k.label} style={{ background:`${k.color}08`, border:`1px solid ${k.color}20`,
                      borderRadius:10, padding:'10px 16px', display:'flex', alignItems:'center', gap:12 }}>
"""
new = """                    { label:'🟢 Connected', val:connectedN, color:'#10b981', note:'live metrics', filter:'connected' },
                    { label:'🟡 Partial',   val:partialN,   color:'#f59e0b', note:'metrics deploy pending', filter:'partial' },
                    { label:'⚪ Not Connected', val:noConnN, color:'#64748b', note:'planned / research', filter:'not_connected' },
                  ].map(k => (
                    <div key={k.label} role="button" tabIndex={0}
                      onClick={()=>setSearchParams({tab:'products',portfolio:k.filter})}
                      onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSearchParams({tab:'products',portfolio:k.filter})}}}
                      style={{ background:`${k.color}08`, border:`1px solid ${k.color}20`,
                      borderRadius:10, padding:'10px 16px', display:'flex', alignItems:'center', gap:12, cursor:'pointer' }}>
"""
if old not in s:
    raise SystemExit('Connection KPI block not found')
s = s.replace(old, new, 1)

p.write_text(s)
print('Portfolio KPI cards are now clickable drilldowns.')
