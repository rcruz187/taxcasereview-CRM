import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'

const ROLES = ['Super Admin', 'Admin', 'Staff', 'View Only']
const ROLE_COLORS = { 'Super Admin': '#ef4444', 'Admin': '#f59e0b', 'Staff': '#3b82f6', 'View Only': '#64748b' }

// perm levels: 0=No Access, 1=View Only, 2=Edit, 3=Full Admin
const PERM_SECTIONS = [
  { key: 'perm_clients',   label: 'Client Work',         desc: 'Leads, Clients, Cases, Tasks, Deadlines', icon: '👥' },
  { key: 'perm_billing',   label: 'Billing',             desc: 'Estimates, Invoices, Payments, Books',    icon: '💳' },
  { key: 'perm_schedule',  label: 'Calendar & Schedule', desc: 'View and manage appointments',            icon: '📅' },
  { key: 'perm_documents', label: 'Documents & E-Sign',  desc: 'Upload, view, and request signatures',   icon: '📄' },
  { key: 'perm_irs',       label: 'IRS Resolution',      desc: 'Transcripts, IRS Forms, Tax Returns',    icon: '🏛️' },
  { key: 'perm_comms',     label: 'Communications',      desc: 'Email, SMS, Dialer, Team Chat',          icon: '💬' },
  { key: 'perm_reports',   label: 'Reports',             desc: 'View firm-wide analytics and reports',   icon: '📊' },
  { key: 'perm_hr',        label: 'HR & Payroll',        desc: 'Time clock, payroll, employee records',  icon: '🏢' },
  { key: 'perm_settings',  label: 'Settings & Users',    desc: 'Firm info, branding, user management',  icon: '⚙️' },
]

const LEVEL_OPTIONS = [
  { value: 0, label: 'No Access',   desc: 'Cannot see this section',             color: '#64748b' },
  { value: 1, label: 'View Only',   desc: 'Can view but not make changes',       color: '#3b82f6' },
  { value: 2, label: 'Edit',        desc: 'Can view and make changes',           color: '#f59e0b' },
  { value: 3, label: 'Full Admin',  desc: 'Full control including delete',       color: '#ef4444' },
]

// Default perm sets per role
const ROLE_PERM_DEFAULTS = {
  'Super Admin': { perm_clients:3, perm_billing:3, perm_schedule:3, perm_documents:3, perm_irs:3, perm_comms:3, perm_reports:3, perm_hr:3, perm_settings:3 },
  'Admin':       { perm_clients:2, perm_billing:2, perm_schedule:2, perm_documents:2, perm_irs:2, perm_comms:2, perm_reports:2, perm_hr:1, perm_settings:1 },
  'Staff':       { perm_clients:1, perm_billing:0, perm_schedule:1, perm_documents:1, perm_irs:1, perm_comms:2, perm_reports:0, perm_hr:0, perm_settings:0 },
  'View Only':   { perm_clients:1, perm_billing:0, perm_schedule:1, perm_documents:1, perm_irs:1, perm_comms:1, perm_reports:0, perm_hr:0, perm_settings:0 },
}

const blankEmp = {
  name: '', email: '', phone: '', title: '', access: 'Staff',
  ...ROLE_PERM_DEFAULTS['Staff']
}

export default function Employees() {
  const { showToast, can } = useApp()
  const [employees, setEmployees] = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [editing, setEditing]     = useState(null)
  const [form, setForm]           = useState(blankEmp)
  const [tab, setTab]             = useState('info')
  const [saving, setSaving]       = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [showReset, setShowReset]   = useState(false)
  const [resetSending, setResetSending] = useState(false)
  const [search, setSearch]       = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('employees').select('*').order('name')
    setEmployees(data || [])
    setLoading(false)
  }

  function openNew() {
    setEditing(null)
    setForm(blankEmp)
    setTab('info')
    setShowForm(true)
  }

  function openEdit(emp) {
    setEditing(emp.id)
    setForm({
      name: emp.name || '',
      email: emp.email || '',
      phone: emp.phone || '',
      title: emp.title ?? '',
      access: emp.access || 'Staff',
      perm_clients:  emp.perm_clients  ?? ROLE_PERM_DEFAULTS[emp.access || 'Staff'].perm_clients,
      perm_billing:  emp.perm_billing  ?? ROLE_PERM_DEFAULTS[emp.access || 'Staff'].perm_billing,
      perm_schedule: emp.perm_schedule ?? ROLE_PERM_DEFAULTS[emp.access || 'Staff'].perm_schedule,
      perm_documents:emp.perm_documents?? ROLE_PERM_DEFAULTS[emp.access || 'Staff'].perm_documents,
      perm_irs:      emp.perm_irs      ?? ROLE_PERM_DEFAULTS[emp.access || 'Staff'].perm_irs,
      perm_comms:    emp.perm_comms    ?? ROLE_PERM_DEFAULTS[emp.access || 'Staff'].perm_comms,
      perm_reports:  emp.perm_reports  ?? ROLE_PERM_DEFAULTS[emp.access || 'Staff'].perm_reports,
      perm_hr:       emp.perm_hr       ?? ROLE_PERM_DEFAULTS[emp.access || 'Staff'].perm_hr,
      perm_settings: emp.perm_settings ?? ROLE_PERM_DEFAULTS[emp.access || 'Staff'].perm_settings,
    })
    setTab('info')
    setShowForm(true)
  }

  function applyRoleDefaults(role) {
    setForm(f => ({ ...f, access: role, ...ROLE_PERM_DEFAULTS[role] }))
  }

  async function save() {
    if (!form.name || !form.email) return showToast('Name and email required', 'err')
    setSaving(true)
    // Strip any fields that may not exist in DB yet
    const payload = Object.fromEntries(
      Object.entries(form).filter(([, v]) => v !== undefined)
    )
    let error
    if (editing) {
      ({ error } = await supabase.from('employees').update(payload).eq('id', editing))
    } else {
      ({ error } = await supabase.from('employees').insert([payload]))
    }
    setSaving(false)
    if (error) return showToast(error.message, 'err')
    showToast(editing ? 'Employee updated!' : 'Employee added!')
    setShowForm(false)
    load()
  }

  async function remove(id) {
    if (!confirm('Delete this employee?')) return
    await supabase.from('employees').delete().eq('id', id)
    showToast('Employee removed')
    load()
  }

  async function sendReset() {
    if (!resetEmail) return
    setResetSending(true)
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: window.location.origin + '/taxcasereview-CRM'
    })
    setResetSending(false)
    if (error) return showToast(error.message, 'err')
    showToast('Password reset link sent!')
    setShowReset(false)
    setResetEmail('')
  }

  const filtered = employees.filter(e =>
    !search || e.name?.toLowerCase().includes(search.toLowerCase()) || e.email?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--tx)' }}>Employees</div>
          <div style={{ fontSize: 13, color: 'var(--t3)' }}>{employees.length} team member{employees.length !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search employees…"
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--br)', background: 'var(--s2)', color: 'var(--tx)', fontSize: 13, width: 200 }}
          />
          <button className="btn" onClick={() => { setShowReset(true); setResetEmail('') }}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            🔑 Reset Password
          </button>
          {can('edit', 'employees') && (
            <button className="btn pri" onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Employee
            </button>
          )}
        </div>
      </div>

      {/* Employee cards */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--t3)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
          <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--tx)' }}>No employees yet</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Add your first team member to get started</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {filtered.map(emp => (
            <div key={emp.id} className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                {/* Avatar */}
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: ROLE_COLORS[emp.access] || '#64748b',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 800, color: '#fff', flexShrink: 0
                }}>
                  {(emp.name || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--tx)' }}>{emp.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>{emp.title || 'Staff'}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)' }}>{emp.email}</div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20,
                      background: (ROLE_COLORS[emp.access] || '#64748b') + '22',
                      color: ROLE_COLORS[emp.access] || '#64748b',
                      border: '1px solid ' + (ROLE_COLORS[emp.access] || '#64748b') + '44'
                    }}>{emp.access || 'Staff'}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="btn sm" onClick={() => { setShowReset(true); setResetEmail(emp.email || '') }} title="Reset password">🔑</button>
                  {can('edit', 'employees') && (
                    <>
                      <button className="btn sm" onClick={() => openEdit(emp)}>Edit</button>
                      <button className="btn sm" onClick={() => remove(emp.id)}
                        style={{ color: 'var(--bad)' }}>✕</button>
                    </>
                  )}
                </div>
              </div>

              {/* Permission chips */}
              <div style={{ marginTop: 14, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {PERM_SECTIONS.map(s => {
                  const level = emp[s.key] ?? ROLE_PERM_DEFAULTS[emp.access || 'Staff']?.[s.key] ?? 0
                  if (level === 0) return null
                  const opt = LEVEL_OPTIONS[level]
                  return (
                    <span key={s.key} title={s.label + ': ' + opt.label} style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 12,
                      background: opt.color + '22', color: opt.color,
                      border: '1px solid ' + opt.color + '44', fontWeight: 600
                    }}>
                      {s.icon} {s.label.split(' ')[0]}
                    </span>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20
        }} onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div style={{
            background: 'var(--sf)', border: '1px solid var(--br)',
            borderRadius: 16, width: '100%', maxWidth: 620,
            maxHeight: '90vh', overflowY: 'auto'
          }}>
            {/* Modal header */}
            <div style={{
              padding: '20px 24px 16px',
              borderBottom: '1px solid var(--br)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--tx)' }}>
                {editing ? 'Edit Employee' : 'Add Employee'}
              </div>
              <button onClick={() => setShowForm(false)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--t3)', fontSize: 20, lineHeight: 1
              }}>✕</button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, padding: '12px 24px 0', borderBottom: '1px solid var(--br)' }}>
              {['info', 'permissions'].map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: '8px 18px', borderRadius: '8px 8px 0 0',
                  border: '1px solid var(--br)', borderBottom: tab === t ? '1px solid var(--sf)' : '1px solid var(--br)',
                  background: tab === t ? 'var(--sf)' : 'var(--s2)',
                  color: tab === t ? 'var(--tx)' : 'var(--t3)',
                  fontWeight: tab === t ? 700 : 400,
                  cursor: 'pointer', fontSize: 13, marginBottom: -1
                }}>
                  {t === 'info' ? '👤 Info' : '🔐 Permissions'}
                </button>
              ))}
            </div>

            <div style={{ padding: 24 }}>
              {/* Info tab */}
              {tab === 'info' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div className="field">
                      <label>Full Name *</label>
                      <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Doe" />
                    </div>
                    <div className="field">
                      <label>Email *</label>
                      <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@taxcasereview.org" />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div className="field">
                      <label>Phone</label>
                      <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(555) 555-5555" />
                    </div>
                    <div className="field">
                      <label>Title</label>
                      <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Tax Analyst" />
                    </div>
                  </div>

                  {/* Role selector */}
                  <div className="field">
                    <label>Role / Access Level</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                      {ROLES.map(r => (
                        <button key={r} onClick={() => applyRoleDefaults(r)} style={{
                          padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                          border: '2px solid ' + (form.access === r ? ROLE_COLORS[r] : 'var(--br)'),
                          background: form.access === r ? ROLE_COLORS[r] + '22' : 'var(--s2)',
                          color: form.access === r ? ROLE_COLORS[r] : 'var(--t2)',
                          fontWeight: form.access === r ? 700 : 400,
                          fontSize: 13, transition: 'all .15s'
                        }}>
                          {r}
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 6 }}>
                      Selecting a role applies default permissions — you can customize them in the Permissions tab.
                    </div>
                  </div>
                </div>
              )}

              {/* Permissions tab */}
              {tab === 'permissions' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{
                    background: 'var(--s2)', border: '1px solid var(--br)',
                    borderRadius: 8, padding: '10px 14px', marginBottom: 10,
                    fontSize: 13, color: 'var(--t3)', display: 'flex', gap: 8, alignItems: 'flex-start'
                  }}>
                    <span>ℹ️</span>
                    <span>Customize access for each section. These override the default role permissions. Click a role above (Info tab) to reset to defaults.</span>
                  </div>
                  {PERM_SECTIONS.map(section => {
                    const currentLevel = form[section.key] ?? 1
                    return (
                      <div key={section.key} style={{
                        border: '1px solid var(--br)', borderRadius: 10,
                        overflow: 'hidden', background: 'var(--s2)'
                      }}>
                        {/* Section header */}
                        <div style={{
                          padding: '12px 16px',
                          display: 'flex', alignItems: 'center', gap: 10,
                          borderBottom: '1px solid var(--br)',
                          background: 'var(--sf)'
                        }}>
                          <span style={{ fontSize: 18 }}>{section.icon}</span>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx)' }}>{section.label}</div>
                            <div style={{ fontSize: 11, color: 'var(--t3)' }}>{section.desc}</div>
                          </div>
                          <div style={{
                            marginLeft: 'auto',
                            fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                            background: LEVEL_OPTIONS[currentLevel].color + '22',
                            color: LEVEL_OPTIONS[currentLevel].color,
                            border: '1px solid ' + LEVEL_OPTIONS[currentLevel].color + '44'
                          }}>
                            {LEVEL_OPTIONS[currentLevel].label}
                          </div>
                        </div>
                        {/* Level options */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
                          {LEVEL_OPTIONS.map(opt => (
                            <div
                              key={opt.value}
                              onClick={() => setForm(f => ({ ...f, [section.key]: opt.value }))}
                              style={{
                                padding: '10px 12px', cursor: 'pointer', textAlign: 'center',
                                borderRight: opt.value < 3 ? '1px solid var(--br)' : 'none',
                                background: currentLevel === opt.value ? opt.color + '18' : 'transparent',
                                transition: 'background .1s',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3
                              }}
                            >
                              <div style={{
                                width: 18, height: 18, borderRadius: '50%',
                                border: '2px solid ' + (currentLevel === opt.value ? opt.color : 'var(--br)'),
                                background: currentLevel === opt.value ? opt.color : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0
                              }}>
                                {currentLevel === opt.value && (
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"/>
                                  </svg>
                                )}
                              </div>
                              <div style={{ fontSize: 12, fontWeight: currentLevel === opt.value ? 700 : 500, color: currentLevel === opt.value ? opt.color : 'var(--t2)' }}>
                                {opt.label}
                              </div>
                              <div style={{ fontSize: 10, color: 'var(--t3)', lineHeight: 1.3 }}>{opt.desc}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--br)' }}>
                <button className="btn" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="btn pri" onClick={save} disabled={saving}>
                  {saving ? 'Saving…' : (editing ? 'Save Changes' : 'Add Employee')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Password reset modal */}
      {showReset && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1001, padding: 20
        }} onClick={e => e.target === e.currentTarget && setShowReset(false)}>
          <div style={{
            background: 'var(--sf)', border: '1px solid var(--br)',
            borderRadius: 14, width: '100%', maxWidth: 400, padding: 28
          }}>
            <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--tx)', marginBottom: 6 }}>🔑 Reset Password</div>
            <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 18 }}>
              A secure reset link will be emailed to the user. The link expires in 1 hour.
            </div>
            <div className="field">
              <label>Employee Email</label>
              <input
                type="email" value={resetEmail}
                onChange={e => setResetEmail(e.target.value)}
                placeholder="employee@taxcasereview.org"
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn" onClick={() => setShowReset(false)}>Cancel</button>
              <button className="btn pri" onClick={sendReset} disabled={resetSending || !resetEmail}>
                {resetSending ? 'Sending…' : 'Send Reset Link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
