import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Search fields per table (using verified live schema columns)
// All queries run through PostgREST → RLS enforced automatically
// No service_role, no cross-tenant bypass

function highlight(text, q) {
  if (!text || !q) return text || ''
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'var(--accent)', color: '#000', borderRadius: 2, padding: '0 2px' }}>
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  )
}

export default function GlobalSearch({ value, onChange }) {
  const [results, setResults] = useState({ clients: [], cases: [], leads: [] })
  const [loading, setLoading] = useState(false)
  const [open, setOpen]     = useState(false)
  const [focused, setFocused] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const debounceRef  = useRef(null)
  const containerRef = useRef(null)
  const navigate     = useNavigate()

  // Flatten results for keyboard nav
  const flat = [
    ...results.clients.map(r => ({ ...r, _type: 'client' })),
    ...results.cases.map(r => ({ ...r, _type: 'case' })),
    ...results.leads.map(r => ({ ...r, _type: 'lead' })),
  ]

  const search = useCallback(async (q) => {
    if (!q || q.trim().length < 2) {
      setResults({ clients: [], cases: [], leads: [] })
      setOpen(false)
      return
    }
    setLoading(true)
    const pat = `%${q.trim()}%`

    const [clientRes, caseRes, leadRes] = await Promise.all([
      supabase.from('clients')
        .select('id, name, first, last, email, phone, custnum, status')
        .or(`name.ilike.${pat},first.ilike.${pat},last.ilike.${pat},email.ilike.${pat},phone.ilike.${pat},custnum.ilike.${pat}`)
        .or('archived.is.null,archived.eq.false')
        .limit(5),

      supabase.from('cases')
        .select('id, clientName, caseNum, caseType, status, assignedTo')
        .or(`clientName.ilike.${pat},caseNum.ilike.${pat},caseType.ilike.${pat},status.ilike.${pat}`)
        .limit(5),

      supabase.from('leads')
        .select('id, name, first, last, email, phone, status, business_name, salesRep')
        .or(`name.ilike.${pat},first.ilike.${pat},last.ilike.${pat},email.ilike.${pat},phone.ilike.${pat},business_name.ilike.${pat}`)
        .or('archived.is.null,archived.eq.false')
        .is('deleted_at', null)
        .limit(5),
    ])

    setResults({
      clients: clientRes.data || [],
      cases:   caseRes.data  || [],
      leads:   leadRes.data  || [],
    })
    setLoading(false)
    setOpen(true)
    setActiveIdx(-1)
  }, [])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (!value || value.trim().length < 2) {
      setResults({ clients: [], cases: [], leads: [] })
      setOpen(false)
      return
    }
    debounceRef.current = setTimeout(() => search(value), 300)
    return () => clearTimeout(debounceRef.current)
  }, [value, search])

  // Close on outside click
  useEffect(() => {
    function onDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setActiveIdx(-1)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  function navigate_to(item) {
    setOpen(false)
    setActiveIdx(-1)
    onChange('')
    if (item._type === 'client') navigate('/clients/' + item.id)
    if (item._type === 'case')   navigate('/cases/'   + item.id)
    if (item._type === 'lead')   navigate('/leads/'   + item.id)
  }

  function onKeyDown(e) {
    if (!open) return
    if (e.key === 'Escape') { setOpen(false); setActiveIdx(-1); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, flat.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && activeIdx >= 0 && flat[activeIdx]) navigate_to(flat[activeIdx])
  }

  const hasResults = flat.length > 0
  const showDropdown = open && focused && value && value.trim().length >= 2

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
      <input
        className="search-input"
        placeholder="Search clients, cases, leads…"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => { setFocused(true); if (value?.length >= 2) setOpen(true) }}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={onKeyDown}
        style={{ width: '100%' }}
        autoComplete="off"
      />

      {showDropdown && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 9999,
          background: 'var(--surface)', border: '1px solid var(--br)',
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.35)',
          maxHeight: 420, overflowY: 'auto',
        }}>
          {loading && (
            <div style={{ padding: '12px 16px', color: 'var(--t3)', fontSize: 13 }}>Searching…</div>
          )}

          {!loading && !hasResults && (
            <div style={{ padding: '12px 16px', color: 'var(--t3)', fontSize: 13 }}>No results for "{value}"</div>
          )}

          {!loading && results.clients.length > 0 && (
            <Section label="Clients">
              {results.clients.map((c, i) => {
                const globalIdx = i
                const display = c.name || [c.first, c.last].filter(Boolean).join(' ') || c.email || c.phone || c.id
                const sub = [c.email, c.phone, c.custnum ? `#${c.custnum}` : null].filter(Boolean).join(' · ')
                return (
                  <ResultRow key={c.id} active={activeIdx === globalIdx}
                    onClick={() => navigate_to({ ...c, _type: 'client' })}
                    label="CLIENT" name={highlight(display, value)} sub={sub} />
                )
              })}
            </Section>
          )}

          {!loading && results.cases.length > 0 && (
            <Section label="Cases">
              {results.cases.map((c, i) => {
                const globalIdx = results.clients.length + i
                const display = c.clientName || c.caseNum || c.id
                const sub = [c.caseNum, c.caseType, c.status].filter(Boolean).join(' · ')
                return (
                  <ResultRow key={c.id} active={activeIdx === globalIdx}
                    onClick={() => navigate_to({ ...c, _type: 'case' })}
                    label="CASE" name={highlight(display, value)} sub={sub} />
                )
              })}
            </Section>
          )}

          {!loading && results.leads.length > 0 && (
            <Section label="Leads">
              {results.leads.map((l, i) => {
                const globalIdx = results.clients.length + results.cases.length + i
                const display = l.name || [l.first, l.last].filter(Boolean).join(' ') || l.business_name || l.email || l.id
                const sub = [l.business_name, l.email, l.phone, l.status].filter(Boolean).join(' · ')
                return (
                  <ResultRow key={l.id} active={activeIdx === globalIdx}
                    onClick={() => navigate_to({ ...l, _type: 'lead' })}
                    label="LEAD" name={highlight(display, value)} sub={sub} />
                )
              })}
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

function Section({ label, children }) {
  return (
    <div>
      <div style={{ padding: '8px 12px 4px', fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t3)', textTransform: 'uppercase' }}>{label}</div>
      {children}
    </div>
  )
}

function ResultRow({ label, name, sub, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '8px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2,
        background: active ? 'var(--accent-dim, rgba(99,102,241,.12))' : 'transparent',
        transition: 'background .1s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,.05)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.08em', color: 'var(--accent, #6366f1)', minWidth: 38 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t3)', paddingLeft: 46, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
    </div>
  )
}
