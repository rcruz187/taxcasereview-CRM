from pathlib import Path

admin = Path('src/pages/AdminPortal.jsx')
s = admin.read_text()
block = """            <div style={{padding:'12px 18px',borderBottom:'1px solid rgba(99,102,241,.08)'}}>
              <div style={{fontSize:9,fontWeight:800,color:'#334155',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:7}}>Office Onboarding</div>
              {selected?.tenant_id
                ? <div style={{fontSize:10,color:'#10b981',fontWeight:700}}>✓ Office created — agreements are managed from Offices → Documents</div>
                : <button onClick={()=>window.location.assign(`/crm-admin/provision?prospect_id=${selected.id}`)} style={{padding:'7px 11px',borderRadius:7,border:'none',background:'#10b981',color:'#052e16',fontSize:10,fontWeight:900,cursor:'pointer'}}>🏢 Create New Office from Sale</button>}
            </div>

"""
if block in s:
    s = s.replace(block, '', 1)
else:
    if 'Office Onboarding' in s:
        raise SystemExit('Office Onboarding markup changed; refusing broad edit')
admin.write_text(s)

helper = Path('.github/scripts/move_esign_to_office.py')
if helper.exists():
    h = helper.read_text()
    needle = "p.write_text(s)\n\n# Office page: create office first, then manage e-sign inside that office."
    replacement = "# Sales must never render office onboarding/e-sign controls.\ns = s.replace(cta, '')\np.write_text(s)\n\n# Office page: create office first, then manage e-sign inside that office."
    if needle in h and 'Sales must never render office onboarding/e-sign controls.' not in h:
        h = h.replace(needle, replacement, 1)
        helper.write_text(h)
