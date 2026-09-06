import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { FIRM } from '../lib/firmBranding'

const CHANNELS = ['All', 'Email', 'SMS', 'Fax', 'Voice']

function when(value) {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString()
}

function normalizeEmail(row) {
  const inbound = String(row.triage || '').toLowerCase() !== 'sent' && String(row.direction || '').toLowerCase() !== 'outbound'
  return {
    id: 'email:' + row.id,
    rawId: row.id,
    channel: 'Email',
    icon: '✉️',
    inbound,
    unread: inbound && row.is_read !== true,
    person: row.clientName || row.from_email || row.sender || row.recipient || 'Email contact',
    address: row.from_email || row.sender || row.recipient || '',
    subject: row.subject || '(no subject)',
    preview: row.body_text || row.body || row.snippet || '',
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
    person: row.clientName || row.client_name || row.phone || 'Text contact',
    address: row.phone || row.from_number || row.to_number || '',
    subject: inbound ? 'Incoming text' : 'Outgoing text',
    preview: row.body || row.message || '',
    at: row.received_at || row.sent_at || row.created_at,
    route: `/sms?reply=1&phone=${encodeURIComponent(row.phone || row.from_number || row.to_number || '')}&client=${encodeURIComponent(row.clientName || row.client_name || '')}`,
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
  const [filter, setFilter] = useState('All')
  const [direction, setDirection] = useState('All')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const centralOwner = ['info@romylabs.com', 'romy@romylabs.com'].includes((user?.email || '').toLowerCase())
    ? 'info@romylabs.com'
    : (user?.email || '')

  async function load() {
    if (!user?.email) return
    setLoading(true)
    setError('')
    try {
      const emailQuery = supabase.from('emails').select('*').order('created_at', { ascending:false }).limit(250)
      if (centralOwner) emailQuery.eq('mailbox_owner', centralOwner)
      const [emails, sms, fax, calls, voicemails] = await Promise.all([
        emailQuery,
        supabase.from('sms_messages').select('*').order('created_at', { ascending:false }).limit(250),
        supabase.from('fax_logs').select('*').order('created_at', { ascending:false }).limit(150),
        supabase.from('calllog').select('*').order('created_at', { ascending:false }).limit(150),
        supabase.from('voicemails').select('*').order('created_at', { ascending:false }).limit(150),
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

  useEffect(() => { void load() }, [user?.email])

  useEffect(() => {
    if (!user?.email) return
    const ch = supabase.channel('unified-inbox-' + user.email)
      .on('postgres_changes', { event:'*', schema:'public', table:'emails' }, () => void load())
      .on('postgres_changes', { event:'*', schema:'public', table:'sms_messages' }, () => void load())
      .on('postgres_changes', { event:'*', schema:'public', table:'fax_logs' }, () => void load())
      .on('postgres_changes', { event:'*', schema:'public', table:'calllog' }, () => void load())
      .on('postgres_changes', { event:'*', schema:'public', table:'voicemails' }, () => void load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user?.email])

  const counts = useMemo(() => {
    const result = { All: items.length, Email:0, SMS:0, Fax:0, Voice:0, unread:0 }
    items.forEach(item => {
      result[item.channel] = (result[item.channel] || 0) + 1
      if (item.unread) result.unread += 1
    })
    return result
  }, [items])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(item => {
      if (filter !== 'All' && item.channel !== filter) return false
      if (direction === 'Inbound' && !item.inbound) return false
      if (direction === 'Outbound' && item.inbound) return false
      if (direction === 'Unread' && !item.unread) return false
      if (!q) return true
      return [item.person, item.address, item.subject, item.preview, item.channel]
        .some(v => String(v || '').toLowerCase().includes(q))
    })
  }, [items, filter, direction, search])

  const card = { background:'var(--sf)', border:'1px solid var(--br)', borderRadius:12 }
  const pill = (active) => ({
    border:'1px solid ' + (active ? 'var(--blue)' : 'var(--br)'),
    background: active ? 'color-mix(in srgb, var(--blue) 14%, transparent)' : 'var(--s2)',
    color: active ? 'var(--blue)' : 'var(--t2)',
    borderRadius:999, padding:'7px 11px', fontSize:11, fontWeight:800, cursor:'pointer'
  })

  return (
    <div style={{maxWidth:1400, margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:16,marginBottom:18,flexWrap:'wrap'}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <h1 style={{margin:0,fontSize:24,color:'var(--tx)'}}>Unified Inbox</h1>
            <span style={{fontSize:10,fontWeight:900,letterSpacing:'.08em',textTransform:'uppercase',padding:'4px 8px',borderRadius:999,background:'rgba(59,130,246,.12)',color:'var(--blue)'}}>Email · SMS · Fax · Voice</span>
          </div>
          <p style={{margin:'6px 0 0',fontSize:12,color:'var(--t3)'}}>One communications queue for {FIRM.name || 'your office'}. Replies stay in the original channel.</p>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button className="btn" onClick={() => navigate('/email?new=1')}>✉️ New Email</button>
          <button className="btn" onClick={() => navigate('/sms')}>💬 New SMS</button>
          <button className="btn" onClick={() => navigate('/fax?new=1')}>📠 New Fax</button>
          <button className="btn" onClick={() => navigate('/dialer')}>📞 Dialer</button>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10,marginBottom:14}}>
        {[
          ['All activity', counts.All, '📥'],
          ['Unread', counts.unread, '🔵'],
          ['Email', counts.Email, '✉️'],
          ['SMS', counts.SMS, '💬'],
          ['Fax', counts.Fax, '📠'],
          ['Voice', counts.Voice, '📞'],
        ].map(([label,value,icon]) => (
          <div key={label} style={{...card,padding:'13px 15px'}}>
            <div style={{fontSize:11,color:'var(--t3)',fontWeight:700}}>{icon} {label}</div>
            <div style={{fontSize:24,fontWeight:900,color:'var(--tx)',marginTop:4}}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{...card,overflow:'hidden'}}>
        <div style={{padding:12,borderBottom:'1px solid var(--br)',display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          {CHANNELS.map(ch => <button key={ch} onClick={() => setFilter(ch)} style={pill(filter===ch)}>{ch}{ch!=='All' ? ' ' + counts[ch] : ''}</button>)}
          <span style={{width:1,height:24,background:'var(--br)',margin:'0 2px'}} />
          {['All','Inbound','Outbound','Unread'].map(d => <button key={d} onClick={() => setDirection(d)} style={pill(direction===d)}>{d}</button>)}
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search all communications…" style={{marginLeft:'auto',minWidth:240,flex:'1 1 280px',maxWidth:420,background:'var(--s2)',border:'1px solid var(--br)',borderRadius:9,padding:'9px 11px',color:'var(--tx)',outline:'none'}} />
          <button className="btn" onClick={() => void load()}>Refresh</button>
        </div>

        {error && <div style={{padding:'10px 14px',background:'rgba(239,68,68,.08)',color:'var(--bad)',fontSize:12,borderBottom:'1px solid var(--br)'}}>Some communication sources could not load: {error}</div>}

        {loading ? (
          <div style={{padding:50,textAlign:'center',color:'var(--t3)'}}>Loading communications…</div>
        ) : visible.length === 0 ? (
          <div style={{padding:56,textAlign:'center'}}>
            <div style={{fontSize:30}}>📭</div>
            <div style={{fontSize:14,fontWeight:800,color:'var(--tx)',marginTop:8}}>Inbox clear</div>
            <div style={{fontSize:12,color:'var(--t3)',marginTop:4}}>No communications match the current filters.</div>
          </div>
        ) : (
          <div>
            {visible.slice(0,500).map(item => (
              <button key={item.id} onClick={() => navigate(item.route)} style={{width:'100%',border:0,borderBottom:'1px solid var(--br)',background:item.unread?'rgba(59,130,246,.055)':'transparent',display:'grid',gridTemplateColumns:'42px minmax(150px,1.1fr) minmax(220px,2fr) 150px',gap:12,alignItems:'center',padding:'11px 14px',textAlign:'left',cursor:'pointer',color:'inherit'}}>
                <div style={{width:34,height:34,borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--s2)',border:'1px solid var(--br)',fontSize:16}}>{item.icon}</div>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:item.unread?900:700,color:'var(--tx)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.person}</div>
                  <div style={{fontSize:10,color:'var(--t3)',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.channel} · {item.inbound?'Inbound':'Outbound'}{item.address?' · '+item.address:''}</div>
                </div>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:item.unread?800:700,color:'var(--tx)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.subject}</div>
                  <div style={{fontSize:11,color:'var(--t3)',marginTop:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{String(item.preview || '').replace(/<[^>]*>/g,' ')}</div>
                </div>
                <div style={{fontSize:10,color:'var(--t3)',textAlign:'right',whiteSpace:'nowrap'}}>{when(item.at)}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
