// TimeEntry — full Canopy-parity billing time entry page.
// Accessed from: Clients detail tab "Time" + global sidebar under Billing.
// Entries attach to a CLIENT (required), optional task link.
// Per-activity rates; rate is snapshotted at entry time.
// WIP = unbilled entries. Billed = marked billed (linked to invoice).

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { parseMoney, formatMoney } from '../lib/money'

const BLANK = {
  client_id: '', client_name: '', task_id: '', task_title: '',
  activity_type: '', date: new Date().toISOString().slice(0, 10),
  hours: '', rate: '', description: '', billed: false,
}

function fmt(n) { return formatMoney(Number(n || 0)) }
function fmtH(h) { return `${Number(h || 0).toFixed(2)}h` }

export default function TimeEntry({ clientId, clientName, embed = false }) {
  const [searchParams] = useSearchParams()
  const { user, employeeName, showToast } = useApp()

  // If embedded in Clients page, clientId/clientName come as props.
  // If standalone page, read from URL or show all entries.
  const filterClient = clientName || searchParams.get('client') || ''
  const filterClientId = clientId || searchParams.get('clientId') || ''

  const [entries,     setEntries]     = useState([])
  const [activities,  setActivities]  = useState([])
  const [clients,     setClients]     = useState([])
  const [tasks,       setTasks]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [form,        setForm]        = useState({ ...BLANK })
  const [editId,      setEditId]      = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [filterBilled, setFilterBilled] = useState('all') // 'all' | 'wip' | 'billed'
  const [clientSearch, setClientSearch] = useState(filterClient)
  const [showClientDrop, setShowClientDrop] = useState(false)

  function fld(k, v) { setForm(f => ({ ...f, [k]: v })) }

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: ents }, { data: acts }, { data: cls }] = await Promise.all([
      filterClientId
        ? supabase.from('billing_time_entries').select('*').eq('client_id', filterClientId).order('date', { ascending: false }).order('created_at', { ascending: false })
        : filterClient
        ? supabase.from('billing_time_entries').select('*').eq('client_name', filterClient).order('date', { ascending: false }).order('created_at', { ascending: false })
        : supabase.from('billing_time_entries').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('billing_activity_types').select('*').order('sort_order'),
      supabase.from('clients').select('id,name').order('name'),
    ])
    setEntries(ents || [])
    setActivities(acts || [])
    setClients(cls || [])
    setLoading(false)
  }, [filterClient, filterClientId])

  useEffect(() => { load() }, [load])

  // Load tasks when client changes in the form
  useEffect(() => {
    if (!form.client_name) { setTasks([]); return }
    supabase.from('tasks').select('id,title,dueDate').eq('clientName', form.client_name).not('deleted', 'is', true).order('created_at', { ascending: false })
      .then(({ data }) => setTasks(data || []))
  }, [form.client_name])

  // When activity type changes, auto-fill rate from the activity's default rate
  useEffect(() => {
    if (!form.activity_type || editId) return // don't override on edit
    const act = activities.find(a => a.name === form.activity_type)
    if (act) fld('rate', act.default_rate)
  }, [form.activity_type, activities])

  function openNew() {
    setForm({
      ...BLANK,
      client_id: filterClientId || '',
      client_name: filterClient || '',
      date: new Date().toISOString().slice(0, 10),
    })
    setClientSearch(filterClient || '')
    setEditId(null)
    setShowForm(true)
  }

  function openEdit(e) {
    setForm({
      client_id: e.client_id || '',
      client_name: e.client_name || '',
      task_id: e.task_id || '',
      task_title: e.task_title || '',
      activity_type: e.activity_type || '',
      date: e.date || new Date().toISOString().slice(0, 10),
      hours: String(e.hours || ''),
      rate: String(e.rate || ''),
      description: e.description || '',
      billed: !!e.billed,
    })
    setClientSearch(e.client_name || '')
    setEditId(e.id)
    setShowForm(true)
  }

  async function save() {
    if (!form.client_name) { showToast('Select a client'); return }
    if (!form.activity_type) { showToast('Select an activity type'); return }
    if (!form.hours || isNaN(Number(form.hours)) || Number(form.hours) <= 0) { showToast('Enter valid hours'); return }
    if (!form.rate || isNaN(Number(form.rate)) || Number(form.rate) < 0) { showToast('Enter valid rate'); return }

    setSaving(true)
    const payload = {
      client_id:     form.client_id || null,
      client_name:   form.client_name.trim(),
      task_id:       form.task_id || null,
      task_title:    form.task_title || null,
      activity_type: form.activity_type,
      date:          form.date,
      hours:         Number(form.hours),
      rate:          parseMoney(String(form.rate)),
      description:   form.description.trim() || null,
      employee_name: employeeName || user?.email?.split('@')[0] || 'Staff',
      billed:        form.billed,
    }

    let err
    if (editId) {
      ;({ error: err } = await supabase.from('billing_time_entries').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editId))
    } else {
      ;({ error: err } = await supabase.from('billing_time_entries').insert([payload]))
    }

    setSaving(false)
    if (err) { showToast('❌ ' + err.message); return }
    showToast(editId ? '✅ Entry updated' : '✅ Time entry saved')
    setShowForm(false)
    setEditId(null)
    load()
  }

  async function markBilled(id, billed) {
    await supabase.from('billing_time_entries').update({ billed, updated_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  async function del(id) {
    if (!confirm('Delete this time entry?')) return
    await supabase.from('billing_time_entries').delete().eq('id', id)
    load()
  }

  const filtered = entries.filter(e =>
    filterBilled === 'all' ? true :
    filterBilled === 'wip' ? !e.billed :
    e.billed
  )

  const wipTotal    = entries.filter(e => !e.billed).reduce((s, e) => s + Number(e.amount || 0), 0)
  const wipHours    = entries.filter(e => !e.billed).reduce((s, e) => s + Number(e.hours || 0), 0)
  const billedTotal = entries.filter(e =>  e.billed).reduce((s, e) => s + Number(e.amount || 0), 0)
  const totalHours  = entries.reduce((s, e) => s + Number(e.hours || 0), 0)

  const clientFiltered = clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).slice(0, 8)

  if (loading) return <div style={{ padding: 24, color: 'var(--t3)', fontSize: 13 }}>Loading…</div>

  return (
    <div style={{ padding: embed ? 0 : '20px 24px' }}>

      {/* Header */}
      {!embed && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--tx)', marginBottom: 4 }}>⏱️ Time & Billing</div>
          <div style={{ fontSize: 13, color: 'var(--t3)' }}>Track billable hours by client and activity type.</div>
        </div>
      )}

      {/* WIP Summary cards */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'WIP Amount',    value: fmt(wipTotal),    sub: fmtH(wipHours) + ' unbilled',  color: '#f59e0b' },
          { label: 'Billed',        value: fmt(billedTotal), sub: 'collected this matter',         color: '#22c55e' },
          { label: 'Total Hours',   value: fmtH(totalHours), sub: entries.length + ' entries',    color: '#2563eb' },
        ].map(c => (
          <div key={c.label} style={{ flex: 1, minWidth: 140, background: 'var(--s1)', border: '1px solid var(--br)', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn pri" style={{ fontSize: 12, padding: '7px 14px' }} onClick={openNew}>+ Log Time</button>
        <div style={{ display: 'flex', gap: 4, background: 'var(--s1)', border: '1px solid var(--br)', borderRadius: 7, padding: 3 }}>
          {['all', 'wip', 'billed'].map(v => (
            <button key={v} onClick={() => setFilterBilled(v)}
              style={{ padding: '4px 12px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                       background: filterBilled === v ? 'var(--blue)' : 'transparent',
                       color: filterBilled === v ? '#fff' : 'var(--t2)' }}>
              {v === 'all' ? 'All' : v === 'wip' ? '⏳ WIP' : '✅ Billed'}
            </button>
          ))}
        </div>
      </div>

      {/* Log Time Form */}
      {showForm && (
        <div style={{ background: 'var(--s1)', border: '1px solid var(--br)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx)', marginBottom: 14 }}>
            {editId ? '✏️ Edit Time Entry' : '⏱️ Log Time'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>

            {/* Client */}
            {!filterClient && (
              <div style={{ gridColumn: '1/-1', position: 'relative' }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>Client *</label>
                <input value={clientSearch} onChange={e => { setClientSearch(e.target.value); fld('client_name', e.target.value); fld('client_id', ''); setShowClientDrop(true) }}
                  onFocus={() => setShowClientDrop(true)} onBlur={() => setTimeout(() => setShowClientDrop(false), 150)}
                  placeholder="Search clients…"
                  style={{ width: '100%', padding: '8px 10px', background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 7, color: 'var(--tx)', fontSize: 13, boxSizing: 'border-box' }} />
                {showClientDrop && clientFiltered.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 8, zIndex: 50, maxHeight: 200, overflowY: 'auto', marginTop: 2 }}>
                    {clientFiltered.map(c => (
                      <div key={c.id} onMouseDown={() => { fld('client_id', c.id); fld('client_name', c.name); setClientSearch(c.name); setShowClientDrop(false) }}
                        style={{ padding: '9px 12px', cursor: 'pointer', fontSize: 13, color: 'var(--tx)' }}
                        onMouseEnter={e => e.target.style.background = 'var(--s3)'}
                        onMouseLeave={e => e.target.style.background = ''}>
                        {c.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Date */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>Date *</label>
              <input type="date" value={form.date} onChange={e => fld('date', e.target.value)}
                style={{ width: '100%', padding: '8px 10px', background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 7, color: 'var(--tx)', fontSize: 13, boxSizing: 'border-box' }} />
            </div>

            {/* Activity Type */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>Activity Type *</label>
              <select value={form.activity_type} onChange={e => fld('activity_type', e.target.value)}
                style={{ width: '100%', padding: '8px 10px', background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 7, color: 'var(--tx)', fontSize: 13, boxSizing: 'border-box' }}>
                <option value="">Select activity…</option>
                {activities.map(a => <option key={a.id} value={a.name}>{a.name} (${Number(a.default_rate).toFixed(0)}/hr)</option>)}
              </select>
            </div>

            {/* Hours */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>Hours *</label>
              <input type="text" inputMode="decimal" value={form.hours} onChange={e => fld('hours', e.target.value)} placeholder="0.00"
                style={{ width: '100%', padding: '8px 10px', background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 7, color: 'var(--tx)', fontSize: 13, boxSizing: 'border-box' }} />
            </div>

            {/* Rate */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>Rate / hr *</label>
              <input type="text" inputMode="decimal" value={form.rate} onChange={e => fld('rate', e.target.value)} placeholder="0.00"
                style={{ width: '100%', padding: '8px 10px', background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 7, color: 'var(--tx)', fontSize: 13, boxSizing: 'border-box' }} />
            </div>

            {/* Amount preview */}
            {form.hours && form.rate && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Amount:</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#22c55e' }}>{fmt(Number(form.hours || 0) * parseMoney(String(form.rate || 0)))}</span>
              </div>
            )}

            {/* Task link (optional) */}
            {tasks.length > 0 && (
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>Link to Task (optional)</label>
                <select value={form.task_id} onChange={e => {
                  const task = tasks.find(t => t.id === e.target.value)
                  fld('task_id', e.target.value)
                  fld('task_title', task?.title || '')
                }}
                  style={{ width: '100%', padding: '8px 10px', background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 7, color: 'var(--tx)', fontSize: 13, boxSizing: 'border-box' }}>
                  <option value="">No task link</option>
                  {tasks.map(t => <option key={t.id} value={t.id}>{t.title}{t.dueDate ? ` (due ${t.dueDate})` : ''}</option>)}
                </select>
              </div>
            )}

            {/* Description */}
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>Description</label>
              <textarea value={form.description} onChange={e => fld('description', e.target.value)} rows={2} placeholder="What did you work on?"
                style={{ width: '100%', padding: '8px 10px', background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 7, color: 'var(--tx)', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn pri" onClick={save} disabled={saving} style={{ fontSize: 13 }}>
              {saving ? 'Saving…' : editId ? 'Update Entry' : 'Save Entry'}
            </button>
            <button className="btn sec" onClick={() => { setShowForm(false); setEditId(null) }} style={{ fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Entries list */}
      {filtered.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>
          {filterBilled === 'wip' ? 'No unbilled entries.' : filterBilled === 'billed' ? 'No billed entries.' : 'No time entries yet — click Log Time to add one.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(e => (
            <div key={e.id} style={{ background: 'var(--s1)', border: '1px solid var(--br)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              {/* Color dot for activity */}
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: activities.find(a => a.name === e.activity_type)?.color || '#64748b', marginTop: 5, flexShrink: 0 }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--tx)' }}>{e.activity_type}</span>
                  {!embed && <span style={{ fontSize: 12, color: 'var(--t2)' }}>· {e.client_name}</span>}
                  {e.task_title && <span style={{ fontSize: 11, color: 'var(--t3)', background: 'var(--s2)', borderRadius: 4, padding: '2px 6px' }}>📋 {e.task_title}</span>}
                  <span style={{ fontSize: 11, color: e.billed ? '#22c55e' : '#f59e0b', fontWeight: 700, marginLeft: 'auto' }}>
                    {e.billed ? '✅ Billed' : '⏳ WIP'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: e.description ? 4 : 0 }}>
                  {new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {' · '}<strong style={{ color: 'var(--tx)' }}>{fmtH(e.hours)}</strong>
                  {' @ '}{fmt(e.rate)}/hr
                  {' = '}<strong style={{ color: 'var(--tx)' }}>{fmt(e.amount)}</strong>
                  {' · '}{e.employee_name}
                </div>
                {e.description && <div style={{ fontSize: 12, color: 'var(--t2)' }}>{e.description}</div>}
              </div>

              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => markBilled(e.id, !e.billed)}
                  style={{ padding: '4px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--br)',
                           background: e.billed ? 'var(--s2)' : '#f59e0b22', color: e.billed ? 'var(--t2)' : '#b45309',
                           cursor: 'pointer', fontWeight: 600 }}>
                  {e.billed ? 'Unmark' : 'Mark billed'}
                </button>
                <button onClick={() => openEdit(e)} style={{ padding: '4px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--br)', background: 'var(--s2)', color: 'var(--t2)', cursor: 'pointer' }}>Edit</button>
                <button onClick={() => del(e.id)} style={{ padding: '4px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--br)', background: 'var(--s2)', color: 'var(--bad)', cursor: 'pointer' }}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
