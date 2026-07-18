import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { sendGmailEmail } from '../lib/gmailUtils'

// ── Quick Email (click-to-email from a lead/client record) ──
// Sends from the logged-in rep's connected Gmail (their signature); falls
// back to the firm-wide account if they haven't connected one. Every send is
// documented: a row in the emails table (rep's Sent box) and a 📧 note on
// the lead/client file — same shapes the Email page writes.

export default function QuickEmail({ contact, kind, leadId, onSent, onClose }) {
  const { user } = useApp()
  const [form, setForm] = useState({ to: contact?.email || '', subject: '', body: '' })
  const [state, setState] = useState('idle') // idle | sending | sent | error
  const [errMsg, setErrMsg] = useState('')

  async function send() {
    if (!form.to.trim() || !form.subject.trim() || !form.body.trim()) { setErrMsg('To, subject, and message are all required.'); setState('error'); return }
    setState('sending'); setErrMsg('')
    let sentVia = null
    try {
      await sendGmailEmail(supabase, { to: form.to.trim(), subject: form.subject, body: form.body, senderEmployeeEmail: user?.email })
      sentVia = 'personal'
    } catch {
      try {
        await sendGmailEmail(supabase, { to: form.to.trim(), subject: form.subject, body: form.body })
        sentVia = 'firm'
      } catch (e2) {
        setState('error'); setErrMsg('Send failed: ' + e2.message + ' — connect Gmail on the Email page, or check the firm account in Settings.')
        return
      }
    }

    // ── Document everything (best-effort; the email already went out) ──
    let authorName = user?.email || 'Staff'
    try {
      const { data: empRec } = await supabase.from('employees').select('name').eq('email', user?.email).maybeSingle()
      if (empRec?.name) authorName = empRec.name
    } catch { /* noop */ }
    const preview = form.body.slice(0, 120).replace(/\n/g, ' ').trim()
    const noteText = `📧 Email Sent — "${form.subject}"\n${preview}${form.body.length > 120 ? '…' : ''}`
    try {
      await supabase.from('emails').insert([{
        recipient: form.to.trim(), clientName: contact?.name || '', subject: form.subject, body: form.body,
        triage: 'Sent', status: 'Sent', mailbox_owner: user?.email || null, created_at: new Date().toISOString(),
      }])
    } catch { /* noop */ }
    try {
      if (kind === 'lead' && leadId) {
        await supabase.from('lead_notes').insert({ lead_id: leadId, lead_name: contact?.name || '', text: noteText, type: 'Email', author: authorName, created_at: new Date().toISOString() })
      } else if (contact?.name) {
        await supabase.from('client_notes').insert({ clientname: contact.name, text: noteText, note_type: 'Email', author: authorName, created_at: new Date().toISOString() })
      }
    } catch { /* noop */ }

    setState('sent')
    if (onSent) onSent(sentVia)
  }

  const label = { display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 5 }
  const input = { width: '100%', boxSizing: 'border-box', background: 'rgba(15,23,42,0.55)', border: '1px solid var(--line)', borderRadius: 8, color: 'inherit', padding: '10px 12px', fontSize: 13.5, outline: 'none', fontFamily: 'inherit' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--s2)', border: '1px solid var(--line)', borderRadius: 14, width: 'min(560px, 96vw)', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
        <div style={{ background: 'linear-gradient(135deg, #1d4ed8, #2563eb 60%, #3b82f6)', padding: '16px 20px', borderRadius: '13px 13px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#fff' }}>✉️ Email {contact?.name || ''}</div>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11.5, marginTop: 2 }}>Sends from your Gmail · logged to the file automatically</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', width: 28, height: 28, fontSize: 13, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: 20 }}>
          {state === 'sent' ? (
            <div style={{ textAlign: 'center', padding: '10px 0 4px' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, margin: '0 auto' }}>📨</div>
              <div style={{ fontWeight: 800, fontSize: 17, marginTop: 12 }}>Sent</div>
              <div style={{ color: 'var(--t3)', fontSize: 12.5, marginTop: 8 }}>Delivered to {form.to} and logged on the file with a 📧 note.</div>
              <button onClick={onClose} style={{ marginTop: 16, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 28px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Done</button>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <label style={label}>To</label>
                  <input style={input} type="email" value={form.to} onChange={e => setForm(f => ({ ...f, to: e.target.value }))} />
                </div>
                <div>
                  <label style={label}>Subject</label>
                  <input style={input} value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} autoFocus />
                </div>
                <div>
                  <label style={label}>Message</label>
                  <textarea style={{ ...input, resize: 'vertical', minHeight: 140 }} rows={7} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} placeholder="Your signature is added automatically." />
                </div>
              </div>
              {state === 'error' && (
                <div style={{ color: '#fca5a5', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, marginTop: 12 }}>{errMsg}</div>
              )}
              <button disabled={state === 'sending'} onClick={send}
                style={{ width: '100%', marginTop: 14, border: 'none', borderRadius: 10, padding: '13px 0', fontSize: 14.5, fontWeight: 800, cursor: state === 'sending' ? 'wait' : 'pointer', background: state === 'sending' ? 'rgba(37,99,235,0.35)' : 'linear-gradient(135deg, #1d4ed8, #2563eb)', color: '#fff' }}>
                {state === 'sending' ? 'Sending…' : '📨 Send Email'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
