from pathlib import Path

p = Path('src/pages/AdminPortal.jsx')
s = p.read_text()

old = """function Sidebar({ onSignOut }) {
  const location = useLocation()
  return (
    <div style={{ width:220, minHeight:'100vh', flexShrink:0, background:'#0f0e1a',
      borderRight:'1px solid rgba(99,102,241,.2)', display:'flex', flexDirection:'column' }}>"""
new = """function Sidebar({ onSignOut, mobile=false, onClose }) {
  const location = useLocation()
  return (
    <div style={{ width:mobile ? 'min(86vw,300px)' : 220, minHeight:'100vh', flexShrink:0, background:'#0f0e1a',
      borderRight:'1px solid rgba(99,102,241,.2)', display:'flex', flexDirection:'column' }}>"""
if old not in s:
    raise SystemExit('sidebar signature pattern missing')
s = s.replace(old, new, 1)

old = """<NavLink key={item.path} to={item.path}
              style={{ display:'flex', alignItems:'center', gap:9, padding:'8px 11px',"""
new = """<NavLink key={item.path} to={item.path} onClick={mobile ? onClose : undefined}
              style={{ display:'flex', alignItems:'center', gap:9, padding:mobile ? '11px 12px' : '8px 11px',"""
if old not in s:
    raise SystemExit('nav link pattern missing')
s = s.replace(old, new, 1)

old = """export default function AdminPortal() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useApp()"""
new = """export default function AdminPortal() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useApp()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)"""
if old not in s:
    raise SystemExit('admin function pattern missing')
s = s.replace(old, new, 1)

old = """  return (
    <ScreenShareProvider>
    <div style={{display:'flex',minHeight:'100vh',background:'#0d0c1a',fontFamily:'system-ui,Arial,sans-serif'}}>
      <Sidebar onSignOut={handleSignOut} />
      <div style={{flex:1,position:'relative',height:'100vh',overflowY:'auto'}}>"""
new = """  return (
    <ScreenShareProvider>
    <div className=\"rl-admin-shell\" style={{display:'flex',minHeight:'100vh',background:'#0d0c1a',fontFamily:'system-ui,Arial,sans-serif',width:'100%',overflowX:'hidden'}}>
      <style>{`
        .rl-admin-mobile-bar,.rl-admin-mobile-overlay{display:none}
        .rl-admin-desktop-sidebar{display:flex;flex-shrink:0}
        .rl-admin-main{min-width:0;width:100%}
        @media (max-width:768px){
          .rl-admin-shell{display:block!important;min-height:100dvh!important}
          .rl-admin-desktop-sidebar{display:none!important}
          .rl-admin-mobile-bar{display:flex!important;position:sticky;top:0;z-index:9000;min-height:58px;align-items:center;gap:12px;padding:env(safe-area-inset-top) 14px 0;background:#0f0e1a;border-bottom:1px solid rgba(99,102,241,.22)}
          .rl-admin-mobile-menu-btn{width:42px;height:42px;border-radius:10px;border:1px solid rgba(99,102,241,.28);background:rgba(99,102,241,.10);color:#e2e8f0;font-size:21px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
          .rl-admin-mobile-overlay{display:flex!important;position:fixed;inset:0;z-index:9500;background:rgba(2,6,23,.72);backdrop-filter:blur(3px)}
          .rl-admin-mobile-drawer{height:100%;overflow-y:auto;box-shadow:16px 0 40px rgba(0,0,0,.45);background:#0f0e1a}
          .rl-admin-mobile-scrim{flex:1;height:100%}
          .rl-admin-main{height:calc(100dvh - 58px)!important;overflow-y:auto!important;overflow-x:hidden!important;-webkit-overflow-scrolling:touch}
          .rl-admin-main>div:not([style*=\"position: absolute\"]){max-width:100%;box-sizing:border-box}
          .rl-admin-main table{display:block;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;white-space:nowrap}
          .rl-admin-main input,.rl-admin-main select,.rl-admin-main textarea{max-width:100%;box-sizing:border-box}
          .rl-admin-main button,.rl-admin-main a{touch-action:manipulation}
          .rl-admin-main [style*=\"padding: 32px 36px\"]{padding:18px 14px!important}
          .rl-admin-main [style*=\"padding: 28px 32px\"]{padding:18px 14px!important}
          .rl-admin-main [style*=\"repeat(6, 1fr)\"],.rl-admin-main [style*=\"repeat(6,1fr)\"]{grid-template-columns:repeat(2,minmax(0,1fr))!important}
          .rl-admin-main [style*=\"repeat(4, 1fr)\"],.rl-admin-main [style*=\"repeat(4,1fr)\"]{grid-template-columns:repeat(2,minmax(0,1fr))!important}
          .rl-admin-main [style*=\"repeat(3, 1fr)\"],.rl-admin-main [style*=\"repeat(3,1fr)\"]{grid-template-columns:1fr!important}
        }
        @media (max-width:430px){
          .rl-admin-main [style*=\"repeat(2, 1fr)\"],.rl-admin-main [style*=\"repeat(2,1fr)\"]{grid-template-columns:1fr!important}
        }
      `}</style>
      <div className=\"rl-admin-desktop-sidebar\"><Sidebar onSignOut={handleSignOut} /></div>
      <div className=\"rl-admin-mobile-bar\">
        <button className=\"rl-admin-mobile-menu-btn\" onClick={()=>setMobileMenuOpen(true)} aria-label=\"Open navigation\">☰</button>
        <img src=\"/romylabs-logo.png\" alt=\"RomyLabs\" style={{height:30,maxWidth:150,objectFit:'contain'}} />
        <span style={{marginLeft:'auto',fontSize:10,fontWeight:800,color:'#C6FF00',letterSpacing:'.05em'}}>ADMIN</span>
      </div>
      {mobileMenuOpen && <div className=\"rl-admin-mobile-overlay\">
        <div className=\"rl-admin-mobile-drawer\"><Sidebar mobile onClose={()=>setMobileMenuOpen(false)} onSignOut={handleSignOut} /></div>
        <div className=\"rl-admin-mobile-scrim\" onClick={()=>setMobileMenuOpen(false)} />
      </div>}
      <div className=\"rl-admin-main\" style={{flex:1,position:'relative',height:'100vh',overflowY:'auto'}}>"""
if old not in s:
    raise SystemExit('shell pattern missing')
s = s.replace(old, new, 1)

p.write_text(s)
print('patched AdminPortal mobile shell')
