import DeleteConfirmModal from '../components/DeleteConfirmModal'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'

const TRIGGER_EVENTS = {
  lead: [
    { value: 'lead_appointment_completed', label: 'Appointment Completed' },
    { value: 'lead_appointment_set',       label: 'Appointment Scheduled' },
    { value: 'lead_called',                label: 'Call Logged on Lead' },
    { value: 'document_uploaded',          label: 'Document Uploaded' },
    { value: 'lead_email_sent',            label: 'Email Sent to Lead' },
    { value: 'esign_sent',                 label: 'E-Signature Package Sent' },
    { value: 'esign_signed',               label: 'E-Signature Signed' },
    { value: 'financial_intake_submitted', label: 'Financial Intake Submitted' },
    { value: 'investigation_fee_paid',     label: 'Investigation Fee Paid' },
    { value: 'invoice_sent',               label: 'Invoice Sent' },
    { value: 'irs_facts_received',         label: 'IRS Facts Received' },
    { value: 'lead_archived',              label: 'Lead Archived' },
    { value: 'lead_assigned',              label: 'Lead Assigned to Rep' },
    { value: 'lead_converted',             label: 'Lead Converted to Client' },
    { value: 'lead_created',               label: 'New Lead Created' },
    { value: 'lead_status_changed',        label: 'Lead Status Changes To…' },
    { value: 'payment_failed',             label: 'Payment Failed' },
    { value: 'payment_received',           label: 'Payment Received' },
    { value: 'poa_sent',                   label: 'POA Sent to IRS' },
    { value: 'resolution_proposed',        label: 'Resolution Proposed' },
    { value: 'lead_sms_sent',              label: 'SMS Sent to Lead' },
    { value: 'tax_investigation_active',   label: 'Tax Investigation Activated' },
  ],
  client: [
    { value: 'addendum_sent',              label: 'Addendum Sent' },
    { value: 'addendum_signed',            label: 'Addendum Signed' },
    { value: 'client_appointment_completed', label: 'Appointment Completed' },
    { value: 'client_appointment_set',     label: 'Appointment Scheduled' },
    { value: 'autopay_enabled',            label: 'Autopay Enabled' },
    { value: 'client_called',              label: 'Call Logged on Client' },
    { value: 'case_closed',               label: 'Case Closed / Completed' },
    { value: 'client_assigned',            label: 'Client Assigned to Rep' },
    { value: 'client_created',             label: 'Client Created' },
    { value: 'client_status_changed',      label: 'Client Status Changes To…' },
    { value: 'document_uploaded',          label: 'Document Uploaded' },
    { value: 'client_email_sent',          label: 'Email Sent to Client' },
    { value: 'esign_sent',                 label: 'E-Signature Package Sent' },
    { value: 'esign_signed',               label: 'E-Signature Signed' },
    { value: 'financial_intake_submitted', label: 'Financial Intake Submitted' },
    { value: 'irs_approved',               label: 'IRS Approved Resolution' },
    { value: 'irs_facts_received',         label: 'IRS Facts Received' },
    { value: 'invoice_paid',               label: 'Invoice Paid' },
    { value: 'invoice_sent',               label: 'Invoice Sent' },
    { value: 'payment_failed',             label: 'Payment Failed' },
    { value: 'payment_plan_created',       label: 'Payment Plan Created' },
    { value: 'payment_received',           label: 'Payment Received' },
    { value: 'poa_sent',                   label: 'POA Sent to IRS' },
    { value: 'resolution_filed',           label: 'Resolution Filed with IRS' },
    { value: 'tax_return_accepted',        label: 'Tax Return Accepted' },
    { value: 'tax_return_filed',           label: 'Tax Return Filed' },
    { value: 'tax_return_rejected',        label: 'Tax Return Rejected' },
  ],
  case: [
    { value: 'agreement_reached',          label: 'Agreement Reached' },
    { value: 'case_assigned',              label: 'Case Assigned to Rep' },
    { value: 'case_closed',               label: 'Case Closed' },
    { value: 'case_created',              label: 'Case Created' },
    { value: 'case_resolved',             label: 'Case Resolved' },
    { value: 'case_status_changed',       label: 'Case Status Changes To…' },
    { value: 'case_type_changed',         label: 'Case Type Changed' },
    { value: 'compliance_issue',          label: 'Compliance Issue Flagged' },
    { value: 'currently_not_collectible', label: 'Currently Not Collectible Filed' },
    { value: 'deadline_approaching',      label: 'Deadline Within 7 Days' },
    { value: 'deadline_passed',           label: 'Deadline Passed' },
    { value: 'docs_needed',               label: 'Docs Needed Flag Set' },
    { value: 'docs_submitted',            label: 'Documents Submitted to IRS' },
    { value: 'document_uploaded',         label: 'Document Uploaded to Case' },
    { value: 'ia_established',            label: 'Installment Agreement Established' },
    { value: 'irs_approved',              label: 'IRS Approved' },
    { value: 'irs_facts_received',        label: 'IRS Facts Received' },
    { value: 'irs_under_review',          label: 'IRS Under Review' },
    { value: 'negotiating',               label: 'Negotiating with IRS' },
    { value: 'oic_submitted',             label: 'OIC Submitted' },
    { value: 'penalty_abatement_filed',   label: 'Penalty Abatement Filed' },
    { value: 'poa_sent',                  label: 'POA Sent to IRS' },
  ],
  deadline: [
    { value: 'deadline_created',          label: 'Deadline Created' },
    { value: 'deadline_completed',        label: 'Deadline Marked Complete' },
    { value: 'deadline_passed',           label: 'Deadline Passed' },
    { value: 'deadline_approaching_1',    label: 'Deadline Tomorrow' },
    { value: 'deadline_approaching_3',    label: 'Deadline Within 3 Days' },
    { value: 'deadline_approaching_7',    label: 'Deadline Within 7 Days' },
  ],
  sms: [
    { value: 'sms_failed',               label: 'SMS Failed to Deliver' },
    { value: 'sms_opted_out',            label: 'SMS Opted Out' },
    { value: 'sms_received',             label: 'SMS Received' },
    { value: 'sms_sent',                 label: 'SMS Sent' },
  ],
  fax: [
    { value: 'fax_failed',               label: 'Fax Failed' },
    { value: 'fax_received',             label: 'Fax Received' },
    { value: 'fax_sent',                 label: 'Fax Sent' },
  ],
  document: [
    { value: 'addendum_sent',            label: 'Addendum Sent' },
    { value: 'addendum_signed',          label: 'Addendum Signed' },
    { value: 'document_deleted',         label: 'Document Deleted' },
    { value: 'document_downloaded',      label: 'Document Downloaded' },
    { value: 'document_uploaded',        label: 'Document Uploaded' },
    { value: 'esign_sent',               label: 'E-Signature Package Sent' },
    { value: 'esign_signed',             label: 'E-Signature Signed' },
    { value: 'esign_voided',             label: 'E-Signature Voided' },
    { value: 'poa_sent',                 label: 'POA Sent to IRS' },
  ],
  invoice: [
    { value: 'invoice_created',          label: 'Invoice Created' },
    { value: 'invoice_overdue',          label: 'Invoice Overdue' },
    { value: 'invoice_paid',             label: 'Invoice Paid' },
    { value: 'invoice_sent',             label: 'Invoice Sent' },
    { value: 'invoice_voided',           label: 'Invoice Voided' },
  ],
  payment: [
    { value: 'ar_overdue',               label: 'AR Balance Overdue' },
    { value: 'ar_paid',                  label: 'AR Balance Paid Off' },
    { value: 'autopay_disabled',         label: 'Autopay Disabled' },
    { value: 'autopay_enabled',          label: 'Autopay Enabled' },
    { value: 'autopay_failed',           label: 'Autopay Payment Failed' },
    { value: 'payment_failed',           label: 'Payment Failed' },
    { value: 'payment_plan_created',     label: 'Payment Plan Created' },
    { value: 'payment_plan_updated',     label: 'Payment Plan Updated' },
    { value: 'payment_received',         label: 'Payment Received' },
  ],
  books: [
    { value: 'expense_added',            label: 'Expense Added' },
    { value: 'income_added',             label: 'Income Recorded' },
    { value: 'month_closed',             label: 'Month Closed / Locked' },
    { value: 'reconciliation_completed', label: 'Reconciliation Completed' },
  ],
  irs: [
    { value: 'form_2848_sent',           label: 'Form 2848 Sent' },
    { value: 'form_8821_sent',           label: 'Form 8821 Sent' },
    { value: 'irs_form_logged',          label: 'IRS Form Logged' },
    { value: 'irs_notice_received',      label: 'IRS Notice Received' },
    { value: 'state_form_logged',        label: 'State Form Logged' },
    { value: 'state_poa_sent',           label: 'State POA Sent' },
    { value: 'transcript_received',      label: 'Transcript Received' },
    { value: 'transcript_requested',     label: 'Transcript Requested' },
  ],
  tax_return: [
    { value: 'return_accepted',          label: 'Return Accepted by IRS/State' },
    { value: 'return_approved',          label: 'Return Approved by Client' },
    { value: 'return_created',           label: 'Return Created' },
    { value: 'return_extension_filed',   label: 'Return Extension Filed' },
    { value: 'return_filed',             label: 'Return Filed' },
    { value: 'return_in_progress',       label: 'Return In Progress' },
    { value: 'return_rejected',          label: 'Return Rejected' },
    { value: 'return_sent_to_client',    label: 'Return Sent to Client for Review' },
  ],
  employee: [
    { value: 'employee_added',           label: 'Employee Added' },
    { value: 'employee_clocked_in',      label: 'Employee Clocked In' },
    { value: 'employee_clocked_out',     label: 'Employee Clocked Out' },
    { value: 'employee_role_changed',    label: 'Employee Role Changed' },
    { value: 'payroll_run_approved',     label: 'Payroll Run Approved' },
    { value: 'payroll_run_created',      label: 'Payroll Run Created' },
    { value: 'time_off_approved',        label: 'Time Off Approved' },
    { value: 'time_off_denied',          label: 'Time Off Denied' },
    { value: 'time_off_requested',       label: 'Time Off Requested' },
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

  const [confirmDel, setConfirmDel] = useState(null)

  async function deleteTemplate(t) {
    setConfirmDel(t)
  }
  async function confirmDeleteTemplate() {
    if (!confirmDel) return
    await supabase.from('workflow_templates').delete().eq('id', confirmDel.id)
    setConfirmDel(null); showToast('Workflow deleted'); load()
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
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:'16px 20px', cursor:'pointer' }}
                onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}>
                <div style={{ width:10, height:10, borderRadius:'50%', background: t.active ? 'var(--ok)' : 'var(--t3)', flexShrink:0 }}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:15 }}>{t.name}</div>
                  <div style={{ fontSize:11, color:'var(--t3)', marginTop:2 }}>
                    {t.entity_type.charAt(0).toUpperCase()+t.entity_type.slice(1)} · {TRIGGER_EVENTS[t.entity_type]?.find(e=>e.value===t.trigger_event)?.label || t.trigger_event}
                    {t.trigger_value ? ` → "${t.trigger_value}"` : ''}
                    {' · '}{t.steps.length} step{t.steps.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <button onClick={e=>{e.stopPropagation();toggleActive(t)}} className="btn" style={{ fontSize:12, padding:'5px 14px', fontWeight:600, background: t.active ? 'var(--ok)' : 'var(--s2)', color: t.active ? '#fff' : 'var(--t3)', border:'none' }}>
                    {t.active ? 'Active' : 'Off'}
                  </button>
                  <button onClick={e=>{e.stopPropagation();openEdit(t)}} className="btn" style={{ fontSize:12, padding:'5px 14px', fontWeight:600 }}>Edit</button>
                  <button onClick={e=>{e.stopPropagation();deleteTemplate(t)}} className="btn" style={{ fontSize:12, padding:'5px 14px', fontWeight:600, color:'var(--bad)', border:'1px solid var(--bad)' }}>Delete</button>
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
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
          <div className="card" style={{ width:'100%', maxWidth:860, maxHeight:'94vh', overflowY:'auto', padding:0, display:'flex', flexDirection:'column' }}>

            {/* Header */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'24px 32px 20px', borderBottom:'1px solid var(--br)' }}>
              <div>
                <h3 style={{ margin:0, fontSize:20, fontWeight:700 }}>{editId ? 'Edit Workflow' : 'New Workflow'}</h3>
                <p style={{ margin:'4px 0 0', fontSize:13, color:'var(--t3)' }}>Define a trigger event and the tasks to auto-create when it fires.</p>
              </div>
              <button onClick={()=>setShowForm(false)} style={{ background:'none', border:'none', fontSize:24, cursor:'pointer', color:'var(--t3)', lineHeight:1, padding:'4px 8px' }}>×</button>
            </div>

            {/* Body */}
            <div style={{ padding:'28px 32px', display:'flex', flexDirection:'column', gap:24, flex:1 }}>

              {/* Workflow Name */}
              <div>
                <label style={{ display:'block', fontSize:12, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Workflow Name *</label>
                <input className="inp" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. New Lead Onboarding, Post-Signing Tasks…" style={{ width:'100%', boxSizing:'border-box', fontSize:15, padding:'10px 14px' }}/>
              </div>

              {/* Entity + Trigger */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:16 }}>
                <div>
                  <label style={{ display:'block', fontSize:12, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Entity Type *</label>
                  <select className="inp" value={form.entity_type} onChange={e=>setForm(f=>({...f,entity_type:e.target.value,trigger_event:'',trigger_value:''}))} style={{ width:'100%', fontSize:14, padding:'10px 14px' }}>
                    <optgroup label="Core">
                      <option value="lead">Lead</option>
                      <option value="client">Client</option>
                      <option value="case">Case</option>
                    </optgroup>
                    <optgroup label="Communications">
                      <option value="sms">SMS</option>
                      <option value="fax">Fax</option>
                    </optgroup>
                    <optgroup label="Documents">
                      <option value="document">Documents &amp; E-Signatures</option>
                    </optgroup>
                    <optgroup label="Billing">
                      <option value="invoice">Invoices</option>
                      <option value="payment">Payments &amp; AR</option>
                      <option value="books">Books &amp; Ledger</option>
                    </optgroup>
                    <optgroup label="IRS &amp; Tax">
                      <option value="irs">IRS &amp; State Forms</option>
                      <option value="tax_return">Tax Returns</option>
                    </optgroup>
                    <optgroup label="Operations">
                      <option value="deadline">Deadlines</option>
                      <option value="employee">Employee / HR / Payroll</option>
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label style={{ display:'block', fontSize:12, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Trigger Event *</label>
                  <select className="inp" value={form.trigger_event} onChange={e=>setForm(f=>({...f,trigger_event:e.target.value,trigger_value:''}))} style={{ width:'100%', fontSize:14, padding:'10px 14px' }}>
                    <option value="">Select trigger event…</option>
                    {triggers.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Status value if needed */}
              {needsValue && (
                <div>
                  <label style={{ display:'block', fontSize:12, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>When Status Changes To *</label>
                  <select className="inp" value={form.trigger_value} onChange={e=>setForm(f=>({...f,trigger_value:e.target.value}))} style={{ width:'100%', fontSize:14, padding:'10px 14px' }}>
                    <option value="">Select status…</option>
                    {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              {/* Active toggle */}
              <div style={{ display:'flex', alignItems:'center', gap:10, background:'var(--s1)', borderRadius:8, padding:'12px 16px' }}>
                <input type="checkbox" id="wf-active" checked={form.active} onChange={e=>setForm(f=>({...f,active:e.target.checked}))} style={{ width:16, height:16, cursor:'pointer' }}/>
                <label htmlFor="wf-active" style={{ fontSize:14, cursor:'pointer', fontWeight:500 }}>
                  Active — trigger fires automatically when this event occurs
                </label>
              </div>

              {/* Steps */}
              <div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.06em' }}>Steps — Tasks to Auto-Create</div>
                    <div style={{ fontSize:12, color:'var(--t3)', marginTop:3 }}>Each step becomes a task assigned to the specified role when the trigger fires.</div>
                  </div>
                  <button onClick={addStep} className="btn pri" style={{ fontSize:13, padding:'7px 16px', fontWeight:600 }}>+ Add Step</button>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  {steps.map((s, i) => (
                    <div key={i} style={{ background:'var(--s1)', border:'1px solid var(--br)', borderRadius:10, padding:'18px 20px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                        <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--blue)', color:'#fff', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{i+1}</div>
                        <input className="inp" value={s.title} onChange={e=>updateStep(i,'title',e.target.value)} placeholder="Task title — what needs to be done? *" style={{ flex:1, fontSize:14, padding:'9px 13px' }}/>
                        {steps.length > 1 && (
                          <button onClick={()=>removeStep(i)} style={{ background:'none', border:'none', color:'var(--bad)', cursor:'pointer', fontSize:20, padding:'0 6px', lineHeight:1 }}>×</button>
                        )}
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                        <div>
                          <label style={{ display:'block', fontSize:11, fontWeight:600, color:'var(--t3)', marginBottom:6 }}>Assign to Role</label>
                          <select className="inp" value={s.assigned_role} onChange={e=>updateStep(i,'assigned_role',e.target.value)} style={{ width:'100%', fontSize:14, padding:'9px 13px' }}>
                            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ display:'block', fontSize:11, fontWeight:600, color:'var(--t3)', marginBottom:6 }}>Due in (days from trigger)</label>
                          <input className="inp" type="number" min="1" max="90" value={s.due_in_days} onChange={e=>updateStep(i,'due_in_days',parseInt(e.target.value)||1)} style={{ width:'100%', fontSize:14, padding:'9px 13px' }}/>
                        </div>
                      </div>
                      <textarea className="inp" value={s.notes} onChange={e=>updateStep(i,'notes',e.target.value)} placeholder="Notes or instructions for the assignee (optional)" rows={2} style={{ width:'100%', boxSizing:'border-box', resize:'vertical', fontSize:13, padding:'9px 13px' }}/>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ display:'flex', gap:12, padding:'20px 32px 24px', borderTop:'1px solid var(--br)', justifyContent:'flex-end' }}>
              <button onClick={()=>setShowForm(false)} className="btn" style={{ padding:'10px 24px', fontSize:14 }}>Cancel</button>
              <button onClick={save} className="btn pri" disabled={saving} style={{ padding:'10px 28px', fontSize:14, fontWeight:700 }}>{saving ? 'Saving…' : editId ? 'Update Workflow' : 'Create Workflow'}</button>
            </div>
          </div>
        </div>
      )}
      <DeleteConfirmModal open={!!confirmDel} label="workflow" onConfirm={confirmDeleteTemplate} onCancel={() => setConfirmDel(null)} />
    </div>
  )
}

