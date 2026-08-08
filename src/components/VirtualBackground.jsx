import { useRef } from 'react'
import { PRESETS } from '../lib/videoBackground'

const TCR_BG = '/tcr-bg.png'

export default function VirtualBackground({ bgMode, bgPreset, segStatus, onSelect }) {
  const fileRef = useRef()

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    onSelect('custom', null, url)
    e.target.value = ''
  }

  const isActive = (id) => {
    if (id === 'none')   return bgMode === 'none'
    if (id === 'blur')   return bgMode === 'blur'
    if (id === 'custom') return bgMode === 'custom'
    return bgMode === 'preset' && bgPreset === id
  }

  return (
    <div style={{ padding: '16px 20px', background: '#0a1628', borderTop: '1px solid #1e293b' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#64748b' }}>
          Virtual Background
        </div>
        {segStatus === 'loading' && (
          <div style={{ fontSize: 11, color: '#94a3b8' }}>⏳ Loading AI segmentation…</div>
        )}
        {segStatus === 'ready' && bgMode !== 'none' && bgMode !== 'blur' && (
          <div style={{ fontSize: 11, color: '#86efac' }}>✓ AI background active</div>
        )}
        {segStatus === 'failed' && bgMode !== 'none' && bgMode !== 'blur' && (
          <div style={{ fontSize: 11, color: '#fbbf24' }}>⚠️ Using soft blend mode</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>

        {/* None */}
        <BgBtn active={isActive('none')} onClick={() => onSelect('none', null, null)} label="None">
          <div style={{ width: 56, height: 34, borderRadius: 4, background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🚫</div>
        </BgBtn>

        {/* Blur */}
        <BgBtn active={isActive('blur')} onClick={() => onSelect('blur', 'blur', null)} label="Blur">
          <div style={{ width: 56, height: 34, borderRadius: 4, background: '#1e293b', overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,#1e3a8a,#0ea5e9)', filter: 'blur(6px)', transform: 'scale(1.2)' }}/>
            <span style={{ fontSize: 16, position: 'relative', zIndex: 1 }}>🌫️</span>
          </div>
        </BgBtn>

        {/* TCR Brand */}
        <BgBtn active={isActive('tcr')} onClick={() => onSelect('preset', 'tcr', null)} label="TCR Brand">
          <img src={TCR_BG} alt="TCR" style={{ width: 56, height: 34, objectFit: 'cover', borderRadius: 4 }}/>
        </BgBtn>

        {/* Other presets */}
        {PRESETS.filter(p => p.id !== 'blur' && p.id !== 'tcr').map(p => (
          <BgBtn key={p.id} active={isActive(p.id)} onClick={() => onSelect('preset', p.id, null)} label={p.label}>
            {p.img ? (
              <img src={p.img} alt={p.label} style={{ width: 56, height: 34, objectFit: 'cover', borderRadius: 4 }}
                onError={e => { e.currentTarget.style.display='none' }}/>
            ) : p.gradient ? (
              <div style={{ width: 56, height: 34, borderRadius: 4, background: `linear-gradient(135deg, ${p.gradient.join(', ')})` }}/>
            ) : null}
          </BgBtn>
        ))}

        {/* Upload */}
        <BgBtn active={isActive('custom')} onClick={() => fileRef.current?.click()} label="Upload">
          <div style={{ width: 56, height: 34, borderRadius: 4, border: '2px dashed #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📁</div>
        </BgBtn>

        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile}/>
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: '#475569', lineHeight: 1.5 }}>
        {bgMode === 'blur'
          ? 'Background blurred. Your face stays sharp in the center.'
          : bgMode !== 'none'
            ? segStatus === 'ready'
              ? 'Virtual background active.'
              : 'Background replacing behind you.'
            : 'No background effect active.'}
      </div>
    </div>
  )
}

function BgBtn({ active, onClick, label, children }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      padding: '8px 8px 10px', borderRadius: 10, cursor: 'pointer', border: 'none',
      background: active ? 'rgba(59,130,246,.2)' : 'rgba(255,255,255,.05)',
      outline: active ? '2px solid #3b82f6' : '2px solid transparent',
      transition: 'all .15s', minWidth: 72,
    }}>
      {children}
      <span style={{ fontSize: 10, fontWeight: 600, color: active ? '#93c5fd' : '#94a3b8' }}>{label}</span>
    </button>
  )
}
