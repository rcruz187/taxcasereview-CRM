import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'

const TRIGGER_EVENTS = {
  lead: [
    { value: 'lead_created',        label: 'New Lead Created' },
    { value: 'lead_status_changed', label: 'Lead Status Changes To…' },
    { value: 'lead_converted',      label: 'Lead Converted to Client' },
    { value: 'esign_signed',        label: 'E-Signature Signed' },
    { value: 'payment_received',    label: 'Payment Received' },
  ],
  client: [
    { value: 'client_created',      label: 'New Client Created' },
    { value: 'esign_signed',        label: 'E-Signature Signed' },
    { value: 'payment_received',    label: 'Payment Received' },
  ],
  case: [
    { value: 'case_created',        label: 'New Case Created' },
    { value: 'case_status_changed', label: 'Case Status Changes To…' },
  ],
}

const LEAD_STATUSES = [
  'New Lead','Contacted','Qualified','Appointment Set','Tax Investigation Active',
  'IRS Facts Received','Resolution Proposed','Negotiating','Agreement Reached',
  'Documents Submitted','Pending IRS Review','IRS Approved','Enrolled',
  'Converted to Client','Closed - Lost',
]

const CASE_STATUSES = ['Open','Pending IRS','Active Plan','Docs Needed','POA Sent','Under Review','Resolved','Completed','Closed']

const ROLES = ['Admin','Super Admin','Tax Advisor','Tax Associate','Manager']

const BLANK_TEMPLATE = { name: '', trigger_event: '', entity_type: 'lead', trigger_value: '', active: true }
const BLANK_STEP = { title: '', assigned_role: 'Admin', due_in_days: 1, notes: '', step_order: 0 }

export default function Workflows() {
  const { role, showToast } = useApp()
  const isAdmin = role === 'Super Admin' || role === 'Admin'

  const [templates, setTemplates]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [editId, setEditId]         = useState(null)
  const [form, setForm]             = useState(BLANK_TEMPLATE)
  const [steps, setSteps]           = useState([{ ...BLANK_STEP }])
  const [saving, setSaving]         = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: tmpl } = await supabase.from('workflow_templates').select('*').order('created_at', { ascending: false })
    if (tmpl) {
      // load steps for each
      const ids = tmpl.map(t => t.id)
      const { data: stps } = await supabase.from('workflow_steps').select('*').in('template_id', ids).order('step_order')
      const stepsMap = {}
      ;(stps || []).forEach(s => { if (!stepsMap[s.template_id]) stepsMap[s.template_id] = []; stepsMap[s.template_id].push(s) })
      setTemplates(tmpl.map(t => ({ ...t, steps: stepsMap[t.id] || [] })))
    }
    setLoading(false)
  }

  function openNew() {
    setEditId(null)
    setForm(BLANK_TEMPLATE)
    setSteps([{ ...BLANK_STEP }])
    setShowForm(true)
  }

  function openEdit(t) {
    setEditId(t.id)
    setForm({ name: t.name, trigger_event: t.trigger_event, entity_type: t.entity_type, trigger_value: t.trigger_value || '', active: t.active })
    setSteps(t.steps.length ? t.steps.map(s => ({ ...s })) : [{ ...BLANK_STEP }])
    setShowForm(true)
  }

  async function save() {
    if (!form.name.trim()) { showToast('Name is required', 'err'); return }
    if (!form.trigger_event) { showToast('Trigger event is required', 'err'); return }
    if (steps.some(s => !s.title.trim())) { showToast('All steps need a title', 'err'); return }
    setSaving(true)
    try {
      let templateId = editId
      if (editId) {
        await supabase.from('workflow_templates').update({
          name: form.name, trigger_event: form.trigger_event, entity_type: form.entity_type,
          trigger_value: form.trigger_value || null, active: form.active,
        }).eq('id', editId)
        await supabase.from('workflow_steps').delete().eq('template_id', editId)
      } else {
        const { data } = await supabase.from('workflow_templates').insert({
          name: form.name, trigger_event: form.trigger_event, entity_type: form.entity_type,
          trigger_value: form.trigger_value || null, active: form.active,
          created_by: 'Admin',
        }).select('id').single()
        templateId = data.id
      }
      await supabase.from('workflow_steps').insert(
        steps.map((s, i) => ({ template_id: templateId, title: s.title, assigned_role: s.assigned_role, due_in_days: s.due_in_days, notes: s.notes, step_order: i }))
      )
      showToast(editId ? '✅ Workflow updated' : '✅ Workflow created')
      setShowForm(false)
      load()
    } catch(e) { showToast('Error: ' + e.message, 'err') }
    setSaving(false)
  }

  async function toggleActive(t) {
    await supabase.from('workflow_templates').update({ active: !t.active }).eq('id', t.id)
    load()
  }

  async function deleteTemplate(t) {
    if (!window.confirm(`Delete workflow "${t.name}"? This cannot be undone.`)) return
    await supabase.from('workflow_templates').delete().eq('id', t.id)
    showToast('Workflow deleted')
    load()
  }

  function addStep() { setSteps(s => [...s, { ...BLANK_STEP, step_order: s.length }]) }
  function removeStep(i) { setSteps(s => s.filter((_, idx) => idx !== i)) }
  function updateStep(i, k, v) { setSteps(s => s.map((st, idx) => idx === i ? { ...st, [k]: v } : st)) }

  const needsValue = form.trigger_event === 'lead_status_changed' || form.trigger_event === 'case_status_changed'
  const statusOptions = form.trigger_event === 'case_status_changed' ? CASE_STATUSES : LEAD_STATUSES
  const triggers = TRIGGER_EVENTS[form.entity_type] || []

  if (!isAdmin) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'60vh', gap:12, color:'var(--t3)' }}>
      <div style={{ fontSize:40 }}>🔒</div>
      <div style={{ fontWeight:700, fontSize:16, color:'var(--tx)' }}>Admin Access Required</div>
      <div style={{ fontSize:13 }}>Workflow management is restricted to Admins and Super Admins.</div>
    </div>
  )

  return (
    <div style={{ padding:'20px 24px', maxWidth:900, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h2 style={{ fontSize:17, fontWeight:700, margin:0 }}>⚡ Workflows</h2>
          <p style={{ fontSize:12, color:'var(--t3)', margin:'4px 0 0' }}>Auto-create tasks when trigger events fire on leads, clients, or cases.</p>
        </div>
        <button className="btn pri" onClick={openNew} style={{ fontSize:13, padding:'8px 16px' }}>+ New Workflow</button>
      </div>

      {loading ? (
        <div style={{ color:'var(--t3)', fontSize:13, padding:'40px 0', textAlign:'center' }}>Loading…</div>
      ) : templates.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px 0', color:'var(--t3)' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>⚡</div>
          <div style={{ fontWeight:600, fontSize:15, color:'var(--tx)', marginBottom:6 }}>No workflows yet</div>
          <div style={{ fontSize:13 }}>Create your first workflow to auto-assign tasks when events happen.</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {templates.map(t => (
            <div key={t.id} className="card" style={{ padding:0, overflow:'hidden' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', cursor:'pointer' }}
                onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}>
                <div style={{ width:10, height:10, borderRadius:'50%', background: t.active ? 'var(--ok)' : 'var(--t3)', flexShrink:0 }}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:600, fontSize:14 }}>{t.name}</div>
                  <div style={{ fontSize:11, color:'var(--t3)', marginTop:2 }}>
                    {t.entity_type.charAt(0).toUpperCase()+t.entity_type.slice(1)} · {TRIGGER_EVENTS[t.entity_type]?.find(e=>e.value===t.trigger_event)?.label || t.trigger_event}
                    {t.trigger_value ? ` → "${t.trigger_value}"` : ''}
                    {' · '}{t.steps.length} step{t.steps.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <button onClick={e=>{e.stopPropagation();toggleActive(t)}} className="btn" style={{ fontSize:11, padding:'3px 10px', background: t.active ? 'var(--ok)' : 'var(--s2)', color: t.active ? '#fff' : 'var(--t3)', border:'none' }}>
                    {t.active ? 'Active' : 'Off'}
                  </button>
                  <button onClick={e=>{e.stopPropagation();openEdit(t)}} className="btn" style={{ fontSize:11, padding:'3px 10px' }}>Edit</button>
                  <button onClick={e=>{e.stopPropagation();deleteTemplate(t)}} className="btn" style={{ fontSize:11, padding:'3px 10px', color:'var(--bad)', border:'1px solid var(--bad)' }}>Del</button>
                  <span style={{ color:'var(--t3)', fontSize:12 }}>{expandedId === t.id ? '▲' : '▼'}</span>
                </div>
              </div>
              {expandedId === t.id && (
                <div style={{ borderTop:'1px solid var(--br)', padding:'12px 16px', background:'var(--s1)' }}>
                  {t.steps.length === 0 ? (
                    <div style={{ fontSize:12, color:'var(--t3)' }}>No steps defined.</div>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {t.steps.map((s, i) => (
                        <div key={s.id} style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                          <div style={{ width:22, height:22, borderRadius:'50%', background:'var(--blue)', color:'#fff', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>{i+1}</div>
                          <div>
                            <div style={{ fontSize:13, fontWeight:600 }}>{s.title}</div>
                            <div style={{ fontSize:11, color:'var(--t3)' }}>Assign to {s.assigned_role} · Due in {s.due_in_days} day{s.due_in_days !== 1 ? 's' : ''}{s.notes ? ` · ${s.notes.slice(0,60)}${s.notes.length>60?'…':''}` : ''}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div className="card" style={{ width:'100%', maxWidth:640, maxHeight:'90vh', overflowY:'auto', padding:24 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
              <h3 style={{ margin:0, fontSize:16, fontWeight:700 }}>{editId ? 'Edit Workflow' : 'New Workflow'}</h3>
              <button onClick={()=>setShowForm(false)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--t3)' }}>×</button>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.05em' }}>Workflow Name *</label>
                <input className="inp" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. New Lead Onboarding" style={{ marginTop:4, width:'100%', boxSizing:'border-box' }}/>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={{ fontSize:11, fontWeight:600, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.05em' }}>Entity Type *</label>
                  <select className="inp" value={form.entity_type} onChange={e=>setForm(f=>({...f,entity_type:e.target.value,trigger_event:'',trigger_value:''}))} style={{ marginTop:4, width:'100%' }}>
                    <option value="lead">Lead</option>
                    <option value="client">Client</option>
                    <option value="case">Case</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:600, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.05em' }}>Trigger Event *</label>
                  <select className="inp" value={form.trigger_event} onChange={e=>setForm(f=>({...f,trigger_event:e.target.value,trigger_value:''}))} style={{ marginTop:4, width:'100%' }}>
                    <option value="">Select trigger…</option>
                    {triggers.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>

              {needsValue && (
                <div>
                  <label style={{ fontSize:11, fontWeight:600, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.05em' }}>Status Value *</label>
                  <select className="inp" value={form.trigger_value} onChange={e=>setForm(f=>({...f,trigger_value:e.target.value}))} style={{ marginTop:4, width:'100%' }}>
                    <option value="">Select status…</option>
                    {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="checkbox" id="wf-active" checked={form.active} onChange={e=>setForm(f=>({...f,active:e.target.checked}))}/>
                <label htmlFor="wf-active" style={{ fontSize:13 }}>Active (trigger fires immediately when enabled)</label>
              </div>

              {/* Steps */}
              <div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                  <label style={{ fontSize:11, fontWeight:600, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.05em' }}>Steps (Tasks to Auto-Create)</label>
                  <button onClick={addStep} className="btn" style={{ fontSize:11, padding:'3px 10px' }}>+ Add Step</button>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {steps.map((s, i) => (
                    <div key={i} style={{ background:'var(--s1)', border:'1px solid var(--br)', borderRadius:8, padding:12 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                        <div style={{ width:22, height:22, borderRadius:'50%', background:'var(--blue)', color:'#fff', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{i+1}</div>
                        <input className="inp" value={s.title} onChange={e=>updateStep(i,'title',e.target.value)} placeholder="Task title *" style={{ flex:1 }}/>
                        {steps.length > 1 && (
                          <button onClick={()=>removeStep(i)} style={{ background:'none', border:'none', color:'var(--bad)', cursor:'pointer', fontSize:16, padding:'0 4px' }}>×</button>
                        )}
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                        <div>
                          <label style={{ fontSize:10, color:'var(--t3)' }}>Assign to Role</label>
                          <select className="inp" value={s.assigned_role} onChange={e=>updateStep(i,'assigned_role',e.target.value)} style={{ width:'100%', marginTop:2 }}>
                            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize:10, color:'var(--t3)' }}>Due in (days)</label>
                          <input className="inp" type="number" min="1" max="30" value={s.due_in_days} onChange={e=>updateStep(i,'due_in_days',parseInt(e.target.value)||1)} style={{ width:'100%', marginTop:2 }}/>
                        </div>
                      </div>
                      <textarea className="inp" value={s.notes} onChange={e=>updateStep(i,'notes',e.target.value)} placeholder="Notes for assignee (optional)" rows={2} style={{ width:'100%', boxSizing:'border-box', resize:'vertical' }}/>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' }}>
              <button onClick={()=>setShowForm(false)} className="btn" style={{ padding:'8px 18px' }}>Cancel</button>
              <button onClick={save} className="btn pri" disabled={saving} style={{ padding:'8px 18px' }}>{saving ? 'Saving…' : editId ? 'Update Workflow' : 'Create Workflow'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
