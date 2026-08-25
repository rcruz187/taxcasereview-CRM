// Support — ticket system
// Romy (romy@taxcasereview.org) sees ALL offices' tickets, can reply/update status/priority.
// Every other office sees ONLY their own tickets + a submit form.

import { useState, useEffect, useCallback } from 'react'
import { supabase }   from '../lib/supabase'
import { useApp }     from '../context/AppContext'
import { FIRM }       from '../lib/firmBranding'

const PLATFORM_EMAILS = ['romy@taxcasereview.org', 'romy@taxrescrm.net', 'romy@romylabs.com', 'info@romylabs.com']
const FROM_EMAIL = 'romy@taxrescrm.net'
const FROM_NAME  = 'TaxRes CRM Support'

const CATEGORIES = ['Bug Report','Feature Request','Account Issue','Billing Question','Other']
const PRIORITIES = ['Low','Normal','High','Urgent']
const STATUSES   = ['Open','In Progress','Resolved']

const PRI_COLOR  = { Low:'#64748b', Normal:'#2563eb', High:'#d97706', Urgent:'#dc2626' }
const STA_COLOR  = { Open:'#2563eb', 'In Progress':'#d97706', Resolved:'#16a34a' }

function Badge({ label, color }) {
  return (
    <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20,
                   background: color + '18', color, border:`1px solid ${color}33` }}>
      {label}
    </span>
  )
}

// ── Submit form (shown to all offices) ──────────────────────────────
function SubmitForm({ user, onSubmitted }) {
  const [form, setForm] = useState({
    submitted_by_name: '', submitted_by_email: user?.email || '',
    category: 'Bug Report', priority: 'Normal', subject: '', description: ''
  })
  const [saving, setSaving] = useState(false)
  const { showToast } = useApp()

  async function submit() {
    if (!form.subject.trim() || !form.description.trim()) {
      showToast('Subject and description are required', 'error'); return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('support_tickets').insert({
        tenant_id: FIRM.tenantId,
        submitted_by_name:  form.submitted_by_name  || user?.email?.split('@')[0] || 'Unknown',
        submitted_by_email: form.submitted_by_email || user?.email || '',
        category:    form.category,
        priority:    form.priority,
        subject:     form.subject.trim(),
        description: form.description.trim(),
      })
      if (error) throw error
      // Notify Romy by email
      await supabase.functions.invoke('send-email', {
        body: {
          to: FROM_EMAIL,
          from_email: FROM_EMAIL,
          from_name:  FROM_NAME,
          subject: `[New Ticket] ${form.subject} — ${FIRM.name} (${form.priority})`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;padding:24px">
<h2 style="margin:0 0 16px">New Support Ticket</h2>
<table style="width:100%;border-collapse:collapse;font-size:14px">
<tr><td style="padding:6px 0;color:#64748b;width:120px">Office</td><td><strong>${FIRM.name}</strong></td></tr>
<tr><td style="padding:6px 0;color:#64748b">From</td><td>${form.submitted_by_name} &lt;${form.submitted_by_email}&gt;</td></tr>
<tr><td style="padding:6px 0;color:#64748b">Category</td><td>${form.category}</td></tr>
<tr><td style="padding:6px 0;color:#64748b">Priority</td><td><strong style="color:${PRI_COLOR[form.priority]}">${form.priority}</strong></td></tr>
<tr><td style="padding:6px 0;color:#64748b">Subject</td><td><strong>${form.subject}</strong></td></tr>
</table>
<div style="margin-top:16px;padding:14px;background:#f8fafc;border-radius:8px;font-size:14px;line-height:1.6">
${form.description.replace(/\n/g,'<br>')}
</div>
</div>`
        }
      })
      showToast('Ticket submitted — we\'ll be in touch shortly', 'success')
      setForm(f => ({ ...f, subject: '', description: '', priority: 'Normal', category: 'Bug Report' }))
      onSubmitted()
    } catch (e) {
      showToast(e.message || 'Failed to submit ticket', 'error')
    } finally { setSaving(false) }
  }

  const inp = { background:'var(--s1)', border:'1px solid var(--br)', borderRadius:8,
                padding:'9px 12px', color:'var(--tx)', fontSize:14, width:'100%', boxSizing:'border-box' }

  return (
    <div style={{ background:'var(--s1)', border:'1px solid var(--br)', borderRadius:12, padding:20, marginBottom:20 }}>
      <div style={{ fontSize:15, fontWeight:700, marginBottom:16 }}>Submit a Support Ticket</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
        <div>
          <div style={{ fontSize:12, color:'var(--t2)', marginBottom:4 }}>Your name</div>
          <input style={inp} value={form.submitted_by_name}
            onChange={e => setForm(f => ({...f, submitted_by_name: e.target.value}))}
            placeholder={user?.email?.split('@')[0] || 'Your name'} />
        </div>
        <div>
          <div style={{ fontSize:12, color:'var(--t2)', marginBottom:4 }}>Your email</div>
          <input style={inp} value={form.submitted_by_email}
            onChange={e => setForm(f => ({...f, submitted_by_email: e.target.value}))}
            placeholder="you@yourfirm.com" />
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
        <div>
          <div style={{ fontSize:12, color:'var(--t2)', marginBottom:4 }}>Category</div>
          <select style={inp} value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize:12, color:'var(--t2)', marginBottom:4 }}>Priority</div>
          <select style={inp} value={form.priority} onChange={e => setForm(f => ({...f, priority: e.target.value}))}>
            {PRIORITIES.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom:12 }}>
        <div style={{ fontSize:12, color:'var(--t2)', marginBottom:4 }}>Subject</div>
        <input style={inp} value={form.subject}
          onChange={e => setForm(f => ({...f, subject: e.target.value}))}
          placeholder="Brief description of the issue" />
      </div>
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:12, color:'var(--t2)', marginBottom:4 }}>Description</div>
        <textarea style={{ ...inp, minHeight:100, resize:'vertical' }} value={form.description}
          onChange={e => setForm(f => ({...f, description: e.target.value}))}
          placeholder="Describe the issue in detail — steps to reproduce, what you expected, what happened" />
      </div>
      <button onClick={submit} disabled={saving}
        style={{ background:'#2563eb', border:'none', borderRadius:8, padding:'10px 24px',
                 color:'#fff', fontWeight:700, fontSize:14, cursor: saving ? 'not-allowed' : 'pointer',
                 opacity: saving ? .6 : 1 }}>
        {saving ? 'Submitting…' : 'Submit Ticket'}
      </button>
    </div>
  )
}

// ── Ticket thread / detail ───────────────────────────────────────────
function TicketThread({ ticket, isRomy, onBack, onUpdated }) {
  const [rows,    setRows]    = useState([])
  const [reply,   setReply]   = useState('')
  const [sending, setSending] = useState(false)
  const [status,  setStatus]  = useState(ticket.status)
  const [priority,setPriority]= useState(ticket.priority)
  const { showToast } = useApp()

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('get_ticket_thread', { p_ticket_id: ticket.id })
    setRows(data || [])
  }, [ticket.id])

  useEffect(() => { load() }, [load])

  async function saveStatus(newStatus, newPriority) {
    if (!isRomy) return
    const s = newStatus  || status
    const p = newPriority || priority
    await supabase.rpc('update_ticket_status', { p_ticket_id: ticket.id, p_status: s, p_priority: p })
    setStatus(s); setPriority(p)
    onUpdated()
    // Notify the submitter
    const t = rows[0]
    if (t?.submitted_by_email) {
      const statusMsg = newStatus === 'In Progress'
        ? `We've started working on your ticket and will update you when it's resolved.`
        : newStatus === 'Resolved'
        ? `Your ticket has been resolved. Please reply if you need further assistance.`
        : `Your ticket status has been updated to ${s}.`
      await supabase.functions.invoke('send-email', {
        body: {
          to: t.submitted_by_email,
          from_email: FROM_EMAIL, from_name: FROM_NAME,
          subject: `[Ticket Update] ${t.subject} — ${s}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;padding:24px">
<p>Hi ${t.submitted_by_name},</p>
<p>${statusMsg}</p>
<table style="font-size:13px;margin:16px 0;border-collapse:collapse">
<tr><td style="padding:4px 12px 4px 0;color:#64748b">Ticket</td><td><strong>${t.subject}</strong></td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#64748b">Status</td><td><strong style="color:${STA_COLOR[s]}">${s}</strong></td></tr>
</table>
<p style="font-size:12px;color:#94a3b8">TaxRes CRM Support · ${FROM_EMAIL}</p>
</div>`
        }
      })
    }
    showToast(`Status → ${s}`, 'success')
  }

  async function sendReply() {
    if (!reply.trim()) return
    setSending(true)
    try {
      const sender = isRomy ? 'romy' : 'staff'
      await supabase.rpc('add_ticket_message', {
        p_ticket_id: ticket.id, p_sender: sender, p_message: reply.trim()
      })
      // Email the other party
      const t = rows[0]
      const toEmail  = isRomy ? t?.submitted_by_email : FROM_EMAIL
      const toName   = isRomy ? t?.submitted_by_name  : 'Romy'
      const fromName = isRomy ? FROM_NAME : (t?.submitted_by_name || 'Staff')
      if (toEmail) {
        await supabase.functions.invoke('send-email', {
          body: {
            to: toEmail,
            from_email: FROM_EMAIL, from_name: fromName,
            subject: `Re: ${t?.subject}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;padding:24px">
<p>Hi ${toName},</p>
<div style="margin:16px 0;padding:14px;background:#f8fafc;border-radius:8px;font-size:14px;line-height:1.6">
${reply.trim().replace(/\n/g,'<br>')}
</div>
<p style="font-size:12px;color:#94a3b8">TaxRes CRM Support · ${FROM_EMAIL}</p>
</div>`
          }
        })
      }
      setReply('')
      load()
      onUpdated()
    } catch (e) { showToast(e.message || 'Send failed', 'error') }
    finally { setSending(false) }
  }

  const info = rows[0] || ticket

  return (
    <div>
      <button onClick={onBack} style={{ background:'none', border:'none', color:'var(--blue)',
        fontSize:13, cursor:'pointer', marginBottom:16, padding:0 }}>← Back to tickets</button>

      <div style={{ background:'var(--s1)', border:'1px solid var(--br)', borderRadius:12, padding:20, marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:17, fontWeight:700, marginBottom:6 }}>{info.subject}</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <Badge label={priority} color={PRI_COLOR[priority]} />
              <Badge label={status}   color={STA_COLOR[status]} />
              <span style={{ fontSize:12, color:'var(--t3)' }}>{info.category}</span>
              {isRomy && <span style={{ fontSize:12, color:'var(--t3)' }}>· {info.firm_name}</span>}
            </div>
          </div>
          {isRomy && (
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {STATUSES.map(s => s !== status && (
                <button key={s} onClick={() => saveStatus(s, null)}
                  style={{ background: STA_COLOR[s]+'18', border:`1px solid ${STA_COLOR[s]}44`,
                           borderRadius:6, padding:'4px 12px', color: STA_COLOR[s],
                           fontSize:12, fontWeight:700, cursor:'pointer' }}>
                  → {s}
                </button>
              ))}
              <select value={priority} onChange={e => saveStatus(null, e.target.value)}
                style={{ fontSize:12, padding:'4px 8px', borderRadius:6,
                         border:'1px solid var(--br)', background:'var(--bg)', color:'var(--tx)' }}>
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Thread */}
      <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
        {/* Original description */}
        <div style={{ background:'var(--s1)', border:'1px solid var(--br)', borderRadius:10, padding:14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
            <span style={{ fontSize:12, fontWeight:600 }}>{info.submitted_by_name}</span>
            <span style={{ fontSize:11, color:'var(--t3)' }}>{new Date(info.created_at).toLocaleString()}</span>
          </div>
          <div style={{ fontSize:14, lineHeight:1.6, color:'var(--tx)', whiteSpace:'pre-wrap' }}>{info.description}</div>
        </div>
        {rows.filter(r => r.msg_id).map(r => (
          <div key={r.msg_id} style={{
            background: r.sender === 'romy' ? '#1e3a5f22' : 'var(--s1)',
            border: `1px solid ${r.sender === 'romy' ? '#2563eb44' : 'var(--br)'}`,
            borderRadius:10, padding:14,
            alignSelf: r.sender === 'romy' ? 'flex-end' : 'flex-start',
            maxWidth:'85%'
          }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:16, marginBottom:6 }}>
              <span style={{ fontSize:12, fontWeight:600, color: r.sender === 'romy' ? '#2563eb' : 'var(--tx)' }}>
                {r.sender === 'romy' ? 'TaxRes CRM Support' : info.submitted_by_name}
              </span>
              <span style={{ fontSize:11, color:'var(--t3)' }}>{new Date(r.msg_at).toLocaleString()}</span>
            </div>
            <div style={{ fontSize:14, lineHeight:1.6, whiteSpace:'pre-wrap' }}>{r.message}</div>
          </div>
        ))}
      </div>

      {/* Reply box */}
      {status !== 'Resolved' && (
        <div style={{ background:'var(--s1)', border:'1px solid var(--br)', borderRadius:12, padding:16 }}>
          <textarea
            value={reply} onChange={e => setReply(e.target.value)}
            placeholder="Type your reply…"
            style={{ width:'100%', minHeight:80, background:'var(--bg)', border:'1px solid var(--br)',
                     borderRadius:8, padding:'9px 12px', color:'var(--tx)', fontSize:14,
                     resize:'vertical', boxSizing:'border-box', marginBottom:10 }} />
          <button onClick={sendReply} disabled={sending || !reply.trim()}
            style={{ background:'#2563eb', border:'none', borderRadius:8, padding:'9px 20px',
                     color:'#fff', fontWeight:700, fontSize:14,
                     cursor: sending || !reply.trim() ? 'not-allowed' : 'pointer',
                     opacity: sending || !reply.trim() ? .6 : 1 }}>
            {sending ? 'Sending…' : 'Send Reply'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main Support page ────────────────────────────────────────────────
export default function Support() {
  const { user } = useApp()
  const isRomy = PLATFORM_EMAILS.includes(user?.email || '')
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  // Non-Romy users land on submit+history view by default — form always visible
  const [view,    setView]    = useState('list') // 'list' | ticket_id (Romy) or always shows form+list (staff)
  const [filter,  setFilter]  = useState('Open')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.rpc('list_support_tickets')
    setTickets(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = filter === 'All'
    ? tickets
    : tickets.filter(t => t.status === filter)

  if (view && view !== 'list' && view !== 'submit') {
    const t = tickets.find(t => t.id === view)
    if (t) return (
      <div style={{ padding:'24px', maxWidth:800 }}>
        <TicketThread ticket={t} isRomy={isRomy}
          onBack={() => setView('list')}
          onUpdated={load} />
      </div>
    )
  }

  return (
    <div style={{ padding:'24px', maxWidth:900 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ margin:0, fontSize:22, fontWeight:800 }}>
            {isRomy ? '🎫 Support Tickets' : '🎫 Support'}
          </h1>
          <div style={{ fontSize:13, color:'var(--t3)', marginTop:4 }}>
            {isRomy
              ? 'All offices — manage and respond to tickets'
              : 'Get help from TaxRes CRM support'}
          </div>
        </div>
        {!isRomy && (
          <button onClick={() => setView('new')}
            style={{ background:'#2563eb', border:'none', borderRadius:8, padding:'9px 20px',
                     color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer',
                     display: view === 'new' ? 'none' : 'block' }}>
            + New Ticket
          </button>
        )}
      </div>

      {/* Submit form — always visible for non-Romy users */}
      {!isRomy && view !== 'list' && view !== 'new' ? null : !isRomy && (
        <>
          {view === 'new'
            ? <SubmitForm user={user} onSubmitted={() => { load(); setView('list') }} />
            : <SubmitForm user={user} onSubmitted={load} />
          }
          {view === 'new' && (
            <button onClick={() => setView('list')}
              style={{ background:'none', border:'none', color:'var(--blue)', fontSize:13,
                       cursor:'pointer', marginBottom:16, padding:0 }}>
              ← View my tickets
            </button>
          )}
        </>
      )}

      {/* Filter bar */}
      {view !== 'submit' && (
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          {['Open','In Progress','Resolved','All'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ background: filter === f ? '#2563eb' : 'var(--s1)',
                       border:`1px solid ${filter === f ? '#2563eb' : 'var(--br)'}`,
                       borderRadius:6, padding:'5px 14px', color: filter === f ? '#fff' : 'var(--tx)',
                       fontSize:13, fontWeight:600, cursor:'pointer' }}>
              {f}
            </button>
          ))}
        </div>
      )}

      {/* Ticket list */}
      {view !== 'submit' && (
        loading
          ? <div style={{ color:'var(--t3)', fontSize:14 }}>Loading…</div>
          : filtered.length === 0
          ? <div style={{ color:'var(--t3)', fontSize:14, padding:24, textAlign:'center' }}>
              {filter === 'All' ? 'No tickets yet.' : `No ${filter.toLowerCase()} tickets.`}
            </div>
          : <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {filtered.map(t => (
                <div key={t.id} onClick={() => setView(t.id)}
                  style={{ background:'var(--s1)', border:'1px solid var(--br)', borderRadius:10,
                           padding:14, cursor:'pointer', transition:'border-color .15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor='#2563eb'}
                  onMouseLeave={e => e.currentTarget.style.borderColor='var(--br)'}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:600, marginBottom:6 }}>{t.subject}</div>
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                        <Badge label={t.priority} color={PRI_COLOR[t.priority]} />
                        <Badge label={t.status}   color={STA_COLOR[t.status]} />
                        <span style={{ fontSize:12, color:'var(--t3)' }}>{t.category}</span>
                        {isRomy && <span style={{ fontSize:12, color:'var(--t3)' }}>· {t.firm_name}</span>}
                        {t.message_count > 0 && (
                          <span style={{ fontSize:12, color:'var(--t3)' }}>· {t.message_count} message{t.message_count > 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize:11, color:'var(--t3)', whiteSpace:'nowrap' }}>
                      {new Date(t.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ fontSize:12, color:'var(--t3)', marginTop:6 }}>
                    From: {t.submitted_by_name}
                    {isRomy && ` · ${t.submitted_by_email}`}
                  </div>
                </div>
              ))}
            </div>
      )}
    </div>
  )
}
