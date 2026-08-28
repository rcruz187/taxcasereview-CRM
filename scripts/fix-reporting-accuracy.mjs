import fs from 'node:fs'

const file = 'src/pages/Reports.jsx'
let src = fs.readFileSync(file, 'utf8')

function replaceExact(from, to, label) {
  if (!src.includes(from)) throw new Error(`Reporting audit patch anchor missing: ${label}`)
  // Function replacer is intentional: replacement strings containing currency
  // text like '$' must never be interpreted as String.replace $-patterns.
  src = src.replace(from, () => to)
}

replaceExact(
`  async function loadAll() {\n    setLoading(true)\n    const [c,l,ca,t,inv,pay,dl,emp,tr,es,fc,bk] = await Promise.all([\n      supabase.from('clients').select('*').order('created_at',{ascending:true}),\n      supabase.from('leads').select('*').order('created_at',{ascending:true}),\n      supabase.from('cases').select('*').order('created_at',{ascending:true}),\n      supabase.from('tasks').select('*').not('deleted','is',true).order('created_at',{ascending:true}),\n      supabase.from('invoices').select('*').order('created_at',{ascending:true}),\n      supabase.from('payments').select('*').order('created_at',{ascending:true}),\n      supabase.from('deadlines').select('*'),\n      supabase.from('employees').select('*'),\n      supabase.from('tax_returns').select('*').order('created_at',{ascending:false}),\n      supabase.from('esigns').select('*').order('created_at',{ascending:false}),\n      supabase.from('formacorp').select('*').order('created_at',{ascending:false}),\n      supabase.from('bookkeeping').select('*').order('date',{ascending:false}),\n    ])\n    setData({\n      clients:c.data||[], leads:l.data||[], cases:ca.data||[], tasks:t.data||[],\n      invoices:inv.data||[], payments:pay.data||[], deadlines:dl.data||[],\n      employees:emp.data||[], taxReturns:tr.data||[], esigns:es.data||[],\n      formacorp:fc.data||[], bookkeeping:bk.data||[]\n    })\n    setLoading(false)\n  }`,
`  async function fetchAllRows(table, { orderBy, ascending=true, filter } = {}) {\n    const pageSize = 1000\n    const rows = []\n    for (let from = 0; ; from += pageSize) {\n      let query = supabase.from(table).select('*')\n      if (filter) query = filter(query)\n      if (orderBy) query = query.order(orderBy, { ascending })\n      const { data: page, error } = await query.range(from, from + pageSize - 1)\n      if (error) throw new Error(\`${'${table}'} report load failed: ${'${error.message}'}\`)\n      rows.push(...(page || []))\n      if (!page || page.length < pageSize) break\n    }\n    return rows\n  }\n\n  async function loadAll() {\n    setLoading(true)\n    try {\n      const [clients,leads,cases,tasks,invoices,payments,deadlines,employees,taxReturns,esigns,formacorp,bookkeeping] = await Promise.all([\n        fetchAllRows('clients',{orderBy:'created_at'}),\n        fetchAllRows('leads',{orderBy:'created_at'}),\n        fetchAllRows('cases',{orderBy:'created_at'}),\n        fetchAllRows('tasks',{orderBy:'created_at',filter:q=>q.not('deleted','is',true)}),\n        fetchAllRows('invoices',{orderBy:'created_at'}),\n        fetchAllRows('payments',{orderBy:'created_at'}),\n        fetchAllRows('deadlines'),\n        fetchAllRows('employees'),\n        fetchAllRows('tax_returns',{orderBy:'created_at',ascending:false}),\n        fetchAllRows('esigns',{orderBy:'created_at',ascending:false}),\n        fetchAllRows('formacorp',{orderBy:'created_at',ascending:false}),\n        fetchAllRows('bookkeeping',{orderBy:'date',ascending:false}),\n      ])\n      setData({ clients,leads,cases,tasks,invoices,payments,deadlines,employees,taxReturns,esigns,formacorp,bookkeeping })\n    } catch (err) {\n      console.error('Reports exhaustive load failed:', err)\n      setData({ clients:[], leads:[], cases:[], tasks:[], invoices:[], payments:[], deadlines:[], employees:[], taxReturns:[], esigns:[], formacorp:[], bookkeeping:[] })\n    } finally {\n      setLoading(false)\n    }\n  }`,
'exhaustive report loader')

replaceExact(
`  const fPayments = filterByRange(payments)\n  const fInvoices = filterByRange(invoices)\n  const fClients  = filterByRange(clients)\n  const fLeads    = filterByRange(leads)\n  const fCases    = filterByRange(cases)\n\n  const totalRevenue    = fPayments.filter(p=>p.status==='Cleared').reduce((s,p)=>s+parseFloat(p.amount||0),0)\n  const pendingRevenue  = fInvoices.filter(i=>i.status!=='Paid').reduce((s,i)=>s+parseFloat(i.total||0),0)\n  const openCases       = cases.filter(c=>OPEN_STATUSES.includes(c.status)).length\n  const overdueDl       = deadlines.filter(d=>d.dueDate&&new Date(d.dueDate)<new Date()&&d.status!=='Completed').length\n  const conversionRate  = leads.length ? Math.round((clients.length/leads.length)*100) : 0`,
`  const normalizeStatus = (v) => String(v || '').trim().toLowerCase()\n  const isSettledPayment = (p) => ['succeeded','cleared','paid','completed','success'].includes(normalizeStatus(p.status || p.payment_status))\n  const paymentDate = (p) => p.date || p.created_at\n  const invoiceAmountDue = (i) => Math.max(0, parseFloat(i.total || i.amount || 0) - parseFloat(i.paid || 0))\n  const isConvertedLead = (l) => ['converted to client','converted','closed won'].includes(normalizeStatus(l.status))\n\n  const fPayments = dateRange === 'all' ? payments : filterByRange(payments.map(p=>({...p,__reportDate:paymentDate(p)})), '__reportDate')\n  const fInvoices = filterByRange(invoices)\n  const fClients  = filterByRange(clients)\n  const fLeads    = filterByRange(leads).filter(l=>!l.deleted_at)\n  const fCases    = filterByRange(cases)\n\n  const settledPayments = fPayments.filter(isSettledPayment)\n  const totalRevenue    = settledPayments.reduce((s,p)=>s+parseFloat(p.amount||0),0)\n  const pendingRevenue  = fInvoices.reduce((s,i)=>s+invoiceAmountDue(i),0)\n  const openCases       = fCases.filter(c=>OPEN_STATUSES.includes(c.status)).length\n  const overdueDl       = deadlines.filter(d=>d.dueDate&&new Date(d.dueDate)<new Date()&&d.status!=='Completed').length\n  const conversionRate  = fLeads.length ? Math.round((fLeads.filter(isConvertedLead).length/fLeads.length)*100) : 0`,
'metrics')

replaceExact(
`  // Revenue by month\n  const revByMonth = {}\n  for(let i=0;i<12;i++) revByMonth[i]=0\n  payments.filter(p=>p.status==='Cleared').forEach(p=>{\n    if(!p.created_at) return\n    revByMonth[new Date(p.created_at).getMonth()] += parseFloat(p.amount||0)\n  })\n  const maxRev = Math.max(...Object.values(revByMonth),1)`,
`  // Revenue by month — chronological rolling 12 months; never collapse different years together.\n  const monthBuckets = Array.from({length:12}, (_,offset) => {\n    const d = new Date()\n    d.setDate(1)\n    d.setHours(0,0,0,0)\n    d.setMonth(d.getMonth() - (11 - offset))\n    return { key: \`${'${d.getFullYear()}'}-${'${String(d.getMonth()+1).padStart(2,\'0\')}'}\`, label: \`${'${MONTHS[d.getMonth()]}'} '${'${String(d.getFullYear()).slice(-2)}'}\` }\n  })\n  const revByMonth = Object.fromEntries(monthBuckets.map((_,i)=>[i,0]))\n  const bucketIndex = new Map(monthBuckets.map((b,i)=>[b.key,i]))\n  settledPayments.forEach(p=>{\n    const raw = paymentDate(p)\n    if(!raw) return\n    const d = new Date(raw)\n    if(Number.isNaN(d.getTime())) return\n    const idx = bucketIndex.get(\`${'${d.getFullYear()}'}-${'${String(d.getMonth()+1).padStart(2,\'0\')}'}\`)\n    if(idx !== undefined) revByMonth[idx] += parseFloat(p.amount||0)\n  })\n  const maxRev = Math.max(...Object.values(revByMonth),1)`,
'monthly revenue')

replaceExact(
`    const repPayments = payments.filter(p=>p.status==='Cleared'&&repClients.some(c=>c.name===p.clientName))`,
`    const repClientIds = new Set(repClients.map(c=>String(c.id)))\n    const repPayments = settledPayments.filter(p=>p.client_id && repClientIds.has(String(p.client_id)))`,
'rep payments')

replaceExact(
`rows:MONTHS.map((m,i)=>[m,'$'+Math.round(revByMonth[i])])`,
`rows:monthBuckets.map((b,i)=>[b.label,'$'+Math.round(revByMonth[i])])`,
'PDF month labels')
replaceExact(
`...MONTHS.map((m,i)=>[m,'$'+Math.round(revByMonth[i])])`,
`...monthBuckets.map((b,i)=>[b.label,'$'+Math.round(revByMonth[i])])`,
'Excel month labels')

src = src.replace(/MONTHS\[Number\(m\)\]/g, () => 'monthBuckets[Number(m)]?.label || m')
src = src.replace(/MONTHS\[i\]/g, () => 'monthBuckets[i]?.label || MONTHS[i]')

fs.writeFileSync(file, src)
console.log('✓ Reporting accuracy patch applied: exhaustive paging, settled payments, derived AR, lead conversion, tenant-safe rep attribution, year-aware monthly revenue')
