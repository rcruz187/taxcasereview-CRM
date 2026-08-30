import { useMemo, useState } from 'react'
import Training from './Training'

const ROMYLABS_TENANT = 'a0000000-0000-0000-0000-000000000001'

function makeRoomId() {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').slice(0, 10).toUpperCase()
}

export default function MeetTrainingHub() {
  const [roomId, setRoomId] = useState(() => makeRoomId())
  const [copied, setCopied] = useState(false)

  const meetingUrl = useMemo(() => {
    const url = new URL(`/meet/${roomId}`, window.location.origin)
    url.searchParams.set('t', ROMYLABS_TENANT)
    return url.toString()
  }, [roomId])

  function newRoom() {
    setRoomId(makeRoomId())
    setCopied(false)
  }

  function startMeeting() {
    window.open(meetingUrl, '_blank', 'noopener,noreferrer')
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(meetingUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div style={{ padding: '28px 32px 36px', maxWidth: 1180 }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#C6FF00', marginBottom: 6 }}>
          RomyLabs Platform
        </div>
        <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', marginBottom: 5 }}>Meet & Training</div>
        <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
          Run video meetings and live training sessions for any RomyLabs office from one place.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.15fr) minmax(280px,.85fr)', gap: 14, marginBottom: 20 }}>
        <section style={{ background: 'linear-gradient(135deg,rgba(99,102,241,.16),rgba(139,92,246,.08))', border: '1px solid rgba(99,102,241,.35)', borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#f8fafc', marginBottom: 5 }}>🎥 Video Meeting</div>
              <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.55 }}>
                Camera, microphone, participant video, TURN-assisted connectivity, and virtual backgrounds are already built in.
              </div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#86efac', background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.25)', borderRadius: 999, padding: '4px 9px', whiteSpace: 'nowrap' }}>READY</span>
          </div>

          <div style={{ background: 'rgba(2,6,23,.45)', border: '1px solid rgba(148,163,184,.14)', borderRadius: 10, padding: '11px 12px', marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>Meeting invite</div>
            <div style={{ fontSize: 12, color: '#cbd5e1', overflowWrap: 'anywhere', fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }}>{meetingUrl}</div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={startMeeting} style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Start Video Meeting</button>
            <button onClick={copyInvite} style={{ background: 'rgba(255,255,255,.05)', color: copied ? '#86efac' : '#cbd5e1', border: '1px solid rgba(148,163,184,.2)', borderRadius: 8, padding: '9px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{copied ? '✓ Copied' : 'Copy Invite'}</button>
            <button onClick={newRoom} style={{ background: 'transparent', color: '#94a3b8', border: '1px solid rgba(148,163,184,.16)', borderRadius: 8, padding: '9px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>New Room</button>
          </div>
        </section>

        <section style={{ background: 'rgba(255,255,255,.025)', border: '1px solid rgba(99,102,241,.2)', borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#f8fafc', marginBottom: 8 }}>🖥️ Live Training</div>
          <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.65, marginBottom: 14 }}>
            Use the training controls below for screen sharing, branded invitations, host view, chat, and saved recordings.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {['Screen share', 'Recordings', 'Email invites', 'Office branding'].map(item => (
              <div key={item} style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(15,23,42,.45)', color: '#cbd5e1', fontSize: 11, fontWeight: 600 }}>✓ {item}</div>
            ))}
          </div>
        </section>
      </div>

      <div style={{ borderTop: '1px solid rgba(99,102,241,.16)', paddingTop: 4 }}>
        <Training />
      </div>
    </div>
  )
}
