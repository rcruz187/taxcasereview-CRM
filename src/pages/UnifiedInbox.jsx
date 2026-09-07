import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { FIRM } from '../lib/firmBranding'

const CHANNELS = ['All', 'Email', 'SMS', 'Fax', 'Voice']
const VIEWS = ['Primary', 'Unread', 'All', 'System']

function cleanText(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function initials(value) {
  const text = cleanText(value)
  if (!text) return '?'
  if (text.includes('@')) return text.slice(0, 1).toUpperCase()
  const parts = text.split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '') || text[0]).toUpperCase()
}

function isSystemEmail(row) {
  const sender = cleanText(row.from_address || row.from_email || row.sender).toLowerCase()
  const subject = cleanText(row.subject).toLowerCase()
  return (
    sender.includes('noreply-dmarc-support@') ||
    sender.includes('no-reply-dmarc') ||
    sender.includes('mailer-daemon') ||
    sender.includes('postmaster@') ||
    sender.includes('@supabase.com') ||
    subject.includes('dmarc aggregate') ||
    subject.startsWith('report domain:') ||
    subject.includes('point-in-time recovery') ||
    subject.includes('taxcase review engine') ||
    subject.includes('revenue bottleneck') ||
    subject.includes('automation task')
  )
}

function when(value) {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString()
}

function normalizeEmail(row) {
  const inbound = String(row.triage || '').toLowerCase() !== 'sent' && String(row.direction || '').toLowerCase() !== 'outbound'
  const system = isSystemEmail(row)
  return {
    id: 'email:' + row.id,
    rawId: row.id,
    channel: 'Email',
    icon: '✉️',
    inbound,
    unread: inbound && row.is_read !== true,
    system,
    person: row.clientName || row.clientname || row.from_address || row.sender || row.recipient || 'Email contact',
    address: row.from_address || row.from_email || row.sender || row.recipient || '',
    subject: row.subject || '(no subject)',
    preview: cleanText(row.body_text || row.body || row.snippet),
    at: row.received_at || row.sent_at || row.created_at,
    route: `/email?email=${encodeURIComponent(row.id)}`,
  }
}

function normalizeSms(row) {
  const inbound = String(row.direction || '').toLowerCase() === 'inbound'
  return {
    id: 'sms:' + row.id,
    rawId: row.id,
    channel: 'SMS',
    icon: '💬',
    inbound,
    unread: inbound && row.is_read !== true,
    system: false,
    person: row.clientName || row.client_name || row.phone || 'Text contact',
    address: row.phone || '',
    subject: inbound ? 'Incoming text' : 'Outgoing text',
    preview: cleanText(row.body || row.message),
    at: row.received_at || row.sent_at || row.created_at,
    route: `/sms?reply=1&phone=${encodeURIComponent(row.phone || '')}&client=${encodeURIComponent(row.clientName || row.client_name || '')}`,
  }
}

function normalizeVoice(row) {
  const rawDirection = String(row.direction || row.call_direction || '').toLowerCase()
  const inbound = rawDirection === 'inbound' || rawDirection === 'incoming'
  const peer = inbound
    ? (row.from_number || row.from || row.caller_number || row.phone || '')
    : (row.to_number || row.to || row.dialed_number || row.phone || '')
  const duration = Number(row.duration_seconds || row.duration || 0)
  const voicemail = Boolean(row.voicemail_url || row.recording_url || row.audio_url || row.transcription || row.transcript)
  return {
    id: 'voice:' + (row.id || row.sid || row.call_sid || Math.random()),
    rawId: row.id,
    channel: 'Voice',
    icon: voicemail ? '🎙️' : '📞',
    inbound,
    unread: inbound && row.is_read !== true,
    system: false,
    person: row.client_name || row.clientName || row.contact_name || peer || 'Call',
    address: peer,
    subject: voicemail ? 'Voicemail' : (inbound ? 'Incoming call' : 'Outgoing call'),
    preview: row.transcription || row.transcript || row.notes || row.status || (duration ? duration + ' sec' : ''),
    at: row.received_at || row.started_at || row.created_at || row.timestamp,
    route: `/dialer?phone=${encodeURIComponent(peer)}`,
  }
}

function normalizeFax(row) {
  const inbound = String(row.direction || '').toLowerCase() === 'inbound'
  return {
    id: 'fax:' + row.id,
    rawId: row.id,
    channel: 'Fax',
    icon: '📠',
    inbound,
    unread: inbound && row.is_read !== true,
    system: false,
    person: row.client_name || row.from_number || row.to_number || 'Fax contact',
    address: inbound ? (row.from_number || '') : (row.to_number || ''),
    subject: row.subject || (inbound ? 'Incoming fax' : 'Outgoing fax'),
    preview: row.notes || row.file_name || row.status || '',
    at: row.received_at || row.sent_at || row.created_at,
    route: `/fax?new=1&phone=${encodeURIComponent(inbound ? (row.from_number || '') : (row.to_number || ''))}&client=${encodeURIComponent(row.client_name || '')}`,
  }
}

export default function UnifiedInbox() {
  const { user } = useApp()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [view, setView] = useState('Primary')
  const [channel, setChannel] = useState('All')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const reloadTimerRef = useRef(null)

  const centralOwner = ['info@romylabs.com', 'romy@romylabs.com'].includes((user?.email || '').toLowerCase())
    ? 'info@romylabs.com'
    : (user?.email || '')

  async function load() {
    if (!user?.email) return
    setLoading(true)
    setError('')
    try {
      const emailQuery = supabase.from('emails').select('*').order('created_at', { ascending:false }).limit(175)
      if (centralOwner) emailQuery.eq('mailbox_owner', centralOwner)
      const [emails, sms, fax, calls, voicemails] = await Promise.all([
        emailQuery,
        supabase.from('sms_messages').select('*').order('created_at', { ascending:false }).limit(125),
        supabase.from('fax_logs').select('*').order('created_at', { ascending:false }).limit(75),
        supabase.from('calllog').select('*').order('created_at', { ascending:false }).limit(125),
        supabase.from('voicemails').select('*').order('created_at', { ascending:false }).limit(75),
      ])
      const errors = [emails.error, sms.error, fax.error, calls.error, voicemails.error].filter(Boolean)
      if (errors.length) setError(errors.map(e => e.message).join(' · '))
      const merged = [
        ...(emails.data || []).map(normalizeEmail),
        ...(sms.data || []).map(normalizeSms),
        ...(fax.data || []).map(normalizeFax),
        ...(calls.data || []).map(normalizeVoice),
        ...(voicemails.data || []).map(normalizeVoice),
      ].sort((a,b) => new Date(b.at || 0) - new Date(a.at || 0))
      setItems(merged)
    } catch (e) {
      setError(e?.message || 'Unable to load communications.')
    } finally {
      setLoading(false)
    }
  }

  function scheduleReload() {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
    reloadTimerRef.current = setTimeout(() => { void load() }, 900)
  }

  useEffect(() => { void load() }, [user?.email])

  useEffect(() => {
    if (!user?.email) return
    const ch = supabase.channel('unified-inbox-' + user.email)
      .on('postgres_changes', { event:'*', schema:'public', table:'emails' }, scheduleReload)
      .on('postgres_changes', { event:'*', schema:'public', table:'sms_messages' }, scheduleReload)
      .on('postgres_changes', { event:'*', schema:'public', table:'fax_logs' }, scheduleReload)
      .on('postgres_changes', { event:'*', schema:'public', table:'calllog' }, scheduleReload)
      .on('postgres_changes', { event:'*', schema:'public', table:'voicemails' }, scheduleReload)
      .subscribe()
    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
      supabase.removeChannel(ch)
    }
  }, [user?.email])

  const counts = useMemo(() => {
    const primary = items.filter(item => !item.system)
    return {
      Primary: primary.length,
      Unread: primary.filter(item => item.unread).length,
      System: items.filter(item => item.system).length,
      Email: primary.filter(item => item.channel === 'Email').length,
      SMS: primary.filter(item => item.channel === 'SMS').length,
      Fax: primary.filter(item => item.channel === 'Fax').length,
      Voice: primary.filter(item => item.channel === 'Voice').length,
    }
  }, [items])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(item => {
      if (view === 'Primary' && item.system) return false
      if (view === 'Unread' && (item.system || !item.unread)) return false
      if (view === 'System' && !item.system) return false
      if (channel !== 'All' && item.channel !== channel) return false
      if (!q) return true
      return [item.person, item.address, item.subject, item.preview, item.channel]
        .some(v => String(v || '').toLowerCase().includes(q))
    })
  }, [items, view, channel, search])

  const panel = { background:'var(--sf)', border:'1px solid var(--br)', borderRadius:14 }
  const tabStyle = active => ({
    border: active ? '1px solid var(--blue)' : '1px solid transparent',
    background: active ? 'color-mix(in srgb, var(--blue) 14%, transparent)' : 'transparent',
    color: active ? 'var(--blue)' : 'var(--t2)',
    borderRadius:8, padding:'8px 11px', fontSize:12, fontWeight:800, cursor:'pointer'
  })
  const channelStyle = active => ({
    border:'1px solid ' + (active ? 'var(--blue)' : 'var(--br)'),
    background: active ? 'color-mix(in srgb, var(--blue) 12%, transparent)' : 'var(--s2)',
    color: active ? 'var(--blue)' : 'var(--t2)',
    borderRadius:999, padding:'6px 10px', fontSize:11, fontWeight:800, cursor:'pointer'
  })

  return (
    <div style={{maxWidth:1460, margin:'0 auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:18,marginBottom:18,flexWrap:'wrap'}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <h1 style={{margin:0,fontSize:26,color:'var(--tx)',letterSpacing:'-.02em'}}>Unified Inbox</h1>
            <span style={{fontSize:10,fontWeight:900,letterSpacing:'.08em',textTransform:'uppercase',padding:'5px 8px',borderRadius:999,background:'rgba(59,130,246,.11)',color:'var(--blue)'}}>Email · SMS · Fax · Voice</span>
          </div>
          <p style={{margin:'7px 0 0',fontSize:12.5,color:'var(--t3)'}}>Customer conversations for {FIRM.name || 'your office'}, with automated system traffic separated out.</p>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button className="btn pri" onClick={() => navigate('/email?new=1')}>✉️ New Email</button>
          <button className="btn" onClick={() => navigate('/sms')}>💬 New SMS</button>
          <button className="btn" onClick={() => navigate('/fax?new=1')}>📠 New Fax</button>
          <button className="btn" onClick={() => navigate('/dialer')}>📞 Dialer</button>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:10,marginBottom:14}}>
        {[
          ['Needs attention', counts.Unread, 'Unread customer messages', '🔵'],
          ['Primary', counts.Primary, 'Recent customer conversations', '💬'],
          ['Voice', counts.Voice, 'Calls and voicemail', '📞'],
          ['System', counts.System, 'Automated mail kept separate', '⚙️'],
        ].map(([label,value,sub,icon]) => (
          <button key={label} onClick={() => setView(label === 'Needs attention' ? 'Unread' : label)} style={{...panel,padding:'14px 16px',textAlign:'left',cursor:'pointer',color:'inherit'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
              <span style={{fontSize:11,fontWeight:800,color:'var(--t2)'}}>{label}</span>
              <span style={{fontSize:16}}>{icon}</span>
            </div>
            <div style={{fontSize:25,fontWeight:900,color:'var(--tx)',marginTop:5}}>{value}</div>
            <div style={{fontSize:10.5,color:'var(--t3)',marginTop:2}}>{sub}</div>
          </button>
        ))}
      </div>

      <div style={{...panel,overflow:'hidden'}}>
        <div style={{padding:'10px 12px',borderBottom:'1px solid var(--br)',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',background:'color-mix(in srgb, var(--sf) 88%, var(--s2))'}}>
          <div style={{display:'flex',gap:3,padding:3,background:'var(--s2)',border:'1px solid var(--br)',borderRadius:10}}>
            {VIEWS.map(v => <button key={v} onClick={() => setView(v)} style={tabStyle(view===v)}>{v}{v==='System' && counts.System ? ' ' + counts.System : ''}</button>)}
          </div>
          <div style={{width:1,height:26,background:'var(--br)'}} />
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {CHANNELS.map(ch => (
              <button key={ch} onClick={() => setChannel(ch)} style={channelStyle(channel===ch)}>
                {ch}{ch !== 'All' && counts[ch] !== undefined ? ' ' + counts[ch] : ''}
              </button>
            ))}
          </div>
          <div style={{marginLeft:'auto',display:'flex',gap:8,alignItems:'center',flex:'1 1 320px',justifyContent:'flex-end'}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search conversations…" style={{flex:'1 1 260px',maxWidth:420,background:'var(--s2)',border:'1px solid var(--br)',borderRadius:9,padding:'9px 11px',color:'var(--tx)',outline:'none'}} />
            <button className="btn" onClick={() => void load()}>Refresh</button>
          </div>
        </div>

        {error && <div style={{padding:'10px 14px',background:'rgba(239,68,68,.08)',color:'var(--bad)',fontSize:12,borderBottom:'1px solid var(--br)'}}>Some communication sources could not load: {error}</div>}

        {view === 'Primary' && counts.System > 0 && (
          <button onClick={() => setView('System')} style={{width:'100%',border:0,borderBottom:'1px solid var(--br)',background:'rgba(148,163,184,.045)',padding:'9px 14px',color:'var(--t3)',fontSize:11,textAlign:'left',cursor:'pointer'}}>
            ⚙️ {counts.System} automated/system messages are hidden from Primary. View system mail →
          </button>
        )}

        {loading ? (
          <div style={{padding:56,textAlign:'center',color:'var(--t3)'}}>Loading conversations…</div>
        ) : visible.length === 0 ? (
          <div style={{padding:60,textAlign:'center'}}>
            <div style={{fontSize:30}}>📭</div>
            <div style={{fontSize:14,fontWeight:850,color:'var(--tx)',marginTop:8}}>Nothing here</div>
            <div style={{fontSize:12,color:'var(--t3)',marginTop:4}}>No conversations match the current view and filters.</div>
          </div>
        ) : (
          <div>
            {visible.slice(0,300).map(item => (
              <button key={item.id} onClick={() => navigate(item.route)} style={{width:'100%',border:0,borderBottom:'1px solid var(--br)',background:item.unread&&!item.system?'rgba(59,130,246,.055)':'transparent',display:'grid',gridTemplateColumns:'44px minmax(180px,1fr) minmax(280px,2.15fr) 110px',gap:14,alignItems:'center',padding:'12px 14px',textAlign:'left',cursor:'pointer',color:'inherit'}}>
                <div style={{width:38,height:38,borderRadius:11,display:'flex',alignItems:'center',justifyContent:'center',background:item.system?'rgba(148,163,184,.09)':'color-mix(in srgb, var(--blue) 10%, var(--s2))',border:'1px solid var(--br)',fontSize:12,fontWeight:900,color:item.system?'var(--t3)':'var(--blue)'}}>
                  {item.channel === 'Email' ? initials(item.person) : item.icon}
                </div>
                <div style={{minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:7,minWidth:0}}>
                    {item.unread && !item.system && <span style={{width:7,height:7,borderRadius:'50%',background:'var(--blue)',flex:'0 0 auto'}} />}
                    <div style={{fontSize:12.5,fontWeight:item.unread&&!item.system?900:750,color:'var(--tx)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.person}</div>
                  </div>
                  <div style={{fontSize:10.5,color:'var(--t3)',marginTop:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.address || (item.inbound ? 'Inbound' : 'Outbound')}</div>
                </div>
                <div style={{minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:7,minWidth:0}}>
                    <span style={{fontSize:10,fontWeight:850,padding:'3px 6px',borderRadius:6,background:'var(--s2)',border:'1px solid var(--br)',color:'var(--t2)',flex:'0 0 auto'}}>{item.channel}</span>
                    <div style={{fontSize:12.5,fontWeight:item.unread&&!item.system?850:700,color:'var(--tx)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.subject}</div>
                  </div>
                  <div style={{fontSize:11,color:'var(--t3)',marginTop:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.preview || 'No preview available'}</div>
                </div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:8}}>
                  <span style={{fontSize:10.5,color:'var(--t3)',whiteSpace:'nowrap'}}>{when(item.at)}</span>
                  <span style={{fontSize:15,color:'var(--t3)'}}>›</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
