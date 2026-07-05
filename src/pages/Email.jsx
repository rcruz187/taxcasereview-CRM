import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { sendGmailEmail, downloadGmailAttachment, fetchGmailAttachmentBlob } from '../lib/gmailUtils'
import { useGmailSync } from '../context/GmailSyncContext'
import { useApp } from '../context/AppContext'
import { DOC_FOLDERS } from './Clients'

const TEMPLATES = [
  { label:'Welcome Letter',         subject:'Welcome to Tax Case Review', body:"Dear {name},\n\nWelcome to Tax Case Review — we're glad to have you on board. Your case has been assigned to a dedicated representative who will be reaching out shortly to walk you through the next steps and what to expect along the way.\n\nIn the meantime, if anything comes up or you have questions, don't hesitate to reach out. We're here to help." },
  { label:'Document Request',       subject:'A Few Documents We Need From You', body:"Dear {name},\n\nTo keep your case moving, we need a few documents from you:\n\n1. Your last 2 years of filed tax returns\n2. Any IRS notices you've received\n3. A copy of your photo ID\n\nYou can upload these directly through your client portal, or reply to this email and we'll guide you through it. The sooner we have these, the sooner we can move forward." },
  { label:'Tax Investigation Update', subject:'Update: Your IRS Investigation', body:"Dear {name},\n\nWe wanted to give you an update on the investigation into your IRS account. This is the part of the process where we pull your full IRS transcripts and review your account history, balances, and any notices on file, so we have a complete and accurate picture before recommending a resolution path.\n\nThis step typically takes some time since it depends on the IRS's own response times, not ours. We'll reach out as soon as we have results to share, and there's nothing you need to do on your end right now." },
  { label:'OIC Update',             subject:'Update on Your Offer in Compromise', body:"Dear {name},\n\nHere's where things stand with your Offer in Compromise (OIC) — this is the IRS program that can let you settle your tax debt for less than the full amount owed. We've submitted your offer, and it's now sitting with the IRS for their review.\n\nThis stage can take several months, since it's entirely on the IRS's timeline. We're monitoring it closely and will let you know the moment there's movement." },
  { label:'Installment Agreement Update', subject:'Update on Your IRS Payment Plan', body:"Dear {name},\n\nWe wanted to update you on your Installment Agreement — this is the monthly payment plan being set up with the IRS so you can pay down your balance over time instead of all at once.\n\nWe're currently working with the IRS to finalize the terms. Once it's approved, we'll send you the full details, including your monthly payment amount and due date." },
  { label:'IRS Notice Response',    subject:"We've Received Your IRS Notice", body:"Dear {name},\n\nWe've received and reviewed the IRS notice on your case, and we're preparing our response on your behalf. No action is needed from you right now — we'll handle the back-and-forth with the IRS directly.\n\nWe'll keep you posted as this develops, and reach out right away if anything changes." },
  { label:'Appointment Reminder',   subject:'Reminder: Your Upcoming Appointment', body:"Dear {name},\n\nJust a friendly reminder of your upcoming appointment with us. If you have any documents we've requested, having them ready ahead of time will help us make the most of our time together.\n\nIf you need to reschedule for any reason, just let us know and we'll find a time that works better." },
  { label:'Documents Still Needed', subject:'Quick Follow-Up: Documents Needed', body:"Dear {name},\n\nWe're still waiting on a few documents to keep your case moving forward. If you've already sent these, please disregard this message — otherwise, we'd really appreciate getting them over to us soon so there's no delay on our end.\n\nIf anything's unclear about what's needed or how to send it, just reply here and we'll help." },
  { label:'Case Status Update',     subject:'An Update on Your Case', body:"Dear {name},\n\nWe wanted to check in and give you a quick update on where your case stands. Things are progressing, and we're continuing to work on your behalf with the IRS.\n\nIf you have any questions in the meantime, feel free to reach out — we're always happy to walk you through where things are." },
  { label:'Resolution Complete',    subject:'Great News — Your Case Is Resolved!', body:"Dear {name},\n\nWe're thrilled to let you know that your tax case has been successfully resolved! This is the moment we've been working toward together, and we couldn't be happier to share this news with you.\n\nThank you for trusting us with something this important — it's been a pleasure working on your behalf." },
  { label:'Payment Receipt',        subject:'Payment Received — Thank You', body:"Dear {name},\n\nThank you — we've received your payment and your account has been updated. We'll continue working diligently on your case, and we appreciate you staying current as we move things forward together." },
  { label:'Penalty Abatement Update', subject:'Update on Your Penalty Relief Request', body:"Dear {name},\n\nWe wanted to update you on the penalty abatement request we filed on your behalf — this is a request asking the IRS to remove or reduce penalties that were added to your balance. We're still waiting to hear back from the IRS on this.\n\nWe'll let you know as soon as we get a decision." },
  { label:'Wage Garnishment Update', subject:'Update on Your Wage Garnishment', body:"Dear {name},\n\nWe wanted to update you on the status of your wage garnishment. We are actively working with the IRS to have this released or reduced, and we understand how stressful this situation can be.\n\nWe're treating this with urgency and will reach out the moment we have news." },
]

const TRIAGE = ['Inbox','Action Needed','Waiting','Sent','Archive']
const TRIAGE_COLORS = { 'Action Needed':'var(--bad)', 'Waiting':'var(--warn)', 'Inbox':'var(--blue)', 'Sent':'var(--ok)', 'Archive':'var(--t3)' }
const BLANK = { recipient:'', clientName:'', subject:'', body:'', triage:'Sent', status:'Sent' }

export default function Email() {
  const [emails, setEmails]     = useState([])
  const [clients, setClients]   = useState([])
  const [leads, setLeads]       = useState([])
  const [attachPickerFor, setAttachPickerFor] = useState(null) // attachmentId currently showing the manual picker
  const [attachSearch, setAttachSearch] = useState('')
  const [attachFolder, setAttachFolder] = useState('Correspondence')
  const [attaching, setAttaching] = useState(null) // attachmentId currently being attached
  const [form, setForm]         = useState(BLANK)
  const [sug, setSug]           = useState([])
  const [saving, setSaving]     = useState(false)
  const [toast, setToast]       = useState('')
  const [view, setView]         = useState('inbox') // inbox | compose | templates
  const [readLayout, setReadLayout] = useState(() => localStorage.getItem('tcr_email_layout') || 'side') // side | stacked
  const [listSize, setListSize] = useState(() => ({
    side: parseInt(localStorage.getItem('tcr_email_list_width')) || 320,
    stacked: parseInt(localStorage.getItem('tcr_email_list_height')) || 260,
  }))
  const [resizing, setResizing] = useState(false)
  const [triageFilter, setTriageFilter] = useState('Inbox')
  const [selected, setSelected] = useState(null)
  const [dragOverFolder, setDragOverFolder] = useState(null)
  const [search, setSearch]     = useState('')
  const [gmailConnected, setGmailConnected] = useState(false)
  const [gmailClientId, setGmailClientId] = useState('')
  const [signature, setSignature] = useState({ text: '', logoUrl: '' })
  const { lastSyncAt, syncing, lastError, syncNow } = useGmailSync()
  const { user } = useApp()
  // Display-only tick — re-renders the "Synced Xs ago" text once a
  // second so it doesn't look frozen between real sync updates. Purely
  // local state, no Supabase calls.
  const [, forceTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => forceTick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Multi-select for bulk archive. checkedIds = the actual selection;
  // focusIndex/anchorIndex track keyboard navigation within the currently
  // filtered list so Shift+Arrow can extend a range from wherever
  // selection started.
  const [checkedIds, setCheckedIds] = useState(() => new Set())
  const [focusIndex, setFocusIndex] = useState(-1)
  const anchorIndexRef = useRef(-1)
  const listRef = useRef(null)

  // Scroll the active email row into view when navigating with arrow keys
  useEffect(() => {
    if (focusIndex < 0 || !listRef.current) return
    const rows = listRef.current.querySelectorAll('[data-email-row]')
    const row = rows[focusIndex]
    if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focusIndex])

  useEffect(() => {
    load(); loadGmailConfig()
    const onFocus = () => loadGmailConfig()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  // Global Delete/Backspace key — archive selected email from anywhere on the page
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return
      if (!selected) return
      e.preventDefault()
      archiveEmail(selected.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  // Refresh the visible list whenever the background sync (running
  // globally, not just on this page) picks up anything new.
  useEffect(() => { if (lastSyncAt) load() }, [lastSyncAt])

  async function loadGmailConfig() {
    const { data } = await supabase.from('settings').select('gmail_client_id,gmail_refresh_token,email_signature,email_signature_logo_url').limit(1).maybeSingle()
    if (data?.gmail_client_id) setGmailClientId(data.gmail_client_id)
    if (data?.gmail_refresh_token) setGmailConnected(true)

    // Each employee has their own signature now — fall back to the firm
    // default only if they haven't set a personal one yet.
    let sigText = data?.email_signature || ''
    let sigLogo = data?.email_signature_logo_url || ''
    if (user?.email) {
      const { data: emp } = await supabase.from('employees')
        .select('email_signature,email_signature_logo_url')
        .eq('email', user.email).maybeSingle()
      if (emp?.email_signature) sigText = emp.email_signature
      if (emp?.email_signature_logo_url) sigLogo = emp.email_signature_logo_url
    }
    setSignature({ text: sigText, logoUrl: sigLogo })
  }

  async function load() {
    const [{ data: e }, { data: c }, { data: l }] = await Promise.all([
      supabase.from('emails').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('id,name,email'),
      supabase.from('leads').select('id,name,email'),
    ])
    if (e) setEmails(e)
    if (c) setClients(c)
    if (l) setLeads(l)
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3500) }

  // Match an inbound email's sender address against known clients/leads by
  // email, purely to suggest who an attachment probably belongs to —
  // attaching still always requires a click either way.
  function matchByEmail(address) {
    if (!address) return null
    const addr = address.toLowerCase()
    const c = clients.find(c => c.email && c.email.toLowerCase() === addr)
    if (c) return { ...c, _type: 'Client' }
    const l = leads.find(l => l.email && l.email.toLowerCase() === addr)
    if (l) return { ...l, _type: 'Lead' }
    return null
  }

  // Fetches an email attachment's actual bytes from Gmail and copies it
  // straight into a lead/client's Docs tab — unlike fax/SMS attachments,
  // this one re-hosts the file in our own storage since we have to fetch
  // the real bytes from Gmail anyway (no persistent public URL otherwise).
  async function attachEmailAttachmentToFile(email, att, targetName, folder) {
    if (!targetName) { showToast('Pick who this belongs to first'); return }
    setAttaching(att.attachmentId)
    try {
      const blob = await fetchGmailAttachmentBlob(supabase, {
        gmailMessageId: email.gmail_message_id, attachmentId: att.attachmentId, mimeType: att.mimeType,
      })
      const path = `docs/${targetName.replace(/\s+/g,'-')}/${Date.now()}_${att.filename}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, blob, { upsert: true, contentType: att.mimeType })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
      const { error } = await supabase.from('documents').insert([{
        name: att.filename, client: targetName, docType: folder || 'Correspondence',
        notes: `Received via email from ${email.recipient || email.clientName || 'unknown sender'} on ${email.created_at ? new Date(email.created_at).toLocaleString() : 'unknown date'}`,
        file_url: urlData.publicUrl, file_name: att.filename, file_size: att.size || null,
        created_at: new Date().toISOString(),
      }])
      if (error) throw error
      showToast(`✅ Attached to ${targetName}'s ${folder} folder`)
      setAttachPickerFor(null); setAttachSearch(''); setAttachFolder('Correspondence')
    } catch (e) {
      showToast('Error attaching: ' + e.message)
    }
    setAttaching(null)
  }
  function setLayout(l) { setReadLayout(l); localStorage.setItem('tcr_email_layout', l) }
  function startResize(e) {
    e.preventDefault()
    setResizing(true)
    const startX = e.clientX, startY = e.clientY
    const startSize = listSize[readLayout]
    function onMove(ev) {
      let next
      if (readLayout === 'side') {
        next = Math.min(600, Math.max(220, startSize + (ev.clientX - startX)))
      } else {
        next = Math.min(600, Math.max(120, startSize + (ev.clientY - startY)))
      }
      setListSize(s => ({ ...s, [readLayout]: next }))
    }
    function onUp() {
      setResizing(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      setListSize(s => {
        localStorage.setItem(readLayout === 'side' ? 'tcr_email_list_width' : 'tcr_email_list_height', s[readLayout])
        return s
      })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }
  function fld(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function searchClient(val) {
    fld('clientName', val)
    if (val.length < 2) { setSug([]); return }
    const m = clients.filter(c => c.name.toLowerCase().includes(val.toLowerCase())).slice(0, 5)
    setSug(m)
    const match = clients.find(c => c.name.toLowerCase() === val.toLowerCase())
    if (match?.email) fld('recipient', match.email)
  }

  function useTemplate(t) {
    const name = form.clientName || '{name}'
    setForm(f => ({ ...f, subject: t.subject, body: t.body.replace(/{name}/g, name) }))
    setView('compose')
  }

  async function send() {
    if (!form.clientName || !form.subject || !form.body) { showToast('Client, subject and body required'); return }
    setSaving(true)
    let status = 'Logged'
    if (gmailConnected) {
      if (!form.recipient) {
        setSaving(false); showToast('Recipient email address required to send'); return
      }
      try {
        await sendGmailEmail(supabase, { to: form.recipient, subject: form.subject, body: form.body, senderEmployeeEmail: user?.email })
        status = 'Sent'
      } catch (e) {
        setSaving(false)
        showToast('Gmail send failed: ' + e.message)
        return
      }
    }
    const { error } = await supabase.from('emails').insert([{ ...form, status, created_at: new Date().toISOString() }])
    setSaving(false)
    if (error) { showToast('Error: ' + error.message); return }

    // Auto-log to client activity history
    if (form.clientName) {
      const preview = (form.body || '').slice(0, 120).replace(/\n/g, ' ').trim()
      await supabase.from('client_notes').insert({
        clientname: form.clientName,
        text: `📧 Email Sent — "${form.subject}"\n${preview}${form.body?.length > 120 ? '…' : ''}`,
        note_type: 'Email',
        author: user?.email || 'Staff',
        created_at: new Date().toISOString(),
      })
    }

    showToast(status === 'Sent' ? '✅ Email sent via Gmail!' : '⚠️ Gmail is not connected — this was only saved as a log entry, nothing was emailed')
    setForm(BLANK); setView('inbox'); load()
  }

  async function moveTriage(id, triage) {
    if (selected?.id === id) setSelected(prev => ({ ...prev, triage }))
    setEmails(prev => prev.map(e => e.id === id ? { ...e, triage } : e))
    await supabase.from('emails').update({ triage }).eq('id', id)
    showToast(`Moved to ${triage}`)
    load()
  }

  // The trash icon archives instead of permanently deleting. Two reasons:
  // Romy asked for this directly, and it also fixes a real bug — actually
  // deleting a synced email left its gmail_message_id gone from our table,
  // so the very next Gmail sync saw it as "new" and pulled it right back
  // in. Archiving keeps the row (with its gmail_message_id) so sync never
  // re-imports it.
  async function archiveEmail(id) {
    await supabase.from('emails').update({ triage: 'Archive' }).eq('id', id)
    if (selected?.id === id) setSelected(null)
    setCheckedIds(s => { const n = new Set(s); n.delete(id); return n })
    load()
  }

  async function archiveSelected() {
    if (checkedIds.size === 0) return
    const ids = [...checkedIds]
    await supabase.from('emails').update({ triage: 'Archive' }).in('id', ids)
    if (selected && ids.includes(selected.id)) setSelected(null)
    setCheckedIds(new Set())
    showToast(`Archived ${ids.length} email${ids.length === 1 ? '' : 's'}`)
    load()
  }

  async function markRead(email) {
    if (email.is_read) return
    await supabase.from('emails').update({ is_read: true }).eq('id', email.id)
    setEmails(es => es.map(e => e.id === email.id ? { ...e, is_read: true } : e))
  }

  async function markUnread(email) {
    await supabase.from('emails').update({ is_read: false }).eq('id', email.id)
    setEmails(es => es.map(e => e.id === email.id ? { ...e, is_read: false } : e))
    if (selected?.id === email.id) setSelected(prev => ({ ...prev, is_read: false }))
    showToast('Marked as new')
  }

  function openEmail(email, index) {
    setSelected(email)
    setFocusIndex(index)
    anchorIndexRef.current = index
    setCheckedIds(new Set())
    markRead(email)
  }

  function toggleChecked(id) {
    setCheckedIds(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  // Shift+Up/Down extends a checked range from wherever the selection
  // started (anchorIndexRef) to the new focus position — same convention
  // as a file explorer. Plain Up/Down without Shift just moves which
  // single email is open for reading, clearing any multi-select.
  function onListKeyDown(e) {
    // Delete or Backspace: if emails are checked, delete all checked; else delete the open one
    if ((e.key === 'Delete' || e.key === 'Backspace') && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
      e.preventDefault()
      if (checkedIds.size > 0) { archiveSelected(); return }
      if (selected) { archiveEmail(selected.id); return }
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    if (filtered.length === 0) return
    e.preventDefault()
    const dir = e.key === 'ArrowDown' ? 1 : -1
    const next = Math.min(filtered.length - 1, Math.max(0, focusIndex + dir))

    if (e.shiftKey) {
      if (anchorIndexRef.current === -1) anchorIndexRef.current = focusIndex === -1 ? 0 : focusIndex
      const lo = Math.min(anchorIndexRef.current, next)
      const hi = Math.max(anchorIndexRef.current, next)
      setCheckedIds(new Set(filtered.slice(lo, hi + 1).map(e => e.id)))
      setFocusIndex(next)
    } else {
      openEmail(filtered[next], next)
    }
  }

  const filtered = emails.filter(e => {
    const t = e.triage || 'Inbox'
    if (triageFilter !== t) return false
    if (search && !e.subject?.toLowerCase().includes(search.toLowerCase()) && !e.clientName?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Badge counts reflect UNREAD mail in each folder (standard inbox
  // behavior) — this is what makes the Inbox number actually go down as
  // things get read, instead of just showing a static total forever.
  const counts = {}
  TRIAGE.forEach(t => { counts[t] = emails.filter(e => (e.triage || 'Inbox') === t && !e.is_read).length })

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 52px)', margin: '-16px', overflow: 'hidden', background: 'var(--bg)', position: 'relative' }}>
      {toast && <div className="toast show">{toast}</div>}

      {/* ── Left sidebar ── */}
      <div className="email-sidebar" style={{ width: 220, flexShrink: 0, background: 'var(--nav)', borderRight: '1px solid var(--br)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 14px 10px' }}>
          <button className="btn pri" style={{ width: '100%', justifyContent: 'center', fontWeight: 700 }} onClick={() => { setForm(BLANK); setView('compose') }}>
            ✏️ Compose
          </button>
        </div>

        {/* Gmail connect banner */}
        {gmailConnected ? (
          <div style={{ margin: '0 10px 10px', padding: '8px 12px', background: 'rgba(34,197,94,.12)', borderRadius: 8, border: '1px solid rgba(34,197,94,.3)', fontSize: 11, fontWeight: 700, color: 'var(--ok)' }}>
            ✅ Gmail Connected
            <div style={{ marginTop: 4, fontSize: 10, fontWeight: 400, color: 'var(--t3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <span>
                {syncing ? '🔄 Syncing…' : lastSyncAt ? `Synced ${Math.max(0, Math.round((Date.now() - lastSyncAt.getTime()) / 1000))}s ago` : 'Starting sync…'}
              </span>
              <span onClick={syncNow} style={{ cursor: 'pointer', textDecoration: 'underline' }}>Sync now</span>
            </div>
            {lastError && <div style={{ marginTop: 4, fontSize: 10, color: 'var(--bad)' }}>⚠️ {lastError}</div>}
          </div>
        ) : !gmailConnected && (
          <div style={{ margin: '0 10px 10px', padding: '10px 12px', background: 'rgba(26,127,212,.12)', borderRadius: 8, border: '1px solid rgba(26,127,212,.3)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', marginBottom: 4 }}>📧 Connect Gmail</div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 8, lineHeight: 1.5 }}>Link your Gmail account to send & receive emails directly.</div>
            {gmailClientId ? (
              <button onClick={() => {
                const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${gmailClientId}&redirect_uri=${encodeURIComponent(window.location.origin + '/taxcasereview-CRM/auth/callback')}&response_type=code&scope=https://mail.google.com/&access_type=offline&prompt=consent`
                window.open(url, '_blank')
                showToast('Complete authorization in the popup window')
              }} style={{ width: '100%', padding: '5px 0', borderRadius: 6, border: 'none', background: 'var(--blue)', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                🔗 Connect Gmail
              </button>
            ) : (
              <button onClick={() => showToast('Go to Settings → Integrations to add your Gmail Client ID first')} style={{ width: '100%', padding: '5px 0', borderRadius: 6, border: '1px solid var(--br)', background: 'var(--s2)', color: 'var(--t3)', cursor: 'pointer', fontSize: 11 }}>
                ⚙️ Setup in Settings
              </button>
            )}
          </div>
        )}

        {/* Triage folders */}
        <div style={{ padding: '4px 0' }}>
          <div style={{ padding: '6px 14px 4px', fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Triage</div>
          {TRIAGE.map(t => (
            <div key={t}
              onClick={() => { setTriageFilter(t); setView('inbox'); setSelected(null); setCheckedIds(new Set()); setFocusIndex(-1); anchorIndexRef.current = -1 }}
              onDragOver={ev => { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; setDragOverFolder(t) }}
              onDragLeave={() => setDragOverFolder(null)}
              onDrop={ev => {
                ev.preventDefault()
                const id = ev.dataTransfer.getData('emailId')
                if (id) moveTriage(id, t)
                setDragOverFolder(null)
              }}
              style={{
                padding: '7px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: dragOverFolder === t ? (TRIAGE_COLORS[t] + '22') : triageFilter === t && view === 'inbox' ? 'rgba(26,127,212,.18)' : 'transparent',
                borderLeft: dragOverFolder === t ? `3px solid ${TRIAGE_COLORS[t] || 'var(--blue)'}` : triageFilter === t && view === 'inbox' ? '3px solid var(--blue)' : '3px solid transparent',
                borderRadius: 0, transition: 'all .1s',
                outline: dragOverFolder === t ? `1px dashed ${TRIAGE_COLORS[t] || 'var(--blue)'}` : 'none',
              }}>
              <span style={{ fontSize: 13, color: triageFilter === t && view === 'inbox' ? 'var(--blue)' : 'var(--t2)', fontWeight: triageFilter === t ? 700 : 400 }}>
                {t === 'Action Needed' ? '🔴' : t === 'Waiting' ? '🟡' : t === 'Inbox' ? '📥' : t === 'Sent' ? '📤' : '📦'} {t}
              </span>
              {counts[t] > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: TRIAGE_COLORS[t] + '33', color: TRIAGE_COLORS[t] }}>{counts[t]}</span>
              )}
            </div>
          ))}
        </div>

        <div style={{ height: 1, background: 'var(--br)', margin: '8px 0' }} />

        {/* Templates shortcut */}
        <div onClick={() => setView('templates')} style={{
          padding: '7px 14px', cursor: 'pointer', fontSize: 13, color: 'var(--t2)',
          borderLeft: view === 'templates' ? '3px solid var(--blue)' : '3px solid transparent',
          background: view === 'templates' ? 'rgba(26,127,212,.18)' : 'transparent',
        }}>
          📋 Templates ({TEMPLATES.length})
        </div>
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Email list */}
        {view === 'inbox' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: readLayout === 'side' ? 'row' : 'column', overflow: 'hidden' }}>
            <div style={{
              width: readLayout === 'side' ? listSize.side : '100%',
              height: readLayout === 'side' ? '100%' : listSize.stacked,
              flexShrink: 0,
              borderRight: readLayout === 'side' ? '1px solid var(--br)' : 'none',
              borderBottom: readLayout === 'stacked' ? '1px solid var(--br)' : 'none',
              display: 'flex', flexDirection: 'column', background: 'var(--sf)'
            }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--br)', display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  title="Select all"
                  checked={filtered.length > 0 && filtered.every(e => checkedIds.has(e.id))}
                  ref={el => { if (el) el.indeterminate = checkedIds.size > 0 && !filtered.every(e => checkedIds.has(e.id)) }}
                  onChange={e => {
                    if (e.target.checked) {
                      setCheckedIds(new Set(filtered.map(e => e.id)))
                    } else {
                      setCheckedIds(new Set()); anchorIndexRef.current = -1
                    }
                  }}
                  style={{ cursor: 'pointer', flexShrink: 0, width: 15, height: 15 }}
                />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search emails…"
                  style={{ flex: 1, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--br)', background: 'var(--s2)', color: 'var(--tx)', fontSize: 13 }} />
                <div style={{ display: 'flex', border: '1px solid var(--br)', borderRadius: 7, overflow: 'hidden', flexShrink: 0 }}>
                  <button title="Side-by-side" onClick={() => setLayout('side')} style={{ padding: '6px 9px', background: readLayout === 'side' ? 'rgba(26,127,212,.18)' : 'transparent', color: readLayout === 'side' ? 'var(--blue)' : 'var(--t3)', border: 'none', cursor: 'pointer', fontSize: 13 }}>▥</button>
                  <button title="Top and bottom" onClick={() => setLayout('stacked')} style={{ padding: '6px 9px', background: readLayout === 'stacked' ? 'rgba(26,127,212,.18)' : 'transparent', color: readLayout === 'stacked' ? 'var(--blue)' : 'var(--t3)', border: 'none', cursor: 'pointer', fontSize: 13 }}>▤</button>
                </div>
              </div>

              {/* Bulk action bar — appears once anything is checked */}
              {checkedIds.size > 0 && (
                <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--br)', background: 'rgba(26,127,212,.12)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)' }}>{checkedIds.size} email{checkedIds.size !== 1 ? 's' : ''} selected</span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                      defaultValue=""
                      onChange={async e => {
                        const folder = e.target.value
                        if (!folder) return
                        e.target.value = ''
                        const ids = [...checkedIds]
                        await supabase.from('emails').update({ triage: folder }).in('id', ids)
                        if (selected && ids.includes(selected.id)) setSelected(null)
                        setCheckedIds(new Set()); anchorIndexRef.current = -1
                        showToast(`Moved ${ids.length} to ${folder}`)
                        load()
                      }}
                      style={{ fontSize: 11, padding: '4px 8px', background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 6, color: 'var(--tx)', cursor: 'pointer' }}>
                      <option value="">Move to…</option>
                      {TRIAGE.filter(t => t !== triageFilter).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button className="btn sec" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { setCheckedIds(new Set()); anchorIndexRef.current = -1 }}>Clear</button>
                    <button className="btn del" style={{ fontSize: 11, padding: '4px 12px', fontWeight: 700 }} onClick={archiveSelected}>🗑 Delete Selected</button>
                  </div>
                </div>
              )}

              <div
                ref={listRef}
                tabIndex={0}
                onKeyDown={onListKeyDown}
                style={{ flex: 1, overflow: 'auto', outline: 'none' }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: 30, textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>No emails in {triageFilter}</div>
                ) : filtered.map((e, i) => {
                  let isDragging = false
                  return (
                  <div key={e.id}
                    data-email-row
                    onClick={() => { if (!isDragging) openEmail(e, i) }}
                    draggable
                    onDragStart={ev => { isDragging = true; ev.dataTransfer.setData('emailId', e.id); ev.dataTransfer.effectAllowed = 'move' }}
                    onDragEnd={() => { setTimeout(() => { isDragging = false }, 100) }}
                    style={{
                    padding: '12px 14px', borderBottom: '1px solid var(--br)', cursor: 'grab',
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    background: checkedIds.has(e.id) ? 'rgba(26,127,212,.10)' : selected?.id === e.id ? 'rgba(26,127,212,.14)' : 'transparent',
                    borderLeft: selected?.id === e.id ? '3px solid var(--blue)' : '3px solid transparent',
                  }}>
                    <input
                      type="checkbox"
                      checked={checkedIds.has(e.id)}
                      onClick={ev => ev.stopPropagation()}
                      onChange={() => { toggleChecked(e.id); anchorIndexRef.current = i; setFocusIndex(i) }}
                      style={{ marginTop: 3, flexShrink: 0, cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
                        <div style={{ fontWeight: e.is_read ? 600 : 800, fontSize: 13, color: 'var(--tx)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {!e.is_read && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--blue)', flexShrink: 0 }} />}
                          {e.clientName || e.recipient || 'Unknown'}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--t3)', flexShrink: 0, marginLeft: 8 }}>
                          {e.created_at ? new Date(e.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: e.is_read ? 600 : 800, color: 'var(--t2)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
                        {e.subject}
                        {e.attachments?.length > 0 && <span title={`${e.attachments.length} attachment(s)`} style={{ flexShrink: 0 }}>📎</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.body?.slice(0, 80)}</div>
                    </div>
                  </div>
                  )
                })}
              </div>
            </div>

            {/* Drag handle to resize the list pane */}
            <div
              onMouseDown={startResize}
              style={{
                cursor: readLayout === 'side' ? 'col-resize' : 'row-resize',
                width: readLayout === 'side' ? 5 : '100%',
                height: readLayout === 'side' ? '100%' : 5,
                flexShrink: 0,
                background: resizing ? 'var(--blue)' : 'transparent',
              }}
            />

            {/* Email detail */}
            <div style={{ flex: 1, overflow: 'auto', padding: 24, background: 'var(--bg)' }}>
              {selected ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--tx)', marginBottom: 6 }}>{selected.subject}</div>
                      <div style={{ fontSize: 13, color: 'var(--t3)' }}>To: {selected.clientName} {selected.recipient ? `<${selected.recipient}>` : ''}</div>
                      <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>{selected.created_at ? new Date(selected.created_at).toLocaleString() : ''}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      {/* Move triage */}
                      {TRIAGE.filter(t => t !== (selected.triage || 'Inbox') && t !== 'Sent').map(t => (
                        <button key={t} className="btn sec" style={{ fontSize: 12, padding: '6px 14px', fontWeight: 600 }} onClick={() => moveTriage(selected.id, t)}>→ {t}</button>
                      ))}
                      <button className="btn" style={{ fontSize: 12, padding: '6px 14px', fontWeight: 600 }} onClick={() => { setForm({ ...BLANK, clientName: selected.clientName, recipient: selected.recipient, subject: 'Re: ' + selected.subject }); setView('compose') }}>↩ Reply</button>
                      <button className="btn" style={{ fontSize: 12, padding: '6px 14px', fontWeight: 600, background: 'var(--blue)', color: '#fff', border: 'none' }} onClick={() => markUnread(selected)}>● Mark as New</button>
                      <button className="btn del" style={{ fontSize: 12, padding: '6px 14px', fontWeight: 600 }} onClick={() => archiveEmail(selected.id)}>🗑 Archive</button>
                    </div>
                  </div>
                  {selected.body_html ? (
                    <SafeHtmlEmail html={selected.body_html} />
                  ) : (
                    <div style={{ background: 'var(--sf)', border: '1px solid var(--br)', borderRadius: 10, padding: 20, fontSize: 14, lineHeight: 1.8, color: 'var(--tx)', whiteSpace: 'pre-wrap' }}>
                      {selected.body}
                    </div>
                  )}
                  {selected.attachments?.length > 0 && (() => {
                    const match = matchByEmail(selected.from_address || selected.recipient)
                    return (
                    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {selected.attachments.map((att, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button className="btn sec" style={{ fontSize: 12, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
                              onClick={async () => {
                                try {
                                  await downloadGmailAttachment(supabase, {
                                    gmailMessageId: selected.gmail_message_id, attachmentId: att.attachmentId,
                                    filename: att.filename, mimeType: att.mimeType,
                                  })
                                } catch (e) { showToast('Could not download: ' + e.message) }
                              }}>
                              📎 {att.filename} {att.size ? `(${Math.round(att.size / 1024)}KB)` : ''}
                            </button>
                            <button className="btn sec" style={{ fontSize: 11, padding: '5px 10px' }}
                              onClick={() => { setAttachPickerFor(attachPickerFor === att.attachmentId ? null : att.attachmentId); setAttachSearch(''); setAttachFolder('Correspondence') }}>
                              📁 {match ? `Attach to ${match.name}'s file` : 'Attach to file'}
                            </button>
                          </div>
                        ))}
                      </div>
                      {selected.attachments.map((att, i) => attachPickerFor === att.attachmentId && (
                        <div key={'picker-'+i} style={{ background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 360 }}>
                          {match ? (
                            <div style={{ fontSize: 13, fontWeight: 600 }}>Attaching to: {match.name} <span style={{ color: 'var(--t3)', fontWeight: 400, fontSize: 11 }}>({match._type}, matched by email)</span></div>
                          ) : (
                            <>
                              <input autoFocus placeholder="Search client or lead name…" value={attachSearch}
                                onChange={e => setAttachSearch(e.target.value)}
                                style={{ fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--br)', background: 'var(--bg)', color: 'var(--tx)' }}/>
                              {attachSearch.length >= 2 && [...clients.map(c=>({...c,_type:'Client'})), ...leads.map(l=>({...l,_type:'Lead'}))]
                                .filter(p => p.name.toLowerCase().includes(attachSearch.toLowerCase())).slice(0, 6)
                                .map(p => (
                                  <div key={p._type+p.id} onClick={() => setAttachSearch(p.name)}
                                    style={{ fontSize: 13, padding: '6px 10px', cursor: 'pointer', borderRadius: 6, background: attachSearch===p.name?'var(--br)':'transparent' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--br)'}
                                    onMouseLeave={e => e.currentTarget.style.background = attachSearch===p.name?'var(--br)':''}>
                                    {p.name} <span style={{ color: 'var(--t3)', fontSize: 11 }}>({p._type})</span>
                                  </div>
                              ))}
                            </>
                          )}
                          <div className="field"><label style={{fontSize:11}}>Folder</label>
                            <select value={attachFolder} onChange={e=>setAttachFolder(e.target.value)} style={{fontSize:13,padding:'6px 10px'}}>
                              {DOC_FOLDERS.map(f=><option key={f}>{f}</option>)}
                            </select>
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn pri" style={{ fontSize: 12, padding: '5px 12px' }} disabled={attaching === att.attachmentId || (!match && !attachSearch)}
                              onClick={() => attachEmailAttachmentToFile(selected, att, match ? match.name : attachSearch, attachFolder)}>
                              Confirm Attach
                            </button>
                            <button className="btn sec" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => { setAttachPickerFor(null); setAttachSearch(''); setAttachFolder('Correspondence') }}>Cancel</button>
                          </div>
                        </div>
                      ))}
                    </div>
                    )
                  })()}
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--t3)' }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>📧</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--tx)', marginBottom: 6 }}>Select an email to read</div>
                  <div style={{ fontSize: 13 }}>Or compose a new one</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Compose */}
        {view === 'compose' && (
          <div style={{ flex: 1, overflow: 'auto', padding: 32, maxWidth: 700 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <button className="btn" onClick={() => setView('inbox')}>← Back</button>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--tx)' }}>New Email</div>
            </div>

            <div className="field" style={{ position: 'relative' }}>
              <label>Client Name *</label>
              <input value={form.clientName} onChange={e => searchClient(e.target.value)} placeholder="Search client…" autoComplete="off" onBlur={() => setTimeout(() => setSug([]), 150)} />
              {sug.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--s3)', border: '1px solid var(--br)', borderRadius: 7, zIndex: 100 }}>
                  {sug.map(c => <div key={c.id} onClick={() => { fld('clientName', c.name); if (c.email) fld('recipient', c.email); setSug([]) }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13 }}>{c.name} {c.email ? `— ${c.email}` : ''}</div>)}
                </div>
              )}
            </div>
            <div className="field"><label>To (email address)</label>
              <input type="email" value={form.recipient} onChange={e => fld('recipient', e.target.value)} placeholder="client@email.com" />
            </div>
            <div className="field"><label>Subject *</label>
              <input value={form.subject} onChange={e => fld('subject', e.target.value)} placeholder="Email subject…" />
            </div>

            {/* Quick templates */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Quick Templates</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TEMPLATES.map(t => (
                  <button key={t.label} className="btn sec" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => useTemplate(t)}>{t.label}</button>
                ))}
              </div>
            </div>

            <div className="field"><label>Body *</label>
              <textarea value={form.body} onChange={e => fld('body', e.target.value)} rows={14} style={{ minHeight: 280, fontFamily: 'inherit', lineHeight: 1.7 }} placeholder="Email body…" />
            </div>

            {/* Signature preview — not part of the editable body, appended automatically on send */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ margin: 0 }}>Signature</label>
                <a href="/taxcasereview-CRM/settings" style={{ fontSize: 11, color: 'var(--blue)' }}>Edit in Settings →</a>
              </div>
              {signature.text || signature.logoUrl ? (
                <div style={{ background: 'var(--s2)', border: '1px dashed var(--br)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>Automatically added when sent</div>
                  {signature.logoUrl && <img src={signature.logoUrl} alt="" style={{ maxHeight: 50, maxWidth: 220, display: 'block', marginBottom: 8 }} />}
                  {signature.text && <div style={{ fontSize: 13, color: 'var(--t2)', whiteSpace: 'pre-wrap', fontFamily: 'Arial, sans-serif' }}>{signature.text}</div>}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--t3)', padding: '10px 14px', background: 'var(--s2)', borderRadius: 8 }}>
                  No signature set yet — <a href="/taxcasereview-CRM/settings" style={{ color: 'var(--blue)' }}>add one in Settings</a> and it'll be appended to every email sent through Gmail.
                </div>
              )}
            </div>
            <div className="field"><label>Triage</label>
              <select value={form.triage} onChange={e => fld('triage', e.target.value)}>
                {TRIAGE.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" onClick={() => setView('inbox')}>Cancel</button>
              <button className="btn pri" style={{ flex: 1, justifyContent: 'center', padding: 12 }} onClick={send} disabled={saving}>
                {saving ? 'Saving…' : '📤 Log Email'}
              </button>
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--t3)', textAlign: 'center' }}>
              Connect Gmail in the sidebar to send directly. Until then, emails are logged for tracking.
            </div>
          </div>
        )}

        {/* Templates library */}
        {view === 'templates' && (
          <div style={{ flex: 1, overflow: 'auto', padding: 32 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--tx)', marginBottom: 20 }}>📋 Email Templates</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
              {TEMPLATES.map(t => (
                <div key={t.label} className="card" style={{ padding: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--tx)', marginBottom: 4 }}>{t.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--blue)', marginBottom: 10 }}>{t.subject}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'hidden' }}>{t.body}</div>
                  <button className="btn pri" style={{ marginTop: 14, width: '100%', justifyContent: 'center', fontSize: 12 }} onClick={() => useTemplate(t)}>
                    Use Template
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Renders a full HTML email body inside a sandboxed iframe. sandbox=
// "allow-same-origin" (deliberately WITHOUT "allow-scripts") means no
// <script> tag or inline event handler in the email can ever execute —
// that's what actually blocks XSS — while still letting this component
// read the iframe's rendered height to auto-size it. allow-same-origin
// alone is inert without allow-scripts; there's no script context to
// exploit it with. Safe even for HTML from senders we don't control.
function SafeHtmlEmail({ html }) {
  const ref = useRef(null)
  const [height, setHeight] = useState(200)

  // Force every link to open in a real new tab instead of trying to
  // navigate the sandboxed iframe itself (which the sandbox blocks).
  const docWithBaseTarget = `<base target="_blank">${html || ''}`

  function resize() {
    const doc = ref.current?.contentDocument
    if (doc?.body) setHeight(doc.body.scrollHeight + 24)
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--br)', borderRadius: 10, overflow: 'hidden' }}>
      <iframe
        ref={ref}
        srcDoc={docWithBaseTarget}
        // allow-same-origin: needed to read scrollHeight for auto-resize
        // allow-popups + allow-popups-to-escape-sandbox: required for link
        // clicks to actually open — without these, clicking any link inside
        // a sandboxed iframe is silently swallowed by the browser.
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        onLoad={resize}
        title="Email content"
        style={{ width: '100%', height, border: 'none', display: 'block' }}
      />
    </div>
  )
}
