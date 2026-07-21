import { useState, useEffect, useRef } from 'react'
import { listDemoProfiles, getActiveDemoId, setActiveDemoId } from '../lib/demoBranding'
import { useFirm } from '../lib/useFirm'

// Super-Admin-only sales tool: switch the whole app's branding to a prospect
// so you can present the CRM as their firm. Overlay only — never touches the
// real settings row or production data. "Live" turns it off.
export default function DemoModeSwitcher() {
  const [profiles, setProfiles] = useState([])
  const [activeId, setId] = useState(getActiveDemoId())
  const [open, setOpen] = useState(false)
  const { refresh } = useFirm()
  const ref = useRef(null)

  useEffect(() => { listDemoProfiles().then(setProfiles) }, [])
  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function pick(id) {
    setActiveDemoId(id)      // fires 'demo-branding-changed' → useFirm rebuilds app-wide
    setId(id)
    setOpen(false)
    refresh()
  }

  const active = profiles.find(p => p.id === activeId)
  const on = !!active

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Demo Mode — present the CRM as a prospect's firm"
        style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700,
          padding: '5px 10px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
          border: `1px solid ${on ? '#f59e0b' : 'var(--br)'}`,
          background: on ? 'rgba(245,158,11,.14)' : 'transparent',
          color: on ? '#f59e0b' : 'var(--t2)',
        }}>
        <span>{on ? `🎭 Demo: ${active.name}` : '🎭 Demo Mode'}</span>
        <span style={{ fontSize: 9, opacity: .7 }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50, minWidth: 240,
          background: 'var(--card)', border: '1px solid var(--br)', borderRadius: 10,
          boxShadow: '0 10px 30px rgba(0,0,0,.25)', padding: 6,
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em', padding: '6px 10px 4px' }}>Present as</div>
          <button onClick={() => pick('')} style={rowStyle(!on)}>
            🏢 Live (your firm)
          </button>
          {profiles.map(p => (
            <button key={p.id} onClick={() => pick(p.id)} style={rowStyle(p.id === activeId)}>
              🎭 {p.name}
            </button>
          ))}
          {profiles.length === 0 && (
            <div style={{ fontSize: 11.5, color: 'var(--t3)', padding: '8px 10px', lineHeight: 1.5 }}>
              No prospects yet. Add rows to <code>demo_profiles</code> to show the CRM as any firm.
            </div>
          )}
          {on && (
            <div style={{ fontSize: 10.5, color: '#f59e0b', padding: '6px 10px 2px', borderTop: '1px solid var(--br)', marginTop: 4 }}>
              Demo overlay active — your real data is untouched.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function rowStyle(active) {
  return {
    display: 'block', width: '100%', textAlign: 'left', fontSize: 12.5, fontWeight: active ? 700 : 500,
    padding: '8px 10px', borderRadius: 7, cursor: 'pointer', border: 'none',
    background: active ? 'var(--hover)' : 'transparent', color: 'var(--t1)',
  }
}
