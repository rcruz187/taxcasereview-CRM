import { useMemo, useState } from 'react'
import Training from './Training'
import { supabase } from '../lib/supabase'

const ROMYLABS_TENANT = 'a0000000-0000-0000-0000-000000000001'
const ROMYLABS_FROM_NAME = 'RomyLabs'
const ROMYLABS_FROM_EMAIL = 'info@romylabs.com'

function makeRoomId() {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').slice(0, 10).toUpperCase()
}

function EmailInvite({ url, kind, disabled = false }) {
  const [open, setOpen] = useState(false)
  const [to, setTo] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState('')

  async function send() {
    const recipients = to.split(',').map(v => v.trim()).filter(Boolean)
    if (!recipients.length || !url) return
    const invalid = recipients.find(v => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
    if (invalid) { setStatus(`Invalid email: ${invalid}`); return }

    setSending(true)
    setStatus('')
    try {
      const subject = kind === 'training' ? 'RomyLabs live training invitation' : 'RomyLabs video meeting invitation'
      const heading = kind === 'training' ? 'Join our live training' : 'Join our video meeting'
      const button = kind === 'training' ? 'Join Live Training' : 'Join Video Meeting'
      for (const recipient of recipients) {
        const { data, error } = await supabase.functions.invoke('send-email', {
          body: {
            from_name: ROMYLABS_FROM_NAME,
            from_email: ROMYLABS_FROM_EMAIL,
            to: recipient,
            subject,
            html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;padding:28px;color:#0f172a">
              <div style="font-size:24px;font-weight:800;margin-bottom:8px">${heading}</div>
              <p style="font-size:15px;line-height:1.6;color:#475569">RomyLabs has invited you to ${kind === 'training' ? 'a live training session' : 'a secure video meeting'}.</p>
              <p style="text-align:center;margin:28px 0"><a href="${url}" style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:800">${button}</a></p>
              <p style="font-size:12px;line-height:1.6;color:#64748b">No download is required. Open the secure link in your browser:</p>
              <p style="font-size:11px;line-height:1.5;color:#64748b;word-break:break-all">${url}</p>
              <div style="border-top:1px solid #e2e8f0;margin-top:26px;padding-top:16px;font-size:12px;color:#64748b">
                Best Regards,<br><br>
                <strong>Romy Cruz</strong><br>
                Founder &amp; CEO | RomyLabs<br>
                ${ROMYLABS_FROM_EMAIL} · romylabs.com
              </div>
            </div>`,
          }
        })
        if (error || data?.error) throw new Error(data?.error || error?.message || 'Email failed')
      }
      setStatus(`✓ Sent from ${ROMYLABS_FROM_EMAIL} to ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}`)
      setTo('')
    } catch (e) {
      setStatus(e?.message || 'Could not send invite')
    } finally {
      setSending(false)
    }
  }

  if (!open) return <button onClick={() => setOpen(true)} disabled={disabled || !url} style={{ ...secondaryBtn, opacity: disabled || !url ? .45 : 1 }}>✉ Email Invite</button>

  return (
    <div style={{ width:'100%', marginTop:10, padding:12, borderRadius:10, border:'1px solid rgba(99,102,241,.24)', background:'rgba(2,6,23,.42)' }}>
      <div style={{ fontSize:10, fontWeight:800, color:'#94a3b8', marginBottom:6 }}>SEND FROM {ROMYLABS_FROM_EMAIL}</div>
      <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
        <input value={to} onChange={e => setTo(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="email@example.com, another@example.com" style={emailInput} />
        <button onClick={send} disabled={sending || !to.trim()} style={primaryBtn}>{sending ? 'Sending…' : 'Send Invite'}</button>
        <button onClick={() => { setOpen(false); setStatus('') }} style={ghostBtn}>Cancel</button>
      </div>
      {status && <div style={{ marginTop:8, fontSize:11, color:status.startsWith('✓') ? '#86efac' : '#fca5a5' }}>{status}</div>}
    </div>
  )
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
            <EmailInvite url={meetingUrl} kind="meeting" />
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
              <EmailInvite url={trainingUrl} kind="training" />
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
const emailInput = { flex:'1 1 240px', minWidth:0, background:'#0b1220', border:'1px solid #334155', borderRadius:8, padding:'9px 10px', color:'#f8fafc', fontSize:11, outline:'none' }
const primaryBtn = { background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', border:'none', borderRadius:8, padding:'9px 14px', fontSize:11, fontWeight:800, cursor:'pointer' }
const limeBtn = { ...primaryBtn, background:'linear-gradient(135deg,#65a30d,#16a34a)' }
const secondaryBtn = { background:'rgba(255,255,255,.05)', color:'#cbd5e1', border:'1px solid rgba(148,163,184,.2)', borderRadius:8, padding:'9px 12px', fontSize:11, fontWeight:700, cursor:'pointer' }
const ghostBtn = { ...secondaryBtn, background:'transparent', color:'#94a3b8', border:'1px solid rgba(148,163,184,.16)' }
