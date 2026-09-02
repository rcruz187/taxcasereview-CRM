from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def patch(rel, pairs):
    p = ROOT / rel
    s = p.read_text()
    for old, new in pairs:
        if old not in s:
            if new in s:
                continue
            raise SystemExit(f'{rel}: anchor not found: {old[:100]!r}')
        s = s.replace(old, new, 1)
    p.write_text(s)
    print(rel, 'patched')

patch('src/pages/Deadlines.jsx', [
    ("const BLANK = { name:'', title:'', client:'', clientName:'', type:'General', dueDate:'', status:'Tracking', notes:'' }",
     "const BLANK = { name:'', title:'', client:'', clientName:'', client_id:'', type:'General', dueDate:'', status:'Tracking', notes:'' }"),
    ("supabase.from('clients').select('id,name')", "supabase.from('clients').select('id,name,email')"),
    ("fld('client',val); fld('clientName',val)", "fld('client',val); fld('clientName',val); fld('client_id','')"),
    ("{sug.map(c=><div key={c.id} onClick={()=>{fld('client',c.name);fld('clientName',c.name);setSug([])}}",
     "{sug.map(c=><div key={c.id} onClick={()=>{fld('client',c.name);fld('clientName',c.name);fld('client_id',c.id);setSug([])}}"),
    ("    const { data: client } = await supabase.from('clients').select('email').eq('name', clientName).maybeSingle()\n    const { data: lead }   = await supabase.from('leads').select('email').eq('name', clientName).maybeSingle()\n    const to = client?.email || lead?.email",
     "    let client = null\n    if (d.client_id) {\n      const { data } = await supabase.from('clients').select('email').eq('id', d.client_id).maybeSingle()\n      client = data\n    }\n    if (!client) {\n      const { data } = await supabase.from('clients').select('email').eq('name', clientName).limit(1)\n      client = data?.[0] || null\n    }\n    const { data: leadRows } = client ? { data: [] } : await supabase.from('leads').select('email').eq('name', clientName).limit(1)\n    const to = client?.email || leadRows?.[0]?.email")
])

patch('src/pages/Estimates.jsx', [
    ("const BLANK = { clientName:'', service:'', description:'', amount:'', depositAmount:'', validUntil:'', status:'Draft', assignedTo:'', notes:'' }",
     "const BLANK = { clientName:'', client_id:'', service:'', description:'', amount:'', depositAmount:'', validUntil:'', status:'Draft', assignedTo:'', notes:'' }"),
    ("supabase.from('clients').select('id,name,issueType,assignedTo')", "supabase.from('clients').select('id,name,email,issueType,assignedTo')"),
    ("    fld('clientName',val)\n", "    fld('clientName',val)\n    fld('client_id','')\n"),
    ("    fld('clientName', c.name)\n    if (c.assignedTo)", "    fld('clientName', c.name)\n    fld('client_id', c.id)\n    if (c.assignedTo)"),
    ("    const { data: client } = await supabase.from('clients').select('email').eq('name', est.clientName).maybeSingle()\n    const { data: lead }   = await supabase.from('leads').select('email').eq('name', est.clientName).maybeSingle()\n    const to = client?.email || lead?.email",
     "    let client = null\n    if (est.client_id) {\n      const { data } = await supabase.from('clients').select('email').eq('id', est.client_id).maybeSingle()\n      client = data\n    }\n    if (!client) {\n      const { data } = await supabase.from('clients').select('email').eq('name', est.clientName).limit(1)\n      client = data?.[0] || null\n    }\n    const { data: leadRows } = client ? { data: [] } : await supabase.from('leads').select('email').eq('name', est.clientName).limit(1)\n    const to = client?.email || leadRows?.[0]?.email"),
    ("      clientName: est.clientName, lineItems:", "      clientName: est.clientName, client_id: est.client_id || null, lineItems:")
])

patch('src/pages/Invoices.jsx', [
    ("const BLANK = { clientName:'', caseNum:'', lineItems:'', total:'', paid:'0', dueDate:'', taxRate:'0', status:'Unpaid', notes:'' }",
     "const BLANK = { clientName:'', client_id:'', caseNum:'', lineItems:'', total:'', paid:'0', dueDate:'', taxRate:'0', status:'Unpaid', notes:'' }"),
    ("supabase.from('clients').select('id,name,assignedTo')", "supabase.from('clients').select('id,name,email,assignedTo')"),
    ("    fld('clientName',val)\n", "    fld('clientName',val)\n    fld('client_id','')\n"),
    ("    fld('clientName', c.name)\n    // Auto-fill", "    fld('clientName', c.name)\n    fld('client_id', c.id)\n    // Auto-fill"),
    ("    // Look up client email\n    const { data: client } = await supabase.from('clients').select('id,email').eq('name', inv.clientName).maybeSingle()\n    const { data: lead }   = await supabase.from('leads').select('email').eq('name', inv.clientName).maybeSingle()\n    const to = client?.email || lead?.email",
     "    // Prefer the stable client id; keep a bounded name fallback only for legacy rows.\n    let client = null\n    if (inv.client_id) {\n      const { data } = await supabase.from('clients').select('id,email').eq('id', inv.client_id).maybeSingle()\n      client = data\n    }\n    if (!client) {\n      const { data } = await supabase.from('clients').select('id,email').eq('name', inv.clientName).limit(1)\n      client = data?.[0] || null\n    }\n    const { data: leadRows } = client ? { data: [] } : await supabase.from('leads').select('email').eq('name', inv.clientName).limit(1)\n    const to = client?.email || leadRows?.[0]?.email"),
    ("await supabase.from('payments').insert([{ clientName: inv.clientName, amount: paymentAmount, method: 'Manual', invoiceId: inv.id,",
     "await supabase.from('payments').insert([{ clientName: inv.clientName, client_id: inv.client_id || null, amount: paymentAmount, method: 'Manual', invoiceId: inv.id,"),
    ("  async function markPaid(inv) {    const total = parseFloat(inv.total||0)\n    const {error} = await supabase.from('invoices').update({paid:String(total), status:'Paid'",
     "  async function markPaid(inv) {\n    const subtotal = parseFloat(inv.total||0)\n    const taxRate = parseFloat(inv.taxRate||0)\n    const total = subtotal + (subtotal * taxRate / 100)\n    const {error} = await supabase.from('invoices').update({paid:String(total), status:'Paid'")
])
