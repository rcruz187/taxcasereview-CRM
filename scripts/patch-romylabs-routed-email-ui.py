from pathlib import Path

p = Path('src/pages/Email.jsx')
s = p.read_text()


def replace_once(old, new, label):
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    s = s.replace(old, new, 1)

replace_once(
"const BLANK = { recipient:'', clientName:'', subject:'', body:'', triage:'Sent', status:'Sent' }",
"const BLANK = { recipient:'', clientName:'', subject:'', body:'', triage:'Sent', status:'Sent', routeId:'', replyFrom:'', threadId:'', inReplyTo:'', references:'', productId:'' }",
'BLANK route metadata')

replace_once(
"  const isDemoMailbox = user?.email?.toLowerCase() === 'demo@taxrescrm.net'\n  const DEMO_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'",
"  const userEmailLower = user?.email?.toLowerCase() || ''\n  const isDemoMailbox = userEmailLower === 'demo@taxrescrm.net'\n  const isRomyLabsMailboxAdmin = ['info@romylabs.com','romy@romylabs.com'].includes(userEmailLower)\n  const centralMailboxOwner = isRomyLabsMailboxAdmin ? 'info@romylabs.com' : (user?.email || '')\n  const DEMO_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'",
'central mailbox identity')

replace_once(
"    const owner = user.email\n    const channel = supabase",
"    const owner = centralMailboxOwner || user.email\n    const channel = supabase",
'realtime central owner')

replace_once(
"      supabase.from('emails').select('*').eq('mailbox_owner', user.email).is('deleted_at', null).order('created_at', { ascending: false }).limit(300),",
"      supabase.from('emails').select('*').eq('mailbox_owner', centralMailboxOwner || user.email).is('deleted_at', null).order('created_at', { ascending: false }).limit(300),",
'load central owner')

old_send = '''  async function send() {
    if (!form.clientName || !form.subject || !form.body) { showToast('Client, subject and body required'); return }
    setSaving(true)
    let status = 'Logged'
    if (gmailConnected) {
      if (!form.recipient) {
        setSaving(false); showToast('Recipient email address required to send'); return
      }
      if (isDemoMailbox) {
        // Demo-safe send: write the message into the sandbox Sent folder but
        // never deliver it outside TaxRes CRM.
        status = 'Sent'
      } else {
        try {
          await sendGmailEmail(supabase, { to: form.recipient, subject: form.subject, body: form.body, senderEmployeeEmail: user?.email })
          status = 'Sent'
        } catch (e) {
          setSaving(false)
          showToast('Gmail send failed: ' + e.message)
          return
        }
      }
    }
    const emailRow = { ...form, status, created_at: new Date().toISOString(), mailbox_owner: user?.email || null }
    if (isDemoMailbox) {
      emailRow.tenant_id = DEMO_TENANT_ID
      emailRow.from_address = 'demo@taxrescrm.net'
      emailRow.direction = 'outbound'
      emailRow.received_at = emailRow.created_at
      emailRow.is_read = true
    }
    const { error } = await supabase.from('emails').insert([emailRow])
    setSaving(false)
    if (error) { showToast('Error: ' + error.message); return }
'''

new_send = '''  async function send() {
    if (!form.clientName || !form.subject || !form.body) { showToast('Client, subject and body required'); return }
    if (!form.recipient) { showToast('Recipient email address required to send'); return }
    setSaving(true)
    let status = 'Logged'
    let alreadyStored = false

    // Routed RomyLabs replies are never allowed to fall through to Gmail.
    // The backend resolves routeId to the exact original receiving mailbox
    // and refuses to send if that SMTP identity is not configured.
    if (form.routeId) {
      try {
        const refs = [form.references, form.inReplyTo].filter(Boolean).join(' ').trim()
        const { data, error } = await supabase.functions.invoke('smtp-send', {
          body: {
            route_id: form.routeId,
            to: form.recipient,
            subject: form.subject,
            text_body: form.body,
            from_name: form.replyFrom ? form.replyFrom.split('@')[0] : undefined,
            in_reply_to: form.inReplyTo || undefined,
            references: refs || undefined,
            thread_id: form.threadId || undefined,
          },
        })
        if (error) throw error
        if (!data?.ok) throw new Error(data?.error || 'Routed SMTP send failed')
        status = 'Sent'
        alreadyStored = true
      } catch (e) {
        setSaving(false)
        showToast('Reply not sent: ' + (e?.message || e))
        return
      }
    } else if (gmailConnected) {
      if (isDemoMailbox) {
        // Demo-safe send: write the message into the sandbox Sent folder but
        // never deliver it outside TaxRes CRM.
        status = 'Sent'
      } else {
        try {
          await sendGmailEmail(supabase, { to: form.recipient, subject: form.subject, body: form.body, senderEmployeeEmail: user?.email })
          status = 'Sent'
        } catch (e) {
          setSaving(false)
          showToast('Gmail send failed: ' + e.message)
          return
        }
      }
    }

    if (!alreadyStored) {
      const { routeId, replyFrom, threadId, inReplyTo, references, productId, ...loggableForm } = form
      const emailRow = { ...loggableForm, status, created_at: new Date().toISOString(), mailbox_owner: centralMailboxOwner || user?.email || null }
      if (isDemoMailbox) {
        emailRow.tenant_id = DEMO_TENANT_ID
        emailRow.from_address = 'demo@taxrescrm.net'
        emailRow.direction = 'outbound'
        emailRow.received_at = emailRow.created_at
        emailRow.is_read = true
      }
      const { error } = await supabase.from('emails').insert([emailRow])
      if (error) { setSaving(false); showToast('Error: ' + error.message); return }
    }
    setSaving(false)
'''
replace_once(old_send, new_send, 'send function')

replace_once(
"    showToast(isDemoMailbox && status === 'Sent' ? '✅ Demo email sent — sandbox only' : status === 'Sent' ? '✅ Email sent via Gmail!' : '⚠️ Gmail is not connected — this was only saved as a log entry, nothing was emailed')",
"    showToast(form.routeId && status === 'Sent' ? `✅ Reply sent from ${form.replyFrom}` : isDemoMailbox && status === 'Sent' ? '✅ Demo email sent — sandbox only' : status === 'Sent' ? '✅ Email sent via Gmail!' : '⚠️ Gmail is not connected — this was only saved as a log entry, nothing was emailed')",
'toast routed reply')

old_reply = "<button className=\"btn\" style={{ fontSize: 12, padding: '6px 14px', fontWeight: 600 }} onClick={() => { setForm({ ...BLANK, clientName: selected.clientName, recipient: selected.recipient, subject: 'Re: ' + selected.subject }); setView('compose') }}>↩ Reply</button>"
new_reply = "<button className=\"btn\" style={{ fontSize: 12, padding: '6px 14px', fontWeight: 600 }} onClick={() => { const replyRecipient = selected.from_address || selected.sender || selected.recipient; const replySubject = String(selected.subject || '').toLowerCase().startsWith('re:') ? selected.subject : 'Re: ' + (selected.subject || ''); setForm({ ...BLANK, clientName: selected.clientName || selected.clientname || replyRecipient, recipient: replyRecipient || '', subject: replySubject, routeId: selected.route_id || '', replyFrom: selected.reply_from || selected.received_mailbox || '', threadId: selected.thread_id || '', inReplyTo: selected.message_id || '', references: selected.references_header || '', productId: selected.product_id || '' }); setView('compose') }}>↩ Reply</button>"
replace_once(old_reply, new_reply, 'reply button')

replace_once(
'''            <div className="field"><label>To (email address)</label>
              <input type="email" value={form.recipient} onChange={e => fld('recipient', e.target.value)} placeholder="client@email.com" />
            </div>
            <div className="field"><label>Subject *</label>''',
'''            {form.routeId && form.replyFrom && (
              <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.25)' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>Reply identity</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ok)' }}>From: {form.replyFrom}</div>
                <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 3 }}>Locked to the mailbox that received this conversation.</div>
              </div>
            )}
            <div className="field"><label>To (email address)</label>
              <input type="email" value={form.recipient} onChange={e => fld('recipient', e.target.value)} placeholder="client@email.com" />
            </div>
            <div className="field"><label>Subject *</label>''',
'compose routed identity banner')

# Show the receiving identity when reading routed inbound mail.
replace_once(
"                      <div style={{ fontSize: 13, color: 'var(--t3)' }}>To: {selected.clientName} {selected.recipient ? `<${selected.recipient}>` : ''}</div>",
"                      <div style={{ fontSize: 13, color: 'var(--t3)' }}>From: {selected.clientName || selected.clientname || selected.from_address || selected.sender || 'Unknown'} {selected.from_address ? `<${selected.from_address}>` : ''}</div>\n                      {selected.received_mailbox && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>Received by: <strong style={{ color:'var(--blue)' }}>{selected.received_mailbox}</strong>{selected.assigned_to ? ` · Assigned to ${selected.assigned_to}` : ' · Unassigned'}</div>}",
'read routed identity')

p.write_text(s)
print('Patched RomyLabs routed email UI')
