from pathlib import Path

for rel in ['src/pages/Leads.jsx', 'src/pages/Clients.jsx']:
    p = Path(rel)
    s = p.read_text()
    old = "provider_sid:resData?.sid || null," if rel.endswith('Leads.jsx') else "provider_sid:resData?.sid || null,"
    if old not in s:
        raise SystemExit(f'{rel}: provider_sid anchor not found')
    new = "...(resData?.provider === 'telnyx' ? { telnyx_fax_id: resData?.sid || null } : { signalwire_fax_id: resData?.sid || null }),"
    s = s.replace(old, new, 1)
    p.write_text(s)
    print(rel, 'patched')
