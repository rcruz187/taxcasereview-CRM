from pathlib import Path

# Admin shell polish — mobile only.
p = Path('src/pages/AdminPortal.jsx')
s = p.read_text()
marker = '/* MOBILE_POLISH_V1_20260830 */'
if marker not in s:
    needle = "        @media (max-width:430px){"
    if needle not in s:
        raise SystemExit('Admin mobile media marker not found')
    css = r'''        /* MOBILE_POLISH_V1_20260830 */
        @media (max-width: 768px){
          .rl-admin-mobile-bar{height:60px!important;padding-left:12px!important;padding-right:12px!important;background:rgba(15,14,26,.96)!important;backdrop-filter:blur(14px);box-shadow:0 8px 24px rgba(0,0,0,.18)}
          .rl-admin-mobile-bar img{height:27px!important;max-width:138px!important}
          .rl-admin-mobile-menu-btn{width:42px!important;height:42px!important;border-radius:12px!important;font-size:20px!important}
          .rl-admin-mobile-drawer{width:min(88vw,310px)!important;border-radius:0 18px 18px 0;overflow:hidden;background:#0f0e1a}
          .rl-admin-main{background:linear-gradient(180deg,#0d0c1a 0%,#0b0a16 100%);padding-bottom:max(20px,env(safe-area-inset-bottom))}
          .rl-admin-main > div{max-width:100%!important;box-sizing:border-box}
          .rl-admin-main [style*="padding: 32px 36px"],
          .rl-admin-main [style*="padding: 28px 36px"],
          .rl-admin-main [style*="padding: 28px 32px"],
          .rl-admin-main [style*="padding: 32px 32px"],
          .rl-admin-main [style*="padding: 24px 32px"]{padding:18px 14px!important}
          .rl-admin-main [style*="grid-template-columns: 1fr 420px"],
          .rl-admin-main [style*="grid-template-columns: 420px 1fr"],
          .rl-admin-main [style*="grid-template-columns: 1fr 1fr"]{grid-template-columns:1fr!important}
          .rl-admin-main [style*="font-size: 28px"]{font-size:24px!important;line-height:1.1!important}
          .rl-admin-main [style*="font-size: 26px"]{font-size:22px!important;line-height:1.18!important}
          .rl-admin-main [style*="font-size: 24px"]{font-size:21px!important;line-height:1.2!important}
          .rl-admin-main [style*="font-size: 22px"]{font-size:20px!important;line-height:1.22!important}
          .rl-admin-main [style*="border-radius: 14px"]{border-radius:12px!important}
          .rl-admin-main button{min-height:40px;touch-action:manipulation}
          .rl-admin-main input,.rl-admin-main select,.rl-admin-main textarea{font-size:16px!important;min-height:42px}
          .rl-admin-main textarea{min-height:84px}
          .rl-admin-main table{font-size:12px!important;border-spacing:0}
          .rl-admin-main th,.rl-admin-main td{padding:9px 10px!important}
          .rl-admin-main [style*="margin-bottom: 32px"]{margin-bottom:22px!important}
          .rl-admin-main [style*="margin-bottom: 28px"]{margin-bottom:20px!important}
          .rl-admin-main [style*="gap: 20px"]{gap:14px!important}
          .rl-admin-main [style*="gap: 18px"]{gap:12px!important}
          .rl-admin-main [style*="gap: 16px"]{gap:12px!important}
          .rl-admin-main iframe{max-width:100vw!important}
        }
'''
    s = s.replace(needle, css + needle, 1)
    p.write_text(s)

# Credential Vault mobile polish — component-local and behavior-neutral.
p = Path('src/components/admin/CredentialVault.jsx')
s = p.read_text()
if 'VAULT_MOBILE_POLISH_V1_20260830' not in s:
    s = s.replace("<div style={{ padding:'28px 32px', maxWidth:1200 }}>", "<div className=\"rl-vault\" style={{ padding:'28px 32px', maxWidth:1200 }}>\n      <style>{`\n        /* VAULT_MOBILE_POLISH_V1_20260830 */\n        @media (max-width:768px){\n          .rl-vault{padding:18px 14px!important;max-width:none!important}\n          .rl-vault-header{flex-direction:column!important;align-items:stretch!important;gap:12px!important;margin-bottom:16px!important}\n          .rl-vault-header button{width:100%!important;min-height:44px!important}\n          .rl-vault-filters{padding:12px!important}\n          .rl-vault-filters>div{display:grid!important;grid-template-columns:1fr!important;gap:9px!important}\n          .rl-vault-filters select,.rl-vault-filters input{width:100%!important;min-width:0!important;font-size:16px!important}\n          .rl-vault-form{padding:14px!important}\n          .rl-vault-form-grid{grid-template-columns:1fr!important;gap:10px!important}\n          .rl-vault-form input,.rl-vault-form select,.rl-vault-form textarea{font-size:16px!important}\n          .rl-vault-grid{grid-template-columns:1fr!important;gap:9px!important}\n          .rl-vault-card{padding:11px 12px!important;border-radius:12px!important}\n          .rl-vault-card button{min-height:38px!important;padding:7px 10px!important}\n          .rl-vault-actions{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:7px!important}\n        }\n      `}</style>", 1)
    s = s.replace("<div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, marginBottom:22 }}>", "<div className=\"rl-vault-header\" style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, marginBottom:22 }}>", 1)
    s = s.replace("<div style={{ ...CARD, padding:16, marginBottom:18 }}>", "<div className=\"rl-vault-filters\" style={{ ...CARD, padding:16, marginBottom:18 }}>", 1)
    s = s.replace("<div style={{ ...CARD, padding:18, marginBottom:18, border:'1px solid rgba(99,102,241,.38)' }}>", "<div className=\"rl-vault-form\" style={{ ...CARD, padding:18, marginBottom:18, border:'1px solid rgba(99,102,241,.38)' }}>", 1)
    s = s.replace("<div style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:12 }}>", "<div className=\"rl-vault-form-grid\" style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:12 }}>", 1)
    s = s.replace("<div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,280px))', gap:8, alignItems:'start' }}>", "<div className=\"rl-vault-grid\" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,280px))', gap:8, alignItems:'start' }}>", 1)
    s = s.replace("return <div key={e.id} style={{ ...CARD, padding:'8px 9px', minWidth:0, borderRadius:10 }}>", "return <div className=\"rl-vault-card\" key={e.id} style={{ ...CARD, padding:'8px 9px', minWidth:0, borderRadius:10 }}>", 1)
    s = s.replace("<div style={{ display:'flex', gap:5, marginTop:7, flexWrap:'wrap' }}>", "<div className=\"rl-vault-actions\" style={{ display:'flex', gap:5, marginTop:7, flexWrap:'wrap' }}>", 1)
    p.write_text(s)

print('Admin mobile polish v1 applied')
