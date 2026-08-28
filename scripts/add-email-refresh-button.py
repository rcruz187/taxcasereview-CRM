from pathlib import Path

p = Path('src/pages/Email.jsx')
s = p.read_text()
old = """              <span onClick={syncNow} style={{ cursor: 'pointer', textDecoration: 'underline' }}>Sync now</span>
"""
new = """              <button
                className=\"btn\"
                disabled={syncing}
                onClick={async () => {
                  await syncNow()
                  await load()
                  showToast(lastError ? 'Email sync error: ' + lastError : '✅ Email refreshed')
                }}
                style={{ padding:'4px 8px', fontSize:10, fontWeight:700, whiteSpace:'nowrap' }}
              >
                {syncing ? '⟳ Refreshing…' : '↻ Refresh Email'}
              </button>
"""
if '↻ Refresh Email' in s:
    print('Refresh Email button already present')
elif old in s:
    p.write_text(s.replace(old, new, 1))
    print('Refresh Email button added')
else:
    raise SystemExit('Expected Sync now link not found; refusing unsafe edit')
