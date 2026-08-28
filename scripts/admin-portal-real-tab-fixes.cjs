const fs=require('fs');
const p='src/pages/AdminPortal.jsx';
let s=fs.readFileSync(p,'utf8');
function once(a,b,label){const n=s.split(a).length-1;if(n!==1)throw new Error(`${label}: ${n}`);s=s.replace(a,b)}

once(
"function Overview() {\n  const [stats, setStats] = useState(null)",
"function Overview() {\n  const [stats, setStats] = useState(null)\n  const [loadError, setLoadError] = useState('')",
'overview error state');
once(
"    supabase.rpc('admin_tenant_overview').then(({ data }) => setStats(data || []))",
"    supabase.rpc('admin_tenant_overview').then(({ data, error }) => {\n      if (error) { setLoadError(error.message); setStats([]); return }\n      setLoadError(''); setStats(data || [])\n    })",
'overview rpc error');
once(
"      <div style={{ fontSize:12, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:12 }}>All Offices</div>",
"      {loadError && <div style={{padding:14,borderRadius:10,background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.25)',color:'#fca5a5',marginBottom:16}}>Unable to load platform offices: {loadError}</div>}\n      <div style={{ fontSize:12, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:12 }}>All Offices</div>",
'overview error ui');

once(
"function OfficesList() {\n  const [rows, setRows] = useState(null)",
"function OfficesList() {\n  const [rows, setRows] = useState(null)\n  const [loadError, setLoadError] = useState('')",
'offices error state');
once(
"  useEffect(() => { supabase.rpc('admin_tenant_overview').then(({data})=>setRows(data||[])) }, [])",
"  useEffect(() => { supabase.rpc('admin_tenant_overview').then(({data,error})=>{\n    if(error){ setLoadError(error.message); setRows([]); return }\n    setLoadError(''); setRows(data||[])\n  }) }, [])",
'offices rpc error');
once(
"      {!rows ? <Spinner /> : (\n        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>",
"      {loadError && <div style={{padding:14,borderRadius:10,background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.25)',color:'#fca5a5',marginBottom:16}}>Unable to load offices: {loadError}</div>}\n      {!rows ? <Spinner /> : rows.length===0 && !loadError ? <div style={{color:'#64748b',fontSize:13}}>No offices found.</div> : (\n        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>",
'offices error ui');

once(
"        todayDate: now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}),\n        kpis:",
"        todayDate: now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}),\n        tenants,\n        kpis:",
'command center tenants contract');

once(
"function AuditLog() {\n  const [log,setLog] = useState(null)",
"function AuditLog() {\n  const [log,setLog] = useState(null)\n  const [loadError,setLoadError] = useState('')",
'audit error state');
once(
"    supabase.rpc('admin_get_audit_log',{p_limit:100}).then(({data})=>setLog(data||[]))",
"    supabase.rpc('admin_get_audit_log',{p_limit:100}).then(({data,error})=>{ if(error){setLoadError(error.message);setLog([])} else {setLoadError('');setLog(data||[])} })",
'audit rpc error');
once(
"      <div style={{ fontSize:22,fontWeight:800,color:'#fff',marginBottom:24 }}>📋 Audit Log</div>\n      {!log ?",
"      <div style={{ fontSize:22,fontWeight:800,color:'#fff',marginBottom:24 }}>📋 Audit Log</div>\n      {loadError && <div style={{color:'#fca5a5',marginBottom:14}}>Unable to load audit log: {loadError}</div>}\n      {!log ?",
'audit error ui');

once(
"    const{data}=await supabase.rpc('admin_search_all',{p_query:q.trim()})\n    setBusy(false)\n    setResults(data||[])",
"    const{data,error}=await supabase.rpc('admin_search_all',{p_query:q.trim()})\n    setBusy(false)\n    if(error){setResults([]); return}\n    setResults(data||[])",
'search rpc error');

fs.writeFileSync(p,s);
