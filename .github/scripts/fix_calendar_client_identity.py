from pathlib import Path

p = Path('src/pages/Calendar.jsx')
s = p.read_text()

def once(old, new):
    global s
    if new in s:
        return
    if old not in s:
        raise SystemExit(f'anchor not found: {old[:120]!r}')
    s = s.replace(old, new, 1)

once("    title: '', clientName: '', assignedTo: '', date: '', time: '',\n", "    title: '', clientName: '', client_id: '', assignedTo: '', date: '', time: '',\n")
once("      supabase.from('clients').select('id,name'),", "      supabase.from('clients').select('id,name,email,address'),")
once("      supabase.from('deadlines').select('id,title,dueDate,clientName,status').neq('status', 'Completed'),", "      supabase.from('deadlines').select('id,title,dueDate,clientName,client_id,status').neq('status', 'Completed'),")
once("    const [{ data: c }, { data: l }] = await Promise.all([\n      supabase.from('clients').select('email').eq('name', ev.clientName).maybeSingle(),\n      supabase.from('leads').select('email').eq('name', ev.clientName).maybeSingle(),\n    ])\n    const email = c?.email || l?.email", "    let c = null\n    if (ev.client_id) {\n      const { data } = await supabase.from('clients').select('email').eq('id', ev.client_id).maybeSingle()\n      c = data\n    }\n    if (!c) {\n      const { data } = await supabase.from('clients').select('email').eq('name', ev.clientName).limit(1)\n      c = data?.[0] || null\n    }\n    const { data: leadRows } = c ? { data: [] } : await supabase.from('leads').select('email').eq('name', ev.clientName).limit(1)\n    const email = c?.email || leadRows?.[0]?.email")
once("      const { data: leadRow } = await supabase.from('leads').select('id').eq('name', form.clientName).maybeSingle().catch(()=>({data:null}))", "      const { data: leadRows } = await supabase.from('leads').select('id').eq('name', form.clientName).limit(1).catch(()=>({data:[]}))\n      const leadRow = leadRows?.[0] || null")
once("    setShowForm(false); setForm({ title:'',clientName:'',assignedTo:'',date:'',time:'',endTime:'',eventType:'Consultation Call',color:'bb',notes:'',recurring:'none',status:'scheduled' })", "    setShowForm(false); setForm({ title:'',clientName:'',client_id:'',assignedTo:'',date:'',time:'',endTime:'',eventType:'Consultation Call',color:'bb',notes:'',recurring:'none',status:'scheduled' })")
once("                  const c = clients.find(cl => cl.name === ev.clientName)", "                  const c = ev.client_id ? clients.find(cl => cl.id === ev.client_id) : clients.find(cl => cl.name === ev.clientName)")
once("                <input style={inp} value={form.clientName} onChange={e => fld('clientName', e.target.value)} list=\"cal-clients\" placeholder=\"Search client...\" />\n                <datalist id=\"cal-clients\">{clients.map(c => <option key={c.id} value={c.name} />)}</datalist>", "                <select style={inp} value={form.client_id || ''} onChange={e => { const c = clients.find(x => x.id === e.target.value); fld('client_id', e.target.value); fld('clientName', c?.name || '') }}>\n                  <option value=\"\">— No client —</option>\n                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}\n                </select>")

p.write_text(s)
