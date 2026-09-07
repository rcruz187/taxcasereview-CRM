from pathlib import Path

p = Path('supabase/functions/gmail-sync-cron/index.ts')
s = p.read_text()

old = '''  const succeeded: any[] = [], failures: any[] = []
  for (const row of owned) {
    try {
      if (row.gmail_message_id) {
        const id = encodeURIComponent(row.gmail_message_id)
        let endpoint = `${GMAIL}/${id}/modify`
        let body: any = null
        if (action === 'archive') body = { removeLabelIds: ['INBOX'] }
        else if (action === 'inbox') body = { addLabelIds: ['INBOX'] }
        else if (action === 'read') body = { removeLabelIds: ['UNREAD'] }
        else if (action === 'unread') body = { addLabelIds: ['UNREAD'] }
        else endpoint = `${GMAIL}/${id}/trash`
        const res = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error?.message || `Gmail ${action} failed (${res.status})`)
      }
      const patch: any = action === 'trash' ? { deleted_at: new Date().toISOString(), triage: 'Archive' }
        : action === 'archive' ? { triage: 'Archive' }
        : action === 'inbox' ? { triage: 'Inbox', deleted_at: null }
        : action === 'read' ? { is_read: true } : { is_read: false }
      const { error: updateErr } = await db.from('emails').update(patch).eq('id', row.id).eq('mailbox_owner', row.mailbox_owner)
      if (updateErr) throw updateErr
      succeeded.push(row.id)
    } catch (e) { failures.push({ id: row.id, error: String((e as Error)?.message || e) }) }
  }
  return json({ ok: failures.length === 0, action, succeeded, failures }, failures.length ? 207 : 200)
'''

new = '''  const succeeded: any[] = [], failures: any[] = []
  const processRow = async (row: any) => {
    try {
      if (row.gmail_message_id) {
        const id = encodeURIComponent(row.gmail_message_id)
        let endpoint = `${GMAIL}/${id}/modify`
        let body: any = null
        if (action === 'archive') body = { removeLabelIds: ['INBOX'] }
        else if (action === 'inbox') body = { addLabelIds: ['INBOX'] }
        else if (action === 'read') body = { removeLabelIds: ['UNREAD'] }
        else if (action === 'unread') body = { addLabelIds: ['UNREAD'] }
        else endpoint = `${GMAIL}/${id}/trash`
        const res = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
        const data = await res.json().catch(() => ({}))
        // Delete/archive are idempotent. If Gmail says the provider message no
        // longer exists, the desired end state is already true, so clear/move
        // the CRM row instead of resurrecting it forever on Refresh.
        const alreadyGone = res.status === 404 && (action === 'trash' || action === 'archive')
        if (!res.ok && !alreadyGone) throw new Error(data?.error?.message || `Gmail ${action} failed (${res.status})`)
      }
      const patch: any = action === 'trash' ? { deleted_at: new Date().toISOString(), triage: 'Archive' }
        : action === 'archive' ? { triage: 'Archive' }
        : action === 'inbox' ? { triage: 'Inbox', deleted_at: null }
        : action === 'read' ? { is_read: true } : { is_read: false }
      const { error: updateErr } = await db.from('emails').update(patch).eq('id', row.id).eq('mailbox_owner', row.mailbox_owner)
      if (updateErr) throw updateErr
      succeeded.push(row.id)
    } catch (e) {
      const message = String((e as Error)?.message || e)
      console.error('gmail message action failed', { action, email_id: row.id, message })
      failures.push({ id: row.id, error: message })
    }
  }
  // Bounded concurrency: fast enough for bulk actions without one 50+ second
  // serial request or an unbounded burst against Gmail.
  for (let i = 0; i < owned.length; i += 5) {
    await Promise.all(owned.slice(i, i + 5).map(processRow))
  }
  return json({ ok: failures.length === 0, action, succeeded, failures }, failures.length ? 207 : 200)
'''

if new in s:
    print('gmail idempotent delete patch already present')
elif old in s:
    p.write_text(s.replace(old, new))
    print('gmail idempotent delete patch applied')
else:
    raise SystemExit('gmail messageAction anchor not found; refusing unsafe patch')
