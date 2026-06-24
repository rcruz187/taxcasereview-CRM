import { useRef } from 'react'
import { PRESETS } from '../lib/videoBackground'

const TCR_BG = '/taxcasereview-CRM/tcr-bg.png'

// Virtual background selector panel
// onSelect(mode, presetId, customUrl)
export default function VirtualBackground({ bgMode, bgPreset, onSelect }) {
  const fileRef = useRef()

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    onSelect('custom', null, url)
    e.target.value = ''
  }

  const isNone   = bgMode === 'none'
  const isCustom = bgMode === 'custom'

  return (
    <div style={{ padding: '16px 20px', background: '#0a1628', borderTop: '1px solid #1e293b' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#64748b', marginBottom: 12 }}>
        Virtual Background
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>

        {/* None */}
        <BgBtn
          active={isNone}
          onClick={() => onSelect('none', null, null)}
          label="None"
        >
          <span style={{ fontSize: 22 }}>🚫</span>
        </BgBtn>

        {/* Blur */}
        <BgBtn
          active={bgMode === 'blur'}
          onClick={() => onSelect('blur', 'blur', null)}
          label="Blur"
        >
          <div style={{ width: 56, height: 34, borderRadius: 4, background: '#1e3a8a', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(100,116,139,.5)', filter: 'blur(4px)' }}/>
            <span style={{ fontSize: 16, position: 'relative' }}>🌫️</span>
          </div>
        </BgBtn>

        {/* TCR Brand */}
        <BgBtn
          active={bgMode === 'preset' && bgPreset === 'tcr'}
          onClick={() => onSelect('preset', 'tcr', null)}
          label="TCR Brand"
        >
          <img src={TCR_BG} alt="TCR" style={{ width: 56, height: 34, objectFit: 'cover', borderRadius: 4 }}/>
        </BgBtn>

        {/* Other presets */}
        {PRESETS.filter(p => p.id !== 'blur' && p.id !== 'tcr').map(p => (
          <BgBtn
            key={p.id}
            active={bgMode === 'preset' && bgPreset === p.id}
            onClick={() => onSelect('preset', p.id, null)}
            label={p.label}
          >
            {p.img ? (
              <img src={p.img} alt={p.label} style={{ width: 56, height: 34, objectFit: 'cover', borderRadius: 4 }}
                onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }}
              />
            ) : null}
            {p.gradient ? (
              <div style={{ width: 56, height: 34, borderRadius: 4, background: `linear-gradient(135deg, ${p.gradient.join(', ')})` }}/>
            ) : null}
          </BgBtn>
        ))}

        {/* Custom upload */}
        <BgBtn
          active={isCustom}
          onClick={() => fileRef.current?.click()}
          label="Upload"
        >
          <div style={{ width: 56, height: 34, borderRadius: 4, border: '2px dashed #334155', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 18 }}>📁</span>
          </div>
        </BgBtn>

        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile}/>
      </div>

      {bgMode !== 'none' && (
        <div style={{ marginTop: 10, fontSize: 11, color: '#64748b' }}>
          ℹ️ Background is applied to your video feed. Peers see the processed video.
        </div>
      )}
    </div>
  )
}

function BgBtn({ active, onClick, label, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        padding: '8px 8px 10px', borderRadius: 10, cursor: 'pointer', border: 'none',
        background: active ? 'rgba(59,130,246,.2)' : 'rgba(255,255,255,.05)',
        outline: active ? '2px solid #3b82f6' : '2px solid transparent',
        transition: 'all .15s', minWidth: 72,
      }}
    >
      {children}
      <span style={{ fontSize: 10, fontWeight: 600, color: active ? '#93c5fd' : '#94a3b8' }}>{label}</span>
    </button>
  )
}
