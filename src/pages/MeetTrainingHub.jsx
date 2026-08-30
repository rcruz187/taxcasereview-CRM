import { useMemo, useState } from 'react'
import Training from './Training'
import { supabase } from '../lib/supabase'

const ROMYLABS_TENANT = 'a0000000-0000-0000-0000-000000000001'

function makeRoomId() {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').slice(0, 10).toUpperCase()
}

export default function MeetTrainingHub() {
  const [roomId, setRoomId] = useState(() => makeRoomId())
  const [copied, setCopied] = useState(false)
  const [trainingId, setTrainingId] = useState(() => makeRoomId())
  const [trainingInvite, setTrainingInvite] = useState('')
  const [trainingBusy, setTrainingBusy] = useState(false)
  const [trainingError, setTrainingError] = useState('')
  const [trainingCopied, setTrainingCopied] = useState(false)

  const meetingUrl = useMemo(() => {
    const url = new URL(`/meet/${roomId}`, window.location.origin)
    url.searchParams.set('t', ROMYLABS_TENANT)
    return url.toString()
  }, [roomId])

  const trainingUrl = useMemo(() => {
    if (!trainingInvite) return ''
    const url = new URL(`/meet/${trainingId}`, window.location.origin)
    url.searchParams.set('large', '1')
    url.searchParams.set('invite', trainingInvite)
    return url.toString()
  }, [trainingInvite, trainingId])

  function newRoom() { setRoomId(makeRoomId()); setCopied(false) }
  function startMeeting() { window.open(meetingUrl, '_blank', 'noopener,noreferrer') }
  async function copyInvite() {
    try { await navigator.clipboard.writeText(meetingUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { setCopied(false) }
  }

  async function createLargeTraining() {
    setTrainingBusy(true); setTrainingError(''); setTrainingInvite(''); setTrainingCopied(false)
    const nextId = makeRoomId()
    setTrainingId(nextId)
    try {
      const { data, error } = await supabase.functions.invoke('turn-credentials', {
        body: { action: 'training-create', room: nextId, name: 'RomyLabs Host' },
      })
      if (error || data?.error || !data?.host_token || !data?.invite) throw new Error(data?.error || error?.message || 'Could not create training room')
      sessionStorage.setItem(`romylabs_training_host_${nextId}`, data.host_token)
      setTrainingInvite(data.invite)
    } catch (e) {
      setTrainingError(e?.message || String(e))
    } finally {
      setTrainingBusy(false)
    }
  }

  function launchLargeTraining() {
    if (!trainingInvite) return
    window.open(`/meet/${trainingId}?large=1`, '_blank')
  }

  async function copyTrainingInvite() {
    if (!trainingUrl) return
    try { await navigator.clipboard.writeText(trainingUrl); setTrainingCopied(true); setTimeout(() => setTrainingCopied(false), 2000) } catch { setTrainingCopied(false) }
  }

  return (
    <div style={{ padding: '28px 32px 36px', maxWidth: 1180 }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#C6FF00', marginBottom: 6 }}>RomyLabs Platform</div>
        <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', marginBottom: 5 }}>Meet & Training</div>
        <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>Run video meetings and live training sessions for any RomyLabs office from one place.</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(330px,1fr))', gap: 14, marginBottom: 20 }}>
        <section style={{ background: 'linear-gradient(135deg,rgba(99,102,241,.16),rgba(139,92,246,.08))', border: '1px solid rgba(99,102,241,.35)', borderRadius: 14, padding: 20 }}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:12, marginBottom:14 }}><div><div style={{ fontSize:16, fontWeight:800, color:'#f8fafc', marginBottom:5 }}>🎥 Video Meeting</div><div style={{ fontSize:12, color:'#94a3b8', lineHeight:1.55 }}>Fast camera/mic rooms for office meetings and small groups.</div></div><span style={badge('#10b981')}>1–6 PEOPLE</span></div>
          <div style={urlBox}><div style={urlLabel}>Meeting invite</div><div style={urlText}>{meetingUrl}</div></div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <button onClick={startMeeting} style={primaryBtn}>Start Video Meeting</button>
            <button onClick={copyInvite} style={secondaryBtn}>{copied ? '✓ Copied' : 'Copy Invite'}</button>
            <button onClick={newRoom} style={ghostBtn}>New Room</button>
          </div>
        </section>

        <section style={{ background:'linear-gradient(135deg,rgba(198,255,0,.07),rgba(14,165,233,.08))', border:'1px solid rgba(198,255,0,.24)', borderRadius:14, padding:20 }}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:12, marginBottom:14 }}><div><div style={{ fontSize:16, fontWeight:800, color:'#f8fafc', marginBottom:5 }}>📡 Large Live Training</div><div style={{ fontSize:12, color:'#94a3b8', lineHeight:1.55 }}>Server-relayed training for large multi-office sessions. Attendees join watch/listen-only until promoted.</div></div><span style={badge('#C6FF00')}>100+ READY</span></div>

          {trainingInvite ? <div style={urlBox}><div style={urlLabel}>Audience invite · expires in 12 hours</div><div style={urlText}>{trainingUrl}</div></div> : <div style={{ ...urlBox, color:'#64748b', fontSize:12 }}>Create a session to generate a secure audience invite.</div>}
          {trainingError && <div style={{ marginBottom:10, color:'#fca5a5', fontSize:11, background:'rgba(127,29,29,.22)', border:'1px solid rgba(248,113,113,.18)', borderRadius:8, padding:'8px 10px' }}>{trainingError}</div>}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {!trainingInvite ? <button onClick={createLargeTraining} disabled={trainingBusy} style={limeBtn}>{trainingBusy ? 'Creating…' : 'Create Large Training'}</button> : <>
              <button onClick={launchLargeTraining} style={limeBtn}>Start as Host</button>
              <button onClick={copyTrainingInvite} style={secondaryBtn}>{trainingCopied ? '✓ Copied' : 'Copy Audience Invite'}</button>
              <button onClick={createLargeTraining} disabled={trainingBusy} style={ghostBtn}>New Training</button>
            </>}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7, marginTop:14 }}>{['Host camera + mic','Audience watch/listen','Screen sharing','Cloud recording'].map(x=><div key={x} style={{ padding:'7px 9px', borderRadius:7, background:'rgba(15,23,42,.48)', color:'#cbd5e1', fontSize:10, fontWeight:700 }}>✓ {x}</div>)}</div>
        </section>
      </div>

      <section style={{ background: 'rgba(255,255,255,.025)', border: '1px solid rgba(99,102,241,.2)', borderRadius: 14, padding: 20, marginBottom:18 }}>
        <div style={{ fontSize:16, fontWeight:800, color:'#f8fafc', marginBottom:7 }}>🖥️ Office Training Tools</div>
        <div style={{ fontSize:12, color:'#94a3b8', lineHeight:1.6 }}>The original Training workflow stays below for screen-share sessions, branded email invitations, host pop-out, chat, and saved recordings.</div>
      </section>

      <div style={{ borderTop: '1px solid rgba(99,102,241,.16)', paddingTop: 4 }}><Training /></div>
    </div>
  )
}

const badge = color => ({ fontSize:9, fontWeight:900, color, background:'rgba(15,23,42,.6)', border:`1px solid ${color}55`, borderRadius:999, padding:'4px 8px', whiteSpace:'nowrap', height:'fit-content' })
const urlBox = { background:'rgba(2,6,23,.45)', border:'1px solid rgba(148,163,184,.14)', borderRadius:10, padding:'11px 12px', marginBottom:12, minHeight:42 }
const urlLabel = { fontSize:9, color:'#64748b', fontWeight:800, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:5 }
const urlText = { fontSize:10, color:'#cbd5e1', overflowWrap:'anywhere', fontFamily:'ui-monospace,SFMono-Regular,Menlo,monospace' }
const primaryBtn = { background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', border:'none', borderRadius:8, padding:'9px 14px', fontSize:11, fontWeight:800, cursor:'pointer' }
const limeBtn = { ...primaryBtn, background:'linear-gradient(135deg,#65a30d,#16a34a)' }
const secondaryBtn = { background:'rgba(255,255,255,.05)', color:'#cbd5e1', border:'1px solid rgba(148,163,184,.2)', borderRadius:8, padding:'9px 12px', fontSize:11, fontWeight:700, cursor:'pointer' }
const ghostBtn = { ...secondaryBtn, background:'transparent', color:'#94a3b8', border:'1px solid rgba(148,163,184,.16)' }
