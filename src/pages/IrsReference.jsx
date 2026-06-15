import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'

const CATEGORIES = ['IRS Phone Numbers', 'Mailing Addresses', 'State Info', 'Rep Info', 'Tips & Procedures', 'Other']

const STATE_NAMES = {
  AL:'Alabama', AZ:'Arizona', AR:'Arkansas', CA:'California', CO:'Colorado', CT:'Connecticut',
  DE:'Delaware', FL:'Florida', GA:'Georgia', HI:'Hawaii', ID:'Idaho', IL:'Illinois', IN:'Indiana',
  IA:'Iowa', KS:'Kansas', KY:'Kentucky', LA:'Louisiana', ME:'Maine', MD:'Maryland', MA:'Massachusetts',
  MI:'Michigan', MN:'Minnesota', MS:'Mississippi', MO:'Missouri', MT:'Montana', NE:'Nebraska',
  NJ:'New Jersey', NM:'New Mexico', NY:'New York', NC:'North Carolina', ND:'North Dakota', OH:'Ohio',
  OK:'Oklahoma', OR:'Oregon', PA:'Pennsylvania', RI:'Rhode Island', SC:'South Carolina', TN:'Tennessee',
  TX:'Texas', UT:'Utah', VA:'Virginia', DC:'Washington D.C.', WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming',
}

const blankEntry = { category: 'IRS Phone Numbers', title: '', content: '', notes: '', state: '', sort_order: 0 }

export default function IrsReference() {
  const { showToast, user } = useApp()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const [modal, setModal]     = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm]       = useState(blankEntry)
  const [saving, setSaving]   = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('irs_reference').select('*').order('category').order('sort_order').order('title')
    setEntries(data || [])
    setLoading(false)
  }

  function openNew() {
    setEditing(null)
    setForm(blankEntry)
    setModal(true)
  }

  function openEdit(entry) {
    setEditing(entry.id)
    setForm({
      category: entry.category || 'Other',
      title: entry.title || '',
      content: entry.content || '',
      notes: entry.notes || '',
      state: entry.state || '',
      sort_order: entry.sort_order || 0,
    })
    setModal(true)
  }

  async function save() {
    if (!form.title.trim()) return showToast('Title is required', 'err')
    setSaving(true)
    const payload = { ...form, updated_at: new Date().toISOString() }
    let error
    if (editing) {
      ({ error } = await supabase.from('irs_reference').update(payload).eq('id', editing))
    } else {
      ({ error } = await supabase.from('irs_reference').insert([{
        ...payload, created_by: user?.email || '', created_at: new Date().toISOString()
      }]))
    }
    setSaving(false)
    if (error) return showToast(error.message, 'err')
    showToast(editing ? 'Entry updated!' : 'Entry added!')
    setModal(false)
    load()
  }

  async function remove(id) {
    await supabase.from('irs_reference').delete().eq('id', id)
    showToast('Entry removed')
    setConfirmDel(null)
    load()
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => showToast('Copied!'))
  }

  const q = search.trim().toLowerCase()
  const filtered = entries.filter(e => {
    if (stateFilter && e.state !== stateFilter) return false
    return !q ||
      e.title?.toLowerCase().includes(q) ||
      e.content?.toLowerCase().includes(q) ||
      e.notes?.toLowerCase().includes(q) ||
      e.category?.toLowerCase().includes(q) ||
      e.state?.toLowerCase().includes(q) ||
      (e.state && STATE_NAMES[e.state]?.toLowerCase().includes(q))
  })

  // All distinct states present, for the filter dropdown
  const statesPresent = [...new Set(entries.filter(e => e.state).map(e => e.state))]
    .sort((a, b) => (STATE_NAMES[a] || a).localeCompare(STATE_NAMES[b] || b))

  // Group by category, preserving category order
  const grouped = {}
  for (const e of filtered) {
    if (!grouped[e.category]) grouped[e.category] = []
    grouped[e.category].push(e)
  }
  const categoryOrder = [...CATEGORIES.filter(c => grouped[c]), ...Object.keys(grouped).filter(c => !CATEGORIES.includes(c))]

  // For 'State Info', further group by state
  function groupByState(list) {
    const byState = {}
    for (const e of list) {
      const key = e.state || '—'
      if (!byState[key]) byState[key] = []
      byState[key].push(e)
    }
    return Object.entries(byState).sort(([a], [b]) => (STATE_NAMES[a] || a).localeCompare(STATE_NAMES[b] || b))
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--tx)' }}>IRS Reference</div>
          <div style={{ fontSize: 13, color: 'var(--t3)' }}>Phone numbers, addresses, and tips — shared by the whole team</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={stateFilter} onChange={e => setStateFilter(e.target.value)}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--br)', background: 'var(--s2)', color: 'var(--tx)', fontSize: 13 }}
          >
            <option value="">All States</option>
            {statesPresent.map(s => <option key={s} value={s}>{STATE_NAMES[s] || s}</option>)}
          </select>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--br)', background: 'var(--s2)', color: 'var(--tx)', fontSize: 13, width: 200 }}
          />
          <button className="btn pri" onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Entry
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--t3)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏛️</div>
          <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--tx)' }}>{q ? 'No matching entries' : 'No entries yet'}</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>{q ? 'Try a different search' : 'Add IRS phone numbers, addresses, and tips for the team'}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {categoryOrder.map(cat => (
            <div key={cat}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
                {cat}
              </div>
              {cat === 'State Info' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {groupByState(grouped[cat]).map(([st, list]) => (
                    <div key={st}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                          background: 'var(--blt)', color: 'var(--b2)', border: '1px solid var(--blue)'
                        }}>{st}</span>
                        {STATE_NAMES[st] || st}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                        {list.map(entry => <EntryCard key={entry.id} entry={entry} showState={false} onCopy={copyToClipboard} onEdit={openEdit} onDelete={setConfirmDel} />)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
                  {grouped[cat].map(entry => <EntryCard key={entry.id} entry={entry} showState onCopy={copyToClipboard} onEdit={openEdit} onDelete={setConfirmDel} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      {modal && (
        <div className="modal-bg open" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal" style={{ width: 460, maxWidth: '95vw' }}>
            <div className="mh">
              <span className="mt">{editing ? 'Edit Entry' : 'Add Entry'}</span>
              <button className="xbtn" onClick={() => setModal(false)}>&times;</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '0 0 4px' }}>
              <div className="field">
                <label>Category</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Tax Practitioner Line"/>
              </div>
              <div className="field">
                <label>Content (number, address, etc.)</label>
                <textarea rows={3} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} placeholder="e.g. 866-860-4259"/>
              </div>
              <div className="field">
                <label>Notes <span style={{ fontWeight: 400, color: 'var(--t3)', textTransform: 'none' }}>(optional)</span></label>
                <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Option 2 for personal, option 3 for business"/>
              </div>
              <div className="field">
                <label>State <span style={{ fontWeight: 400, color: 'var(--t3)', textTransform: 'none' }}>(optional — for state-specific entries)</span></label>
                <select value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))}>
                  <option value="">— None (federal/general) —</option>
                  {Object.entries(STATE_NAMES).map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--br)' }}>
              <button className="btn" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn pri" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : (editing ? 'Save Changes' : 'Add Entry')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDel && (
        <div className="modal-bg open" onClick={e => e.target === e.currentTarget && setConfirmDel(null)}>
          <div className="modal" style={{ maxWidth: 360, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🗑</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Delete this entry?</div>
            <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 20 }}>This cannot be undone.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn sec" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className="btn del" style={{ flex: 1, justifyContent: 'center' }} onClick={() => remove(confirmDel)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EntryCard({ entry, showState, onCopy, onEdit, onDelete }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx)' }}>
            {entry.title}
            {showState && entry.state && (
              <span style={{
                marginLeft: 8, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                background: 'var(--blt)', color: 'var(--b2)', border: '1px solid var(--blue)'
              }}>{entry.state}</span>
            )}
          </div>
          {entry.content && (
            <div style={{ fontSize: 14, color: 'var(--t2)', marginTop: 6, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
              {entry.content}
            </div>
          )}
          {entry.notes && (
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 6, lineHeight: 1.5 }}>
              {entry.notes}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {entry.content && (
            <button className="btn sm" onClick={() => onCopy(entry.content)} title="Copy">📋</button>
          )}
          <button className="btn sm" onClick={() => onEdit(entry)} title="Edit">Edit</button>
          <button className="btn sm" onClick={() => onDelete(entry.id)} title="Delete" style={{ color: 'var(--bad)' }}>✕</button>
        </div>
      </div>
    </div>
  )
}
