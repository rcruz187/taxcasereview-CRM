from pathlib import Path
p = Path('src/pages/Payments.jsx')
s = p.read_text()

def once(old,new):
    global s
    if new in s: return
    if old not in s: raise SystemExit(f'anchor not found: {old[:120]!r}')
    s=s.replace(old,new,1)

once("const BLANK = { clientName:'', invNum:'', amount:'', method:'Credit Card', checkNum:'', date:'', status:'Cleared', notes:'', reference:'' }",
     "const BLANK = { clientName:'', client_id:'', invNum:'', amount:'', method:'Credit Card', checkNum:'', date:'', status:'Cleared', notes:'', reference:'' }")
once("supabase.from('invoices').select('id,invNum,clientName,total,paid,status')",
     "supabase.from('invoices').select('id,invNum,clientName,client_id,total,taxRate,paid,status')")
once("    fld('clientName',val)\n    setSug", "    fld('clientName',val)\n    fld('client_id','')\n    setSug")
once("      setInvSug(invoices.filter(i=>i.clientName?.toLowerCase().includes(val.toLowerCase())&&i.status!=='Paid').slice(0,4))",
     "      setInvSug(invoices.filter(i=>i.clientName?.toLowerCase().includes(val.toLowerCase())&&i.status!=='Paid').slice(0,4))")
once("    fld('invNum', inv.invNum)\n    fld('clientName', inv.clientName)\n    const balance = parseFloat(inv.total||0) - parseFloat(inv.paid||0)",
     "    fld('invNum', inv.invNum)\n    fld('clientName', inv.clientName)\n    fld('client_id', inv.client_id || '')\n    const subtotal = parseFloat(inv.total||0)\n    const taxRate = parseFloat(inv.taxRate||0)\n    const balance = subtotal + (subtotal * taxRate / 100) - parseFloat(inv.paid||0)")
once("onClick={()=>{fld('clientName',c.name);setSug([]);setShowSug(false);setInvSug(invoices.filter(i=>i.clientName===c.name&&i.status!=='Paid').slice(0,4))}}",
     "onClick={()=>{fld('clientName',c.name);fld('client_id',c.id);setSug([]);setShowSug(false);setInvSug(invoices.filter(i=>(i.client_id?i.client_id===c.id:i.clientName===c.name)&&i.status!=='Paid').slice(0,4))}}")
p.write_text(s)
