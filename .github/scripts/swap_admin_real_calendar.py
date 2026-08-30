from pathlib import Path

p = Path('src/pages/AdminPortal.jsx')
s = p.read_text()

imp = "import CredentialVault from '../components/admin/CredentialVault'\n"
new_imp = imp + "import RomyLabsCalendar from '../components/admin/RomyLabsCalendar'\n"
if "RomyLabsCalendar from '../components/admin/RomyLabsCalendar'" not in s:
    if imp not in s:
        raise SystemExit('CredentialVault import marker missing')
    s = s.replace(imp, new_imp, 1)

start = s.find('function AdminCalendar(){')
if start < 0:
    raise SystemExit('AdminCalendar start missing')
next_marker = s.find('\n// ──', start)
if next_marker < 0:
    raise SystemExit('AdminCalendar end marker missing')
replacement = "function AdminCalendar(){\n  return <RomyLabsCalendar />\n}\n"
s = s[:start] + replacement + s[next_marker:]

p.write_text(s)
print('Admin Calendar now uses real RomyLabs product calendar')
