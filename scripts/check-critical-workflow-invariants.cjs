const fs = require('fs')

function read(path) { return fs.readFileSync(path, 'utf8') }
function requireAll(path, snippets) {
  const src = read(path)
  for (const snippet of snippets) {
    if (!src.includes(snippet)) {
      console.error(`ERROR: ${path} is missing required audited invariant: ${snippet}`)
      process.exit(1)
    }
  }
  return src
}

const calendar = requireAll('src/pages/Calendar.jsx', [
  "client_id: ''",
  "supabase.from('clients').select('id,name,email,address')",
  "if (ev.client_id)",
  "clients.find(cl => cl.id === ev.client_id)",
  "value={form.client_id || ''}",
])
if (calendar.includes('datalist id="cal-clients"')) {
  console.error('ERROR: Calendar reverted to duplicate-prone name-only client selection.')
  process.exit(1)
}

for (const path of ['src/pages/Leads.jsx', 'src/pages/Clients.jsx']) {
  const src = requireAll(path, [
    "supabase.functions.invoke('send-fax'",
    "document_url:fileUrl",
    "resData?.success",
    "Fax provider rejected the send",
    "faxDigits.length !== 10",
  ])
  if (src.includes("signalwire_backend+'/fax/send")) {
    console.error(`ERROR: ${path} reverted to legacy inline fax backend.`)
    process.exit(1)
  }
}

console.log('Critical workflow invariants: PASS')
